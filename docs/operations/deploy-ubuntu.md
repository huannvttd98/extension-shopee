# Deploy Backend lên Ubuntu

Hướng dẫn deploy `backend/` (FastAPI + MariaDB/MySQL) lên server Ubuntu 22.04 / 24.04 LTS.

Kết quả cuối:
- Backend chạy như **systemd service** (auto-restart, start at boot).
- **Nginx** reverse proxy + TLS (Let's Encrypt).
- **MariaDB** local (khuyến nghị cho VPS nhỏ), DB `productmap`. Có thể thay bằng MySQL 8 khi server ≥ 2GB RAM.
- Chrome Extension point `backend_url` sang `https://<domain>`.

---

## 0. Giả định & biến dùng trong hướng dẫn

| Biến | Ví dụ |
|------|-------|
| Server user deploy | `deploy` |
| Domain | `api.productmap.example` |
| App dir | `/opt/productmap/backend` |
| Service name | `productmap-api` |
| DB name | `productmap` |
| DB user | `pm_app` |
| Port nội bộ | `8000` |

Thay giá trị phù hợp với bạn khi chạy lệnh.

### Cấu hình VPS khuyến nghị

| Hạng mục | Tối thiểu | Khuyến nghị |
|----------|-----------|-------------|
| CPU | 1 core | 2 core |
| RAM | 1 GB (bắt buộc swap 2 GB) | 2 GB |
| Disk | 20 GB SSD | 40 GB SSD |
| OS | Ubuntu 22.04 / 24.04 LTS | Ubuntu 24.04 LTS |
| DB | **MariaDB 11.x** khi RAM ≤ 1 GB | MySQL 8 khi RAM ≥ 2 GB |

> **Vì sao MariaDB cho VPS 1GB?** MySQL 8 idle tốn ~400–500 MB RAM, cộng với FastAPI + Nginx sẽ OOM. MariaDB idle chỉ ~150–250 MB, tương thích utf8mb4 / InnoDB / FULLTEXT / FK — Alembic migration và driver `PyMySQL` không cần đổi. Khi nâng server ≥ 2GB có thể migrate qua MySQL 8 bằng `mysqldump` mà schema không đổi.

---

## 1. Chuẩn bị server

```bash
# SSH vào server với user có sudo
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential \
  python3 python3-venv python3-pip python3-dev \
  default-libmysqlclient-dev pkg-config \
  mariadb-server \
  nginx \
  ufw
```

> Dùng `mysql-server` thay `mariadb-server` nếu server có ≥ 2GB RAM và bạn muốn khớp 100% với dev (Laragon MySQL 8).

Bật firewall:
```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

### 1.1. Tạo swap (BẮT BUỘC cho VPS ≤ 1GB RAM)

1GB RAM không đủ cho `pip install` (build `lxml`, `pydantic-core`) và DB chạy song song — thiếu swap sẽ OOM ngay khi deploy lần đầu.

```bash
# Kiểm tra swap hiện tại
free -h
# Tạo 2GB swap
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
# Bật persistent (tự mount khi reboot)
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
# Giảm swappiness để chỉ dùng swap khi thật sự cần
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf
sudo sysctl --system
free -h
```

Tạo user deploy (nếu chưa có):
```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG sudo deploy
# (khuyến nghị) copy SSH key
sudo rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

---

## 2. Cài đặt Database (MariaDB khuyến nghị cho 1GB RAM)

### 2.1. MariaDB (mặc định trong hướng dẫn này)

```bash
sudo mariadb-secure-installation
```
Trả lời: set root password (chọn STRONG), switch to unix_socket auth = N (để dùng password từ app), remove anonymous users = Y, disallow root remote = Y, remove test db = Y, reload = Y.

Tạo DB và user app:
```bash
sudo mariadb
```
```sql
CREATE DATABASE productmap CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'pm_app'@'localhost' IDENTIFIED BY 'CHANGE_ME_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON productmap.* TO 'pm_app'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Kiểm tra:
```bash
mariadb -u pm_app -p productmap -e "SHOW TABLES;"
```

**Tuning cho VPS 1GB RAM** — tạo file `/etc/mysql/mariadb.conf.d/99-productmap.cnf`:
```ini
[mysqld]
# Bộ nhớ — tổng ~200MB
innodb_buffer_pool_size      = 128M
innodb_log_buffer_size       = 8M
innodb_redo_log_capacity     = 64M
key_buffer_size              = 16M
tmp_table_size               = 16M
max_heap_table_size          = 16M

# Kết nối
max_connections              = 30
thread_cache_size            = 4
table_open_cache             = 200

# Tắt phần nặng không cần
performance_schema           = OFF

# Batch ingest an toàn + throughput
max_allowed_packet           = 64M
innodb_flush_log_at_trx_commit = 2
```
Restart: `sudo systemctl restart mariadb`.

Kiểm tra RAM sau tune:
```bash
sudo systemctl status mariadb
free -h
```

### 2.2. MySQL 8 (khi server ≥ 2GB RAM)

Nếu bạn cài `mysql-server` ở mục 1, thay các lệnh trên:
- `mariadb-secure-installation` → `mysql_secure_installation`
- `mariadb` → `mysql`
- `sudo systemctl restart mariadb` → `sudo systemctl restart mysql`
- Đường dẫn config: `/etc/mysql/mysql.conf.d/99-productmap.cnf`

Gợi ý buffer pool cho 2GB RAM: `innodb_buffer_pool_size = 512M`, giữ `performance_schema = OFF` để tiết kiệm ~100MB.

---

## 3. Clone code & setup Python

```bash
sudo mkdir -p /opt/productmap
sudo chown deploy:deploy /opt/productmap
su - deploy
cd /opt/productmap

# Option A: clone từ git (khuyến nghị)
git clone <your-git-url> .
# Option B: scp/rsync thủ công từ máy dev
# rsync -avz --exclude '.venv' --exclude '__pycache__' backend/ deploy@server:/opt/productmap/backend/

cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
# gunicorn làm process manager production
pip install gunicorn
```

Tạo `.env`:
```bash
cp .env.example .env
nano .env
```
Sửa:
```
DATABASE_URL=mysql+pymysql://pm_app:CHANGE_ME_STRONG_PASSWORD@127.0.0.1:3306/productmap?charset=utf8mb4
CORS_ORIGINS=chrome-extension://<YOUR_EXTENSION_ID>
INGEST_MAX_BATCH=500
LOG_LEVEL=INFO
```

> **Lấy extension ID**: vào `chrome://extensions` trong Chrome, bật Developer mode, xem ID dưới tên extension. Trong lúc chưa publish, Chrome sinh ID khác nhau cho mỗi máy trừ khi bạn pack với `key` cố định (xem mục 9).

> `DATABASE_URL` giữ nguyên dialect `mysql+pymysql://` cho cả MariaDB lẫn MySQL 8 — `PyMySQL` nói giao thức MySQL chuẩn mà MariaDB vẫn tương thích.

Chạy migration:
```bash
alembic upgrade head
```
Kiểm tra bảng:
```bash
mariadb -u pm_app -p productmap -e "SHOW TABLES;"   # hoặc: mysql -u pm_app -p productmap -e "SHOW TABLES;"
```

Test nhanh:
```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000
curl http://127.0.0.1:8000/healthz
# Ctrl+C để dừng
```

---

## 4. systemd service

Tạo file `/etc/systemd/system/productmap-api.service`:
```bash
sudo nano /etc/systemd/system/productmap-api.service
```
Nội dung:
```ini
[Unit]
Description=ProductMap FastAPI backend
# MariaDB: dùng mariadb.service; MySQL 8: đổi thành mysql.service
After=network.target mariadb.service
Wants=mariadb.service

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=/opt/productmap/backend
EnvironmentFile=/opt/productmap/backend/.env
ExecStart=/opt/productmap/backend/.venv/bin/gunicorn \
    -k uvicorn.workers.UvicornWorker \
    -w 1 \
    -b 127.0.0.1:8000 \
    --access-logfile - \
    --error-logfile - \
    app.main:app
Restart=on-failure
RestartSec=3
# Giới hạn tài nguyên (tuỳ chỉnh)
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

> `-w 1`: 1 worker cho VPS 1 core / 1GB RAM (mỗi UvicornWorker ~80–120MB). Dùng `-w 2` khi ≥ 2GB RAM, `-w 3` khi 4GB. Batch ingest I/O-bound (DB), không cần quá nhiều worker.

Enable & start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable productmap-api
sudo systemctl start productmap-api
sudo systemctl status productmap-api
```

Xem log:
```bash
sudo journalctl -u productmap-api -f
```

---

## 5. Nginx reverse proxy

Tạo `/etc/nginx/sites-available/productmap-api`:
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name api.productmap.example;

    # Batch ingest có thể lớn
    client_max_body_size 20M;

    location / {
        proxy_pass         http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
```

Kích hoạt + test:
```bash
sudo ln -s /etc/nginx/sites-available/productmap-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Kiểm tra:
```bash
curl http://api.productmap.example/healthz
```

---

## 6. TLS bằng Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.productmap.example \
  --non-interactive --agree-tos -m you@example.com --redirect
```

Certbot sẽ tự sửa Nginx để chuyển HTTP → HTTPS và gia hạn tự động (timer `certbot.timer`).

Test:
```bash
curl https://api.productmap.example/healthz
```

---

## 7. Cấu hình CORS cho Chrome Extension production

Mặc định `.env` đã set `CORS_ORIGINS=chrome-extension://<ID>`. Nếu có nhiều extension ID (dev + production), phân tách bằng dấu phẩy:
```
CORS_ORIGINS=chrome-extension://abcdef...,chrome-extension://ghijkl...
```

Restart service:
```bash
sudo systemctl restart productmap-api
```

Trong extension, mở popup → đổi `Backend URL` = `https://api.productmap.example` → Lưu.

---

## 8. Quy trình deploy cập nhật

```bash
ssh deploy@server
cd /opt/productmap
git pull
cd backend
source .venv/bin/activate
pip install -r requirements.txt       # nếu đổi deps
alembic upgrade head                   # nếu có migration mới
sudo systemctl restart productmap-api
sudo journalctl -u productmap-api -n 50 --no-pager
```

Hoặc tự động hóa bằng 1 script `/opt/productmap/deploy.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/productmap
git pull
cd backend
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
sudo systemctl restart productmap-api
```
```bash
chmod +x /opt/productmap/deploy.sh
```

---

## 9. (Tuỳ chọn) Cố định Extension ID

Chrome Extension ID thay đổi giữa các máy khi load unpacked. Để CORS đúng 1 ID:

1. Tạo key trên máy dev:
   ```bash
   openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out extension.pem
   ```
2. Lấy public key base64:
   ```bash
   openssl rsa -in extension.pem -pubout -outform DER | openssl base64 -A
   ```
3. Thêm vào `extension/manifest.json`:
   ```json
   "key": "<base64-public-key>"
   ```
4. Load unpacked lại → ID sẽ cố định trên mọi máy.
5. Giữ `extension.pem` **bí mật** (không commit git).

---

## 10. Backup & operations

### Backup DB (cron)

MariaDB dùng `mariadb-dump`; MySQL dùng `mysqldump` (cả hai đều có ở `/usr/bin/`).

Tạo dir + file credentials (để cron không phải nhập password):
```bash
sudo mkdir -p /var/backups && sudo chown deploy:deploy /var/backups
sudo -u deploy tee /home/deploy/.my.cnf >/dev/null <<'EOF'
[client]
user=pm_app
password=CHANGE_ME_STRONG_PASSWORD
EOF
sudo chmod 600 /home/deploy/.my.cnf
```

`/etc/cron.d/productmap-backup` (MariaDB):
```
0 3 * * * deploy /usr/bin/mariadb-dump --defaults-file=/home/deploy/.my.cnf --single-transaction --quick productmap | gzip > /var/backups/productmap_$(date +\%Y\%m\%d).sql.gz
0 4 * * * deploy find /var/backups -name 'productmap_*.sql.gz' -mtime +14 -delete
```

Nếu dùng MySQL 8, đổi `mariadb-dump` → `mysqldump`.

### Theo dõi
```bash
# Tail live log
sudo journalctl -u productmap-api -f

# Thống kê nhanh
curl -s https://api.productmap.example/api/stats | jq
```

### Log rotation
journald đã rotate sẵn. Nếu muốn giới hạn dung lượng:
`/etc/systemd/journald.conf`:
```
SystemMaxUse=500M
```
Rồi `sudo systemctl restart systemd-journald`.

---

## 11. Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp |
|-------------|----------------------|
| `502 Bad Gateway` ở Nginx | `productmap-api` service chết / port 8000 không lắng nghe → `systemctl status productmap-api`, `ss -tlnp \| grep 8000` |
| `OperationalError: (1045) Access denied` | Sai password trong `.env` → mở `.env`, test `mariadb -u pm_app -p` (hoặc `mysql -u pm_app -p`) |
| `OOM Killed` / service tự chết | VPS 1GB không đủ RAM — check `free -h`, bảo đảm swap đã bật (mục 1.1), giảm `innodb_buffer_pool_size` xuống `96M`, giữ `-w 1` ở gunicorn |
| `mariadb: command not found` | Cài `mariadb-client`: `sudo apt install -y mariadb-client` |
| `CORS blocked` trong DevTools Chrome | `CORS_ORIGINS` chưa khớp extension ID → xem mục 7 |
| `413 Request Entity Too Large` | Batch quá lớn → tăng `client_max_body_size` trong Nginx hoặc giảm `BATCH_SIZE` trong extension |
| Migration chạy treo | Kết nối DB sai hoặc bảng đã tồn tại trái schema → kiểm tra `alembic current`, `alembic history` |
| Service restart loop | `journalctl -u productmap-api -n 100` để xem stacktrace |

---

## 12. Checklist go-live

- [ ] DNS A record trỏ domain về IP server
- [ ] `ufw status` → cho phép 22, 80, 443
- [ ] Swap đã bật (nếu RAM ≤ 1GB): `swapon --show` thấy `/swapfile` 2G
- [ ] MariaDB (hoặc MySQL) root password mạnh, user `pm_app` chỉ có quyền trên `productmap`
- [ ] File `99-productmap.cnf` đã tune theo RAM thực tế, DB restart sạch
- [ ] `.env` không commit git (có `.gitignore`)
- [ ] HTTPS hoạt động, HTTP → HTTPS redirect
- [ ] `CORS_ORIGINS` = ID extension production
- [ ] `systemctl enable productmap-api` (auto start khi reboot)
- [ ] Cron backup DB hoạt động (file `.sql.gz` sinh ra trong `/var/backups`)
- [ ] Test end-to-end: cài extension → duyệt shopee.vn → popup "sent" tăng → `SELECT COUNT(*) FROM products` tăng

---

## Tham chiếu

- [../getting-started/overview.md](../getting-started/overview.md) — stack & cấu trúc dự án
- [../design/plan-phase-1.md](../design/plan-phase-1.md) — kiến trúc backend & endpoints
- [../design/architecture.md](../design/architecture.md) — luồng dữ liệu end-to-end
- [../design/adr/README.md](../design/adr/README.md) — ADR index
