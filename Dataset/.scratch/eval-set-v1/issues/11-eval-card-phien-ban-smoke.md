# 11: Eval: dataset card, phiên bản, đăng ký số chính trước, chuyển bộ smoke

**Phía:** dự án bộ đánh giá (`Dataset/`)

**What to build:** Lệnh `card` sinh dataset card có tiêu đề YAML kiểu Hugging Face với các mục: động cơ, thành phần (snapshot, hạn mức R, phân bố thực tế), cách thu thập (model, prompt, tỉ lệ loại từng bước), cách gán nhãn (một người, độ ổn định, hướng dẫn), biến thể ngôn ngữ, cách dùng / không nên dùng, cách báo chuẩn, phân phối (CC BY-SA 4.0, ghi công OWASP, canary), bảo trì, hạn chế đã biết. Số chính và phương pháp sai số được ghi vào card và commit trước lần đo đầu tiên. Bộ đánh giá đánh SemVer kèm nhật ký thay đổi (MAJOR đổi snapshot / nghĩa gold, MINOR thêm câu, PATCH sửa nhãn); canary ở đầu mỗi file câu hỏi. Bộ smoke 40 câu hiện tại được chuyển sang gold span trên snapshot mới và đưa vào git. Spec: user story 68-71.

**Blocked by:** 02, 10

**Status:** ready-for-agent

- [ ] Card sinh tự động từ dữ liệu, các số liệu thống kê điền từ file chứ không gõ tay
- [ ] Số chính + phương pháp sai số được commit trước mọi lượt đo
- [ ] CHANGELOG và quy tắc SemVer có trong dự án
- [ ] Bộ smoke có gold span trên snapshot thật, qua `check`, nằm trong git
