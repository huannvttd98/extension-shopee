# ADR-0003 — Lưu `raw_json` song song cột chuẩn hoá

- **Trạng thái**: Accepted
- **Ngày**: 2026-04-20

## Bối cảnh

Shopee API có thể thêm/đổi field bất kỳ lúc nào. Nếu chỉ lưu cột chuẩn hoá, khi cần field mới phải re-crawl.

## Quyết định

Mỗi bảng (`products`, `shops`, `categories`) có cột `raw_json JSON` lưu toàn bộ response gốc, **song song** với các cột trích xuất.

## Lý do

- Không mất dữ liệu khi Shopee thêm field → tránh re-crawl.
- Có thể thêm cột / index mới và backfill từ `raw_json` bằng SQL đơn giản.
- Debug dễ: kiểm tra response gốc vì sao parse sai.

## Hệ quả

- **Tích cực**: resilient với thay đổi upstream; an toàn cho việc mở rộng schema sau.
- **Tiêu cực**: tăng dung lượng DB (1M rows × ~2KB ≈ 2GB). Chấp nhận được vì crawl lại tốn hơn.
- **Việc kèm**: khi thêm cột mới, viết job backfill từ `raw_json` trước khi enforce NOT NULL.

## Thay thế đã cân nhắc

- **Chỉ lưu cột chuẩn hoá**: tiết kiệm dung lượng nhưng phải re-crawl mỗi khi schema thay đổi.
- **Tách bảng `*_raw` riêng**: linh hoạt nhưng thêm join cost — không cần thiết ở quy mô này.
