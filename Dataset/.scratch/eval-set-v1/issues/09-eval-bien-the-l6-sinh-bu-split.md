# 09: Eval: biến thể L2 / L7 / L6(c), L6(b) có bằng chứng, sinh bù / cắt bớt theo hạn mức, tách dev / test

**Phía:** dự án bộ đánh giá (`Dataset/`)

**What to build:** Từ câu L1 / L3 đã duyệt, dựng biến thể L2 (diễn đạt lại / không dấu) và L7 (hội thoại) cùng `seed_id`; từ câu L1 đã duyệt, dựng L6(c) tiền đề sai kèm span bác bỏ. Sinh L6(b) (an ninh nhưng corpus không có) kèm bằng chứng: từ khoá tiếng Anh đã grep trên snapshot và top-20 của 2 retriever, để người xác nhận. Hạn mức áp lên số câu giữ lại sau duyệt: ô thiếu chỉ sinh bù cho đúng ô đó, ô thừa bỏ bớt theo seed cố định. Tách dev / test theo `seed_id` để không biến thể nào ở hai split. Spec: user story 23-25, 29-31.

**Blocked by:** 05, 08 (retriever cho bằng chứng L6(b))

**Status:** ready-for-agent

- [ ] Biến thể mang đúng `seed_id` của câu gốc; L6(c) có span bác bỏ
- [ ] L6(b) có bằng chứng grep + top-20 hiển thị được cho người duyệt
- [ ] Test bằng client giả: ô thiếu chỉ sinh bù ô đó; ô thừa cắt tái lập được theo seed
- [ ] Không `seed_id` nào ở cả dev và test; `check` qua trên kết quả

## Comments

**2026-10-21, agent (luật chọn đơn vị khi sinh bù, theo quyết định của bạn):** Khi sinh bù một ô thiếu, `generate` đang chọn đơn vị thay thế cho slot bị từ chối theo thứ tự: cùng tài liệu với đơn vị bị thay trước, rồi đơn vị kế hoạch dùng ít nhất (xem ticket 05, comment 2026-10-21). Ở lần chạy thật, thứ tự này làm 10 slot bị từ chối liên tiếp, vì đơn vị cùng tài liệu cũng đầy payload (WSTG-INPV, XSS Filter Evasion, WSTG-CLNT). Khi làm ticket này:
- Sau **một lần bị từ chối**, ưu tiên đơn vị của **tài liệu khác** trong cùng cụm chủ đề. Chỉ quay lại cùng tài liệu khi không còn tài liệu khác hợp lệ. Vẫn giữ luật của mức (L3 ≥ 2 chunk), trần mỗi tài liệu, và với cặp L4 / L5 thì đổi một đơn vị, giữ đơn vị kia.
- Một đơn vị đã bị từ chối ở bất kỳ slot nào thì không được chọn làm đơn vị thay thế cho slot khác.
- Có test: slot bị từ chối ở đơn vị A thì đơn vị thay thế đầu tiên thuộc tài liệu khác A; và đơn vị đã bị từ chối không bao giờ được chọn lại.
- Đổi luật này làm thay đổi request của các slot đang dùng đơn vị thay thế, nên chúng sẽ được gọi lại khi chạy `generate`. Chỉ áp luật mới cho slot còn bị từ chối hoặc ô cần sinh bù, để không tốn lại tiền cho 24 slot đã viết được (`generate-report.json`, mục `substituted`).
