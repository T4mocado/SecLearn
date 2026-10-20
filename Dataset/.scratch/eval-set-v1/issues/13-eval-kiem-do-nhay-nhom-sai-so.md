# 13: Eval: số kiểm độ nhạy của sai số theo cụm (nhóm = cụm chủ đề)

**Phía:** dự án bộ đánh giá (`Dataset/`)

**What to build:** Lệnh `score` tính thêm, cho số chính (macro trên các cụm chủ đề) và micro, sai số chuẩn theo cụm khi **nhóm sai số là cả cụm chủ đề** (10 nhóm) thay vì tài liệu / test case WSTG, để kiểm xem việc xếp câu L4 / L5 vào nhóm của đơn vị đầu tiên có làm sai số bị đánh giá thấp không (lựa chọn D ở comment 2026-10-20 của ticket 10). Kết quả ghi vào `scores.json` cạnh sai số chính, và `report` thêm một dòng / cột "SE (nhóm = cụm chủ đề)" cùng tỉ số hai SE, ở cả markdown và LaTeX. Không đổi số chính hay khoảng tin cậy chính. Spec: user story 61, 65.

**Blocked by:** 10

**Status:** ready-for-agent

- [ ] Test trên dữ liệu nhỏ có đáp số tính tay: SE khi nhóm = cụm chủ đề, và tỉ số với SE theo tài liệu
- [ ] Report hiện số kiểm độ nhạy ở cả markdown và LaTeX, sinh từ cùng kết quả
- [ ] Số chính và khoảng tin cậy chính không đổi so với trước
