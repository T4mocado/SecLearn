# Bộ đánh giá là dự án riêng trong `Dataset/`, nối với app chỉ qua snapshot corpus

Việc xây bộ đánh giá (sinh câu, lọc, gán nhãn, qrels, chấm điểm, dataset card) đặt trong **dự án Python riêng ở thư mục `Dataset/`** của repo này, tách khỏi mã app SecLearn (`src/`). Ranh giới duy nhất là **snapshot corpus** do app xuất ra (markdown từng tài liệu, `manifest.json` có sha256, chunk kèm offset); dự án bộ đánh giá không import mã app và không truy cập Postgres. Gold lưu dạng span trên markdown của snapshot, còn qrels theo chunk được sinh lại cho từng cách cắt chunk. Lý do: bộ đánh giá có vòng đời, phiên bản và giấy phép (CC BY-SA) riêng, và tái lập được mà không cần DB; đổi lại, mọi thay đổi corpus phía app chỉ đến được bộ đánh giá qua một snapshot mới.

## Considered Options

- **Repo riêng**: tách bạch nhất, nhưng phải giữ liên kết với commit của app bằng tay. Chọn thư mục trong cùng repo (2026-10-18) để một commit gắn được cả phiên bản app lẫn phiên bản bộ đánh giá, và `Dataset/` được git theo dõi (khác `/data/` bị `.gitignore` bỏ qua).

## Consequences

- Câu hỏi được sinh từ chunk, nhưng không có gì trong bộ đánh giá phụ thuộc vào id chunk của DB.
- Mỗi phiên bản bộ đánh giá ghi `snapshot_id`, sha256 và commit của app mà nó dựa vào.
- Ticket và spec của công việc bộ đánh giá nằm trong `Dataset/.scratch/`.
