# ADR-0005 — Chưa làm API search ở phase 1

- **Trạng thái**: Accepted
- **Ngày**: 2026-04-20

## Bối cảnh

Yêu cầu 3 trong `README.md` là "API tìm kiếm sản phẩm sau khi crawl". Có thể làm ngay phase 1 hoặc để phase sau.

## Quyết định

**Để phase 3**. Phase 1 chỉ làm crawl + storage. Phase 2 lo auto-browser scale.

## Lý do

- Chưa có đủ data để đánh giá search quality (rank, từ khoá VN, alias).
- Chọn **FULLTEXT MySQL** vs **Elasticsearch** phụ thuộc quy mô thực tế đạt được và latency yêu cầu — quyết định sớm là tối ưu non-mượt.
- Giữ MVP nhỏ: verify pipeline crawl end-to-end trước khi thêm component mới.

## Hệ quả

- **Tích cực**: schema phase 1 không gánh FULLTEXT index (tránh cost write trong lúc crawl batch lớn).
- **Tiêu cực**: yêu cầu ban đầu chưa hoàn thành hết — user chấp nhận.
- **Việc kèm**: khi vào phase 3, viết migration thêm FULLTEXT index hoặc dựng ES + indexer. Cần ADR riêng.

## Thay thế đã cân nhắc

- **Làm ngay FULLTEXT MySQL phase 1**: đơn giản nhưng làm chậm ingest + có thể phải đập đi khi chuyển ES.
- **Dựng ES ngay**: overhead vận hành không đáng ở giai đoạn dữ liệu ít.
