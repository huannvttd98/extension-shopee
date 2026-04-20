# ADR-0004 — Upsert bằng raw SQL `INSERT ... ON DUPLICATE KEY UPDATE`

- **Trạng thái**: Accepted
- **Ngày**: 2026-04-20

## Bối cảnh

Cần ingest idempotent cho batch 50–500 rows. Cùng 1 `itemid` có thể đến từ nhiều session của user (khi duyệt qua nhiều page). SQLAlchemy ORM row-by-row quá chậm.

## Quyết định

Trong `services/ingest_service.py`, build **1 câu SQL duy nhất** cho mỗi batch:
```sql
INSERT INTO products (...) VALUES (...), (...), ...
ON DUPLICATE KEY UPDATE col=VALUES(col), ...
```
Thực thi qua `session.execute(text(sql), rows)`.

## Lý do

- Nhanh hơn 10–100× so với ORM loop.
- Idempotent tự nhiên vì PK là `itemid` (do Shopee cấp).
- `last_seen_at` cập nhật tự động qua `ON UPDATE CURRENT_TIMESTAMP`, giữ `first_seen_at` không đổi.

## Hệ quả

- **Tích cực**: throughput đủ cho mục tiêu 1M SP.
- **Tiêu cực**: không hưởng ORM lifecycle hooks. Phải cẩn thận escape/bind params — dùng `text(...)` với named params, không concat string.
- **Việc kèm**: khi thêm cột mới vào `products`, cập nhật cả `PRODUCT_COLUMNS` và danh sách UPDATE trong service.

## Thay thế đã cân nhắc

- **SQLAlchemy `Session.merge()`**: tiện nhưng chậm row-by-row.
- **`INSERT IGNORE`**: không cập nhật `last_seen_at` → mất khả năng biết sản phẩm còn active.
- **MySQL 8 `INSERT ... AS new ... ON DUPLICATE KEY UPDATE col = new.col`** (tránh deprecate `VALUES()`): tốt hơn cho MySQL 8.0.20+, có thể chuyển sau nếu gặp warning.
