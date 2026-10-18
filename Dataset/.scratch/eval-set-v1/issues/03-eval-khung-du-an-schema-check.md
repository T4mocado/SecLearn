# 03: Eval: khung dự án Python, schema, snapshot mẫu, lệnh `snapshot` và `check`

**Phía:** dự án bộ đánh giá (`Dataset/`)

**What to build:** Một dự án Python quản lý bằng `uv`, ghim Python 3.12, với một CLI duy nhất có các lệnh con theo thứ tự quy trình (snapshot, clusters, plan, generate, filter, annotate, pool, judge, qrels, check, score, report, card; lệnh chưa làm thì báo chưa có). Một module schema pydantic là nguồn sự thật cho mọi bản ghi: tài liệu trong manifest, đơn vị lấy mẫu, chunk, câu hỏi (theo spec, gồm `cluster`, `unit_ids`, `seed_id`, `question_en`, `strata`, `split`, `review`, `generation`), gold span `{doc_key, md_sha256, char_start, char_end, quote}`, nhãn, mục pool, cấu hình lượt chạy, định dạng qrels / run TREC. Một snapshot mẫu rất nhỏ trong thư mục test (khoảng 3 tài liệu, có đoạn WSTG 2-3 test case). Lệnh `snapshot` nạp và kiểm snapshot; lệnh `check` thực hiện 9 kiểm tra và thoát mã khác 0 khi có lỗi; trích dẫn lệch offset được neo lại bằng cách tìm lại quote, tỉ lệ neo lại / bỏ được báo. Không import mã app, không kết nối Postgres (ADR 0004). Spec: user story 59, 60, 72; Seam 3.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] `uv` chạy được CLI và bộ pytest bằng một lệnh
- [x] Mọi lệnh đọc / ghi qua schema; file sai định dạng bị từ chối với thông báo rõ
- [x] `check` bắt được từng loại lỗi khi cố tình làm hỏng fixture: sai định dạng / trùng id; sha256 markdown lệch manifest; quote không tìm thấy đúng một lần quanh offset; span không có chunk nào phủ ≥ 50%; gold trong vùng loại; phân bố lệch kế hoạch > 5%; `seed_id` ở hai split; cấu hình chạy thiếu hoặc mã chưa commit; thiếu canary
- [x] Neo lại quote khi offset lệch, có báo tỉ lệ neo lại / bỏ
- [x] `.gitignore` bỏ cache API, cache embedding, export thô Label Studio; phần còn lại nằm trong git

## Comments

**2026-10-18, agent:** Đã làm xong.
- Chạy: `uv sync` rồi `uv run pytest` (19 test) và `uv run seclearn-eval <lệnh>`. Các lệnh chưa làm sẽ báo số ticket phụ trách và thoát với mã 2.
- Đã làm: lệnh `snapshot` (nạp và kiểm với manifest), `check` (9 kiểm tra, thoát mã 1 khi có lỗi), `reanchor` (neo lại quote lên snapshot mới, báo tỉ lệ giữ nguyên / neo lại / bỏ).
- Schema pydantic nằm trong `schema.py`, cấm trường lạ. Dòng đầu file câu hỏi là header `{"_meta": {canary, eval_version, snapshot_id}}`.
- Snapshot mẫu `tests/fixtures/snapshot-mini` được sinh bằng chính bộ cắt và `buildSnapshot` của app (`npx tsx Dataset/tests/fixtures/make-snapshot-mini.ts`), nên test phía Python chạy trên đúng định dạng app xuất ra. Đây là công cụ dev viết bằng TS, mã Python vẫn không import mã app.
- `.gitattributes` đặt `* -text` để git không đổi CRLF trên markdown của snapshot, vì sha256 và offset phụ thuộc từng byte.
- Lưu ý môi trường: uv 0.13.1 trên máy này không tạo được liên kết `cpython-3.12` (lỗi "Missing expected target directory for Python minor version link"). Python 3.12.15 vẫn được cài, và `uv sync --python <đường dẫn python.exe>` chạy bình thường. Đã có `.venv`, nên các lần `uv run` sau không cần thêm cờ này.
