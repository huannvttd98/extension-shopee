# ProductMap

Crawl sản phẩm Shopee bằng **Chrome Extension (MV3)** + **FastAPI** + **MySQL**, xem data qua **PWA viewer** (tại `/app/`).

## Mục tiêu

1. Crawl data Shopee
2. ~1 triệu sản phẩm theo chủ đề
3. API tìm kiếm sản phẩm sau khi crawl *(phase 3)*

## Trạng thái

- **Phase 1** — Crawl + Storage: done.
- **Phase 2 (MVP)** — Auto-scan theo keyword + Viewer PWA: đang dùng.
- **Phase 3** — Search API trên FULLTEXT / ES: chưa làm.

## Bắt đầu

- Đọc tổng quan → [docs/getting-started/overview.md](docs/getting-started/overview.md)
- Chạy thử dev local → [docs/getting-started/quick-start.md](docs/getting-started/quick-start.md)
- Deploy production → [docs/operations/deploy-ubuntu.md](docs/operations/deploy-ubuntu.md)

## Tài liệu

Xem [docs/README.md](docs/README.md) — index đầy đủ theo vòng đời:
- **getting-started/** — overview, quick start
- **design/** — architecture, plan, ADR (0001 → 0008)
- **operations/** — deploy, ops
