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
| Database | MySQL 8 (qua Laragon khi dev, self-host khi prod) |
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
└── backend/                # FastAPI + MySQL
    ├── requirements.txt
    ├── .env.example
    ├── alembic/
    └── app/
        ├── main.py
        ├── config.py
        ├── db.py
        ├── models.py
        ├── schemas.py
        ├── routers/
        │   ├── ingest.py
        │   └── stats.py
        └── services/
            └── ingest_service.py
```

## Môi trường dev

- **OS dev**: Windows 11 + Laragon
- **Python**: 3.11+, `venv` riêng trong `backend\.venv`
- **Chrome**: bật Developer mode, Load unpacked từ `extension\`
- **DB**: `productmap` trong MySQL của Laragon

Bắt đầu nhanh → [quick-start.md](quick-start.md).

## Scope theo phase

**Phase 1** *(hiện tại)* — Crawl + Storage
- Extension intercept API Shopee khi user duyệt
- Backend nhận batch, upsert MySQL
- Không có UI search

**Phase 2** — Auto-browser + Scale
- Extension tự mở tab theo seed keyword/category, tự scroll
- Queue job, resume, dedup cross-session
- Tiến tới 1 triệu SP

**Phase 3** — Search API
- FULLTEXT MySQL hoặc Elasticsearch
- Endpoint `/api/search` với filter theo giá, shop, category
- Có thể có frontend riêng

## Tài liệu liên quan

- [quick-start.md](quick-start.md) — chạy dev local
- [../design/architecture.md](../design/architecture.md) — sơ đồ kiến trúc
- [../design/plan-phase-1.md](../design/plan-phase-1.md) — plan chi tiết
- [../design/adr/README.md](../design/adr/README.md) — ADR index
- [../operations/deploy-ubuntu.md](../operations/deploy-ubuntu.md) — deploy production
