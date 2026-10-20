# 08: Eval: 5 hệ truy xuất, pool, Gemini chấm, độ đồng ý, qrels

**Phía:** dự án bộ đánh giá (`Dataset/`)

**What to build:** Lệnh `pool` chạy 5 hệ trên chunk của snapshot (BM25 trên `question_en`; embedding tiếng Việt cùng model của app; embedding đó + bge-reranker; bge-m3 câu tiếng Việt; bge-m3 `question_en`), cache embedding chunk theo `md_sha256` + model, pool = hợp top-10 + chunk phủ gold span. Lệnh `judge` cho Gemini chấm 0-3 toàn pool theo prompt kiểu UMBRELA, rồi chọn phần người chấm: chunk Gemini ≥ 1 cộng 10% mẫu (seed cố định) chunk Gemini cho 0; chunk người chấm 2-3 ngoài gold mở rộng gold bằng span mới. Tính κ có trọng số và tỉ lệ đồng ý theo mức giữa Gemini và người, và độ ổn định của người gán trên bộ gán lại. Lệnh `qrels` sinh qrels TREC cho một `chunker_version`: chunk liên quan khi giao ≥ 50% độ dài span hoặc chứa trọn span, nhãn người ghi đè. Spec: user story 50 (phần tính), 52-58.

**Blocked by:** 05 (LLM client), 06 (project "chấm pool" và annotate)

**Status:** ready-for-agent

- [x] Test qrels trên fixture: đúng quy tắc 50%, chứa trọn span, nhãn pool ghi đè
- [x] Test chọn mẫu người chấm tái lập được với seed cố định
- [x] Test κ có trọng số và độ ổn định trên dữ liệu nhỏ có đáp số tính tay
- [x] Judge chạy qua client giả trong test; embedding được cache
- [x] Qrels là sản phẩm sinh ra, không sửa tay
- [x] Prompt chấm 0-3 của Gemini có các bước đánh giá tường minh, đánh số (đọc câu, xác định thông tin cần, đối chiếu chunk, rồi mới cho điểm) và định nghĩa từng mức 0-3 bằng lời, không chỉ một câu tiêu chí chung; có số phiên bản prompt
- [x] Báo ma trận nhầm lẫn Gemini × người (4 × 4 mức, và gộp liên quan ≥ 2 / không liên quan), tách riêng tỉ lệ âm tính giả: chunk Gemini cho 0 mà người chấm ≥ 2, ước từ mẫu 10%

## Comments

**2026-10-20, agent:** Thêm hai tiêu chí cuối theo yêu cầu của bạn, lấy ý từ bài DeepEval về LLM-as-a-judge (https://deepeval.com/blog/llm-as-a-judge):
- Các bước đánh giá tường minh (`evaluation_steps` của G-Eval) làm judge ổn định hơn một câu tiêu chí chung. Giữ khung UMBRELA, chỉ viết rõ các bước và định nghĩa mức.
- Với pool, lỗi nguy hiểm là âm tính giả: Gemini cho 0 một chunk thật ra liên quan thì chunk đó vắng khỏi qrels và hệ truy xuất bị chấm thấp oan. Mẫu 10% chunk Gemini cho 0 đo đúng lỗi này, nên báo riêng con số đó (để ticket 11 ghi vào card), cạnh κ có trọng số.

**2026-10-20, agent:** Phần code đã xong. Test chỉ dùng model giả: không gọi Gemini / Claude thật, không tải trọng số nào (bge-m3, bge-reranker, model tiếng Việt của app). Còn lại cho bạn: **chạy thật**, chấm pool trên Label Studio, rồi xem các lựa chọn để ngỏ bên dưới.

**Lệnh chạy thật** (trong `Dataset/`, theo thứ tự):
1. Cài model một lần (nặng: torch, sentence-transformers, pyvi; nhóm tuỳ chọn, test không cần): `uv sync --group retrieval`. Có GPU thì cài bản torch CUDA phù hợp.
2. `uv run seclearn-eval pool --snapshot corpus/2026-10-18-owasp --questions questions/v1.0/test.jsonl questions/v1.0/dev.jsonl`: chạy 5 hệ, ghi `judgments/pool.jsonl` và một run TREC mỗi hệ ở `judgments/pool-runs/`. Lần đầu tải trọng số từ Hugging Face và nhúng toàn bộ chunk (cache ở `cache/embeddings/<model>/<md_sha256>.json`, đã gitignore); lần sau chỉ nhúng câu hỏi.
3. `export GEMINI_API_KEY=…` rồi `uv run seclearn-eval judge grade --snapshot corpus/2026-10-18-owasp --questions questions/v1.0/test.jsonl questions/v1.0/dev.jsonl`: Gemini (model `judge` trong `llm-config.json`) chấm 0-3 toàn pool, cache ở `cache/llm/`; ghi lại `judgments/pool.jsonl` (điểm, model, phiên bản prompt, `for_human`) và `judgments/pool-human.jsonl` (phần người chấm).
4. `uv run seclearn-eval annotate export --kind pool --snapshot corpus/2026-10-18-owasp --questions questions/v1.0/test.jsonl --pool judgments/pool-human.jsonl --out annotation/exports/pool-tasks.json`, nhập vào project "chấm pool", chấm, export JSON, rồi `annotate import --kind pool --snapshot … --export annotation/exports/raw/<file>.json` (nhãn cộng dồn vào `judgments/labels.jsonl`). Lặp lại cho `dev.jsonl` nếu pool có câu dev.
5. `uv run seclearn-eval judge expand --snapshot corpus/2026-10-18-owasp --questions questions/v1.0/test.jsonl --out questions/v1.0/test.jsonl` (mỗi split một lần): chunk người chấm 2-3 không chồng gold span nào thành gold span mới, `source: "pool"`, span là phần thân chunk.
6. Sau ít nhất một tuần, gán lại khoảng 100 task pool (export lại một tập con, không nhìn nhãn cũ, cùng hướng dẫn) và import như bước 4.
7. `uv run seclearn-eval judge agreement`: ghi `judgments/agreement.json` và `.md` (κ, ma trận nhầm lẫn, âm tính giả, độ ổn định) và `judgments/stability.json`. Lệnh `card` (ticket 11) đọc hai file JSON này: mục "Cách gán nhãn" hiện bảng κ, hai ma trận nhầm lẫn và dòng âm tính giả.
8. `uv run seclearn-eval qrels --snapshot corpus/2026-10-18-owasp --questions questions/v1.0/test.jsonl questions/v1.0/dev.jsonl --pool judgments/pool.jsonl`: ghi `qrels/<chunker_version>.qrels` và `.meta.json` cạnh nó.

**Đã làm:**
- `pool-config.json` ghim model: `bkai-foundation-models/vietnamese-bi-encoder` (lấy từ `EMBED_MODEL` trong `.env.example` và `scripts/embed_server.py` của app; cùng tiền xử lý của app: tách từ pyvi, `max_seq_length` 256), `BAAI/bge-reranker-v2-m3` (`RERANK_MODEL` của app, sigmoid như app, xếp lại 20 ứng viên = `RAG_CANDIDATES`), `BAAI/bge-m3` (vector dense); độ sâu pool 10. Chỉ đọc file cấu hình của app để lấy tên model, không import mã app.
- `retrieval.py`: 5 hệ `bm25-en` (BM25 Okapi tự cài, idf kiểu Lucene, trên `question_en`), `vi-embed`, `vi-embed+rerank` (điểm reranker lấy max trên câu tiếng Việt và `question_en`, như RAG của app), `bge-m3-vi`, `bge-m3-en`. Model nằm sau hai interface nhỏ `Encoder` / `Scorer`; adapter thật (sentence-transformers) nạp lười, thiếu nhóm `retrieval` thì báo cách cài. Cache embedding chunk theo model + `md_sha256`, trong file khoá theo sha256 của văn bản chunk (đổi chunker chỉ nhúng lại chunk đổi chữ).
- `pool.py`: pool = hợp top-10 của 5 hệ + chunk phủ gold span (quy tắc 50%), chỉ câu trả lời được và chưa bị loại; mỗi mục ghi các hệ tìm thấy, `covers_gold`, `chunker_version`. Pool lại giữ điểm Gemini và lựa chọn người đã có.
- `judge.py` + prompt `judge-umbrela-v1` (`prompts.py`): thang UMBRELA 0-3, 4 bước đánh số (đọc câu, xác định thông tin cần và ghi vào `needed`, đối chiếu chunk và ghi vào `found`, rồi mới cho `grade`), định nghĩa từng mức bằng lời, khớp thang của hướng dẫn mục 7. Điểm ngoài 0-3 là lỗi. Phần người chấm: mọi chunk Gemini ≥ 1 cộng ceil(10%) chunk Gemini cho 0, seed cố định `20261020`, sắp khoá trước khi rút; chạy lại giữ các chunk 0 đã rút.
- `agreement.py`: κ có trọng số tuyến tính và bậc hai (Cohen 1968), đồng ý tuyệt đối, tỉ lệ đồng ý theo mức (trong các chunk người chấm mức g, phần Gemini cũng chấm g), ma trận nhầm lẫn 4 × 4 (hàng Gemini, cột người) và gộp ≥ 2 / < 2, âm tính giả riêng: số chunk 0 được rút, số người chấm ≥ 2, tỉ lệ kèm khoảng Wilson 95% và số chunk liên quan ước vắng khỏi qrels (tỉ lệ × số chunk Gemini cho 0). Thêm một κ bậc hai gia trọng mỗi chunk 0 được rút bằng (số chunk 0 / số rút), vì tập người chấm dồn về chunk Gemini ≥ 1. Độ ổn định: cặp nhãn đầu và cuối của cùng chunk, cùng người, cách ≥ 7 ngày (cặp gần hơn bị bỏ và đếm riêng).
- `qrels.py`: chunk liên quan khi giữ ≥ 50% độ dài span hoặc trọn span, điểm là `grade` của span (nhiều span thì lấy cao nhất); nhãn pool của người (nhãn mới nhất) ghi đè, chunk chỉ có điểm 0 của Gemini ghi là đã chấm, không liên quan; nhãn của pool trên chunker khác không được áp (cảnh báo). Mỗi file qrels có `.meta.json` ghi đầu vào kèm sha256 và sha256 của chính qrels; `score` từ chối qrels có sha lệch meta (sửa tay), cảnh báo khi không có meta.
- Schema: `PoolEntry` thêm `chunker_version`, `llm_model`, `llm_prompt_version`, `for_human`; `GoldSpan` thêm `source` (`review` / `pool`); bản ghi mới `PoolConfig`, `QrelsMeta`, `AgreementReport`. Lệnh mới: `pool`, `judge grade | expand | agreement`, `qrels`. Dependency: `numpy` (chính), nhóm tuỳ chọn `retrieval` (sentence-transformers, pyvi).

**Test:** 31 test mới (tổng 166 pytest sau khi merge `eval/tickets-05-06-10` tại 4ae885b; `ruff check .` sạch) trong `test_qrels.py`, `test_agreement.py`, `test_judge.py`, `test_pool.py` và một test card (ma trận nhầm lẫn, âm tính giả, độ ổn định đến được card); `test_cli` giờ kiểm không còn lệnh nào "chưa làm": quy tắc 50% ở đúng mốc một nửa, span vắt hai chunk, nhãn người ghi đè và nhãn mới nhất thắng, pool khác chunker bị bỏ qua, qrels chạy lại ra đúng từng byte, qrels sửa tay bị `score` từ chối; κ tuyến tính 17/23 và bậc hai 20/23, độ ổn định κ 0,8 / 0,9, âm tính giả 1/10 với Wilson tính tay; chọn mẫu tái lập với cùng seed bất kể thứ tự file; judge qua `FakeClient`, chạy lại lấy từ cache; BM25 khớp ln 2 tính tay; embedding chunk lấy từ cache ở lần chạy thứ hai; lệnh `pool`, `judge`, `qrels` qua CLI với model giả.

**Lựa chọn để ngỏ (bạn quyết):**
- **Ghim `revision`** (commit Hugging Face) cho 3 model trong `pool-config.json`: đang để `null`, nên model trên hub đổi thì pool đổi. Nên điền commit sau lần tải đầu.
- **Nhãn người nào là "nhãn của người"** khi một chunk được chấm hai lần (vòng gán lại): đang lấy nhãn **mới nhất** cho cả qrels lẫn κ Gemini × người. Nếu muốn vòng gán lại chỉ để đo độ ổn định, đổi sang nhãn đầu tiên.
- **Câu L6** không vào pool (không có qrels). Nếu muốn kiểm Gemini có cho điểm cao chunk nào với câu L6(c) không, cần thêm sau.
- **Span mở rộng gold** là cả phần thân chunk, không phải đoạn tối thiểu; project "chấm pool" chỉ chấm điểm, không bôi span. Nếu muốn span tối thiểu, cần thêm một bước bôi trên Label Studio.
- **Độ ổn định** chỉ tính cho điểm pool 0-3; nhãn kiểm câu (`review`) không ghi mức hay quyết định trong `Label` nên chưa tính được.
- Điểm của reranker chưa được cache (chỉ embedding chunk); chạy lại `pool` tính lại khoảng 1.475 × 20 × 2 cặp, chậm trên CPU.
- Ngưỡng 7 ngày cho cặp ổn định, tỉ lệ 10% và seed `20261020` là hằng số trong `judge.py` / `agreement.py`; đổi bằng `--rate`, `--seed` của `judge grade`.
