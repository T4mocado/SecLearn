# Nhật ký lỗi (Error log)

Ghi lại các lỗi đã gặp, nguyên nhân và cách xử lý. Thêm lỗi mới ở cuối file.

## 1. OpenAI embedding 429 — hết credit
- **Triệu chứng:** `skip chunk 113 of document ...: Embedding failed (429 You have no credits remaining ...)`
- **Nguyên nhân:** Tài khoản OpenAI hết credit, không tạo được vector.
- **Cách xử lý:** Chuyển embedding sang BKAI `bkai-foundation-models/vietnamese-bi-encoder` (768 chiều).
  `EMBED_PROVIDER=huggingface`, `EMBED_DIM=768`.

## 2. HuggingFace 400 — Model not supported by provider hf-inference
- **Triệu chứng:** `Embedding failed (HuggingFace 400: {"error":"Model not supported by provider hf-inference"})`
- **Nguyên nhân:** Model BKAI không có trên Inference API miễn phí; `.env` thiếu `HF_EMBED_URL` nên app gọi API HuggingFace.
- **Cách xử lý:** Chạy model cục bộ bằng `python scripts/embed_server.py` (cổng 8008) và đặt
  `HF_EMBED_URL="http://127.0.0.1:8008"` trong `.env`.

## 3. `HF_TOKEN is empty`
- **Triệu chứng:** `Embedding failed (HF_TOKEN is empty (EMBED_PROVIDER=huggingface))`
- **Nguyên nhân:** `HF_TOKEN` trong `.env` để trống.
- **Cách xử lý:** Điền `HF_TOKEN`, hoặc dùng `HF_EMBED_URL` (server cục bộ) thì không cần token.

## 4. pgvector — expected 1536 dimensions, not 768
- **Triệu chứng:** `Raw query failed. Code: 22000. Message: ERROR: expected 1536 dimensions, not 768`
- **Nguyên nhân:** Schema đã đổi sang `vector(768)` nhưng cột trong DB vẫn là 1536.
  `prisma db push` không phát hiện thay đổi của kiểu `Unsupported(vector)`.
- **Cách xử lý:** Chạy SQL migration trực tiếp rồi Reindex tất cả tài liệu:
  ```powershell
  Get-Content prisma/migrations/20261010000000_embed_dim_768/migration.sql | npx prisma db execute --stdin --schema prisma/schema.prisma
  ```

## 5. DeepSeek LLM 402 — Insufficient Balance
- **Triệu chứng:** `Không gọi được API LLM (402 Insufficient Balance ...)`
- **Nguyên nhân:** Tài khoản DeepSeek hết số dư.
- **Cách xử lý:** Nạp tiền tại https://platform.deepseek.com, hoặc đổi tạm `LLM_PROVIDER` sang provider
  khác còn credit (`openai`) / `mock` để thử giao diện. Khởi động lại `npm run dev` sau khi sửa `.env`.

## 6. PDF bị lưu thành chunk rác (dữ liệu nhị phân) — ingest rất chậm
- **Triệu chứng:** Mỗi PDF ~250KB tạo ra hàng trăm chunk (số ký tự ≈ kích thước file); nội dung chunk là ký tự
  lạ kiểu `l�*=��H�E�...`; cắt chunk + embedding mất rất lâu; RAG không tìm được gì có nghĩa.
- **Nguyên nhân:** Trong Next.js, `pdf-parse` bị Turbopack đóng gói nên `pdfjs` không tìm thấy worker:
  `Setting up fake worker failed: Cannot find module '.next/dev/server/chunks/pdf.worker.mjs'`.
  Code cũ nuốt lỗi này và **đọc file PDF nhị phân như văn bản**, rồi cắt chunk + embedding toàn bộ rác.
  (Chạy bằng `tsx` ngoài Next thì không lỗi, nên khó phát hiện.)
- **Cách xử lý:**
  - `next.config.ts`: thêm `"pdf-parse"`, `"pdfjs-dist"` vào `serverExternalPackages`.
  - `src/lib/ingest.ts`: bỏ nhánh dự phòng đọc nhị phân; lỗi parse giờ đánh dấu tài liệu `failed` với thông báo rõ.
  - Reindex toàn bộ: `npm run db:reindex` (hoặc `npm run db:reindex -- --pending` chỉ cho tài liệu kẹt).
    Đã chạy ngày 10/10/2026: 103/103 tài liệu `ready`, 3.264 chunk, tất cả có vector (trước đó ~50.000 chunk rác).

## 7. Embedding và ghi database từng chunk một — chậm
- **Nguyên nhân:** Mỗi chunk = 1 request embedding + 1 `INSERT` + 1 `UPDATE`, chạy nối tiếp.
- **Cách xử lý:** Embedding theo lô (`EMBED_BATCH_SIZE`, mặc định 32) qua `embedTexts()`; server Python nhận mảng
  `inputs` và `model.encode(..., batch_size=32)`; ghi 1 lệnh `INSERT` nhiều dòng (nội dung + vector) mỗi lô.
  Nếu cả lô lỗi thì thử lại từng chunk; dừng sau 5 chunk lỗi liên tiếp. Đo trên GPU: ~12 ms/chunk → ~1,8 ms/chunk.
- **Lưu ý:** Không gửi `HF_TOKEN` tới `HF_EMBED_URL` (server cục bộ); không bắt buộc token khi có `HF_EMBED_URL`.

## 8. Tài liệu kẹt `pending`, Reindex trùng, upload nhiều file
- **Nguyên nhân:** Mỗi upload/Reindex gọi `void processDocument()` không giới hạn; restart server khi đang ingest
  để lại tài liệu `pending` mãi (đã gặp: 65 tài liệu kẹt); bấm Reindex khi đang xử lý gây ghi chunk trùng.
- **Cách xử lý:** Hàng đợi `src/lib/ingest-queue.ts` (tối đa `INGEST_CONCURRENCY`, mặc định 2, tài liệu cùng lúc;
  không xử lý trùng một tài liệu; API Reindex trả 409 `BUSY`); `instrumentation.ts` xếp lại tài liệu `pending`
  khi khởi động; server Python dùng `ThreadingHTTPServer`; giao diện admin cho chọn tối đa 20 PDF mỗi lần.
- **Lưu ý:** Không chạy `npm run db:reindex` cùng lúc với `npm run dev` — cả hai sẽ xử lý cùng tài liệu `pending`.

## 9. Tài liệu mẫu (seed) không Reindex được
- **Triệu chứng:** `ENOENT: no such file or directory, open '...\seed:\starter-notes.md'`
- **Nguyên nhân:** Tài liệu do `prisma/seed.ts` tạo không có file thật (`storagePath = "seed://..."`), nhưng ingest luôn đọc file.
- **Cách xử lý:** Tài liệu `text/markdown` có sẵn `markdown` thì ingest dùng nội dung đó thay vì đọc file.

## 10. Reranker loại nhầm chunk tiếng Anh khi hỏi bằng tiếng Việt
- **Triệu chứng:** Với ngưỡng `RAG_MIN_RELEVANCE=0.3`, câu hỏi tiếng Việt không còn nguồn tiếng Anh nào dù tài liệu có liên quan.
- **Nguyên nhân:** `BAAI/bge-reranker-v2-m3` chấm cặp khác ngôn ngữ thấp hơn nhiều: đoạn OWASP về XSS/lưu mật khẩu
  chỉ được 0,01–0,04 khi hỏi bằng tiếng Việt, trong khi đoạn không liên quan ≈ 0.
- **Cách xử lý:** Mặc định `RAG_MIN_RELEVANCE=0.01`; chỉ nâng ngưỡng sau khi hiệu chỉnh trên bộ câu hỏi đánh giá.
  Panel nguồn chỉ hiển thị phần trăm, không gắn nhãn Cao/Thấp để tránh nhãn "Thấp" sai cho chunk tiếng Anh.

## 11. Panel nguồn: không đánh số lại `[n]`; câu có nhiều trích dẫn
- **Lưu ý:** Số `[n]` trong câu trả lời, `citedIndexes()` và `data-source-index` đều dựa vào `MessageSource.index`.
  Sắp xếp theo độ liên quan chỉ làm lúc hiển thị (`orderSources`), không sửa mảng `sources` đã lưu; khi đang stream giữ thứ tự gốc.
- **Lỗi đã sửa:** Câu "A [1][2], B [3], và C [5]." làm thẻ [3] hiển thị cả mệnh đề của [1][2]. `citationClaims` (trước là `citationExcerpts`) giờ cắt từ
  trích dẫn trước đó trong cùng câu; mệnh đề ngắn hơn 20 ký tự thì hiển thị cả câu.

## 12. Hậu kiểm trích dẫn: ngưỡng 0,1 cảnh báo sai câu có nguồn hỗ trợ
- **Triệu chứng:** Mệnh đề ngắn, mất chủ ngữ như "các hạn chế của câu hỏi bảo mật" [4] (0,083) hay
  "và mô tả các giao thức… FIDO2" [5] (0,063) bị gắn ⚠️ dù chunk có hỗ trợ.
- **Nguyên nhân:** Reranker chấm mệnh đề kiểu "tài liệu nói về…" thấp. Chấm bằng cả câu còn tệ hơn (0,003–0,027) vì câu lẫn nhiều ý.
- **Cách xử lý:** `SUPPORT_THRESHOLD = 0.05` trong `src/lib/sources.ts` (13 cặp thật: có hỗ trợ ≥ 0,063, bịa/sai chunk ≤ 0,031).
  Khoảng cách hẹp, cần hiệu chỉnh lại trên bộ đánh giá. Panel chỉ hiện nhãn, điểm thô nằm trong tooltip.
- **Lưu ý tương thích:** Hậu kiểm gửi `{"pairs": [...]}` tới `/rerank`; embed server cũ không hiểu → hậu kiểm bị bỏ qua
  (log `[verify]`), chat vẫn chạy. Truy xuất vẫn gửi `{query, documents}` nên không phụ thuộc phiên bản server.
  Khởi động lại `python scripts/embed_server.py` sau khi cập nhật.

## 13. Lint React Compiler: gán lại biến trong callback khi render
- **Triệu chứng:** `react-hooks/immutability: Cannot reassign variable after render completes` khi cộng dồn `offset` trong `.map()`.
- **Cách xử lý:** Tính trước mảng `{ part, at }` bằng vòng `for` rồi mới `.map()` để render.
- **Lưu ý:** Dự án không cấu hình Prettier; đừng chạy `npx prettier --write` (mặc định 80 cột sẽ định dạng lại cả file).

## 14. Quy tắc mật khẩu chỉ áp cho đăng ký, không áp cho đăng nhập
- **Lưu ý:** `PASSWORD_RULES` (≥ 8 ký tự, hoa, thường, số, ký tự đặc biệt) dùng trong `registerSchema` và form đăng ký.
  `credentialsSchema` trong `src/lib/auth.ts` vẫn `min(6)`: nếu siết ở đó, tài khoản cũ và admin seed (`change-me`) sẽ không đăng nhập được.
- Chữ hoa/thường kiểm theo Unicode (`\p{Lu}`/`\p{Ll}`) nên "Ă/ă" hợp lệ; khoảng trắng không tính là ký tự đặc biệt.
- API trả `WEAK_PASSWORD` / `EMAIL_EXISTS` để form hiện đúng thông báo thay vì "Email có thể đã tồn tại" cho mọi lỗi.
