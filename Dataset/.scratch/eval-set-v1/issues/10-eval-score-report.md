# 10: Eval: chấm điểm và báo cáo

**Phía:** dự án bộ đánh giá (`Dataset/`)

**What to build:** Lệnh `score` nhận qrels + run TREC và cho ra Hit@k, MRR, nDCG@10, Recall@k (ranx), Judged@10 (ir-measures) theo micro, macro 10 cụm (số chính), theo mức và hậu phân tầng; mỗi số kèm sai số chuẩn điều chỉnh theo cụm (cụm là tài liệu hoặc test case WSTG, biến thể gom theo `seed_id`; phương trình 4 và 8 của Miller 2024); tầng dưới khoảng 300 câu dùng Wilson; so sánh hai cấu hình ghép cặp theo câu với sai số ghép cặp theo cụm và kiểm định Fisher randomization; L6 báo riêng (từ chối đúng / sai). Định dạng run và độ đo phần trả lời được định nghĩa nhưng chưa chạy. Lệnh `report` sinh bảng markdown và LaTeX, kết quả theo cụm kèm số câu, số tài liệu, khoảng tin cậy. Spec: user story 61-67.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Test trên dữ liệu nhỏ có đáp số tính tay: micro, macro, SE theo cụm, Wilson, so sánh ghép cặp
- [ ] L6 không bị gộp vào điểm câu trả lời được
- [ ] Report sinh được cả markdown và LaTeX từ cùng kết quả
