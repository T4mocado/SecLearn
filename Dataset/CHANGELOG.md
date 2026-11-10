# Nhật ký thay đổi của bộ đánh giá SecLearn

Phiên bản MAJOR.MINOR.PATCH (spec user story 70). Mọi số đo ghi phiên bản bộ đánh giá nó đo trên (`eval_version`
trong `runs/<run_id>/config.json` và ở dòng đầu mỗi file câu hỏi).

- **MAJOR**: đổi snapshot corpus, hoặc đổi nghĩa của gold (quy tắc liên quan, định nghĩa mức, thang chấm).
  Số đo trên hai MAJOR khác nhau không so trực tiếp được.
- **MINOR**: thêm câu (sinh bù, thêm split / bộ mới) mà không đổi nghĩa câu cũ.
- **PATCH**: sửa nhãn (span, mức, đáp án tham chiếu, nhãn pool) của câu đã có.

`seclearn_eval.versioning.bump` cài đúng các quy tắc này; `card` đọc phiên bản hiện tại từ mục trên cùng của file
này. Mỗi mục có dạng `## [x.y.z] - YYYY-MM-DD` (mục chưa phát hành ghi `chưa phát hành` thay cho ngày), mới nhất ở
trên.

## [0.2.0] - 2026-11-10

### Thêm
- Gold set đầu tiên, đóng băng ở các câu đã duyệt (ADR 0005): 199 câu của đợt duyệt lớn (hướng dẫn v1) và 50 câu
  pilot (hướng dẫn v0), tổng 249 câu, `questions/v1.0/test.jsonl` và `dev.jsonl`. Chỉ có L1, L3, L4, L5, L6(a);
  không đạt sàn 100 câu mỗi cụm của kế hoạch. 795 câu chưa duyệt không vào gold.
- Pool 5 hệ thống × sâu 10 (6.947 chunk) có điểm Gemini `judge-umbrela-v1`; không có nhãn người chấm pool (ADR 0005).
  `qrels/sentence-v2.qrels` chỉ từ gold span: 493 chunk liên quan, 3.636 chunk Gemini cho 0 ghi là đã chấm.
- Lượt đo đầu tiên trên test (`runs/`): baseline, answer mode và ba lượt ablation (no-rerank, no-translate, cand50).

## [0.1.0] - 2026-10-20

### Thêm
- Bộ smoke 40 câu của app (`data/eval/set-a.jsonl`, `set-b.jsonl`) chuyển sang gold span trên snapshot
  `2026-10-18-owasp`: `questions/smoke/dev.jsonl` (bộ A), `questions/smoke/test.jsonl` (bộ B); bản gốc ở
  `questions/smoke/source/`, lựa chọn tay cho trích dẫn xuất hiện nhiều lần ở `questions/smoke/anchor-picks.json`.
- Dataset card (`CARD.md`) với phần "Cách báo chuẩn" đăng ký trước lượt đo đầu tiên (số chính, sai số, kiểm định).
- Kế hoạch lấy mẫu `questions/v1.0/sample-plan.json` (phương án R, seed cố định).
