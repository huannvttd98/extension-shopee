# ADR-0002 — Backend Python + FastAPI + MySQL

- **Trạng thái**: Accepted
- **Ngày**: 2026-04-20

## Bối cảnh

Laragon sẵn có PHP + MySQL trên máy dev. Cần chọn stack backend nhận batch từ Chrome Extension và lưu dữ liệu.

## Quyết định

**Python 3.11+ / FastAPI / SQLAlchemy 2 / MySQL 8**.

## Lý do

- Async I/O của FastAPI tốt cho nhận batch từ nhiều tab extension.
- Type-safe với Pydantic v2 — validate payload từ extension dễ.
- Mở đường cho phase sau (Elasticsearch, embedding/ML cho search) — hệ sinh thái Python mạnh hơn PHP.
- MySQL dùng luôn của Laragon, không phải cài thêm DB.

## Hệ quả

- **Tích cực**: codebase thuần Python, dễ test, dễ thêm task background.
- **Tiêu cực**: cần `venv` riêng trong `backend/.venv`, không dùng PHP có sẵn.
- **Việc kèm**: cần viết Alembic migration (không dùng ORM auto-create để có schema reproducible).

## Thay thế đã cân nhắc

- **PHP + Laravel**: hợp Laragon nhưng async I/O yếu cho batch ingest quy mô lớn; hệ sinh thái ML/search yếu hơn.
- **Node.js + Express**: async tốt, nhưng Python có lợi thế khi mở rộng sang xử lý/phân tích dữ liệu.
