# 01: App: markdown sạch, chunk có offset, lệnh xuất snapshot corpus

**Phía:** app SecLearn

**What to build:** Sau khi trích văn bản, mỗi test case WSTG có tiêu đề `## WSTG-XXXX-NN <tên>`, test case chỉ ghi "This content has been removed" không thành mục có nội dung, và dòng rác `## Sheet` biến mất; các tài liệu khác giữ nguyên. Mỗi chunk lưu vào cột metadata JSON có sẵn `{char_start, char_end, md_sha256, chunker_version}`, trong đó khoảng `[char_start, char_end)` trỏ vào **phần thân** chunk trên đúng chuỗi markdown được lưu (không tính tiêu đề chèn lại, kể cả câu chồng lấn). Có một lệnh xuất snapshot chạy cùng kiểu lệnh reindex: đọc tài liệu + chunk từ DB, rồi một hàm thuần dựng thư mục snapshot (markdown từng tài liệu, manifest, danh sách chunk) ghi thẳng vào vùng snapshot của `Dataset/`. Spec: user story 1-5, 8-14; Seam 1 và Seam 2.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Fixture WSTG rút gọn cho ra đúng tiêu đề `## WSTG-XXXX-NN <tên>`; test case "removed" không thành mục; `## Sheet` biến mất
- [x] Bất biến được test: với mọi chunk, markdown tại `[char_start, char_end)` khớp phần thân chunk sau chuẩn hoá khoảng trắng, kể cả chunk có tiêu đề chèn lại, câu chồng lấn và khối dài bị cắt cứng
- [x] Offset đúng trên chuỗi markdown lưu vào tài liệu (ánh xạ ngược nếu bộ cắt chuẩn hoá đầu vào); sanitize / trim / lọc chunk rỗng không làm lệch chỉ số
- [x] Hàm cắt chunk cũ giữ chữ ký và cho ra đúng danh sách văn bản như trước; `chunker_version` là hằng số
- [x] Không đổi schema DB
- [x] Manifest theo trường Croissant: tên, `snapshot_id` (ngày + tên), phiên bản, ngày, giấy phép, commit app + cờ dirty, cấu hình chunker (phiên bản, cỡ, chồng lấn), canary GUID, và từng tài liệu: khoá ổn định (tên file bỏ tiền tố thời gian / mã ngẫu nhiên), tiêu đề, file nguồn, sha256 nguồn, sha256 markdown, số ký tự, số chunk, trạng thái, URL nguồn, ngày lấy
- [x] Danh sách chunk có khoá `doc_key#seq`, offset, và id DB chỉ để tra ngược
- [x] Test hàm dựng snapshot (không cần Postgres): sha256 khớp markdown, số chunk khớp, offset nằm trong độ dài markdown, khoá bỏ đúng tiền tố, từ chối khi có tài liệu chưa sẵn sàng hoặc có cảnh báo bỏ chunk khi nhúng
- [x] Toàn bộ chạy qua lệnh test hiện có của app

## Comments

**2026-10-18, agent:** Đã làm xong.
- Làm sạch: `addWstgHeadings` (mới) và `removeSiteChrome` (bỏ `## Sheet`) trong bước làm sạch PDF. Chạy thử trên markdown WSTG đang lưu trong DB: 97 tiêu đề `## WSTG-XXXX-NN <tên>` cho 97 mã, không còn dòng `ID` hay "This content has been removed" nào. Test case bị bỏ là WSTG-INPV-13 "Testing for Buffer Overflow" (mã này bị dùng hai lần, lần còn lại là Format String Injection).
- Bộ cắt: `chunkMarkdownWithSpans` + `CHUNKER_VERSION = "sentence-v2"`; `chunkMarkdown` giữ chữ ký. Kiểm trên cả 134 tài liệu trong DB: bộ cắt cũ và mới cho ra cùng danh sách văn bản ở 134/134 tài liệu, và 5.800/5.800 span khớp phần thân chunk.
- Ingest ghi `metadata = {char_start, char_end, md_sha256, chunker_version}`; văn bản và offset đi theo cặp qua bước sanitize / lọc chunk rỗng. Không đổi schema DB.
- Lệnh xuất: `npm run db:snapshot` (mặc định ghi vào `Dataset/corpus/<ngày>-owasp/`, không ghi đè snapshot đã có). Hàm thuần `buildSnapshot` nằm trong `src/lib/snapshot.ts` và có test. Chạy thử trên DB hiện tại thì lệnh từ chối đúng như mong đợi: "5800 problem(s) … no offsets in metadata (reindex first)". Chỗ này chờ ticket 02.
- Định dạng snapshot: `manifest.json`, `md/<doc_key>.md`, `chunks.<chunker_version>.jsonl` (mỗi dòng có cả `text` của chunk để các retriever ở ticket 08 dùng). `source_url` suy ra từ khoá tài liệu (cheat sheet, WSTG), không khớp mẫu thì để null. `retrieved` lấy theo ngày upload.
