# 13: Eval: số kiểm độ nhạy của sai số theo cụm (nhóm = cụm chủ đề)

**Phía:** dự án bộ đánh giá (`Dataset/`)

**What to build:** Lệnh `score` tính thêm sai số chuẩn theo cụm dưới hai cách nhóm thận trọng hơn, để kiểm xem việc xếp câu L4 / L5 vào nhóm của đơn vị đầu tiên có làm sai số bị đánh giá thấp không (lựa chọn D ở comment 2026-10-20 của ticket 10):
- **Gộp nhóm theo cặp**: mỗi câu L4 / L5 nối nhóm của hai tài liệu nó dùng (union-find, nối dây chuyền trong cụm chủ đề); áp cho micro, macro, từng cụm và từng mức.
- **Nhóm = cụm chủ đề** (10 nhóm), chỉ cho micro. Với từng cụm và macro, cách này suy biến (mỗi cụm chỉ còn một nhóm), nên không tính.

Kết quả ghi vào `scores.json` cạnh sai số chính, kèm số nhóm và tỉ số SE thay thế / SE chính; `report` thêm bảng "Kiểm độ nhạy của sai số" ở cả markdown và LaTeX. Không đổi số chính hay khoảng tin cậy chính. Spec: user story 61, 65.

**Blocked by:** 10

**Status:** ready-for-agent

- [ ] Test trên dữ liệu nhỏ có đáp số tính tay: SE khi nhóm = cụm chủ đề, và tỉ số với SE theo tài liệu
- [ ] Report hiện số kiểm độ nhạy ở cả markdown và LaTeX, sinh từ cùng kết quả
- [ ] Số chính và khoảng tin cậy chính không đổi so với trước
