# Tổng quan dự án

## Mục tiêu

1. **Crawl dữ liệu sản phẩm Shopee** (`shopee.vn`).
2. Quy mô mục tiêu: **~1 triệu sản phẩm** theo chủ đề / category.
3. Cung cấp **API tìm kiếm sản phẩm** trên data đã crawl *(phase 3)*.

## Hướng tiếp cận

Dùng **Chrome Extension (MV3)** tận dụng session thật của user để intercept response từ Shopee internal API khi user duyệt/scroll → đẩy batch về backend lưu MySQL.

Ưu điểm so với crawl server-side:
- Dùng cookie / header hợp lệ của trình duyệt → ít bị anti-bot chặn.
- Không cần proxy pool.
- Lấy trực tiếp từ API nội bộ (JSON sạch) → không parse HTML.

Nhược điểm:
- Phase 1 phụ thuộc thao tác user. Phase 2 thêm auto-browser.
- Tốc độ bị giới hạn bởi rate tự nhiên của trình duyệt.

Lý do sâu hơn: [ADR-0001](../design/adr/0001-extension-vs-server.md).

## Stack

| Tầng | Công nghệ |
|------|-----------|
| Crawler | Chrome Extension MV3 (JS thuần) |
| Backend | Python 3.11+, FastAPI, Uvicorn / Gunicorn |
| ORM / Migration | SQLAlchemy 2.x, Alembic |
| Database | MySQL 8 hoặc MariaDB 11 (qua Laragon khi dev, self-host khi prod) |
| Viewer (PWA) | Vite 5 + Tailwind 4 + vanilla JS, mount vào FastAPI tại `/app` (xem [ADR-0008](../design/adr/0008-pwa-viewer-vite.md)) |
| Search | *(phase 3)* MySQL FULLTEXT hoặc Elasticsearch |

ADR liên quan: [0002 FastAPI+MySQL](../design/adr/0002-fastapi-mysql.md).

## Cấu trúc thư mục (gốc dự án)

```
d:\laragon\www\ProductMap\
├── README.md
├── docs/                   # Tài liệu (file này ở đây)
├── extension/              # Chrome Extension MV3
│   ├── manifest.json
│   └── src/
│       ├── inject.js       # page-world: hook fetch/XHR
│       ├── content.js      # bridge page ↔ background
│       ├── background.js   # batch + retry + POST backend
│       └── popup/
└── backend/                # FastAPI + MySQL + PWA viewer
    ├── requirements.txt
    ├── .env.example
    ├── alembic/            # migration 0001 init, 0002 fulltext, 0003 crawl_sessions
    ├── app/                # FastAPI app
    │   ├── main.py         # mount /api, /healthz, /app (static PWA nếu webapp/dist có)
    │   ├── config.py
    │   ├── db.py
    │   ├── models.py
    │   ├── schemas.py
    │   ├── routers/
    │   │   ├── ingest.py
    │   │   ├── products.py
    │   │   ├── scan_sessions.py
    │   │   └── stats.py
    │   └── services/
    │       └── ingest_service.py
    └── webapp/             # Viewer PWA (ADR-0008)
        ├── package.json    # vite + tailwind + vite-plugin-pwa
        ├── vite.config.js  # base:/app/, proxy /api → :8000 khi `npm run dev`
        ├── index.html
        ├── src/            # pages/ components/ api.js router.js utils.js
        └── dist/           # build output — FastAPI serve tại /app (gitignore)
```

## Môi trường dev

- **OS dev**: Windows 11 + Laragon
- **Python**: 3.11+, `venv` riêng trong `backend\.venv`
- **Chrome**: bật Developer mode, Load unpacked từ `extension\`
- **DB**: `productmap` trong MySQL của Laragon

Bắt đầu nhanh → [quick-start.md](quick-start.md).

## Scope theo phase

**Phase 1** — Crawl + Storage *(done)*
- Extension intercept API Shopee khi user duyệt
- Backend nhận batch, upsert MySQL
- Endpoint `/api/products`, `/api/products/{id}`, `/api/stats`

**Phase 2 — MVP** *(hiện tại)* — Auto-scan + Viewer
- Extension auto-scan: mở tab Shopee theo keyword, tự scroll tới hết ([ADR-0007](../design/adr/0007-autoscan-tab-scroll.md))
- Bảng `crawl_sessions` + `product_crawl_sessions`, endpoint `/api/scan-sessions`
- **PWA Viewer** `backend/webapp/` mount tại `/app` để xem SP + lịch sử phiên ([ADR-0008](../design/adr/0008-pwa-viewer-vite.md))
- Migration 0002 thêm `FULLTEXT` index cho phase 3 (chưa dùng)

**Phase 2 — mở rộng** — Scale
- Queue nhiều keyword, dedup cross-session, chạy background không cần user
- Tiến tới 1 triệu SP

**Phase 3** — Search API
- Dùng FULLTEXT (đã có index từ migration 0002) hoặc Elasticsearch
- Endpoint `/api/search` với filter theo giá, shop, category
- Có thể mở rộng viewer PWA thành trang search chính

## Tài liệu liên quan

- [quick-start.md](quick-start.md) — chạy dev local
- [../design/architecture.md](../design/architecture.md) — sơ đồ kiến trúc
- [../design/plan-phase-1.md](../design/plan-phase-1.md) — plan chi tiết
- [../design/adr/README.md](../design/adr/README.md) — ADR index
- [../operations/deploy-ubuntu.md](../operations/deploy-ubuntu.md) — deploy production
