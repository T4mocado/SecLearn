# 06: Eval: Label Studio, chuyển đổi annotate, thử offset span, hướng dẫn gán nhãn v0

**Phía:** dự án bộ đánh giá (`Dataset/`)

**What to build:** Label Studio chạy cục bộ bằng Docker với hai project có cấu hình giao diện lưu trong dự án: "kiểm câu" (hiện câu tiếng Việt, đoạn markdown nguồn liên tục không thấy ranh giới chunk; đánh giá câu và tự bôi span trước khi thấy đáp án LLM; chấp nhận / sửa / loại, chỉnh mức, sửa đáp án, ghi chú) và "chấm pool" (hiện câu và từng chunk, chấm 0-3). Lệnh `annotate` xuất câu hỏi → task và nhập nhãn về, giữ `completed_by`, `lead_time`, phiên bản hướng dẫn, snapshot. Hướng dẫn gán nhãn v0 do agent nháp: định nghĩa L1-L7, ví dụ tốt / xấu lấy từ corpus, quy tắc span, thang 0-3, quy tắc L6. Spec: user story 41-48, 51.

**Blocked by:** 03; 02 (ví dụ trong hướng dẫn lấy từ snapshot thật)

**Status:** ready-for-agent

- [ ] Test khứ hồi câu hỏi → task → nhập nhãn về không mất trường nào
- [ ] Thử thật một lần: bôi một span trong Label Studio, export, xác nhận offset ký tự đúng trên markdown của snapshot (ghi kết quả vào ticket)
- [ ] Thứ tự hiển thị đảm bảo người gán không thấy đáp án LLM trước khi tự bôi span
- [ ] Hướng dẫn v0 có đủ các mục và ví dụ trích từ corpus thật, có số phiên bản

## Comments

**2026-10-18, agent:** Snapshot ghi offset theo **code point Unicode** (`manifest.offset_unit = "codepoint"`), không theo đơn vị UTF-16 của JS. Lý do: một emoji 🙂 trong NodeJS_Docker_Cheat_Sheet làm mọi offset JS phía sau nó lệch 1 so với chỉ số chuỗi của Python. Label Studio chạy trên trình duyệt nên nhiều khả năng cũng trả offset theo UTF-16. Khi thử export span (tiêu chí 2), cần kiểm thêm trên một đoạn nằm sau emoji, và đổi sang code point khi nhập nhãn về.
