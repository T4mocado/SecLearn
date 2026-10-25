# 09: Eval: biến thể L2 / L7 / L6(c), L6(b) có bằng chứng, sinh bù / cắt bớt theo hạn mức, tách dev / test

**Phía:** dự án bộ đánh giá (`Dataset/`)

**What to build:** Từ câu L1 / L3 đã duyệt, dựng biến thể L2 (diễn đạt lại / không dấu) và L7 (hội thoại) cùng `seed_id`; từ câu L1 đã duyệt, dựng L6(c) tiền đề sai kèm span bác bỏ. Sinh L6(b) (an ninh nhưng corpus không có) kèm bằng chứng: từ khoá tiếng Anh đã grep trên snapshot và top-20 của 2 retriever, để người xác nhận. Hạn mức áp lên số câu giữ lại sau duyệt: ô thiếu chỉ sinh bù cho đúng ô đó, ô thừa bỏ bớt theo seed cố định. Tách dev / test theo `seed_id` để không biến thể nào ở hai split. Spec: user story 23-25, 29-31.

**Blocked by:** 05, 08 (retriever cho bằng chứng L6(b))

**Status:** resolved

- [x] Biến thể mang đúng `seed_id` của câu gốc; L6(c) có span bác bỏ
- [x] L6(b) có bằng chứng grep + top-20 hiển thị được cho người duyệt
- [x] Test bằng client giả: ô thiếu chỉ sinh bù ô đó; ô thừa cắt tái lập được theo seed
- [x] Không `seed_id` nào ở cả dev và test; `check` qua trên kết quả

## Comments

**2026-10-21, agent (luật chọn đơn vị khi sinh bù, theo quyết định của bạn):** Khi sinh bù một ô thiếu, `generate` đang chọn đơn vị thay thế cho slot bị từ chối theo thứ tự: cùng tài liệu với đơn vị bị thay trước, rồi đơn vị kế hoạch dùng ít nhất (xem ticket 05, comment 2026-10-21). Ở lần chạy thật, thứ tự này làm 10 slot bị từ chối liên tiếp, vì đơn vị cùng tài liệu cũng đầy payload (WSTG-INPV, XSS Filter Evasion, WSTG-CLNT). Khi làm ticket này:
- Sau **một lần bị từ chối**, ưu tiên đơn vị của **tài liệu khác** trong cùng cụm chủ đề. Chỉ quay lại cùng tài liệu khi không còn tài liệu khác hợp lệ. Vẫn giữ luật của mức (L3 ≥ 2 chunk), trần mỗi tài liệu, và với cặp L4 / L5 thì đổi một đơn vị, giữ đơn vị kia.
- Một đơn vị đã bị từ chối ở bất kỳ slot nào thì không được chọn làm đơn vị thay thế cho slot khác.
- Có test: slot bị từ chối ở đơn vị A thì đơn vị thay thế đầu tiên thuộc tài liệu khác A; và đơn vị đã bị từ chối không bao giờ được chọn lại.
- Đổi luật này làm thay đổi request của các slot đang dùng đơn vị thay thế, nên chúng sẽ được gọi lại khi chạy `generate`. Chỉ áp luật mới cho slot còn bị từ chối hoặc ô cần sinh bù, để không tốn lại tiền cho 24 slot đã viết được (`generate-report.json`, mục `substituted`).

**2026-10-23, agent (code xong, chưa chạy thật):** Bốn lệnh mới, test viết trước (đỏ rồi xanh), chỉ dùng client giả, không gọi API thật. 215 pytest qua, `ruff check .` sạch. Đã qua `/code-review` (hai trục standards / spec); các lỗi review đã sửa, mỗi lỗi có test viết trước.

- **`variants`** (`variants.py`): từ câu L1 / L3 đã duyệt (`accepted` / `edited`), dựng L2 (diễn đạt lại; cứ câu thứ hai thì bỏ dấu, `question_style = unaccented`), L7 (1-2 lượt trước rồi câu hỏi nối tiếp, ghi vào `turns`) và L6(c) (chỉ từ L1: đổi một chi tiết thành tiền đề sai). Biến thể giữ `seed_id`, split, cụm, `unit_ids` của câu gốc; L2 / L7 giữ gold span của câu gốc. L6(c) có span `refutes = true`: quote bác bỏ của model phải tìm thấy nguyên văn **trong đơn vị của câu gốc**, không thấy thì bỏ (`quote_not_found` / `quote_outside_units`). Bỏ luôn biến thể có "tài liệu này…" và L2 có ≥ `l2_max_overlap` từ nội dung trùng bằng chứng. Mỗi câu gốc cho tối đa một biến thể mỗi loại (id `<id gốc>-L2`, `-L7`, `-L6c`); thứ tự chọn câu gốc theo hash của seed kế hoạch.
- **`l6b`** (`absence.py`): sinh câu L6(b) theo lô (như L6(a)); prompt kèm danh sách tiêu đề tài liệu của snapshot. Mỗi câu có `absence_evidence`: từ khoá tiếng Anh (model đưa) đã grep nguyên từ, không phân biệt hoa thường, trên mọi markdown của snapshot (số lần và tối đa 5 tài liệu có nhiều nhất), và top-20 của 2 retriever: BM25 trên `question_en` và bge-m3 (model `multilingual` của `pool-config.json`) trên câu tiếng Việt. Task duyệt của Label Studio có ô mới `absence_evidence` (dưới phần nguồn trong `annotation/review.xml`) in từ khoá kèm số lần, rồi từng chunk top-20 kèm 300 ký tự đầu. Lệnh in số câu có từ khoá trúng: xem những câu đó trước. Seed của mỗi lời gọi khác nhau theo split và vòng, nên dev / test không nhận cùng một câu từ cache.
- **`topup`** (`quota.topup_plan` + `generate`): chỉ ô gốc (L1, L3, L4, L5, L6(a)) còn thiếu so với kế hoạch mới có slot mới, mỗi câu thiếu một slot. Câu được tính là "giữ" khi chưa bị duyệt `rejected`, nên chạy được trên `filtered.jsonl` trước khi duyệt và chạy lại sau khi duyệt. Slot `<split>-r<vòng>-NNNNN`, seed = seed kế hoạch + 1000 × vòng. Đơn vị: cùng cụm, không bị từ chối ở lần chạy nào (đọc `generate-report*.json`), giữ luật L3 ≥ 2 chunk và trần mỗi tài liệu đếm trên câu gốc đã giữ (biến thể không tính), đơn vị dùng ít nhất trước. Trong một vòng, một ô không bao giờ dùng lại cùng đơn vị / cặp: cùng prompt và seed thì cache trả lại đúng câu cũ. Không còn đơn vị thì lệnh in `no unit left for …`.
  - **Cặp L4 / L5** (theo comment 2026-10-22 của ticket 05): chọn hai đơn vị trong cụm có nội dung giống nhau nhất (cosine của từ nội dung có trọng số idf, bỏ dòng tiêu đề vì các test case WSTG chung chữ "Testing for…"). Trên snapshot mẫu, mục "Cookies" của Session Management đi cặp với WSTG-SESS-02 "Testing for Cookies Attributes". Đây là độ đo từ vựng, không đảm bảo so sánh được; nên xem tỉ lệ loại ở bước answerable sau lần chạy thật.
  - **Luật đổi đơn vị của comment 2026-10-21** (`generate(..., prefer_other_doc=True)`, chỉ `topup` dùng): sau một lần từ chối, đơn vị của tài liệu khác trong cụm trước, chỉ quay lại cùng tài liệu khi hết; đơn vị đã bị từ chối ở bất kỳ slot nào (trong lần chạy, hoặc trong report cũ) không được chọn làm đơn vị thay thế nữa; cặp vẫn đổi một đơn vị, giữ đơn vị kia; trần tính cả câu đã giữ. `generate` giữ luật cũ, nên 24 slot đã viết từ đơn vị thay thế không bị hỏi lại; 10 slot còn bị từ chối thành chỗ thiếu của ô và được `topup` lo.
- **`split`** (`quota.split_files`): chỉ lấy câu đã duyệt (`accepted` / `edited`; câu `pending` bị bỏ ra và lệnh in số câu đó). Ô thừa cắt về đúng target theo hash của seed kế hoạch (không chọn tay): cắt ô biến thể trước, rồi trong ô câu gốc thì câu gốc của biến thể còn giữ được ưu tiên giữ. Ghi `test.jsonl`, `dev.jsonl`, `split-report.json` (id bị cắt). Một `seed_id` ở hai split thì lệnh dừng với lỗi. Ô vẫn thiếu sau cắt được in `short: …`. Test chạy `check` trên file ra: qua (mã 0).

**Còn lại cho bạn, chạy thật (tốn tiền).** Chạy trong `Dataset/`, đặt `ANTHROPIC_API_KEY` trong shell, model như `llm-config.json`. Ước theo `sample-plan.json` và oversample 1,6:
1. Sinh bù ô gốc, chạy được ngay trên kết quả lọc (khoảng 120 câu thiếu → khoảng 190 ứng viên, khoảng 120 lời gọi Claude):
   `.venv\Scripts\seclearn-eval.exe topup --snapshot corpus/2026-10-18-owasp --questions questions/v1.0/filtered.jsonl --round 1`
   rồi lọc (Gemini, `GEMINI_API_KEY`):
   `.venv\Scripts\seclearn-eval.exe filter --snapshot corpus/2026-10-18-owasp --candidates questions/v1.0/candidates-r1.jsonl --out questions/v1.0/filtered-r1.jsonl --report questions/v1.0/filter-report-r1.json`
   Sau khi duyệt mà ô gốc còn thiếu: chạy lại với `--round 2` và mọi file câu hỏi đã có.
2. Sau khi duyệt các câu gốc (ticket 07 / 12; file `annotate import --out`), dựng biến thể (target L2 209, L7 208, L6(c) 56 → khoảng 760 lời gọi Claude, mỗi câu gốc một lời gọi):
   `.venv\Scripts\seclearn-eval.exe variants --snapshot corpus/2026-10-18-owasp --questions <các file đã duyệt>`
3. L6(b) (113 câu → khoảng 181 câu, khoảng 9 lời gọi). Cần nhóm `retrieval` (`uv sync --group retrieval`) và `revision` của bge-m3 trong `pool-config.json`; chưa ghim thì thêm `--allow-unpinned`:
   `.venv\Scripts\seclearn-eval.exe l6b --snapshot corpus/2026-10-18-owasp --questions <các file đã duyệt>`
4. Duyệt `variants.jsonl` và `l6b-r1.jsonl` trong Label Studio (`annotate export`, như câu gốc). Với L6(b): đọc ô bằng chứng, rồi ghi lệnh grep / truy vấn đã dùng vào ghi chú.
5. Cắt và tách: `.venv\Scripts\seclearn-eval.exe split --snapshot corpus/2026-10-18-owasp --questions <mọi file đã duyệt>`
   rồi kiểm: `.venv\Scripts\seclearn-eval.exe check --snapshot corpus/2026-10-18-owasp --questions questions/v1.0/test.jsonl questions/v1.0/dev.jsonl`

**Cần để ý / chưa làm:**
- `check` không kèm `--questions` sẽ đọc mọi `questions/v1.0/*.jsonl`, kể cả `candidates*.jsonl` (không phải file câu hỏi), nên báo lỗi format. Cho đến khi sửa `discover`, luôn truyền `--questions`.
- `filter` chỉ dedup trong lô ứng viên mới, không so với câu đã giữ; ứng viên sinh bù có thể trùng nghĩa câu cũ cùng cụm, và người duyệt phải bắt.
- L6(b) không có bước dedup; câu nào có từ khoá trúng trên snapshot thì người duyệt quyết định (đổi sang loại hoặc sang mức khác).

**2026-10-25, agent (kết quả `topup --round 1` thật):** Chạy trên `filtered.jsonl` (920 câu). 22 ô thiếu, 125 slot mới, **200 ứng viên** trong `candidates-r1.jsonl` (L4 173, L5 22, L3 5), `generate-report-r1.json`: thiếu 1 câu, 1 slot bị từ chối (`test-r1-00067`, L5 nhóm browser), 2 slot đổi đơn vị (test / browser / L4). Đọc mẫu 8 câu L4: các cặp giống nội dung chọn được cặp so sánh có nghĩa (LDAP với SQL injection, Tink đối xứng với bất đối xứng, OleDbCommand với prepared statement C#…), khác hẳn các cặp gượng của lần đầu. Hai điểm cần để ý khi duyệt: 64 / 90 cặp là hai mục của cùng một tài liệu (thường liền nhau), và có câu hỏi sâu vào chi tiết code (macro `ESAPI_ASSERT1` / `ESAPI_ASSERT2`). Mỗi cặp cho khoảng 2 ứng viên, nên bước dedup có thể loại bớt. Bước `filter` cho vòng 1 chưa chạy.

**2026-10-25, agent (kết quả `filter` vòng 1):** `filtered-r1.jsonl` giữ **62 / 200** (L4 54 / 173, L5 5 / 22, L3 3 / 5). Theo bước: quote 0, **answerable 119**, level 7, self_reference 1, dedup 11, l2_overlap 0. Cộng hai vòng (chưa duyệt): L4 dev 21 / 25, test 139 / 184; các mức khác đủ hoặc dư. **17 / 80 ô còn thiếu, tổng 58 câu**, trong đó 13 ô L4 (thiếu nhiều nhất: test / framework 9, test / inj 9, test / arch 7) và 4 ô L5 (mỗi ô 1-3). Các ô L4 không còn dư nên duyệt xong sẽ còn thiếu thêm.

Bước answerable vẫn loại 60% câu L4 dù cặp đã hợp lý. Đọc mẫu 6 câu bị loại: một phần loại đúng (quote "Level: WARN" lặp hai lần, quote không nhắc hai thứ được so), nhưng có câu loại oan: "session fixation so với session hijacking" có 5 quote nói rõ cả hai vế, Gemini vẫn trả không trả lời được. Prompt answerable chỉ cho judge xem các quote, và judge không suy ra điểm khác nhau từ hai mô tả riêng. Chưa sửa.

**2026-10-25, agent (prompt answerable cho L4 / L5):** `filter-answer-v2`: với câu L4 / L5, prompt answerable nói thêm rằng không bằng chứng đơn lẻ nào cần nêu sẵn phép so sánh hay kết cục; câu trả lời được khi bằng chứng nói đủ về từng vế (hoặc từng bước), judge được ghép lại và suy ra điểm khác nhau; không trả lời được khi bằng chứng không nói gì về một vế mà câu hỏi hỏi. Prompt của L1 / L3 giữ nguyên văn, nên lời gọi của chúng vẫn lấy từ cache; chỉ khoảng 866 lời gọi answerable của L4 / L5 (hai vòng) và lời gọi level của câu mới qua là lời gọi mới (Gemini Flash). Test viết trước (đỏ rồi xanh), 225 pytest qua. Kết quả filter trước khi chạy lại đã sao lưu ngoài repo để so sánh.
