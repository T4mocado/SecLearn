# 08: Eval: 5 hệ truy xuất, pool, Gemini chấm, độ đồng ý, qrels

**Phía:** dự án bộ đánh giá (`Dataset/`)

**What to build:** Lệnh `pool` chạy 5 hệ trên chunk của snapshot (BM25 trên `question_en`; embedding tiếng Việt cùng model của app; embedding đó + bge-reranker; bge-m3 câu tiếng Việt; bge-m3 `question_en`), cache embedding chunk theo `md_sha256` + model, pool = hợp top-10 + chunk phủ gold span. Lệnh `judge` cho Gemini chấm 0-3 toàn pool theo prompt kiểu UMBRELA, rồi chọn phần người chấm: chunk Gemini ≥ 1 cộng 10% mẫu (seed cố định) chunk Gemini cho 0; chunk người chấm 2-3 ngoài gold mở rộng gold bằng span mới. Tính κ có trọng số và tỉ lệ đồng ý theo mức giữa Gemini và người, và độ ổn định của người gán trên bộ gán lại. Lệnh `qrels` sinh qrels TREC cho một `chunker_version`: chunk liên quan khi giao ≥ 50% độ dài span hoặc chứa trọn span, nhãn người ghi đè. Spec: user story 50 (phần tính), 52-58.

**Blocked by:** 05 (LLM client), 06 (project "chấm pool" và annotate)

**Status:** ready-for-agent

- [ ] Test qrels trên fixture: đúng quy tắc 50%, chứa trọn span, nhãn pool ghi đè
- [ ] Test chọn mẫu người chấm tái lập được với seed cố định
- [ ] Test κ có trọng số và độ ổn định trên dữ liệu nhỏ có đáp số tính tay
- [ ] Judge chạy qua client giả trong test; embedding được cache
- [ ] Qrels là sản phẩm sinh ra, không sửa tay
- [ ] Prompt chấm 0-3 của Gemini có các bước đánh giá tường minh, đánh số (đọc câu, xác định thông tin cần, đối chiếu chunk, rồi mới cho điểm) và định nghĩa từng mức 0-3 bằng lời, không chỉ một câu tiêu chí chung; có số phiên bản prompt
- [ ] Báo ma trận nhầm lẫn Gemini × người (4 × 4 mức, và gộp liên quan ≥ 2 / không liên quan), tách riêng tỉ lệ âm tính giả: chunk Gemini cho 0 mà người chấm ≥ 2, ước từ mẫu 10%

## Comments

**2026-10-20, agent:** Thêm hai tiêu chí cuối theo yêu cầu của bạn, lấy ý từ bài DeepEval về LLM-as-a-judge (https://deepeval.com/blog/llm-as-a-judge):
- Các bước đánh giá tường minh (`evaluation_steps` của G-Eval) làm judge ổn định hơn một câu tiêu chí chung. Giữ khung UMBRELA, chỉ viết rõ các bước và định nghĩa mức.
- Với pool, lỗi nguy hiểm là âm tính giả: Gemini cho 0 một chunk thật ra liên quan thì chunk đó vắng khỏi qrels và hệ truy xuất bị chấm thấp oan. Mẫu 10% chunk Gemini cho 0 đo đúng lỗi này, nên báo riêng con số đó (để ticket 11 ghi vào card), cạnh κ có trọng số.
