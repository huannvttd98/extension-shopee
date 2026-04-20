# Quick start (dev local)

Hướng dẫn chạy toàn bộ pipeline trên máy dev (Windows + Laragon) trong ~10 phút.

## Yêu cầu

- Windows 10/11, Laragon đã cài (MySQL chạy sẵn).
- Python 3.11+
- Node.js 18+ (dành cho viewer PWA — có thể bỏ qua nếu chỉ cần API)
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
Thấy 7 bảng: `alembic_version`, `categories`, `crawl_log`, `crawl_sessions`, `product_crawl_sessions`, `products`, `shops`. Bảng `products` có thêm FULLTEXT index `ftx_products_name_brand` từ migration 0002 (chưa dùng — để sẵn cho phase 3).

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

## 7. Test tab "Quét tự động" (auto-scan)

Cho phép extension tự mở tab Shopee search → scroll đến hết → không cần user thao tác.

1. Click icon extension → chọn tab **Quét tự động**.
2. Nhập **Từ khóa** (vd. `iphone 15`), **Max scrolls** = 200, bật "Đóng tab khi xong".
3. Click **Bắt đầu quét** → tab mới mở `shopee.vn/search?keyword=iphone+15&pm_autoscan=1&pm_max=200`.
4. Tab tự scroll xuống dưới mỗi ~1.8s. Popup hiển thị `Scroll ticks` / `Items API` tăng.
5. Tab tự đóng khi:
   - `no-more-content` — 3 tick liên tiếp scrollHeight không đổi (hết sản phẩm).
   - `max-scrolls` — đã đạt giới hạn.
   - `user-stop` — bạn bấm **Dừng**.
6. Verify: `SELECT COUNT(*) FROM products` tăng thêm.

Chi tiết quyết định ở [../design/adr/0007-autoscan-tab-scroll.md](../design/adr/0007-autoscan-tab-scroll.md).

## 8. Tab "Lịch sử" — xem sản phẩm đã quét theo phiên

Mỗi lần bấm **Bắt đầu quét**, extension tạo 1 record trong bảng `crawl_sessions` và gắn `session_id` vào từng batch ingest.

1. Sau khi phiên quét kết thúc, mở popup → tab **Lịch sử**.
2. Danh sách sessions theo thứ tự mới nhất: keyword, trạng thái (running/done/aborted/error), thời gian, `items_seen`, `products_upserted`.
3. Click 1 row → panel chi tiết + list SP (ảnh/giá/sold/rating) của đúng phiên đó.
4. Nút **← Quay lại** về danh sách.

Query trực tiếp từ terminal:
```bash
curl "http://localhost:8000/api/scan-sessions?limit=5"
curl "http://localhost:8000/api/scan-sessions/1"
curl "http://localhost:8000/api/scan-sessions/1/products?limit=10"
```

## 9. Viewer PWA (xem data qua UI thay vì curl)

Viewer mount cùng origin với API tại `/app` (xem [ADR-0008](../design/adr/0008-pwa-viewer-vite.md)). Có 2 cách chạy:

### 9.a. Build 1 lần rồi dùng trong Uvicorn

```bash
cd d:\laragon\www\ProductMap\backend\webapp
npm install
npm run build
```
Output vào `backend/webapp/dist/`. Restart Uvicorn (`Ctrl+C` rồi chạy lại `uvicorn app.main:app --reload`) — log sẽ hết dòng "webapp/dist not built; skipping /app mount".

Mở: `http://localhost:8000/app/` → thấy header ProductMap + trang Tổng quan (stats, phiên mới nhất, SP mới nhất). Các trang:
- `/app/#/products` — list sản phẩm, search + sort + pagination.
- `/app/#/products/<id>` — chi tiết 1 SP + raw JSON.
- `/app/#/sessions` — lịch sử phiên quét.
- `/app/#/sessions/<id>` — chi tiết phiên + SP của phiên đó.

Nếu phiên đang `running`, trang tự poll mỗi 3–5s để cập nhật số liệu.

### 9.b. Vite dev server (HMR khi code viewer)

```bash
cd d:\laragon\www\ProductMap\backend\webapp
npm install
npm run dev
```
Mở `http://localhost:5173/app/`. Vite proxy `/api` về `http://localhost:8000` — chạy song song với Uvicorn. Edit file trong `src/` tự reload.

## 10. Test failure mode (tuỳ chọn)

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
