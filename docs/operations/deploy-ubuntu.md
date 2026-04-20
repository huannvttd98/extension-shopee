# Deploy Backend lên Ubuntu

Hướng dẫn deploy `backend/` (FastAPI + MySQL) lên server Ubuntu 22.04 / 24.04 LTS.

Kết quả cuối:
- Backend chạy như **systemd service** (auto-restart, start at boot).
- **Nginx** reverse proxy + TLS (Let's Encrypt).
- **MySQL** local, DB `productmap`.
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

---

## 1. Chuẩn bị server

```bash
# SSH vào server với user có sudo
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential \
  python3 python3-venv python3-pip \
  mysql-server \
  nginx \
  ufw
```

Bật firewall:
```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Tạo user deploy (nếu chưa có):
```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG sudo deploy
# (khuyến nghị) copy SSH key
sudo rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

---

## 2. Cài đặt MySQL

```bash
sudo mysql_secure_installation
```
Trả lời: set root password (chọn STRONG), remove anonymous users = Y, disallow root remote = Y, remove test db = Y, reload = Y.

Tạo DB và user app:
```bash
sudo mysql
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
mysql -u pm_app -p productmap -e "SHOW TABLES;"
```

**Tuning tối thiểu** (cho batch insert lớn) — `/etc/mysql/mysql.conf.d/mysqld.cnf`:
```ini
[mysqld]
innodb_buffer_pool_size = 1G   # ~50-70% RAM server; giảm nếu VM nhỏ
max_allowed_packet = 64M
innodb_flush_log_at_trx_commit = 2
```
Restart: `sudo systemctl restart mysql`.

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

Chạy migration:
```bash
alembic upgrade head
```
Kiểm tra bảng:
```bash
mysql -u pm_app -p productmap -e "SHOW TABLES;"
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
After=network.target mysql.service
Wants=mysql.service

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=/opt/productmap/backend
EnvironmentFile=/opt/productmap/backend/.env
ExecStart=/opt/productmap/backend/.venv/bin/gunicorn \
    -k uvicorn.workers.UvicornWorker \
    -w 2 \
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

> `-w 2`: 2 worker. Tăng nếu CPU nhiều. Batch ingest I/O-bound (MySQL), không cần quá nhiều worker.

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
`/etc/cron.d/productmap-backup`:
```
0 3 * * * deploy /usr/bin/mysqldump --single-transaction --quick productmap | gzip > /var/backups/productmap_$(date +\%Y\%m\%d).sql.gz
0 4 * * * deploy find /var/backups -name 'productmap_*.sql.gz' -mtime +14 -delete
```
Tạo dir:
```bash
sudo mkdir -p /var/backups && sudo chown deploy:deploy /var/backups
```

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
| `OperationalError: (1045) Access denied` | Sai password trong `.env` → mở `.env`, test `mysql -u pm_app -p` |
| `CORS blocked` trong DevTools Chrome | `CORS_ORIGINS` chưa khớp extension ID → xem mục 7 |
| `413 Request Entity Too Large` | Batch quá lớn → tăng `client_max_body_size` trong Nginx hoặc giảm `BATCH_SIZE` trong extension |
| Migration chạy treo | Kết nối DB sai hoặc bảng đã tồn tại trái schema → kiểm tra `alembic current`, `alembic history` |
| Service restart loop | `journalctl -u productmap-api -n 100` để xem stacktrace |

---

## 12. Checklist go-live

- [ ] DNS A record trỏ domain về IP server
- [ ] `ufw status` → cho phép 22, 80, 443
- [ ] MySQL root password mạnh, user `pm_app` chỉ có quyền trên `productmap`
- [ ] `.env` không commit git (có `.gitignore`)
- [ ] HTTPS hoạt động, HTTP → HTTPS redirect
- [ ] `CORS_ORIGINS` = ID extension production
- [ ] `systemctl enable productmap-api` (auto start khi reboot)
- [ ] Cron backup DB hoạt động
- [ ] Test end-to-end: cài extension → duyệt shopee.vn → popup "sent" tăng → `SELECT COUNT(*) FROM products` tăng

---

## Tham chiếu

- [../getting-started/overview.md](../getting-started/overview.md) — stack & cấu trúc dự án
- [../design/plan-phase-1.md](../design/plan-phase-1.md) — kiến trúc backend & endpoints
- [../design/architecture.md](../design/architecture.md) — luồng dữ liệu end-to-end
- [../design/adr/README.md](../design/adr/README.md) — ADR index
