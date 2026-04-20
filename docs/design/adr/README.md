# Architecture Decision Records

Mỗi ADR là 1 quyết định kỹ thuật quan trọng theo cấu trúc: **Bối cảnh → Quyết định → Lý do → Hệ quả**.

## Index

| # | Tiêu đề | Trạng thái | Ngày |
|---|--------|-----------|------|
| [0001](0001-extension-vs-server.md) | Dùng Chrome Extension thay vì crawler server-side | Accepted | 2026-04-20 |
| [0002](0002-fastapi-mysql.md) | Backend Python + FastAPI + MySQL | Accepted | 2026-04-20 |
| [0003](0003-raw-json.md) | Lưu `raw_json` song song cột chuẩn hoá | Accepted | 2026-04-20 |
| [0004](0004-upsert-on-dup-key.md) | Upsert bằng raw SQL `INSERT ... ON DUPLICATE KEY UPDATE` | Accepted | 2026-04-20 |
| [0005](0005-search-later.md) | Chưa làm API search ở phase 1 | Accepted | 2026-04-20 |
| [0006](0006-inject-page-world.md) | Inject script vào page-world (không dùng isolated world) | Accepted | 2026-04-20 |

## Quy tắc

- Mỗi ADR mới = file riêng, đánh số tăng dần, không sửa ADR cũ đã Accepted.
- Khi thay đổi quyết định cũ → tạo ADR mới với trạng thái **Supersedes 000X**, và đổi ADR cũ sang **Superseded by 000Y**.
- Trạng thái: `Proposed` → `Accepted` → `Superseded` / `Deprecated`.

## Template

Copy [_template.md](_template.md) khi tạo ADR mới.
