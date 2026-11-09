# 12: Chạy toàn bộ gold set, chấm pool, gán lại, đóng băng bộ đánh giá v1.0

**Phía:** dự án bộ đánh giá (thao tác của người, dùng công cụ từ 05-11)

**What to build:** Toàn bộ quy trình chạy trên snapshot thật: sinh khoảng 2.350 ứng viên, lọc, người duyệt để giữ khoảng 1.475 câu gold (test 1.300, dev 175), dựng biến thể và sinh bù đến khi khớp kế hoạch, pool + Gemini chấm + người chấm phần cần chấm, sinh qrels, gán lại khoảng 100 mẫu sau ít nhất một tuần không nhìn nhãn cũ, sinh card và đóng băng **v1.0**. Spec: user story 50, toàn bộ "Solution" bước 1-8.

**Blocked by:** 07, 08, 09, 11

**Status:** ready-for-human

- [ ] Phân bố cuối khớp kế hoạch (sai lệch ≤ 5%), sàn 100 câu / cụm trên test đạt
- [ ] Pool được chấm; κ Gemini-người được ghi
- [ ] Gán lại 100 mẫu, độ ổn định người gán được ghi
- [ ] `check` qua; qrels sinh cho `chunker_version` hiện tại
- [ ] Card hoàn chỉnh, tag phiên bản 1.0.0 trong git

## Comments

**2026-10-25, agent (đợt duyệt lớn: câu gốc, các bước cho bạn):** File duyệt `questions/v1.0/review.jsonl`: mọi câu của `filtered.jsonl` (lọc vòng gốc, `filter-answer-v2`) và `filtered-r1.jsonl` (topup vòng 1), trừ 50 câu pilot. **995 câu**: L1 278, L3 237, L4 200, L5 229, L6(a) 51; test 855, dev 140. Thứ tự xáo cố định theo sha256 của seed kế hoạch + id, để các câu cùng mức, cùng cụm không dồn liền nhau. Task: `annotation/review/tasks.json` (995 task, hướng dẫn v1), xuất bằng:
`.venv\Scripts\seclearn-eval.exe annotate export --snapshot corpus/2026-10-18-owasp --questions questions/v1.0/review.jsonl --out annotation/review/tasks.json`

Các bước, trong `Dataset/`:
1. `cd annotation; docker compose up -d`, mở http://localhost:8080.
2. Tạo project mới **"kiểm câu (gold v1)"**. Settings → Labeling Interface → Code: dán `annotation/review.xml` **hiện tại** (có ô "Câu hỏi sửa" và các ô bắt buộc), Save.
3. Import `annotation/review/tasks.json`: phải ra đúng 995 task.
4. **Bắt buộc:** Data Manager → Columns, bỏ tích `llm_level`, `llm_answer`, `llm_quotes`, `question_en`; kiểm bằng mắt bảng không còn hiện chúng. Gán bằng "Label All Tasks".
5. Đọc `annotation/guideline-v1.md`, nhất là phần đổi so với v0 (dòng "Trạng thái" ở đầu file).
6. Mỗi đợt 1-1,5 giờ; nghỉ giữa hai task, không để task mở. **Cuối mỗi đợt** Export JSON thành `annotation/exports/raw/gold-v1.json` (ghi đè bản trước, export luôn chứa mọi task đã gán) rồi nhập về để sao lưu:
   `.venv\Scripts\seclearn-eval.exe annotate import --snapshot corpus/2026-10-18-owasp --questions questions/v1.0/review.jsonl --export annotation/exports/raw/gold-v1.json --out questions/v1.0/reviewed.jsonl`
   Nhãn cộng dồn vào `judgments/labels.jsonl`; nhập lại cùng export không thêm nhãn trùng. Câu chưa gán giữ `pending`.
7. Xong 995 câu: báo agent. Bước sau: `topup --round 2` cho ô còn thiếu sau duyệt (đọc `reviewed.jsonl`, `filtered-r1.jsonl` không cần vì câu của nó đã nằm trong `review.jsonl`), rồi `variants` và `l6b` từ câu đã duyệt (ticket 09), rồi duyệt đợt hai.

Ước thời gian: 995 × khoảng 7,4 phút ≈ 120 giờ (trung vị của pilot).

**2026-11-09, agent (đóng băng ở 249 câu, ADR 0005):** Bạn chốt dừng duyệt để kịp bảo vệ. Gold set 0.2.0 = 199 câu accepted của đợt duyệt lớn (v1) + 50 câu pilot (v0): `split` ghi `questions/v1.0/test.jsonl` 217 câu, `dev.jsonl` 32 câu, 0 câu bị cắt, 795 câu `pending` để ngoài. Chỉ có L1, L3, L4, L5, L6(a); câu trả lời được trên test mỗi cụm 13–27. Card sinh lại (dòng cuối "Hạn chế đã biết" tính từ dữ liệu), CHANGELOG có mục `[0.2.0] - chưa phát hành`. Phần "Cách báo chuẩn" không đổi.

`check` còn 140 vấn đề: 136 `[plan]` (gold không khớp kế hoạch, đúng như ADR 0005) và 4 vấn đề nhãn ở 2 câu:
- `dev-00100-c2` (Django, mật khẩu): 3 span dòng `# Checks …` (2402-2483, 2680-2733, 2992-3044) nằm đúng khe giữa hai chunk `sentence-v2` (#6 hết ở 2401, #7 bắt đầu 2484…), không chunk nào phủ. 4 span còn lại vẫn đủ trả lời.
- `test-00226-c1` (Security Terminology): span 379-445 bôi dòng trong mục lục; cùng chuỗi xuất hiện lại ở tiêu đề mục tại 578.

Các tiêu chí của ticket này (sàn, κ, gán lại, tag 1.0.0) không đạt theo phạm vi mới; ticket giữ `ready-for-human` cho tới khi xong pool / qrels / gán lại của bước tiếp theo.

**2026-11-09, agent (sửa 2 câu theo lựa chọn của bạn):** Sửa thẳng trong `questions/v1.0/reviewed.jsonl`, ghi lý do vào `review.notes` của từng câu, rồi chạy lại `split`. `dev-00100-c2`: bỏ 3 span `# Checks …`, còn 4 span. `test-00226-c1`: tiêu đề mục ở 578 cũng nằm giữa hai chunk (tiêu đề không vào chunk nào), nên span **không** chuyển sang đó mà giữ ở mục lục, mở rộng thành 361-445 (kèm dòng "Table of Contents") để chuỗi trích là duy nhất; chunk #1 phủ 66/84 ký tự. `check` giờ chỉ còn 136 `[plan]`. Lưu ý: chạy lại `annotate import` từ `gold-v1.json` sẽ ghi đè hai sửa này.
