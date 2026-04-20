# ADR-0006 — Inject script vào page-world (không dùng isolated world)

- **Trạng thái**: Accepted
- **Ngày**: 2026-04-20

## Bối cảnh

Cần hook `window.fetch` + `XMLHttpRequest` của Shopee SPA để bắt response. Content script của MV3 mặc định chạy **isolated world** — không chia sẻ `window` với page, không override được `fetch` thật mà SPA dùng.

## Quyết định

- `content.js` (isolated world) inject thẻ `<script src=inject.js>` vào DOM.
- `inject.js` chạy **page-world**, wrap `window.fetch` và `XMLHttpRequest.prototype.open/send`.
- Giao tiếp giữa page-world ↔ content script qua `window.postMessage({ source: 'pm-crawl', ... })`.
- Content script forward sang background qua `chrome.runtime.sendMessage`.

## Lý do

- Chỉ page-world mới override được `window.fetch` thật của SPA React.
- `postMessage` là cách duy nhất cross-world không dùng `chrome.*` (page-world không có `chrome.*`).
- Giữ content script gọn (chỉ làm bridge), logic hook tập trung 1 file.

## Hệ quả

- **Tích cực**: hook chắc chắn chạy trước mọi `fetch` của SPA nếu inject ở `document_start`.
- **Tiêu cực**: phải khai báo `inject.js` trong `web_accessible_resources`. CSP của site có thể block inline — dự án dùng external script (`src=chrome.runtime.getURL(...)`) nên an toàn với hầu hết CSP.
- **Việc kèm**: kiểm tra định kỳ Shopee có đổi sang service worker proxy không (hiếm, nhưng sẽ làm hook vô hiệu).

## Thay thế đã cân nhắc

- **`chrome.webRequest` API**: MV3 chỉ cho phép `declarativeNetRequest` + không đọc được response body → không khả thi.
- **DevTools Protocol từ extension**: cần permission cao, không phù hợp với extension phân phối rộng.
- **Scrape DOM thay vì API**: dữ liệu thiếu field, vỡ khi Shopee đổi layout — bỏ.
