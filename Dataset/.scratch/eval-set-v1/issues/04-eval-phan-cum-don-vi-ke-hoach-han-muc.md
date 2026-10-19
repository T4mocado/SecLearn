# 04: Eval: phân cụm, đơn vị lấy mẫu, kế hoạch hạn mức phương án R

**Phía:** dự án bộ đánh giá (`Dataset/`)

**What to build:** Lệnh `clusters` dựng file phân cụm khởi đầu theo tên tài liệu vào 10 cụm (miền đặc thù gộp vào kiến trúc, quy trình; CSRF vào trình duyệt; nhóm WSTG ánh xạ theo spec) để người duyệt và sửa. Đơn vị lấy mẫu: mục `##` của cheat sheet, test case WSTG, phần mở đầu WSTG; vùng loại: mục lục WSTG, phụ lục payload, tham khảo. Lệnh `plan` tính hạn mức theo phương án R (ADR 0003): cụm theo √ chunk, trong cụm theo √ chunk tài liệu (WSTG của cụm là một tài liệu rồi chia theo test case), trần mỗi tài liệu, phần dư lớn nhất, seed cố định; sàn 100 câu trả lời được mỗi cụm trên test; 6 mức L1-L5, L7 khoảng 183 câu mỗi mức; 200 câu L6 (50 / 100 / 50) ngoài sàn; khớp hai biên bằng lặp tỉ lệ đến ±5%; L3 chỉ cho đơn vị ≥ 2 chunk, L4 / L5 lấy cặp đơn vị cùng cụm; dev khoảng 150 + 25 L6 (1 : 2 : 1) theo cùng tỉ lệ, không sàn. Kế hoạch lưu cùng seed và in bảng cụm × mức. Spec: user story 15-22, 25.

**Blocked by:** 03 (code trên fixture); 02 (chạy thật và duyệt file phân cụm)

**Status:** ready-for-human

- [x] Test `plan` trên fixture cho hạn mức khớp số tính tay với seed cố định
- [x] Đơn vị lấy mẫu có offset trên markdown; vùng loại bị đánh dấu không lấy mẫu
- [x] Bảng phân bố cụm × mức được in và lưu cùng seed
- [ ] Chạy thật trên snapshot của 02: file phân cụm được người duyệt, kế hoạch cho WSTG khoảng 10% bộ đánh giá

## Comments

**2026-10-19, agent:** Phần code đã xong. Còn lại tiêu chí 4: **bạn duyệt file phân cụm**.

**Lệnh** (chạy trong `Dataset/`):
1. `uv run seclearn-eval clusters --snapshot corpus/2026-10-18-owasp`: dựng `clusters.json` khởi đầu theo tên tài liệu (133 cheat sheet: ai 9, api 7, arch 22, auth 17, authz 10, browser 13, framework 13, inj 17, supply 17, transport 8; nhóm WSTG theo spec). Lệnh không bao giờ ghi đè file đã có (trừ khi dùng `--force`).
2. `uv run seclearn-eval units --snapshot corpus/2026-10-18-owasp`: ghi `corpus/2026-10-18-owasp/units.jsonl`.
3. `uv run seclearn-eval plan --snapshot corpus/2026-10-18-owasp`: ghi `questions/v1.0/sample-plan.json` và bảng `sample-plan.md`.

Sau khi sửa `clusters.json`, chạy lại bước 2 và 3.

**Đơn vị lấy mẫu** (2.999 đơn vị, 2.838 lấy mẫu được):
- Cheat sheet: mỗi mục `##` là một đơn vị. Mục con chung chung (Do, Don't, Pros, Cons, Example, Recommendation…) gộp vào mục trước; tiêu đề rỗng (`## X Cheat Sheet`) gộp vào mục sau.
- Bị loại: 153 mục tham khảo (References, Related Articles, Mapping to OWASP projects…).
- WSTG: 97 test case. INFO-09 và INPV-03 bị loại vì chỉ là stub "This content has been merged into…" (bước sửa trích xuất ở ticket 01 chỉ bỏ "removed").
- Các phần khác của WSTG: Foreword + chương 1-3, Reporting và phụ lục F (Dev Tools) lấy mẫu được, thuộc cụm arch. Mục lục, danh sách phụ lục và phụ lục A (công cụ), B (đọc thêm), C-D (payload), E (lịch sử) bị loại. Spec chỉ nêu payload và tham khảo; việc loại A và E là lựa chọn của agent, bạn xem lại.
- Mỗi đơn vị có `chunks` (số chunk chồng lên, dùng cho điều kiện L3 ≥ 2) và `weight_chunks` (số chunk có điểm giữa nằm trong đơn vị, tổng khớp 5.915, dùng làm trọng số).

**Kế hoạch** (seed 20261018):
- Test: 1.100 câu trả lời được, 5 cụm đúng sàn 100 (ai, api, authz, framework, transport), lớn nhất arch 144; mỗi mức 183-184; L6 50/100/50 (L6(c) chia theo cụm).
- Dev: 150 câu trả lời được + L6 6/13/6.
- Tổng 1.475 slot. WSTG chiếm 10,9% câu trả lời được (79 đơn vị WSTG có câu). Cả 133 cheat sheet có câu ở test, một tài liệu nhiều nhất 15 (GraphQL), một đơn vị WSTG nhiều nhất 13. Trần 20 áp cho từng cheat sheet và từng đơn vị WSTG; phần WSTG của mỗi cụm không bị trần ở mức tài liệu, vì nó đã được tính như một tài liệu.
- Mức được gán theo khả năng: L3 chỉ cho đơn vị ≥ 2 chunk; L4/L5 nhận thêm một đơn vị cùng cụm, chọn theo trọng số. Ô nào vượt sức chứa thì được đổi chéo với cụm khác mà vẫn giữ cả hai biên.
- Cùng seed cho cùng kế hoạch (có test).

**Test:** 31 pytest. Gồm số tính tay (hạn mức cụm 23/19/18; trong cụm, cheat sheet 13 câu, WSTG 10 câu chia 6/4, các mục 8/4/1), sàn, trần, khớp biên, khả năng theo mức, và đơn vị của snapshot mẫu (đã thêm Foreword, Reporting, phụ lục và một stub "merged" vào WSTG mẫu).
