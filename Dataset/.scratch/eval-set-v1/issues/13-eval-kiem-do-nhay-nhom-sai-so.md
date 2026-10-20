# 13: Eval: số kiểm độ nhạy của sai số theo cụm (nhóm = cụm chủ đề)

**Phía:** dự án bộ đánh giá (`Dataset/`)

**What to build:** Lệnh `score` tính thêm sai số chuẩn theo cụm dưới hai cách nhóm thận trọng hơn, để kiểm xem việc xếp câu L4 / L5 vào nhóm của đơn vị đầu tiên có làm sai số bị đánh giá thấp không (lựa chọn D ở comment 2026-10-20 của ticket 10):
- **Gộp nhóm theo cặp**: mỗi câu L4 / L5 nối nhóm của hai tài liệu nó dùng (union-find, nối dây chuyền trong cụm chủ đề); áp cho micro, macro, từng cụm và từng mức.
- **Nhóm = cụm chủ đề** (10 nhóm), chỉ cho micro. Với từng cụm và macro, cách này suy biến (mỗi cụm chỉ còn một nhóm), nên không tính.

Kết quả ghi vào `scores.json` cạnh sai số chính, kèm số nhóm và tỉ số SE thay thế / SE chính; `report` thêm bảng "Kiểm độ nhạy của sai số" ở cả markdown và LaTeX. Không đổi số chính hay khoảng tin cậy chính. Spec: user story 61, 65.

**Blocked by:** 10

**Status:** ready-for-agent

- [x] Test trên dữ liệu nhỏ có đáp số tính tay: SE khi nhóm = cụm chủ đề, và tỉ số với SE theo tài liệu
- [x] Report hiện số kiểm độ nhạy ở cả markdown và LaTeX, sinh từ cùng kết quả
- [x] Số chính và khoảng tin cậy chính không đổi so với trước

## Comments

**2026-10-20, agent:** Phần code đã xong (chưa chạy trên dữ liệu thật vì chưa có qrels của 08).

**Đã làm:**
- `scores.json` có thêm `se_sensitivity`: mỗi dòng là một cách nhóm (`pair_merged` hoặc `topic_cluster`) × một phạm vi (micro, macro, từng cụm, từng mức), ghi số nhóm chính, số nhóm thay thế, SE thay thế và tỉ số SE thay thế / SE chính cho từng độ đo. Tỉ số để trống (`null`) khi SE chính bằng 0.
- **Gộp nhóm theo cặp** (`score.pair_merged_groups`): union-find trên nhóm sai số; mỗi câu L4 / L5 (lấy đơn vị của câu gốc theo `seed_id`, như nhóm chính) nối nhóm của mọi đơn vị nó dùng, nên mọi câu trong hai tài liệu đó chung một nhóm, kể cả ở tầng không có câu L4 / L5 (ví dụ mức L1). Macro: SE² = Σ (1/K)² SE²_cụm như `stats.combine`.
- **Nhóm = cụm chủ đề**: chỉ một dòng, cho micro.
- `report` thêm bảng "Kiểm độ nhạy của sai số" (sau bảng theo mức), ô dạng `SE (tỉ số)`, ở cả markdown và LaTeX từ cùng danh sách bảng.
- `strata`, khoảng tin cậy và so sánh ghép cặp không đổi: vẫn dùng nhóm theo đơn vị đầu tiên.

**Test:** 3 pytest mới (tổng 111). Bộ 6 câu tính tay (một câu L4 nối tài liệu A và B): micro SE chính √(14/324) giữ nguyên, gộp theo cặp √(6/324) (tỉ số √(3/7)), nhóm = cụm √(2/324) (tỉ số √(1/7)); cụm auth tỉ số √(1/7), macro SE chính √(46/1024) giữ nguyên, gộp √(34/1024); mức L1 tỉ số √0,6; L4 một câu không có tỉ số. Trên bộ cũ (không có L4 / L5) mọi tỉ số bằng 1 và các test số chính cũ vẫn qua.

**Bạn xem lại:**
1. Không tính cho hậu phân tầng và cho so sánh ghép cặp (ticket chỉ nêu micro, macro, cụm, mức). Nếu cần, thêm theo cùng cách.
2. Bảng report liệt kê mọi cụm và mọi mức (khoảng 20 dòng × 8 độ đo); nếu dài quá cho luận văn thì có thể chỉ giữ micro và macro.

**2026-10-20, agent (sửa sau review, nhánh `eval/review-fixes-2`):** `pair_merged_groups` từng gộp cho **mọi** câu có nhiều `unit_ids` và có thể nối nhóm của hai cụm chủ đề khác nhau (khi đó công thức macro SE² = Σ (1/K)² SE²_cụm cũng sai, vì nó cần nhóm lồng trong cụm). Giờ chỉ câu **L4 / L5** được gộp (`score.PAIR_LEVELS`), và một lần gộp chỉ xảy ra khi mọi câu trong hai nhóm đều thuộc cụm của câu đó (cụm của một nhóm là cụm của các câu có nhóm chính là nó), đúng như ticket viết "chuỗi nằm trong một cụm". Test mới tính tay: câu L4 của auth nối sang tài liệu của inj không gộp, câu L1 có hai đơn vị không gộp, câu L5 cùng cụm vẫn gộp. Docstring, card và chú thích bảng report ghi "chỉ trong cùng cụm chủ đề". Các số của bộ 6 câu cũ không đổi. Đổi tên hàm phụ trong `se_sensitivity` (`regrouped_se`, `beside_main`).
