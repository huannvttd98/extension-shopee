# Plan Phase 1 — Crawler + Storage

> Plan này **đã được user duyệt** ngày 2026-04-20. Bản gốc còn ở `C:\Users\vihuan\.claude\plans\t-i-mu-n-l-m-tool-hashed-naur.md`.

## Context

Dự án khởi đầu chỉ có `README.md` nêu 3 yêu cầu:
1. Crawl data Shopee
2. Mục tiêu ~1 triệu sản phẩm theo chủ đề
3. Có API tìm kiếm sản phẩm sau khi crawl *(để phase 3)*

Phase 1 lo: **crawl + storage**.

Hướng đã chốt: Chrome Extension MV3 intercept Shopee internal API → batch POST về FastAPI → MySQL. Lý do chi tiết ở [ADR-0001](adr/0001-extension-vs-server.md) và [ADR-0002](adr/0002-fastapi-mysql.md).

---

## Phần 1 — Chrome Extension (MV3)

### `manifest.json`
- `manifest_version: 3`
- `permissions`: `storage`, `scripting`, `activeTab`, `alarms`
- `host_permissions`: `https://shopee.vn/*`, `https://*.shopee.vn/*`, `http://localhost:8000/*`
- `background.service_worker`: `src/background.js`
- `content_scripts` match `https://shopee.vn/*` → `src/content.js` (run_at: `document_start`)
- `web_accessible_resources`: `src/inject.js`
- `action.default_popup`: `src/popup/popup.html`

### `inject.js` (page-world)
Phải chạy page-world để wrap `window.fetch` và `XMLHttpRequest` thật của SPA.

- Wrap `window.fetch`: clone response, parse JSON nếu URL match các endpoint:
  - `/api/v4/search/search_items`
  - `/api/v4/pdp/get_pc`
  - `/api/v4/recommend/recommend`
  - `/api/v4/shop/get_shop_detail`
  - `/api/v4/shop/search_items`
  - `/api/v4/catalog/get_sub_categories`
  - `/api/v4/flash_sale/*`
- Wrap `XMLHttpRequest.prototype.open` + `onload` tương tự.
- `postMessage({ source: 'pm-crawl', url, endpoint, payload, ts })` lên window.

Chi tiết lý do tách page-world: [ADR-0006](adr/0006-inject-page-world.md).

### `content.js` (isolated world)
- Inject `inject.js` vào page-world bằng `<script src=chrome.runtime.getURL('src/inject.js')>` trước khi DOM ready.
- Lắng nghe `message`, filter `source === 'pm-crawl'`, forward sang background.

### `background.js` (service worker)
- Nhận message → enqueue in-memory + mirror `chrome.storage.local` (`pm_queue_v1`).
- Flush: batch 50 items HOẶC alarm `pm-flush` (period 30s).
- POST `http://localhost:8000/api/ingest`.
- Retry exponential backoff: 1s / 2s / 5s / 10s (tối đa 4 lần). Thất bại → giữ trong queue.
- Expose state cho popup: `{ sent, pending, failed, last_endpoint, last_error }`.

### `popup`
- Toggle ON/OFF (lưu `chrome.storage.sync`).
- Input `backend_url` (mặc định `http://localhost:8000`).
- Stats: sent / pending / failed / endpoint + lỗi gần nhất.
- Buttons: **Retry ngay**, **Xoá queue**.

---

## Phần 2 — Backend FastAPI + MySQL

### Dependencies
- `fastapi`, `uvicorn[standard]`
- `sqlalchemy>=2`, `pymysql`
- `alembic`
- `pydantic>=2`, `pydantic-settings`
- `python-dotenv`

Production thêm `gunicorn` ([ops/deploy-ubuntu.md](../operations/deploy-ubuntu.md)).

### `.env.example`
```
DATABASE_URL=mysql+pymysql://root:@127.0.0.1:3306/productmap?charset=utf8mb4
CORS_ORIGINS=*
INGEST_MAX_BATCH=500
LOG_LEVEL=INFO
```

### Schema MySQL

```sql
CREATE TABLE shops (
  id            BIGINT PRIMARY KEY,
  name          VARCHAR(255),
  location      VARCHAR(128),
  rating        DECIMAL(3,2),
  follower_count INT,
  raw_json      JSON,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE categories (
  id         BIGINT PRIMARY KEY,
  name       VARCHAR(255),
  parent_id  BIGINT NULL,
  level      TINYINT,
  raw_json   JSON,
  INDEX idx_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE products (
  id            BIGINT PRIMARY KEY,
  shop_id       BIGINT,
  category_id   BIGINT NULL,
  name          VARCHAR(500),
  price         BIGINT,
  price_min     BIGINT,
  price_max     BIGINT,
  currency      VARCHAR(8) DEFAULT 'VND',
  stock         INT,
  sold          INT,
  historical_sold INT,
  liked_count   INT,
  rating_avg    DECIMAL(3,2),
  rating_count  INT,
  image         VARCHAR(255),
  images_json   JSON,
  brand         VARCHAR(128),
  location      VARCHAR(128),
  raw_json      JSON,
  first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (shop_id)     REFERENCES shops(id)      ON DELETE SET NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  INDEX idx_shop (shop_id),
  INDEX idx_category (category_id),
  INDEX idx_name (name(191)),
  INDEX idx_last_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE crawl_log (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  endpoint    VARCHAR(255),
  source_url  VARCHAR(1000),
  items_count INT,
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_endpoint (endpoint),
  INDEX idx_received (received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Phase này **chưa** thêm FULLTEXT — xem [ADR-0005](adr/0005-search-later.md).

Phase 2 MVP (auto-scan) thêm 2 bảng (migration 0003):

```sql
CREATE TABLE crawl_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  keyword VARCHAR(500),
  source VARCHAR(32) DEFAULT 'autoscan',
  tab_url VARCHAR(1000),
  max_scrolls INT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  status VARCHAR(32) DEFAULT 'running',   -- running | done | aborted | error
  reason VARCHAR(64),
  scroll_ticks INT DEFAULT 0,
  items_seen INT DEFAULT 0,
  products_upserted INT DEFAULT 0,
  INDEX (status), INDEX (started_at), INDEX (keyword(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_crawl_sessions (
  product_id BIGINT,
  session_id BIGINT,
  first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id, session_id),
  FOREIGN KEY (product_id) REFERENCES products(id)       ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES crawl_sessions(id) ON DELETE CASCADE,
  INDEX (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Dùng junction table thay vì FK `session_id` trong `products` vì 1 SP có thể thấy lại ở nhiều phiên (dedup cross-session cho Phase 2 full).

### Endpoints

**`POST /api/ingest`**
```python
class IngestBatch(BaseModel):
    source_url: str
    endpoint: str           # "search_items", "get_pc", ...
    items: list[dict]
```
Service logic trong `services/ingest_service.py`:
- Parse theo `endpoint`:
  - `search_items`, `recommend` → item trong `items[].item_basic`
  - `get_pc` (PDP) → `data.item`
- Normalize: trích `itemid`, `shopid`, `catid`, `name`, `price`, `stock`, `sold`, `image`, `rating_avg`, ...
- Upsert batch `INSERT ... ON DUPLICATE KEY UPDATE` ([ADR-0004](adr/0004-upsert-on-dup-key.md)).
- Upsert `shops` + `categories` kèm theo.
- Ghi `crawl_log`.
- Response: `{ upserted_products, upserted_shops, upserted_categories, skipped, errors }`.

**`GET /api/stats`** — tổng SP / shop / cat, batch gần nhất.

**`GET /api/products`** — list sản phẩm đã crawl, có filter + pagination.
- Query: `q` (tìm theo name, LIKE), `shop_id`, `category_id`, `min_price`, `max_price`.
- Sort: `sort` ∈ `last_seen_at | first_seen_at | price | sold | historical_sold | rating_avg | liked_count`; `order` ∈ `asc | desc`.
- Pagination: `limit` (1–100, default 20), `offset` (default 0).
- Response: `{ total, limit, offset, items: ProductBrief[] }` — không kèm `raw_json` để nhẹ.

**`GET /api/products/{id}`** — chi tiết 1 sản phẩm (kèm `raw_json`, `images_json`, nested `shop` + `category`).

**Scan-sessions** (xem lịch sử quét, thêm ở mở rộng Phase 2 MVP):
- `POST /api/scan-sessions` — extension tạo session ngay trước khi mở tab quét.
- `PATCH /api/scan-sessions/{id}` — cập nhật `status`, `reason`, `scroll_ticks`, `items_seen`, `finished` khi done/stop/abort.
- `GET /api/scan-sessions` — list sessions (filter `status`, `keyword`, pagination).
- `GET /api/scan-sessions/{id}` — detail 1 session.
- `GET /api/scan-sessions/{id}/products` — list SP đã quét trong session (qua bảng nối).

`POST /api/ingest` nhận thêm field optional `session_id`. Nếu có, service insert thêm vào `product_crawl_sessions` và increment counter.

**`GET /healthz`** — liveness.

### CORS
`CORSMiddleware` theo env `CORS_ORIGINS`. Dev: `*`. Prod: `chrome-extension://<id>`.

### Chạy dev
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

---

## Các bước triển khai

1. Backend khung: FastAPI + `/healthz` + kết nối MySQL.
2. Alembic migration + models (4 bảng).
3. `/api/ingest` tối thiểu: nhận batch, ghi `crawl_log`.
4. Ingest service: parse `search_items` → upsert `products`, `shops`, `categories`.
5. Extension skeleton: manifest + background + popup.
6. Inject + content script: hook fetch, log URL.
7. Background batch + POST backend, verify MySQL có row.
8. Popup stats.
9. Parse thêm `get_pc`, `recommend`.
10. Retry / queue persist cho service worker.

Tất cả **đã hoàn thành**. Xem repo hiện tại.

---

## Verification (end-to-end)

Hướng dẫn chạy test → [../getting-started/quick-start.md](../getting-started/quick-start.md).

---

## Ngoài phạm vi phase này

- API search (`/api/search`) + FULLTEXT/ES → phase 3.
- ~~Auto-browser trong extension (tự mở tab, scroll theo seed)~~ → **MVP đã có** (ADR-0007): popup tab "Quét tự động", background mở tab `shopee.vn/search?keyword=...&pm_autoscan=1`, content script `autoscan.js` tự scroll tới hết.
- Queue nhiều keyword / dedup cross-session → phase 2 mở rộng.
- Proxy / anti-detection → không cần.
- Docker / CI → sau khi MVP chạy ổn.

---

## Rủi ro đã biết

- **Shopee đổi cấu trúc API** → giảm thiểu bằng `raw_json` ([ADR-0003](adr/0003-raw-json.md)).
- **CORS** → config `CORS_ORIGINS` đúng `chrome-extension://<id>` khi deploy.
- **SW MV3 bị kill** → mirror queue xuống `chrome.storage.local`.
- **Rate limit Shopee** → thấp vì chạy trong trình duyệt user.
