# 14: App: `run-eval.ts`, chạy chính SecLearn trên bộ câu hỏi và ghi run cho `score`

**Phía:** app (`scripts/`), chỉ gọi hàm có sẵn trong `src/lib/`; dự án bộ đánh giá không đổi (ADR 0004)

**What to build:** Script `scripts/run-eval.ts` chạy **đúng đường đi của ứng dụng** trên một file câu hỏi của bộ đánh giá và ghi thư mục `runs/<run_id>/` mà `seclearn-eval score --run` đọc được. Cần ticket này vì bản dựng lại bằng Python (`vi-embed+rerank` trong `pool`) không có các bước ứng dụng làm trước khi rerank: `planSearch` viết lại câu hỏi thành truy vấn tiếng Anh, đoạn HyDE, tìm theo từ khóa ghép với tìm theo vector (`keywordCandidates`), nhiều truy vấn cho câu nhiều chủ đề, kiểm tra thực thể. Hit@5 0,512 của bản dựng lại vì vậy chưa phải số của SecLearn.

Hai chế độ:

- **`--mode retrieval`** (mặc định): mỗi câu gọi `retrieveForQuestion`, ghi `run.trec` gồm các chunk ứng dụng đưa cho mô hình trả lời, theo đúng thứ tự.
- **`--mode answer`**: gọi `answerQuestion` K = 3 lần mỗi câu (`ANSWER_RUNS`), ghi thêm `answers.jsonl` (`AnswerLine`: `qid`, `k`, `answer`, `refused`, `cited_chunks`). `score` đã đọc file này để tính từ chối đúng của L6 và từ chối sai của câu trả lời được.

### Đầu vào và đầu ra

```
npm run eval:run -- --questions Dataset/questions/v1.0/test.jsonl --snapshot Dataset/corpus/2026-10-18-owasp \
    --out Dataset/runs/seclearn-baseline [--mode retrieval|answer] [--limit 20] [--replay-plans <run_dir>]
```

```
runs/<run_id>/
  run.trec        qid Q0 chunk_key rank score tag    (score đếm ngược theo hạng, xem comment 2026-11-09)
  candidates.trec ứng viên trước rerank, cùng định dạng
  answers.jsonl   chỉ ở --mode answer
  plans.jsonl     SearchPlan của từng câu (truy vấn viết lại, HyDE, thực thể): để xem lại và chạy lại
  config.json     cấu hình đã dùng + config_hash
  cache/          kết quả từng câu theo khóa cache
```

- **`chunk_key` = `docKey(storagePath)#chunkIndex`**, dùng đúng hàm `docKey` của `src/lib/snapshot.ts` mà `export-snapshot.ts` đã dùng. `RetrievedChunk` chỉ có `documentId`, nên tra `storagePath` theo `documentId` một lần cho cả lượt chạy.
- **Lịch sử hội thoại:** câu có `turns` (L7) được truyền `turns` làm `history`. Quyền xem là `["public", "authenticated"]`, như `smoke-retrieval.ts`.
- **`refused`** là true khi ứng dụng trả câu trả lời cố định: không có nguồn (`sources` rỗng, bao gồm trường hợp kiểm tra thực thể thất bại). Câu từ chối do mô hình tự viết ra không bắt được theo cách này; xem quyết định 3.
- **`config.json`** gồm: các biến `RAG_*`, `EMBED_MODEL`, `EMBED_DIM`, model rerank, `LLM_PROVIDER` / model, `snapshot_id`, commit của app và cờ `dirty`. `config_hash` = sha256 của các trường đó. Hai lượt chạy có cùng hash thì so sánh được với nhau.

### Kiểm tra trước khi chạy (từ chối chạy nếu sai)

Mã chunk chỉ khớp qrels khi DB chứa đúng snapshot đã dựng bộ đánh giá:

- Mọi tài liệu trong `manifest.json` của snapshot có trong DB, với cùng `md_sha256`, và metadata chunk có `chunker_version` = `CHUNKER_VERSION` (`sentence-v2`).
- Số chunk mỗi tài liệu trong DB bằng số chunk trong `chunks.jsonl` của snapshot.
- Sai bất kỳ điểm nào thì dừng, in ra tài liệu lệch, và gợi ý: xuất lại snapshot rồi dựng lại qrels, hoặc reindex về snapshot cũ.

### Cache và tính lặp lại

- **Khóa cache** = `sha256(qid + config_hash + snapshot_id + k)`. Chạy lại cùng cấu hình thì không gọi lại LLM. Cờ `dirty` (có thay đổi chưa commit) thì không đọc cache.
- **`--replay-plans <run_dir>`** dùng lại `plans.jsonl` của một lượt chạy khác, như `smoke-plans.json`. Khi đó hai cấu hình chỉ khác nhau ở bước truy xuất, không khác vì LLM viết lại câu hỏi khác đi. Đây là cách so sánh chính giữa các cấu hình truy xuất.
- **Mỗi cấu hình một process**, vì `getEnv()` cache biến môi trường. Script so sánh nhiều cấu hình chạy `run-eval.ts` nhiều lần với file `.env` khác nhau.
- **`--limit 20`** chạy thử 20 câu đầu, kèm in ước tính số lần gọi LLM cho toàn bộ file.

### Các cấu hình nên chạy đầu tiên (không phải phần code của ticket)

| run_id | Thay đổi | Trả lời câu hỏi |
|---|---|---|
| `seclearn-baseline` | `.env` hiện tại | Số thật của SecLearn |
| `seclearn-no-translate` | `RAG_TRANSLATE_QUERY=off` | Bước viết lại sang tiếng Anh đóng góp bao nhiêu |
| `seclearn-no-rerank` | `RERANK_URL=` | Reranker đóng góp bao nhiêu |
| `seclearn-cand50` | `RAG_CANDIDATES=50` | Trần ứng viên có phải nút thắt không |

Đổi embedding sang bge-m3 cần reindex sang một DB khác (`EMBED_DIM` 1024), nên thuộc một ticket riêng.

**Blocked by:** 01, 02 (snapshot xuất từ DB); không cần chờ 12 xong: chạy được trên `reviewed.jsonl` 199 câu đã duyệt để thử, số chính thức chạy trên `test.jsonl` sau `split`.

**Status:** ready-for-human

- [x] Test `node:test` cho phần thuần, không cần DB: dòng TREC từ danh sách `RetrievedChunk`, `chunk_key` từ `storagePath` + `chunkIndex`, khóa cache, `refused` từ `sources`, `config_hash` không đổi khi thứ tự biến môi trường đổi
- [x] Kiểm tra snapshot ↔ DB từ chối chạy khi `md_sha256`, `chunker_version` hoặc số chunk lệch (test với dữ liệu giả)
- [x] `seclearn-eval score --run runs/seclearn-baseline` đọc được kết quả, không báo câu nào thiếu trong run; `--mode answer` cho `refusals.measured = true`
- [ ] Chạy lại cùng cấu hình không gọi LLM lần nào (đếm từ cache)
- [x] `--replay-plans` cho cùng `plans.jsonl`, `run.trec` chỉ khác ở bước truy xuất

## Quyết định cần bạn chọn

1. **Độ sâu của run.** Ứng dụng chỉ trả `RAG_TOP_K` = 5 chunk (ít hơn nếu lọc theo `RAG_MIN_RELEVANCE`). Khi đó Hit@5 và MRR đo đúng, nhưng Hit@10, nDCG@10 và Recall@10 bị cắt ở 5. Đề xuất: giữ 5 cho số chính, vì đó là thứ mô hình trả lời thực sự thấy, và báo rõ trong report rằng chỉ số @10 bị cắt. Cách khác: chạy thêm một lượt `RAG_TOP_K=10`, nhưng như vậy là đo một cấu hình khác.
2. **Ghi danh sách ứng viên trước rerank (`candidates.trec`).** Cần để tách "reranker đánh rơi" khỏi "chưa tới reranker", như phân tích 91/91 câu lần trước. `retrieveChunks` không trả danh sách này, nên phải thêm một tham số tùy chọn trong `src/lib/rag.ts` (ví dụ `onCandidates?: (ids) => void`), không đổi hành vi mặc định. Đề xuất: làm, vì đây là một thay đổi nhỏ trong mã app chứ không phải bộ đánh giá import mã app.
3. **Từ chối do mô hình tự viết.** Bản đề xuất chỉ tính câu trả lời cố định. Muốn bắt cả câu như "tài liệu không đề cập…" thì cần một bộ phân loại (dùng mẫu chuỗi của `withoutRefusals` trong `grounding.ts`, hoặc nhờ LLM chấm). Đề xuất: lần đầu dùng mẫu chuỗi có sẵn, ghi số câu bắt được theo từng cách.
4. **Chi phí.** Mỗi câu gọi LLM ít nhất 1 lần (`planSearch`), cộng thêm lần chấm nếu `RAG_JUDGE=on`. `--mode answer` thêm 3 lần trả lời mỗi câu. Với 199 câu: khoảng 200–400 lần gọi ở chế độ retrieval, khoảng 800–1.000 lần ở chế độ answer. Đề xuất: chạy retrieval trước, chạy answer sau khi số truy xuất đã ổn.

## Comments

**2026-11-09, agent:** Phần code đã xong, theo 4 lựa chọn đề xuất: số chính ở độ sâu `RAG_TOP_K` = 5, có `candidates.trec`, từ chối = câu trả lời cố định hoặc `isRefusal`, chạy chế độ retrieval trước.

**Đã làm:**
- `src/lib/eval-run.ts` (hàm thuần): `runLines`, `chunkKey`, `configHash`, `cacheKey`, `answerLine`, `snapshotProblems`. Có 8 test trong `eval-run.test.ts`.
- `scripts/run-eval.ts` và lệnh `npm run eval:run`.
- `rag.ts` / `chat-answer.ts`: thêm tham số tùy chọn `onCandidates` (danh sách ứng viên đã gộp, trước rerank); `answerQuestion` nhận `plan` và trả lại `plan`. Mặc định không đổi hành vi.
- **Score trong `run.trec` đếm ngược theo hạng** (n, n−1, …, 1), khác với ý đầu "score = rerankScore". ranx và trec_eval sắp theo score, mà thứ tự của ứng dụng không phải lúc nào cũng theo rerank (ô so sánh và chunk mang theo đứng trước), nên dùng rerankScore sẽ làm sai hit@1 và MRR. Rerank score vẫn nằm trong cache.
- Script dừng khi chunk không có rerank score trong lúc `RERANK_URL` có giá trị (reranker lỗi thì `rag.ts` lặng lẽ quay về thứ tự cosine). Kiểm tra này chạy cả cho từng câu trả lời.
- Kiểm tra snapshot còn báo: tài liệu chưa `ready`, hai tài liệu trùng khóa, tài liệu có trong DB mà không có trong snapshot, và text chunk khác (so `content_sha1`).

**Đã chạy thử** (199 câu đã duyệt, 5 câu đầu): kiểm tra snapshot qua (134 tài liệu, 5.915 chunk). `score` đọc được run: 4/4 hit@5, kể cả `test-00714-c1` (Laravel Blade) mà bản dựng lại bằng Python trượt. `--mode answer` cho 15 câu trả lời, `refusals.measured = true`, câu L6 được tính là từ chối đúng. `--replay-plans` cho `run.trec` giống hệt.

**Chưa kiểm:** "chạy lại không gọi LLM". Cache không được đọc khi cây có thay đổi chưa commit, mà `Dataset/pool-config.json`, `pyproject.toml` và `uv.lock` vẫn đang sửa dở. Kiểm lại sau khi commit hoặc stash các file đó.

**Bạn xem lại:**
1. Config chỉ ghi `RERANK_URL`, không ghi model mà `embed_server.py` tải. Nếu đổi `RERANK_MODEL` / `EMBED_MODEL` phía server, hãy đổi `--out` hoặc xóa `cache/`.
2. `--mode answer` truy xuất lại cho từng câu trả lời (1 + K lần mỗi câu), vì `answerQuestion` không nhận chunk đã có. Cách này chậm hơn nhưng đi đúng đường của ứng dụng.
3. Mỗi câu trong `--questions` đều được chạy. Chỉ đưa vào file chứa những câu cần chấm (ví dụ `test.jsonl`, hoặc các câu `accepted`).
