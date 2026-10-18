# 02: Reindex, smoke trước / sau, xuất snapshot thật đầu tiên

**Phía:** app SecLearn (thao tác của người)

**What to build:** Corpus được reindex một lần với bộ trích và bộ cắt mới, có số smoke trước và sau để ghi nhận tác động của việc sửa trích xuất, và snapshot corpus đầu tiên nằm trong vùng snapshot của `Dataset/`. Spec: user story 6, 7; "Kiểm thật một lần".

**Blocked by:** 01

**Status:** ready-for-human

- [ ] Chạy smoke trước reindex, lưu kết quả
- [ ] Chạy lệnh reindex có sẵn trên toàn corpus; mọi tài liệu ở trạng thái sẵn sàng, không có cảnh báo bỏ chunk
- [ ] Chạy smoke sau reindex, lưu kết quả cạnh bản trước và ghi chênh lệch
- [ ] Xuất snapshot thật; lệnh không từ chối
- [ ] Kiểm tay vài chunk WSTG có tiêu đề test case đúng và không còn `## Sheet`
