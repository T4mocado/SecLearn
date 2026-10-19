# 06: Eval: Label Studio, chuyển đổi annotate, thử offset span, hướng dẫn gán nhãn v0

**Phía:** dự án bộ đánh giá (`Dataset/`)

**What to build:** Label Studio chạy cục bộ bằng Docker với hai project có cấu hình giao diện lưu trong dự án: "kiểm câu" (hiện câu tiếng Việt, đoạn markdown nguồn liên tục không thấy ranh giới chunk; đánh giá câu và tự bôi span trước khi thấy đáp án LLM; chấp nhận / sửa / loại, chỉnh mức, sửa đáp án, ghi chú) và "chấm pool" (hiện câu và từng chunk, chấm 0-3). Lệnh `annotate` xuất câu hỏi → task và nhập nhãn về, giữ `completed_by`, `lead_time`, phiên bản hướng dẫn, snapshot. Hướng dẫn gán nhãn v0 do agent nháp: định nghĩa L1-L7, ví dụ tốt / xấu lấy từ corpus, quy tắc span, thang 0-3, quy tắc L6. Spec: user story 41-48, 51.

**Blocked by:** 03; 02 (ví dụ trong hướng dẫn lấy từ snapshot thật)

**Status:** ready-for-human

- [x] Test khứ hồi câu hỏi → task → nhập nhãn về không mất trường nào
- [ ] Thử thật một lần: bôi một span trong Label Studio, export, xác nhận offset ký tự đúng trên markdown của snapshot (ghi kết quả vào ticket)
- [x] Thứ tự hiển thị đảm bảo người gán không thấy đáp án LLM trước khi tự bôi span
- [x] Hướng dẫn v0 có đủ các mục và ví dụ trích từ corpus thật, có số phiên bản

## Comments

**2026-10-18, agent:** Snapshot ghi offset theo **code point Unicode** (`manifest.offset_unit = "codepoint"`), không theo đơn vị UTF-16 của JS. Lý do: một emoji 🙂 trong NodeJS_Docker_Cheat_Sheet làm mọi offset JS phía sau nó lệch 1 so với chỉ số chuỗi của Python. Label Studio chạy trên trình duyệt nên nhiều khả năng cũng trả offset theo UTF-16. Khi thử export span (tiêu chí 2), cần kiểm thêm trên một đoạn nằm sau emoji, và đổi sang code point khi nhập nhãn về.

**2026-10-19, agent:** Phần code đã xong. Còn lại tiêu chí 2: **bạn thử thật một lần trong Label Studio** (cần Docker và trình duyệt; agent không chạy Docker).

**Đã làm** (trong `Dataset/`):
- `annotation/docker-compose.yml`: Label Studio `heartexlabs/label-studio:1.13.1`, chỉ mở ở `127.0.0.1:8080`, dữ liệu ở `annotation/ls-data/` (bị git bỏ qua, cùng `annotation/exports/raw/`).
- `annotation/review.xml` (project "kiểm câu") và `annotation/pool.xml` (project "chấm pool"). Thứ tự trên màn hình là thứ tự làm: (1) câu hỏi, lượt trước, các ô so sánh, đánh giá câu (bắt buộc); (2) hai ô nguồn `source_0` / `source_1` là cả đơn vị lấy mẫu, markdown liên tục không có ranh giới chunk, tự bôi span với nhãn "Bằng chứng", "Bác bỏ tiền đề", "Ô 1"…"Ô 4"; (3) chỉ khi tích "Đã bôi xong span" mới hiện mức LLM khai báo, đáp án, trích dẫn của LLM, bản tiếng Anh, cùng các ô quyết định, mức, loại L6, sửa đáp án, ghi chú. Span của LLM không bao giờ được gửi làm prediction. Pool: câu + chunk, chấm 0-3, không có điểm của LLM judge.
- `seclearn-eval annotate export` / `annotate import` (`--kind review|pool`). Export ghi `guideline_version` (đọc từ dòng `guideline_version:` của file hướng dẫn) và `snapshot_id` vào từng task. Import lấy annotation mới nhất không bị skip của mỗi task, đổi offset UTF-16 sang code point (`--offset-unit utf16`, mặc định), cộng offset đầu đơn vị, rồi **kiểm chữ trong span khớp markdown của snapshot**; lệch thì báo lỗi, không ghi file nào. Ghi lại câu hỏi (span người gán thay span LLM; ô đáp án trống thì giữ đáp án LLM; chỉnh mức kéo theo `answerable`, `l6_kind`) và cộng dồn `judgments/labels.jsonl` (người gán = `completed_by`, thời điểm, `lead_time`, phiên bản hướng dẫn, snapshot; nhập lại cùng export không thêm nhãn trùng).
- Schema: thêm `Review.question_check` (ok / ambiguous / needs_context / opinion), là đánh giá câu trước khi đọc nguồn.
- `annotation/guideline-v0.md`, `guideline_version: v0`: trình tự làm, câu tốt / xấu, L1-L7 mỗi mức 2 ví dụ tốt và 2 ví dụ xấu kèm lý do, quy tắc span, đáp án tham chiếu, quy tắc L6, thang 0-3 có ví dụ, quyết định và khi nào bỏ qua. 17 trích dẫn lấy từ snapshot `2026-10-18-owasp`; test kiểm từng trích dẫn có thật trong markdown.
- `annotation/offset-test/questions.jsonl`: một câu dựng sẵn cho lần thử thật, nguồn là `NodeJS_Docker_Cheat_Sheet#s11` (đơn vị chứa emoji 🙂).

**Test:** 46 pytest (14 mới). Khứ hồi câu hỏi → task → export kiểu Label Studio → câu hỏi + nhãn, so bằng nguyên bản ghi nên không trường nào mất; span nằm sau emoji (offset UTF-16 lệch 1 so với code point); đọc sai đơn vị offset thì báo lỗi; task bị skip giữ `pending`; câu L4 hai nguồn với ô 1 / ô 2; L6(c) có span bác bỏ; khứ hồi pool; cấu hình XML khớp tên và giá trị mà import đọc; mọi trường `$llm_*` chỉ nằm trong khung ẩn mở sau bước span; mọi biến `$…` trong cấu hình đều có trong task; trích dẫn của hướng dẫn có thật; task thử offset trên snapshot thật cho đúng 19397-19468.

**Các bước cho bạn (tiêu chí 2)**, chạy trong `Dataset/`:
1. `cd annotation; docker compose up -d`, mở http://localhost:8080, tạo tài khoản cục bộ.
2. Tạo project "kiểm câu (thử offset)". Settings → Labeling Interface → Code: dán toàn bộ `annotation/review.xml`, Save. Nếu Label Studio không nhận khối chú thích `<!-- … -->` ở đầu file thì xoá khối đó rồi dán lại, và ghi vào đây.
3. `uv run seclearn-eval annotate export --snapshot corpus/2026-10-18-owasp --questions annotation/offset-test/questions.jsonl --out annotation/offset-test/tasks.json`, rồi Import file `tasks.json` vào project.
3a. **Data Manager** (bảng task hiện ngay khi mở project) hiện mọi trường của `task.data` thành cột, kể cả đáp án LLM; cấu hình XML không chặn được chỗ này. Bấm **Columns**, bỏ tích các cột `llm_level`, `llm_answer`, `llm_quotes`, `question_en`. Kiểm bằng mắt: bảng task **không** còn hiện đáp án, mức hay trích dẫn của LLM (nhìn cả ô xem trước khi rê chuột). Người gán vào việc bằng nút "Label All Tasks", không mở task từ bảng. Ghi vào ticket là đã ẩn được.
4. Mở task. Kiểm: trước khi tích "Đã bôi xong span" **không** thấy đáp án, mức, trích dẫn của LLM (xác nhận bằng mắt cho tiêu chí 3).
5. Chọn "Tự đứng được". Ở ô nguồn, chọn nhãn "Bằng chứng" và bôi đúng hai câu: `And then we build it as follows:` (trước emoji) và `Build arguments passed like that to Docker are kept in the history log.` (sau dòng "sorry to disappoint 🙂"). Tích "Đã bôi xong span", chọn "Chấp nhận", "L1", Submit.
6. Export → JSON, lưu thành `annotation/exports/raw/offset-test.json`. Mở file, ghi lại `value.start` / `value.end` của hai region. Dự kiến nếu Label Studio đếm UTF-16: 1703 / 1735 và **2012 / 2083**; nếu đếm code point: 1703 / 1735 và 2011 / 2082.
7. `uv run seclearn-eval annotate import --snapshot corpus/2026-10-18-owasp --questions annotation/offset-test/questions.jsonl --export annotation/exports/raw/offset-test.json --out annotation/offset-test/reviewed.jsonl --labels annotation/offset-test/labels.jsonl`. Dự kiến: chạy được, và `gold_evidence` trong `reviewed.jsonl` có `char_start` / `char_end` là 19089 / 19121 và 19397 / 19468 trên markdown của snapshot. Nếu import báo "Label Studio offsets may not be utf16" thì chạy lại với `--offset-unit codepoint`; được thì đổi mặc định của `--offset-unit` sang `codepoint` (agent làm, kèm sửa test).
8. Nếu bôi không trọn câu (thừa / thiếu một ký tự) thì import vẫn đúng: offset lấy từ Label Studio, quote lấy lại từ markdown, chỉ cần chữ trong region khớp markdown.
9. Ghi kết quả bước 6-7 vào ticket, tick tiêu chí 2. `reviewed.jsonl`, `labels.jsonl`, `tasks.json` của lần thử không cần commit.

**2026-10-19, agent (sửa sau review):** Các lỗi review đã sửa, mỗi lỗi có test viết trước:
- `annotate import`: annotation không có cả `updated_at` lẫn `created_at` giờ báo lỗi định dạng (trước là crash `AttributeError`).
- Hai task cùng `question_id` trong một export (ví dụ import task hai lần vào Label Studio) giờ là lỗi rõ ràng, không ghi file nào; trước đây lặng lẽ lấy một cái.
- `sources` của task đọc qua model `TaskSource` có kiểu; danh sách mức lấy từ `schema.Level`.
- **Rò đáp án LLM qua Data Manager** (user story 42): bảng task của Label Studio hiện mọi trường `task.data` thành cột, cấu hình XML không ẩn được. Gom vào một khoá lồng nhau cũng không giúp (Data Manager hiện cả object). Nên: `annotate.LLM_FIELDS` liệt kê các trường do LLM viết (`llm_level`, `llm_answer`, `llm_quotes`, `question_en`), test kiểm chúng chỉ nằm trong khung ẩn của `review.xml`, đầu `review.xml` có ghi chú, và đã thêm **bước 3a** vào danh sách việc của bạn ở comment trên: ẩn các cột đó trong Data Manager rồi kiểm bằng mắt.
- `annotate --help` không còn crash trên console cp1252 (ký tự `↔` đổi thành `<->`, và CLI ghi UTF-8).

**2026-10-19, agent:** Phần code đã xong và đã gộp vào `eval/tickets-05-06-10`. Ticket chuyển sang `ready-for-human`: còn tiêu chí 2 (thử thật trong Label Studio, các bước ở comment trên, kể cả bước 3a ẩn cột LLM trong Data Manager). Xong thì ghi kết quả vào đây và đổi `Status:` thành `resolved`.
