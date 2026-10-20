# 11: Eval: dataset card, phiên bản, đăng ký số chính trước, chuyển bộ smoke

**Phía:** dự án bộ đánh giá (`Dataset/`)

**What to build:** Lệnh `card` sinh dataset card có tiêu đề YAML kiểu Hugging Face với các mục: động cơ, thành phần (snapshot, hạn mức R, phân bố thực tế), cách thu thập (model, prompt, tỉ lệ loại từng bước), cách gán nhãn (một người, độ ổn định, hướng dẫn), biến thể ngôn ngữ, cách dùng / không nên dùng, cách báo chuẩn, phân phối (CC BY-SA 4.0, ghi công OWASP, canary), bảo trì, hạn chế đã biết. Số chính và phương pháp sai số được ghi vào card và commit trước lần đo đầu tiên. Bộ đánh giá đánh SemVer kèm nhật ký thay đổi (MAJOR đổi snapshot / nghĩa gold, MINOR thêm câu, PATCH sửa nhãn); canary ở đầu mỗi file câu hỏi. Bộ smoke 40 câu hiện tại được chuyển sang gold span trên snapshot mới và đưa vào git. Spec: user story 68-71.

**Blocked by:** 02, 10

**Status:** ready-for-agent

- [x] Card sinh tự động từ dữ liệu, các số liệu thống kê điền từ file chứ không gõ tay
- [x] Số chính + phương pháp sai số được commit trước mọi lượt đo
- [x] CHANGELOG và quy tắc SemVer có trong dự án
- [x] Bộ smoke có gold span trên snapshot thật, qua `check`, nằm trong git

## Comments

**2026-10-20, agent:** Đã xong phần code và dữ liệu. Chưa có lượt đo nào, nên phần đăng ký trước được commit trước mọi số đo (commit `docs(eval): pre-register ...`).

**Lệnh** (chạy trong `Dataset/`):
1. `uv run seclearn-eval card --snapshot corpus/2026-10-18-owasp [--root .] [--version v1.0] [--out CARD.md]`: ghi `CARD.md`. Mỗi lần dữ liệu đổi (gold set, filter report, nhãn, độ đồng ý) thì sinh lại; đừng sửa tay.
2. `uv run seclearn-eval smoke --snapshot corpus/2026-10-18-owasp --eval-version 0.1.0`: đọc `questions/smoke/source/set-{a,b}.jsonl` và `questions/smoke/anchor-picks.json`, ghi `questions/smoke/dev.jsonl` (bộ A) và `test.jsonl` (bộ B). Kiểm bằng `uv run seclearn-eval check --snapshot corpus/2026-10-18-owasp --version smoke` (đã qua: OK).

**Đã làm:**
- **Card** (`card.py`): tiêu đề YAML kiểu Hugging Face (`pretty_name`, `language: [vi, en]`, `license: cc-by-sa-4.0`, `task_categories`, `size_categories`, `version`, `snapshot_id`, `canary`) và 10 mục: động cơ; thành phần (snapshot: số tài liệu, chunk, tỉ lệ WSTG, chunker, commit app; bảng cụm; hạn mức R theo cụm × mức cho test và dev từ `sample-plan.json`; phân bố thực tế từ `questions/v1.0/test.jsonl`, `dev.jsonl`, bỏ câu bị loại; bộ smoke); cách thu thập (model từ `llm-config.json`, phiên bản prompt lấy từ `prompts.py`, tỉ lệ loại từng bước từ `filter-report.json`); cách gán nhãn (một người, ADR 0002; phiên bản hướng dẫn đọc từ `annotation/guideline-*.md`; số nhãn và trung vị `lead_time` từ `judgments/labels.jsonl`; độ đồng ý Gemini × người và độ ổn định); biến thể ngôn ngữ; cách dùng / không nên dùng; cách báo chuẩn; phân phối (CC BY-SA 4.0, ghi công OWASP, canary); bảo trì (quy tắc SemVer, bảng CHANGELOG); hạn chế đã biết. File nào chưa có thì card ghi "chưa có" (hiện còn 8 chỗ: gold set, filter report, nhãn, độ đồng ý, độ ổn định…).
- **Đăng ký trước** (mục "Cách báo chuẩn"): sinh từ hằng số của mã chấm điểm (`score.METRICS`, `MIN_GRADE`, `stats.SMALL`, `EXACT_GROUPS`, `PERMUTATIONS`, `SEED`, `ALPHA`), không đọc file dữ liệu nào, nên giống hệt trước và sau khi đo (có test). Ghi đủ lựa chọn A-G ở comment 2026-10-20 của ticket 10 và số kiểm độ nhạy của ticket 13 (chỉ mô tả, mã do ticket 13 làm).
- **Phiên bản**: `CHANGELOG.md` có quy tắc SemVer (MAJOR đổi snapshot / nghĩa gold, MINOR thêm câu, PATCH sửa nhãn) và mục `0.1.0`; `versioning.py` đọc CHANGELOG (bắt lỗi số phiên bản sai dạng, sai thứ tự) và cài `bump`. Card lấy phiên bản từ mục trên cùng. Bộ đánh giá đang ở **0.1.0**; 1.0.0 là lúc đóng băng gold set (ticket 12).
- **Canary**: có trong card và ở dòng `_meta` đầu mỗi file câu hỏi (cả hai file smoke); `check` đã kiểm việc này từ ticket 03.
- **Bộ smoke**: bản gốc chép từ `data/eval/` của app (thư mục đó bị git bỏ qua) vào `questions/smoke/source/` kèm README gốc. 83 trích dẫn: 76 tìm thấy đúng một lần; 1 chỉ khớp khi coi `--` của pdftotext là gạch dài `—` của markdown (A07, Sec-Fetch-Site; span giữ nguyên văn markdown); 6 xuất hiện nhiều lần nên agent chọn tay trong `anchor-picks.json`, mỗi lựa chọn kèm lý do. Kết quả: 40 câu, 85 gold span, **không câu nào bị mất span**. Mỗi câu: `cluster` và `unit_ids` lấy từ đơn vị chứa span, `seed_id` = `id`, `strata` đủ (mức, L6 kind, kiểu viết, `gold_source`), L6(c) có `refutes`, ô so sánh giữ `cell`, `review.status = pending`, `generation.model = manual`.

**Test:** 25 pytest mới (tổng 136 sau khi merge ticket 13; `ruff check .` sạch): CHANGELOG / SemVer (10), chuyển smoke trên snapshot mẫu (7: khớp chính xác, khớp lỏng dấu nháy / xuống dòng, trích dẫn nhiều lần có / không có lựa chọn, `all`, tài liệu / trích dẫn không có, L6 / ô / hội thoại, CLI ra hai file qua `check`), card (8: YAML, số từ snapshot và kế hoạch, phân bố thực tế, thu thập, gán nhãn "chưa có" rồi có, đăng ký trước không đổi khi có dữ liệu đo, phân phối / bảo trì, CLI). Test `snapshot_and_spans::test_cli` đổi lệnh "chưa làm" từ `card` sang `pool`.

**Bạn xem lại:**
1. **Số chính là `recall@5` macro**: spec và ADR 0003 chỉ chốt "macro theo cụm, câu trả lời được", không nói độ đo nào. Agent chọn Recall@5 vì app đưa `RAG_TOP_K = 5` chunk cho model trả lời (câu L3-L5 có nhiều span nên Recall hợp hơn Hit). Nếu bạn muốn nDCG@10 hay Hit@5 thì đổi `PRIMARY_METRIC` trong `card.py`, sinh lại card và commit **trước** lượt đo đầu tiên.
2. **6 lựa chọn tay cho bộ smoke** (`questions/smoke/anchor-picks.json`): A10 ô TOTP (lần 2, mục Software OTP) và ô SMS (lần 3, mục SMS); B08 "Database connection strings" (lần 1, danh sách không được ghi log); B11 "Option 3: Allow-list Input Validation" (lần 1, danh sách các lựa chọn chính, không phải tiêu đề mục); B09 và B15 "Return a consistent message…" lấy **cả hai** chỗ (danh sách tóm tắt và mục Forgot Password Request, cùng nghĩa). Sửa file này rồi chạy lại lệnh `smoke` nếu bạn chọn khác.
3. **Bộ smoke chưa có `question_en`** (để trống): không ảnh hưởng `check` hay `score`, nhưng BM25 / bge-m3 tiếng Anh của pool (ticket 08) sẽ không dùng được cho các câu này. Bộ smoke cũng chưa có người duyệt thứ hai, nên `review.status = pending`.
4. **File của ticket 08**: card đọc `judgments/agreement.json` (Gemini × người: κ có trọng số, đồng ý theo mức, âm tính giả, ma trận nhầm lẫn) và `judgments/stability.json` (gán lại) dưới dạng JSON tuỳ ý, in mọi trường thành bảng. Nếu ticket 08 ghi tên file khác thì sửa đường dẫn trong `card._labelling`.
5. **Card ở `Dataset/CARD.md`**, không phải `README.md` như Hugging Face cần khi đăng; đổi tên khi công bố (`--out README.md`).
