# 05: Eval: LLM client có cache, sinh ứng viên và lọc 6 bước

**Phía:** dự án bộ đánh giá (`Dataset/`)

**What to build:** Claude và Gemini nằm sau một interface nhỏ (gửi prompt, nhận văn bản hoặc JSON có cấu trúc), có client giả cho test; khoá API đọc từ biến môi trường; model ghim trong cấu hình; DeepSeek không được dùng. Kết quả API được cache theo khoá prompt + model + đầu vào để chạy lại không tốn tiền. Lệnh `generate` sinh dư khoảng 1,6 lần theo kế hoạch cho các mức gốc: L1 / L3 theo kiểu rút câu khẳng định rồi đặt câu hỏi, L4 / L5 từ cặp đơn vị cùng cụm, L6(a) ngoài lĩnh vực; mỗi ứng viên có câu tiếng Việt, `question_en`, đáp án tham chiếu, mức dự kiến, quote nguyên văn, và `generation {model, prompt_version, seed}`. Lệnh `filter` chạy 6 bước theo thứ tự: quote có thật trong snapshot; Gemini trả lời chỉ từ bằng chứng; Gemini phân loại lại mức (đổi nhãn hoặc loại); bỏ tham chiếu "tài liệu này" / hình / bảng / chương; dedup ngữ nghĩa trong cụm; kiểm trùng từ vựng cho L2. Spec: user story 26-28, 32-40; Seam 4.

**Blocked by:** 04

**Status:** ready-for-agent

- [x] Test bằng client giả: generate ra ứng viên đúng schema, đúng ô của kế hoạch
- [x] Mỗi bước lọc ghi số vào, số loại, lý do; test từng bước loại đúng ca hỏng
- [x] Chạy lại generate / filter không gọi lại API cho phần đã cache
- [x] Không có khoá API nào bị ghi vào file của bộ đánh giá

## Comments

**2026-10-19, agent:** Phần code đã xong, test chỉ dùng client giả (không gọi API thật nào). Còn lại cho bạn: **chạy thật** (tốn tiền) và duyệt kết quả.

**Lệnh** (chạy trong `Dataset/`, khoá đặt bằng biến môi trường trong shell, không ghi vào file nào):
1. `export ANTHROPIC_API_KEY=…` và `export GEMINI_API_KEY=…`
2. `uv run seclearn-eval generate --snapshot corpus/2026-10-18-owasp`: ghi `questions/v1.0/candidates.jsonl`.
3. `uv run seclearn-eval filter --snapshot corpus/2026-10-18-owasp`: ghi `questions/v1.0/filtered.jsonl` (file câu hỏi có canary, `review.status = pending`, gold span đã định vị) và `questions/v1.0/filter-report.json` (số vào / loại / đổi nhãn / lý do của từng bước, kèm danh sách câu bị loại).

Chạy lại lệnh nào cũng đọc từ `cache/llm/` (đã gitignore); dòng cuối in số lần gọi API và số lần lấy từ cache. `--no-cache` để bỏ cache.

**LLM client** (`llm.py`): interface nhỏ `ask_json(prompt, schema)` và `embed(texts)`; `ClaudeClient` (SDK `anthropic`, structured output `output_config.format` json_schema), `GeminiClient` (SDK `google-genai`, JSON mode, `seed`, `temperature 0`; embedding theo lô 100); `FakeClient` cho test; `CachedClient` cache theo khoá sha256 của model + system + prompt + schema + seed (embedding cache theo từng câu). File cache chỉ chứa request và response.

**Cấu hình** `llm-config.json`: generator `claude-opus-5-5`, judge `gemini-2.5-pro`, embedder `gemini-embedding-001`, sinh dư 1,6, ngưỡng dedup cosine 0,9, ngưỡng trùng từ vựng L2 0,6. Schema cấm trường lạ (không đặt khoá vào được) và từ chối mọi model DeepSeek. **Bạn xem lại** tên model Gemini còn đúng phiên bản muốn ghim không: agent chọn theo hiểu biết của mình, chưa gọi API để xác nhận.

**generate**: chỉ sinh các mức gốc. L1 / L3 một lời gọi cho mỗi slot, prompt bắt rút câu khẳng định trước rồi mới đặt câu hỏi; L4 / L5 từ cặp đơn vị của slot; L6(a) một lời gọi cho cả ô. Mỗi ô nhận ceil(1,6 × số slot) ứng viên, chia đều cho các slot. L2, L7, L6(b), L6(c) để ticket 09. Mỗi ứng viên có `question`, `question_en`, `reference_answer`, `reference_claims`, `quotes` (gắn tài liệu theo đơn vị), mức, `generation {model, prompt_version, seed}`; `seed` là seed của kế hoạch (Claude không có seed, chỉ ghi lại). Trên kế hoạch thật: 889 slot gốc → 1.463 ứng viên, 835 lời gọi Claude. Spec ước khoảng 2.350 ứng viên là tính cả biến thể; phần biến thể sinh ở ticket 09.

**filter**, 6 bước đúng thứ tự:
1. quote: mọi quote phải tìm thấy (bỏ qua khác biệt khoảng trắng) trong markdown của tài liệu; câu trả lời được mà không có quote bị loại.
2. answerable: Gemini trả lời chỉ từ các quote; L6 không hỏi bước này.
3. level: Gemini phân loại lại. Đổi nhãn trong L1 ↔ L3 (một đơn vị) và L4 ↔ L5 (cặp đơn vị), ghi `relabelled_from`; lệch khác thì loại. Chưa kiểm điều kiện L3 cần đơn vị ≥ 2 chunk khi đổi L1 → L3.
4. self_reference: regex tiếng Việt và tiếng Anh cho "tài liệu này", "hình / bảng / chương / mục + số", "this document", "table 2"… ("bảng điều khiển" không bị bắt).
5. dedup: cosine embedding của `question_en` trong cùng cụm, giữ câu đứng trước.
6. l2_overlap: câu L2 có ≥ 60% từ nội dung của `question_en` nằm trong quote thì loại.

Ngưỡng 0,9 và 0,6 là giá trị khởi đầu, nên chỉnh sau khi xem `filter-report.json` của lần chạy thật.

**Test:** 21 test mới (tổng 58 pytest sau khi merge `eval/tickets-05-06-10`). Gồm: generate đúng số ứng viên mỗi ô, đúng schema, quote theo từng đơn vị của cặp; từng bước lọc loại đúng ca hỏng và đếm đúng; chạy lại không gọi lại client; adapter Claude / Gemini thật nhưng HTTP đi vào mock transport (kiểm header khoá lấy từ env, `output_config` json_schema, JSON mode); chạy `generate` rồi `filter` qua CLI, quét mọi file ghi ra (cả cache) không thấy khoá.
