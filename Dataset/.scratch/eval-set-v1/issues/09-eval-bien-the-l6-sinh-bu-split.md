# 09: Eval: biến thể L2 / L7 / L6(c), L6(b) có bằng chứng, sinh bù / cắt bớt theo hạn mức, tách dev / test

**Phía:** dự án bộ đánh giá (`Dataset/`)

**What to build:** Từ câu L1 / L3 đã duyệt, dựng biến thể L2 (diễn đạt lại / không dấu) và L7 (hội thoại) cùng `seed_id`; từ câu L1 đã duyệt, dựng L6(c) tiền đề sai kèm span bác bỏ. Sinh L6(b) (an ninh nhưng corpus không có) kèm bằng chứng: từ khoá tiếng Anh đã grep trên snapshot và top-20 của 2 retriever, để người xác nhận. Hạn mức áp lên số câu giữ lại sau duyệt: ô thiếu chỉ sinh bù cho đúng ô đó, ô thừa bỏ bớt theo seed cố định. Tách dev / test theo `seed_id` để không biến thể nào ở hai split. Spec: user story 23-25, 29-31.

**Blocked by:** 05, 08 (retriever cho bằng chứng L6(b))

**Status:** ready-for-agent

- [ ] Biến thể mang đúng `seed_id` của câu gốc; L6(c) có span bác bỏ
- [ ] L6(b) có bằng chứng grep + top-20 hiển thị được cho người duyệt
- [ ] Test bằng client giả: ô thiếu chỉ sinh bù ô đó; ô thừa cắt tái lập được theo seed
- [ ] Không `seed_id` nào ở cả dev và test; `check` qua trên kết quả
