# ADR-0007 — Auto-scan bằng cách mở tab Shopee thật và auto-scroll từ content script

- **Trạng thái**: Accepted
- **Ngày**: 2026-04-20

## Bối cảnh

Phase 1 của ProductMap thu thập dữ liệu khi user tự duyệt và scroll Shopee — phụ thuộc hoàn toàn vào thao tác thủ công. Phase 2 cần tự động hóa: user nhập từ khóa → extension tự quét đến khi hết sản phẩm (hoặc đạt giới hạn / user dừng). Pipeline hook `fetch`/`XHR` qua `inject.js` (page-world, xem [ADR-0006](0006-inject-page-world.md)) đã hoạt động ổn — cần quyết định cách kích hoạt quét tự động mà không phá vỡ pipeline này.

## Quyết định

Background service worker mở tab `https://shopee.vn/search?keyword=<kw>&pm_autoscan=1&pm_max=<n>` thật trong trình duyệt. Content script mới (`src/autoscan.js`) phát hiện cờ `pm_autoscan=1` trong URL, sau đó tự động `scrollTo` bottom mỗi ~1.8 giây. `inject.js` đã hook sẵn bắt các response như Phase 1. Dừng khi scroll height không tăng 3 tick liên tiếp, đạt `pm_max`, hoặc user bấm dừng.

## Lý do

- Tái sử dụng toàn bộ pipeline Phase 1 (`inject.js` → `postMessage` → content bridge → background) — không cần maintain song song 2 path thu thập dữ liệu.
- Tab mở trong trình duyệt thật mang đầy đủ session cookie, device fingerprint của user → tỉ lệ bị anti-bot chặn gần 0.
- Shopee search hiện tại dùng infinite scroll (SPA), không có pagination `?page=N` đáng tin cậy — scroll từ content script là cách phù hợp với behavior thật của trang.
- Độ phức tạp triển khai thấp: `autoscan.js` chỉ cần vòng lặp scroll + gửi tín hiệu dừng; phần bắt data không thay đổi.

## Hệ quả

- **Tích cực**: pipeline Phase 1 được tái dùng nguyên vẹn; session hợp lệ → ít bị block; logic auto-scroll đơn giản, dễ test thủ công.
- **Tiêu cực / trade-off**: tốc độ bị giới hạn bởi render SPA (~1.8 s/scroll) — quét số lượng rất lớn cần nhiều session song song; mỗi phiên quét mở 1 tab visible (MVP để `active: true` cho dễ debug, có thể chuyển `active: false` sau); cờ `pm_autoscan=1` trong URL bar — Shopee có thể detect pattern URL lặp về sau (phương án dự phòng: dùng hash fragment `#pm_autoscan=1` thay query param).
- **Việc kèm**: khai báo `src/autoscan.js` vào `content_scripts` trong `manifest.json` với `match` chỉ đúng domain Shopee; background cần state machine `autoscan` (start / stop / progress / done); cân nhắc chuyển `active: false` khi tính năng ổn định để tab không xuất hiện trước mặt user.

## Thay thế đã cân nhắc

- **Fetch Shopee internal API trực tiếp từ background SW**: nhanh hơn ~2–3x nhưng Shopee kiểm tra `Referer`, cookie session, và nhiều header anti-bot (`af-ac-enc-dat`, …) → dễ nhận 403/block; phải giả lập header đầy đủ và bảo trì liên tục khi Shopee thay đổi.
- **Navigate qua pagination `?page=N`**: Shopee search hiện dùng infinite scroll — pagination URL không còn đáng tin cậy, rủi ro quét sai hoặc bỏ sót dữ liệu.
- **Chrome Debugger API / puppeteer-core**: permission quá lớn (`debugger`), không phù hợp với extension phân phối thông thường, ngoài scope MV3.
