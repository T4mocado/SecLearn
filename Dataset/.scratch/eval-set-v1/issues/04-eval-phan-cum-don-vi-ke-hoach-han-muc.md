# 04: Eval: phân cụm, đơn vị lấy mẫu, kế hoạch hạn mức phương án R

**Phía:** dự án bộ đánh giá (`Dataset/`)

**What to build:** Lệnh `clusters` dựng file phân cụm khởi đầu theo tên tài liệu vào 10 cụm (miền đặc thù gộp vào kiến trúc, quy trình; CSRF vào trình duyệt; nhóm WSTG ánh xạ theo spec) để người duyệt và sửa. Đơn vị lấy mẫu: mục `##` của cheat sheet, test case WSTG, phần mở đầu WSTG; vùng loại: mục lục WSTG, phụ lục payload, tham khảo. Lệnh `plan` tính hạn mức theo phương án R (ADR 0003): cụm theo √ chunk, trong cụm theo √ chunk tài liệu (WSTG của cụm là một tài liệu rồi chia theo test case), trần mỗi tài liệu, phần dư lớn nhất, seed cố định; sàn 100 câu trả lời được mỗi cụm trên test; 6 mức L1-L5, L7 khoảng 183 câu mỗi mức; 200 câu L6 (50 / 100 / 50) ngoài sàn; khớp hai biên bằng lặp tỉ lệ đến ±5%; L3 chỉ cho đơn vị ≥ 2 chunk, L4 / L5 lấy cặp đơn vị cùng cụm; dev khoảng 150 + 25 L6 (1 : 2 : 1) theo cùng tỉ lệ, không sàn. Kế hoạch lưu cùng seed và in bảng cụm × mức. Spec: user story 15-22, 25.

**Blocked by:** 03 (code trên fixture); 02 (chạy thật và duyệt file phân cụm)

**Status:** ready-for-agent

- [ ] Test `plan` trên fixture cho hạn mức khớp số tính tay với seed cố định
- [ ] Đơn vị lấy mẫu có offset trên markdown; vùng loại bị đánh dấu không lấy mẫu
- [ ] Bảng phân bố cụm × mức được in và lưu cùng seed
- [ ] Chạy thật trên snapshot của 02: file phân cụm được người duyệt, kế hoạch cho WSTG khoảng 10% bộ đánh giá
