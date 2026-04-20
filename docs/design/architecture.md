# Kiến trúc hệ thống

## Sơ đồ tổng

```
┌─────────────────────────────────────────────────────────────┐
│                       Chrome (User)                          │
│                                                              │
│   Tab shopee.vn                                              │
│   ┌───────────────────────────────────────────┐              │
│   │  Page world                               │              │
│   │  ┌─────────────────────────────────┐      │              │
│   │  │ Shopee SPA (React) → fetch/XHR  │      │              │
│   │  └──────────────┬──────────────────┘      │              │
│   │                 │ hooked                  │              │
│   │  ┌──────────────▼──────────────────┐      │              │
│   │  │ inject.js (wrap fetch + XHR)    │      │              │
│   │  └──────────────┬──────────────────┘      │              │
│   └─────────────────│─────────────────────────┘              │
│                     │ postMessage                            │
│   ┌─────────────────▼─────────────────────────┐              │
│   │  Isolated world                           │              │
│   │  content.js (bridge)                      │              │
│   └─────────────────┬─────────────────────────┘              │
│                     │ chrome.runtime.sendMessage             │
│   ┌─────────────────▼─────────────────────────┐              │
│   │  Service Worker                           │              │
│   │  background.js                            │              │
│   │   - in-memory queue                       │              │
│   │   - mirror chrome.storage.local           │              │
│   │   - batch 50 items / 30s alarm            │              │
│   │   - retry backoff                         │              │
│   └─────────────────┬─────────────────────────┘              │
│                     │                                        │
│   ┌─────────────────▼─────────────────────────┐              │
│   │  Popup (popup.html/js)                    │              │
│   │   - toggle ON/OFF                         │              │
│   │   - stats                                 │              │
│   │   - retry/clear                           │              │
│   └───────────────────────────────────────────┘              │
└─────────────────────┬────────────────────────────────────────┘
                      │ HTTPS/HTTP POST /api/ingest
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                     Backend                                  │
│   ┌─────────────────────────────────────────┐                │
│   │ FastAPI + Uvicorn/Gunicorn (port 8000)  │                │
│   │  routers/                               │                │
│   │   - ingest.py   POST /api/ingest        │                │
│   │   - stats.py    GET  /api/stats         │                │
│   │  services/                              │                │
│   │   - ingest_service (parse + upsert)     │                │
│   │  db.py (SQLAlchemy engine/session)      │                │
│   └──────────────────┬──────────────────────┘                │
│                      │                                       │
│   ┌──────────────────▼──────────────────────┐                │
│   │ MySQL — db `productmap`                 │                │
│   │   - shops                               │                │
│   │   - categories                          │                │
│   │   - products                            │                │
│   │   - crawl_log                           │                │
│   └─────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

## Luồng dữ liệu

1. User duyệt `shopee.vn/...`, SPA gọi `fetch('/api/v4/search/search_items?...')`.
2. `inject.js` đã wrap `fetch` — clone response, đọc JSON.
3. Nếu URL match whitelist → `postMessage({ source: 'pm-crawl', url, payload })`.
4. `content.js` nhận message, forward qua `chrome.runtime.sendMessage` đến background.
5. `background.js` gom vào queue in-memory + mirror `chrome.storage.local`.
6. Batch ≥ 50 items hoặc alarm 30s → POST `/api/ingest`.
7. `routers/ingest.py` validate schema → gọi `ingest_service`.
8. Service parse theo `endpoint` → upsert `products`, `shops`, `categories` bằng `INSERT ... ON DUPLICATE KEY UPDATE` ([ADR-0004](adr/0004-upsert-on-dup-key.md)).
9. Ghi 1 record `crawl_log` cho mỗi batch.
10. Response thống kê → background cập nhật `sent/pending/failed` → popup hiển thị.

## Vì sao chia inject / content / background

| Script | World | Đặc quyền | Lý do |
|--------|-------|-----------|-------|
| inject.js | page | Đọc biến global page, override `window.fetch` | Content script không chia sẻ `window` với page — không wrap được fetch thật |
| content.js | isolated | `chrome.runtime.*`, DOM readonly page | Cần bridge vì page-world không có `chrome.*` |
| background.js | service worker | Network không CORS, `chrome.storage`, `chrome.tabs` | Gom batch, persist, gọi API backend |

Chi tiết: [ADR-0006](adr/0006-inject-page-world.md).

## Schema MySQL (tóm tắt)

- **`shops`** — PK `id` (shopid Shopee), cột chuẩn hoá + `raw_json`.
- **`categories`** — PK `id` (catid), `parent_id`, `level`.
- **`products`** — PK `id` (itemid), FK → `shops`, `categories`, nhiều metric (price, sold, rating…), `raw_json`, `first_seen_at` / `last_seen_at`.
- **`crawl_log`** — audit mỗi batch: endpoint, source_url, items_count, received_at.

Chi tiết schema: [plan-phase-1.md](plan-phase-1.md#schema-mysql). Lý do lưu `raw_json`: [ADR-0003](adr/0003-raw-json.md).

## Biên (boundary)

- Extension chỉ tin backend của mình (config `backend_url` trong popup).
- Backend phase 1 **không auth** (chạy localhost, dev). Khi deploy production nên thêm API key header — xem [../operations/deploy-ubuntu.md](../operations/deploy-ubuntu.md).
- Không lưu cookie / header Shopee trong DB (chỉ raw response item).

## Failure modes

| Failure | Hành xử |
|---------|---------|
| Backend tắt | Batch giữ trong `chrome.storage.local`, retry backoff (1/2/5/10s, tối đa 4 lần); popup báo `failed` tăng |
| Service worker bị kill | Queue đã mirror storage → khôi phục khi SW re-spawn (hàm `restoreState()`) |
| Shopee đổi schema JSON | `raw_json` vẫn lưu; nếu `_normalize_product` fail → skip item và ghi vào `errors`, không crash batch |
| DB lock / deadlock | Rollback + trả 500 → extension retry batch đó |
| Batch quá lớn | FastAPI trả 413 (theo `INGEST_MAX_BATCH`); background chia nhỏ batch size trước khi gửi |
