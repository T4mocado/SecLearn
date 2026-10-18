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
