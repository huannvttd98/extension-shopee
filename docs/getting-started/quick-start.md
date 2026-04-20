# Quick start (dev local)

Hướng dẫn chạy toàn bộ pipeline trên máy dev (Windows + Laragon) trong ~10 phút.

## Yêu cầu

- Windows 10/11, Laragon đã cài (MySQL chạy sẵn).
- Python 3.11+
- Google Chrome
- Đã clone/copy code về `d:\laragon\www\ProductMap`

## 1. Tạo DB trong Laragon

Mở Laragon → Menu → MySQL → HeidiSQL (hoặc chạy `mysql -u root`):
```sql
CREATE DATABASE productmap CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## 2. Setup backend

```bash
cd d:\laragon\www\ProductMap\backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Chỉnh `.env` nếu MySQL của bạn có password:
```
DATABASE_URL=mysql+pymysql://root:<password>@127.0.0.1:3306/productmap?charset=utf8mb4
```

Chạy migration:
```bash
alembic upgrade head
```

Kiểm tra bảng:
```bash
mysql -u root -p productmap -e "SHOW TABLES;"
```
Thấy 4 bảng: `categories`, `crawl_log`, `products`, `shops`.

## 3. Chạy backend

```bash
uvicorn app.main:app --reload --port 8000
```

Test:
```bash
curl http://localhost:8000/healthz
# {"status":"ok"}

curl http://localhost:8000/api/stats
# {"products_total":0, ...}
```

## 4. Load Chrome Extension

1. Mở Chrome → `chrome://extensions`
2. Bật **Developer mode** (góc phải trên)
3. Click **Load unpacked** → chọn thư mục `d:\laragon\www\ProductMap\extension`
4. Extension xuất hiện: **ProductMap Shopee Crawler**

## 5. Cấu hình extension

Click icon extension → popup mở:
- Bật toggle **ON** (góc phải trên popup)
- **Backend URL** = `http://localhost:8000` → **Lưu**

## 6. Test end-to-end

1. Mở tab mới → truy cập `https://shopee.vn`
2. Vào 1 category bất kỳ (vd. Điện thoại & phụ kiện) hoặc search từ khoá
3. Scroll xuống — Shopee sẽ load thêm sản phẩm qua fetch
4. Mở popup extension → xem **Đã gửi** tăng dần
5. Query MySQL:
   ```sql
   SELECT COUNT(*) FROM products;
   SELECT id, name, price, sold FROM products ORDER BY last_seen_at DESC LIMIT 10;
   ```
   Số sản phẩm tăng theo mỗi batch.

6. Xem qua HTTP API (không cần mở MySQL client):
   ```bash
   # Danh sách sản phẩm mới nhất
   curl "http://localhost:8000/api/products?limit=5"

   # Tìm theo tên + sort theo lượt bán
   curl "http://localhost:8000/api/products?q=iphone&sort=sold&order=desc&limit=10"

   # Filter theo shop + giá
   curl "http://localhost:8000/api/products?shop_id=123456&min_price=100000&max_price=500000"

   # Chi tiết 1 sản phẩm (có raw_json + shop + category)
   curl http://localhost:8000/api/products/<product_id>
   ```

   Hoặc mở Swagger UI: `http://localhost:8000/docs`.

## 7. Test failure mode (tuỳ chọn)

- Tắt backend (`Ctrl+C`) → tiếp tục scroll shopee.vn → popup báo **Thất bại** tăng, **Pending** tăng.
- Bật lại backend → click **Retry ngay** trong popup → pending về 0.

## Debug

| Triệu chứng | Kiểm tra |
|-------------|---------|
| Popup không thấy "Đã gửi" tăng | DevTools tab shopee.vn → Console: có log "[pm-crawl]" không? Nếu không, check `chrome://extensions` → Errors của extension |
| `NetworkError` trong background SW | Mở `chrome://extensions` → click "Service worker" của extension → Console: xem URL POST và status code |
| Backend trả 422 | Payload không match `IngestBatch` — xem log uvicorn |
| `products_total` không tăng nhưng `crawl_log` có | Service parse fail — xem log uvicorn, field `errors` trong response |

Xem chi tiết: [../design/architecture.md](../design/architecture.md#failure-modes).
