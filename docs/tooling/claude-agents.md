# Tạo Claude Agent Team cho ProductMap

Hướng dẫn tạo một "team" các **subagent trong Claude Code** để hỗ trợ dev dự án ProductMap. Subagent là persona chuyên biệt có system prompt + tool allowlist riêng, được Claude chính ủy quyền khi task phù hợp.

> Tài liệu tham chiếu chính thức: https://code.claude.com/docs/en/sub-agents

---

## 1. Khi nào nên tạo subagent

Tạo subagent khi:
- Có loại task **lặp lại** trong dự án (review code service, viết migration, debug extension, viết ADR…).
- Muốn **cô lập context**: không để output tìm kiếm dài nhét vào cuộc hội thoại chính.
- Muốn **giới hạn tool** chỉ read-only cho một nhánh việc (vd. reviewer).
- Muốn **đổi model** cho task cụ thể (dùng Haiku cho explore nhanh, Opus cho thiết kế phức tạp).

Không cần subagent cho việc 1–2 bước đơn giản — gọi trực tiếp Claude là đủ.

---

## 2. Cấu trúc file subagent

Mỗi subagent là **1 file Markdown** có **YAML frontmatter** + **body là system prompt**.

```markdown
---
name: shopee-api-reverser
description: Expert về Shopee internal API (search_items, pdp/get_pc, recommend). Proactively dùng khi cần parse response mới, thêm endpoint vào inject.js hook, hoặc normalize field mới trong ingest_service.
tools: Read, Grep, Glob, WebFetch
model: sonnet
---

You are an expert reverse-engineer of Shopee's internal mobile/web APIs...
(system prompt chi tiết viết ở đây)
```

### Field frontmatter

| Field | Bắt buộc | Giá trị | Ghi chú |
|-------|---------|---------|---------|
| `name` | ✅ | lowercase + dấu gạch ngang (vd. `shopee-api-reverser`) | Phải unique |
| `description` | ✅ | 1–3 câu mô tả khi Claude nên delegate | **Đây là trigger chính cho auto-delegate** — viết cụ thể, chèn "Use proactively" khi muốn Claude tự gọi |
| `tools` | ❌ | comma-separated: `Read, Grep, Bash` | Nếu bỏ trống → kế thừa full tool của parent. Cho review-only agent nên allowlist read-only |
| `disallowedTools` | ❌ | comma-separated | Denylist, áp dụng trước `tools` |
| `model` | ❌ | `sonnet`, `opus`, `haiku`, `inherit`, hoặc ID cụ thể (`claude-opus-4-7`) | Mặc định `inherit` |
| `permissionMode` | ❌ | `default`, `acceptEdits`, `auto`, `plan`, `bypassPermissions` | Parent mode thắng nếu parent đang ở bypass/auto |
| `maxTurns` | ❌ | số | Giới hạn turn trước khi dừng |
| `color` | ❌ | `red`/`blue`/`green`/... | Hiển thị UI |
| `memory` | ❌ | `user` / `project` / `local` | Subagent tự lưu memory qua phiên |

Body Markdown sau `---` = **system prompt** của subagent. Viết cụ thể: vai trò, kiến thức nền, quy trình làm việc, định dạng output mong muốn.

---

## 3. Vị trí file và thứ tự ưu tiên

| Vị trí | Phạm vi | Ưu tiên (cao → thấp) |
|-------|--------|------------------------|
| Managed settings | Toàn tổ chức | 1 |
| CLI `--agents` flag | Session hiện tại | 2 |
| `.claude/agents/` | **Project** (commit vào git) | 3 |
| `~/.claude/agents/` | User (mọi dự án) | 4 |
| Plugin `agents/` | Khi plugin bật | 5 |

Khi trùng `name`, cấp ưu tiên cao hơn thắng. **Cho ProductMap, đặt team agent ở `.claude/agents/` để commit chung với code.**

---

## 4. Cách invoke subagent

### (a) Auto-delegate
Claude chính đọc `description` của từng subagent và tự gọi khi task match. Không cần cú pháp đặc biệt. **`description` càng cụ thể + có từ khoá "Proactively" / "Use immediately after…"** thì khả năng được gọi càng cao.

### (b) Gõ thẳng tên
- `@agent-<name>` trong prompt để ép gọi 1 lần.
- Ví dụ: `@agent-mysql-schema-reviewer review migration 0002_add_fulltext.py`

### (c) Session-wide
`claude --agent <name>`: toàn phiên dùng system prompt + tools + model của subagent đó.

### (d) Quản lý: `/agents`
Slash command mở UI list/tạo/sửa/xoá subagent.

---

## 5. Best practices

- **Description phải cụ thể, có action + trigger**: viết như mẩu tin "khi có X thì gọi tôi". Ví dụ tốt:
  > "Expert code review specialist. **Proactively reviews** code for quality, security, and maintainability. **Use immediately after** writing or modifying code."
  Ví dụ kém: "Review code." → Claude không biết khi nào gọi.
- **Tool allowlist tối thiểu**: reviewer chỉ cần `Read, Grep, Glob` — không cho `Edit/Write/Bash` để tránh tác dụng phụ ngoài ý muốn.
- **Model phù hợp task**: Haiku cho explore/nhanh; Sonnet cho default; Opus cho design/refactor phức tạp.
- **Prompt handover**: khi main agent gọi subagent, phải "brief" cụ thể (path file, số dòng, ngữ cảnh) vì subagent **không thấy** hội thoại trước đó.
- **1 việc / 1 agent**: tránh "god agent" ôm đồm. Chia nhỏ theo domain (schema / extension / ADR / deploy…).
- **Commit vào git**: tất cả subagent dự án nằm ở `.claude/agents/` và review qua PR.

---

## 6. Gotchas

- **Context isolation**: subagent bắt đầu sạch. Không thấy transcript cha → phải nhét paths, errors, quyết định vào prompt khi gọi.
- **Không nest**: subagent không gọi được subagent khác.
- **Permission parent thắng**: nếu main session đang `bypassPermissions` thì subagent không thể "giảm quyền" xuống `default`.
- **Chi phí context**: subagent trả kết quả dài → đẩy vào context cha. Yêu cầu subagent tóm tắt ngắn (`"báo cáo dưới 200 từ"`).
- **Plugin agent hạn chế**: plugin-level subagent không hỗ trợ `hooks`, `mcpServers`, `permissionMode`. Nếu cần → copy về `.claude/agents/`.
- **Model override chain**: env `CLAUDE_CODE_SUBAGENT_MODEL` > per-invocation > frontmatter > main conversation.

---

## 7. Template

Copy file dưới đây khi tạo agent mới — lưu ở `.claude/agents/<tên>.md`:

```markdown
---
name: <ten-agent>
description: <1-3 câu: vai trò + khi nào delegate. Chèn "Proactively" nếu muốn auto-gọi>
tools: Read, Grep, Glob
model: sonnet
color: blue
---

# Vai trò
<Mô tả ngắn agent là ai, chuyên gì.>

# Kiến thức nền (dự án ProductMap)
- Stack: Chrome Extension MV3 + FastAPI + MySQL. Xem docs/getting-started/overview.md.
- Kiến trúc: docs/design/architecture.md
- ADR: docs/design/adr/

# Quy trình làm việc
1. Đọc kỹ file/đoạn mã được nhắc đến.
2. <Bước chuyên biệt cho agent này>
3. Output theo format quy định bên dưới.

# Format output
- <Mô tả format mong muốn, vd. checklist, markdown table>

# Giới hạn
- Không tự chỉnh sửa code nếu không được yêu cầu rõ.
- Luôn cite file:line khi nhận xét.
```

---

## 8. Team đề xuất cho ProductMap

Đặt tất cả ở `.claude/agents/` trong repo. Mỗi file một agent. Dưới đây là bộ 6 agent bao phủ các domain chính.

### 8.1 `shopee-api-reverser.md`
- **Vai trò**: đọc response mẫu của Shopee API và đề xuất field mapping trong `backend/app/services/ingest_service.py`.
- **Tools**: `Read, Grep, Glob, WebFetch`
- **Model**: `sonnet`
- **Khi gọi**: thêm endpoint mới, Shopee đổi schema, ingest báo nhiều item `skipped`.
- **Description gợi ý**:
  > "Expert về Shopee internal API (search_items, pdp/get_pc, recommend, shop/*). **Proactively** dùng khi cần thêm endpoint vào inject.js hook, viết/chỉnh normalizer trong ingest_service.py, hoặc debug `skipped` count cao. Không sửa code — chỉ propose mapping + path file cần đổi."

### 8.2 `mysql-schema-reviewer.md`
- **Vai trò**: review Alembic migration (`backend/alembic/versions/*.py`) và gợi ý index/FK/collation.
- **Tools**: `Read, Grep, Glob`
- **Model**: `sonnet`
- **Khi gọi**: thêm migration mới, thêm cột/bảng, cần FULLTEXT index (phase 3).
- **Description gợi ý**:
  > "Reviewer cho Alembic migration + MySQL 8 schema của ProductMap. **Use immediately after** tạo file migration mới trong `backend/alembic/versions/`. Check: utf8mb4 charset, InnoDB, FK ondelete, index hợp lý, BIGINT PK, VARCHAR length. Không sửa file — xuất checklist issue + gợi ý."

### 8.3 `ext-debugger.md`
- **Vai trò**: debug Chrome Extension MV3 (service worker, page-world inject, postMessage bridge).
- **Tools**: `Read, Grep, Glob, Bash`
- **Model**: `sonnet`
- **Khi gọi**: popup không thấy "sent" tăng, SW bị kill, CORS, `chrome.storage` bất thường.
- **Description gợi ý**:
  > "Chuyên gia Chrome Extension Manifest V3: service worker lifecycle, content script ↔ page-world bridge, `chrome.storage`, `chrome.alarms`, CORS cho extension origin. **Proactively** dùng khi extension không gửi data, SW restart loop, hoặc thêm permission mới vào manifest.json."

### 8.4 `ingest-service-reviewer.md`
- **Vai trò**: review Python code trong `backend/app/services/ingest_service.py` (parser + upsert).
- **Tools**: `Read, Grep, Glob`
- **Model**: `sonnet`
- **Khi gọi**: sửa parser, thêm endpoint xử lý, tối ưu upsert.
- **Description gợi ý**:
  > "Reviewer chuyên sâu file `backend/app/services/ingest_service.py`. Kiểm: tính idempotent của INSERT ... ON DUPLICATE KEY UPDATE, bind param, normalization field null-safe, không để raw SQL injection. **Use immediately after** chỉnh ingest_service.py hoặc `schemas.py` liên quan."

### 8.5 `adr-writer.md`
- **Vai trò**: viết ADR mới theo template, cập nhật `docs/design/adr/README.md` index.
- **Tools**: `Read, Grep, Glob, Write, Edit`
- **Model**: `sonnet`
- **Khi gọi**: có quyết định kỹ thuật mới (đổi DB, thêm queue, chọn search engine…).
- **Description gợi ý**:
  > "Viết ADR mới cho ProductMap theo `docs/design/adr/_template.md`. Đánh số tiếp theo, thêm vào bảng index ở `docs/design/adr/README.md`, giữ giọng điệu 'Bối cảnh → Quyết định → Lý do → Hệ quả → Thay thế đã cân nhắc'. **Proactively** dùng khi hội thoại chạm tới một quyết định kỹ thuật chưa có ADR."

### 8.6 `deploy-runbook.md`
- **Vai trò**: tư vấn & sinh lệnh cho deploy/ops trên Ubuntu (systemd, Nginx, MySQL, certbot).
- **Tools**: `Read, Grep, Glob`
- **Model**: `sonnet`
- **Khi gọi**: chuẩn bị lên staging/prod, troubleshoot trên server.
- **Description gợi ý**:
  > "Ops reference cho ProductMap backend trên Ubuntu 22.04/24.04 theo `docs/operations/deploy-ubuntu.md`. Dùng khi cần soạn lệnh systemctl, nginx conf, alembic upgrade trên server, hoặc phân tích log `journalctl -u productmap-api`. Không SSH thật — chỉ tạo lệnh để user copy chạy."

---

## 9. Workflow triển khai team

1. **Tạo thư mục**: `mkdir -p .claude/agents`
2. **Viết từng file `.md`** theo template ở mục 7 và đặc tả ở mục 8.
3. **Commit** cùng PR: `git add .claude/agents/`.
4. **Test bằng `/agents`**: mở Claude Code → `/agents` → thấy 6 agent mới.
5. **Test auto-delegate**: thử prompt `"review migration mới 0002_add_fulltext.py"` — xem Claude có tự gọi `mysql-schema-reviewer` không. Nếu không → chỉnh `description` thêm từ khoá / "Proactively".
6. **Iterate**: sau vài ngày dùng, xem agent nào ít được gọi (→ sửa description) hoặc bị gọi sai ngữ cảnh (→ viết lại scope).

---

## 10. Mở rộng sau này

- **Phase 2** (auto-browser): thêm agent `ext-auto-browser-designer` giúp thiết kế module `chrome.tabs.create` + scroll seed keyword.
- **Phase 3** (search API): thêm agent `search-indexer-architect` tư vấn FULLTEXT vs Elasticsearch (theo [ADR-0005](../design/adr/0005-search-later.md)).
- **Security review**: dùng sẵn skill `/security-review` của Claude Code cho PR lớn, không cần tạo agent riêng.

---

## Tham chiếu

- Claude Code subagent docs: https://code.claude.com/docs/en/sub-agents
- Agent SDK (nếu muốn nhúng agent vào backend runtime): https://code.claude.com/docs/en/agent-sdk/subagents
- ADR template dự án: [../design/adr/_template.md](../design/adr/_template.md)
- Kiến trúc ProductMap: [../design/architecture.md](../design/architecture.md)
