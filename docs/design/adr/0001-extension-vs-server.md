# ADR-0001 — Dùng Chrome Extension thay vì crawler server-side

- **Trạng thái**: Accepted
- **Ngày**: 2026-04-20

## Bối cảnh

Cần crawl dữ liệu sản phẩm Shopee quy mô ~1 triệu SP. Có hai hướng chính:
- **(A)** Server-side: `requests` / `httpx` + proxy pool + rotate User-Agent.
- **(B)** Chrome Extension intercept `fetch`/`XHR` của Shopee SPA khi user duyệt.

## Quyết định

Chọn **(B)** — Chrome Extension Manifest V3.

## Lý do

- Dùng session hợp lệ của user (cookie, device fingerprint) → ít bị anti-bot chặn.
- Không cần đầu tư proxy pool / rotate IP.
- Data từ internal API (JSON) → không cần parse HTML, ít vỡ khi Shopee đổi UI.

## Hệ quả

- **Tích cực**: rủi ro pháp lý/kỹ thuật thấp hơn; không cần infra proxy.
- **Tiêu cực**: phase 1 phụ thuộc thao tác user → chưa đạt 1 triệu SP nhanh; cần nắm MV3 service worker.
- **Việc kèm**: phase 2 sẽ làm auto-browser (extension tự mở tab + scroll theo seed keyword/category).

## Thay thế đã cân nhắc

- **(A) Server-side crawler**: nhanh về throughput nhưng chi phí proxy + rủi ro anti-bot cao.
- **Playwright headless**: đứng giữa nhưng tốn RAM và vẫn bị detect như headless thông thường.
