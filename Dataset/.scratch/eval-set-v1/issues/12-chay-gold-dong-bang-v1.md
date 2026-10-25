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
