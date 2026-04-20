# ProductMap — Docs

Tài liệu của dự án **ProductMap** (crawl sản phẩm Shopee bằng Chrome Extension + backend FastAPI + MySQL).

Cấu trúc theo **vòng đời**: đọc trước — thiết kế — vận hành.

## Mục lục

### getting-started/ — Người đọc: ai lần đầu vào dự án
- [overview.md](getting-started/overview.md) — mục tiêu, stack, cấu trúc thư mục, scope theo phase.
- [quick-start.md](getting-started/quick-start.md) — chạy pipeline dev local trong ~10 phút.

### design/ — Người đọc: dev, architect
- [architecture.md](design/architecture.md) — sơ đồ luồng dữ liệu end-to-end (Extension → FastAPI → MySQL, PWA Viewer → FastAPI), failure modes.
- [plan-phase-1.md](design/plan-phase-1.md) — plan triển khai crawl + storage (đã duyệt, đã code).
- [adr/](design/adr/) — Architecture Decision Records, 1 file / quyết định (hiện có ADR-0001 → ADR-0008).

### operations/ — Người đọc: devops, người trực hệ thống
- [deploy-ubuntu.md](operations/deploy-ubuntu.md) — deploy backend lên Ubuntu (systemd + Nginx + TLS + backup).

### tooling/ — Người đọc: dev team
- [claude-agents.md](tooling/claude-agents.md) — tạo team subagent Claude Code hỗ trợ dev ProductMap (6 agent đề xuất: shopee-api-reverser, mysql-schema-reviewer, ext-debugger, ingest-service-reviewer, adr-writer, deploy-runbook).

## Quy ước ghi docs

- **Tiếng Việt** cho nội dung giải thích. **Tiếng Anh** cho tên file, tên kỹ thuật, code.
- **Thay đổi kiến trúc / stack / scope** → thêm ADR mới vào `design/adr/` (không sửa ADR cũ).
- **Plan phase mới** → tạo `design/plan-phase-N.md` riêng, không ghi đè.
- **Mỗi thư mục con có `README.md`** làm index.
- Liên kết nội bộ dùng đường dẫn tương đối từ file hiện tại.
