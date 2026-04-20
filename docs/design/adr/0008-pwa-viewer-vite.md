# ADR-0008 — Viewer PWA (Vite + Tailwind + vanilla JS) mount chung với FastAPI tại `/app`

- **Trạng thái**: Accepted
- **Ngày**: 2026-04-20

## Bối cảnh

Phase 1 và phase 2-MVP đã crawl được sản phẩm và lưu vào MySQL, nhưng người dùng chỉ có thể xem data qua: (a) popup extension (không gian chật, không xem được chi tiết), (b) SQL client trực tiếp, hoặc (c) `curl` vào `/api/products`, `/api/scan-sessions`. Cần một **UI tách biệt** phục vụ:

- Xem danh sách sản phẩm đã crawl (lọc, sort, phân trang).
- Xem chi tiết 1 sản phẩm (ảnh, giá, rating, raw JSON, link sang Shopee).
- Xem lịch sử phiên quét (`crawl_sessions`) và sản phẩm thuộc từng phiên.
- Đang chạy phiên nào → hiện thị real-time (polling).

Yêu cầu không phát sinh: không có authentication đa người dùng (phase 1–2 chạy cục bộ / 1 team), không có form ghi dữ liệu — chỉ đọc qua API đã có.

## Quyết định

Xây dựng một SPA thuần JS (ESM), bundle bằng **Vite**, style bằng **Tailwind CSS v4**, cấu hình **PWA** qua `vite-plugin-pwa` (service worker cache `NetworkFirst` cho các GET `/api/*`). Build xuất vào `backend/webapp/dist/`. FastAPI mount thư mục đó tại path `/app` bằng `StaticFiles(html=True)` nếu tồn tại (`backend/app/main.py`). Cùng origin với `/api` → không cần cấu hình CORS riêng. Router client-side dùng **hash routing** (`/app/#/products/123`) tự viết ~50 dòng, không dùng framework.

## Lý do

- **Vanilla JS**: UI phạm vi nhỏ (5 trang: Home / Products / Product detail / Sessions / Session detail), không có state server, không cần SSR, không cần form phức tạp. Framework (React/Vue) sẽ thêm ~130KB gzipped mà không đem lại giá trị tương xứng. Code hiện tại ~20KB mà vẫn tách page/component/utils rõ ràng.
- **Vite + Tailwind v4**: dev HMR nhanh, build output tree-shaken; Tailwind utility-first đủ cho dashboard nhìn chuyên nghiệp mà không cần design system riêng.
- **Mount cùng FastAPI tại `/app`**: same-origin → không đụng CORS, không cần thêm domain / TLS riêng, khi deploy chỉ cần `npm run build` rồi restart Uvicorn/Gunicorn là xong. Nginx đã reverse proxy toàn bộ về backend — không đổi cấu hình.
- **Hash routing**: tránh phải cấu hình wildcard `try_files` ở Nginx / fallback route trong FastAPI; `location.hash` luôn được browser xử lý client-side → reload bất kỳ URL nào cũng không 404.
- **PWA + cache API ngắn (60s `NetworkFirst`)**: mở lại tab nhanh, dùng được khi mạng chập, vẫn ưu tiên số liệu mới từ server khi có.

## Hệ quả

- **Tích cực**: UI gọn (1 bundle nhỏ, không polyfill framework), dev nhanh (vite), ops đơn giản (deploy = build + restart, không thêm service), cùng origin → auth/CORS nếu sau này thêm chỉ cần 1 chỗ.
- **Tiêu cực / trade-off**: thao tác DOM thủ công (innerHTML + escapeHtml) dễ bug XSS nếu dev không cẩn thận — bắt buộc `escapeHtml` cho mọi input từ API; khi số trang > ~10 hoặc cần state phức tạp (optimistic update, undo) sẽ phải refactor sang framework; hash routing xấu URL hơn history API nhưng đổi được sau mà không phá API.
- **Việc kèm**:
  - Quick-start phải có bước `npm install` + `npm run build` trong `backend/webapp/`.
  - Deploy runbook Ubuntu cần cài Node LTS trên server để build (hoặc build trên máy dev rồi rsync `dist/`).
  - Khi đổi domain production cần đảm bảo `scope`/`start_url` trong manifest PWA khớp `/app/`.
  - `main.py` đã log warning nếu `webapp/dist` không tồn tại — backend vẫn chạy được độc lập.

## Thay thế đã cân nhắc

- **React/Next.js**: cần runtime framework, SSR hoặc hydration; overkill cho 5 trang read-only và tăng đáng kể thời gian build / footprint.
- **Grafana / Metabase**: mạnh cho dashboard SQL nhưng không render ảnh sản phẩm đẹp, không điều hướng sản phẩm → phiên quét tự nhiên, và cần service riêng.
- **Tự viết HTML từ FastAPI (Jinja2 SSR)**: tránh được JS client, nhưng mọi filter / pagination / polling phải reload full page hoặc dùng HTMX — phát sinh nhiều round-trip, chậm khi phiên quét running.
- **Host viewer dưới subdomain riêng (vd. `viewer.productmap.example`)**: phải set CORS, thêm cert TLS, thêm vhost Nginx — không đổi lại lợi ích gì so với same-origin `/app`.
