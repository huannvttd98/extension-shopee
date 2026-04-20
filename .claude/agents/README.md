# ProductMap Subagents

Team subagent chuyên biệt cho Claude Code, bao phủ các domain chính của dự án.

> Xem hướng dẫn đầy đủ: [../../docs/tooling/claude-agents.md](../../docs/tooling/claude-agents.md)

## Danh sách agent

| Agent | Domain | Tools | Model | Khi Claude auto-gọi |
|-------|--------|-------|-------|---------------------|
| [shopee-api-reverser](shopee-api-reverser.md) | Shopee internal API + parser | read-only + WebFetch | sonnet | Thêm endpoint vào inject.js, chỉnh normalizer, debug skipped cao |
| [mysql-schema-reviewer](mysql-schema-reviewer.md) | Alembic migration + MySQL schema | read-only | sonnet | Tạo/chỉnh migration, thêm cột/bảng |
| [ext-debugger](ext-debugger.md) | Chrome Extension MV3 | read-only + Bash | sonnet | Extension không gửi data, SW restart, CORS |
| [ingest-service-reviewer](ingest-service-reviewer.md) | Python parser + upsert | read-only | sonnet | Chỉnh ingest_service.py, schemas.py, routers/ingest.py |
| [adr-writer](adr-writer.md) | Viết ADR mới | read + Write + Edit | sonnet | Có quyết định kỹ thuật mới chưa ghi lại |
| [deploy-runbook](deploy-runbook.md) | Ops Ubuntu | read-only | sonnet | Setup / deploy / troubleshoot production |

## Cách dùng

### Auto-delegate
Claude chính đọc `description` của từng agent và tự delegate khi prompt match. Không cần cú pháp đặc biệt. Ví dụ:

> "review migration mới 0002_add_fulltext.py" → Claude gọi `mysql-schema-reviewer`.
>
> "extension popup không thấy sent tăng khi scroll shopee" → Claude gọi `ext-debugger`.

### Ép gọi
Dùng `@agent-<name>` trong prompt:
```
@agent-adr-writer ghi ADR cho quyết định chuyển từ MySQL FULLTEXT sang Elasticsearch
```

### Quản lý
Trong Claude Code gõ `/agents` → mở UI xem, edit, disable các agent.

## Quy ước viết agent cho dự án này

- **Ngôn ngữ**: description + body tiếng Việt. Tên field YAML, tool name, code giữ tiếng Anh.
- **Tools**: mặc định allowlist read-only (`Read, Grep, Glob`) + Bash/WebFetch/Edit/Write chỉ khi thực sự cần. Reviewer không được có Edit/Write.
- **Description**: bao gồm cả "khi nào dùng" + "khi nào KHÔNG dùng" nếu dễ nhầm. Chèn "Proactively" / "Use immediately after" nếu muốn auto-delegate mạnh.
- **Model**: mặc định `sonnet`. Dùng `haiku` cho task nhẹ lặp (explore, lint). Dùng `opus` cho task design nặng.
- **Cross-delegate**: nếu agent phát hiện việc thuộc domain khác → nói rõ trong output ("delegate sang shopee-api-reverser"), để main agent biết gọi tiếp.

## Mở rộng

Khi thêm agent mới:
1. Đọc template & best practices trong [../../docs/tooling/claude-agents.md](../../docs/tooling/claude-agents.md).
2. Copy file hiện có gần nhất với domain mới.
3. Chỉnh `name`, `description`, `tools`, system prompt body.
4. Thêm row vào bảng trên.
5. Commit cùng PR.

## Testing

Sau khi commit, test auto-delegate bằng vài prompt thử:
```bash
# Mở Claude Code trong repo
claude
# Thử từng prompt, xem subagent đúng có được gọi không
```
Nếu không match → chỉnh `description` cụ thể hơn (thêm action + tên file liên quan).
