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

## 15. `arr[1]` trong code bị coi là trích dẫn
- **Triệu chứng:** Câu trả lời có code mẫu như `` `arr[1]` `` hay `list[1]` trong khối ``` thì `[1]` bị hiện thành nút nguồn và bị đưa vào hậu kiểm.
- **Cách xử lý:** `maskCode()` trong `src/lib/sources.ts` thay code (cả khối ``` chưa đóng khi đang stream) bằng khoảng trắng, giữ nguyên vị trí ký tự;
  `citedIndexes` và `citationClaims` tìm `[n]` trên bản đã che. Khi render Markdown, plugin `remark-citations` bỏ qua node `code`/`inlineCode`.

## 16. Câu bằng chứng trong chunk PDF bị cụt
- **Triệu chứng:** Popover tô "stopped 99.9% of account compromises." thay vì cả câu, vì chunk từ PDF xuống dòng giữa câu.
- **Cách xử lý:** `splitSentences` chỉ tách ở dấu kết câu, dòng trống, hoặc dòng bắt đầu mục danh sách/tiêu đề; một `\n` đơn không còn là ranh giới câu.

## 17. Câu hỏi tiếng Việt chỉ còn 1 nguồn (reranker chéo ngôn ngữ)
- **Triệu chứng:** "Mật khẩu mạnh cần những gì?" chỉ có 1 đoạn (rerank 0,157), còn "What makes a strong password?" có 5 đoạn (0,87–0,34).
  19/20 ứng viên của câu tiếng Việt chỉ được 0,003–0,0045, dưới ngưỡng 0,01 (xem #10).
- **Cách xử lý:**
  - `searchQueries` (`src/lib/query.ts`): câu hỏi có chữ ngoài ASCII được LLM dịch sang tiếng Anh (khoảng 100 token, timeout 8 giây, lỗi thì dùng câu gốc).
    Truy xuất bằng cả hai câu, rerank lấy điểm cao hơn của hai câu (tài liệu tiếng Việt không bị thiệt). Tắt bằng `RAG_TRANSLATE_QUERY=off`.
  - `selectByRelevance` (`src/lib/rerank.ts`): khi có ít nhất 1 đoạn vượt ngưỡng thì giữ tối thiểu `RAG_MIN_KEEP` (mặc định 2);
    không đoạn nào vượt ngưỡng (câu lạc đề) thì không giữ đoạn nào.
- **Kết quả:** "Mật khẩu mạnh" từ 1 lên 5 đoạn (0,90–0,32); "xác thực đa yếu tố" 4 lên 5 (0,98–0,66); "nấu phở" vẫn 0.
  Chậm thêm khoảng 1 giây trước token đầu (dịch, cộng thêm một lần embed và rerank).
- **Hạn chế:** Tiếng Việt không dấu ("phong chong xss") bị coi là tiếng Anh và không được dịch.

## 18. Model trả lời bằng kiến thức ngoài tài liệu
- **Triệu chứng:** Prompt cũ cho phép "give safe general guidance". "Cách nấu phở bò?" (0 nguồn) vẫn nhận công thức nấu phở;
  câu hỏi phishing có 3 câu không trích dẫn, gồm cả thông tin tự thêm ("email, ngân hàng, mạng xã hội").
- **Cách xử lý (`src/lib/grounding.ts`):**
  - Prompt chặt: chỉ dùng các đoạn được đánh số, mỗi câu nêu sự kiện phải có `[n]`, phần không có trong tài liệu thì nói rõ.
    `temperature` 0,2.
  - Không có nguồn nào thì route trả câu cố định `noSourcesAnswer()`, không gọi LLM.
  - `uncitedSentences()` gạch chân chấm các câu nêu sự kiện mà thiếu `[n]` (bỏ qua tiêu đề, code, bảng, câu dẫn ":", câu ngắn,
    câu "tài liệu không đề cập"). Không đánh dấu khi đang stream.
- **Kết quả:** câu phishing từ 3 câu không có nguồn xuống 0, và câu trả lời nói rõ phần tài liệu không đề cập.

## 19. Viết lại câu hỏi nối tiếp: model bịa chủ đề
- **Triệu chứng:** "Trả lời ngắn gọn" khi chưa có hội thoại được viết lại thành "what is the NIST Cybersecurity Framework",
  kéo về 5 đoạn NIST không liên quan (rerank 0,99). Thêm luật `NONE` chung thì "Trả lời ngắn gọn" **có** hội thoại cũng thành `NONE`.
- **Cách xử lý:** `rewritePrompt(hasConversation)` tách hai trường hợp. Có hội thoại thì câu như "ngắn gọn hơn" tìm theo chủ đề câu hỏi trước,
  `NONE` chỉ dành cho lời chào. Không có hội thoại thì tin nhắn không có chủ đề trả `NONE`, chỉ tìm bằng câu gốc, ra 0 nguồn và nhận câu cố định.
- **Kiểm tra:** "Trả lời ngắn gọn" / "Xin chào" / "Giải thích thêm đi" (mới) cho 0 nguồn. "Trả lời ngắn gọn" và "Còn MFA thì sao?"
  (có hội thoại) cho 5 nguồn đúng chủ đề.

## 20. Mở PDF: không gắn CSP cho file PDF
- **Lưu ý:** `GET /api/admin/documents/[id]/file` gửi `nosniff` nhưng không gửi CSP cho PDF, vì trình xem PDF của Chrome là plugin,
  `sandbox`/`object-src` có thể chặn nó (không kiểm chứng được trong browser pane, pane chỉ tải file về). Tài liệu seed (markdown)
  trả `text/plain` kèm `default-src 'none'; sandbox`. File ngoài `UPLOAD_DIR`, thiếu file, hay đường dẫn là thư mục đều trả 404.

## 21. Quản lý ngữ cảnh: tóm tắt bị từ chối, viết lại câu hỏi nhầm chủ đề, mất trích dẫn ở lượt sau
- **Phát hiện bằng hội thoại 10 câu** (SQLi, rồi XSS, so sánh, "câu đầu tiên", ORM, tóm tắt, "lỗ hổng thứ hai"). LLM không quên ngữ cảnh
  vì nhận đủ lịch sử, nhưng các bước xung quanh làm hỏng 5/10 câu:
  1. "Tóm tắt lại những gì đã thảo luận": viết lại trả `NONE`, 0 nguồn, nên nhận câu cố định "không tìm thấy".
  2. Viết lại câu hỏi chỉ thấy 4 tin nhắn cuối: "lỗ hổng thứ hai" (XSS ở câu 5) thành truy vấn SQLi/ORM;
     "Còn XSS thì sao?" bị trộn "prepared statement parameterized query".
  3. Từ câu 6 trở đi câu trả lời không còn `[n]` (câu 6, 8, 10). Lịch sử gửi cho LLM đã bị xoá `[n]` và model bắt chước.
     A/B câu so sánh: xoá `[n]` thì 1/2 lần không trích dẫn, giữ `[n]` thì 2/2 lần trích dẫn đủ.
  4. "Câu hỏi đầu tiên mình hỏi là gì?" kéo về 3 đoạn tài liệu "Security Questions" không liên quan.
- **Cách xử lý:**
  - `planSearch` (`src/lib/query.ts`) trả thêm `intent`. `CONVERSATION` cho câu hỏi về chính hội thoại thì không truy xuất, không nguồn;
    LLM trả lời bằng `conversationSystemPrompt` chỉ từ lịch sử. Hỏi lại câu trả lời trước ở dạng khác ("Trả lời ngắn gọn lại ý vừa rồi")
    vẫn đi tìm tài liệu để giữ trích dẫn.
  - `historyForRewrite` gửi tối đa 10 câu hỏi trước (đánh số, mỗi câu 200 ký tự) cùng câu trả lời cuối (300 ký tự).
    Prompt dặn đếm chủ đề theo thứ tự, không thêm thuật ngữ của câu hỏi cũ, và truy vấn phải bằng tiếng Anh.
  - `citationReminder` được nối vào câu hỏi mới nhất khi có lịch sử (chỉ trong lời gọi LLM, không lưu).
  - `answerQuestion` (`src/lib/chat-answer.ts`) gom logic chung của hai route chat.
- **Kết quả:** 10/10 câu đúng. Mọi câu trả lời từ tài liệu đều có `[n]`; câu 7 và câu 9 trả lời từ hội thoại, không kèm nguồn.
  Phân loại ổn định 18/18 (6 trường hợp, mỗi trường hợp 3 lần).
- **Chưa xử lý:** route nạp lịch sử bằng `orderBy: asc, take: 40`, tức 40 tin nhắn **cũ nhất**. Từ lượt 21 trở đi, các lượt mới nhất
  không được gửi cho LLM. Đã sửa ở #24.

## 22. Hỏi tiếp về câu trả lời trước thì bị từ chối dù tài liệu có
- **Triệu chứng:** Sau câu trả lời về phòng tránh DDoS, "nói cho tôi biết nhiều hơn về giới hạn tài nguyên" và "nói thêm về phòng chống DoS
  ở mức ứng dụng" đều nhận "Các đoạn tài liệu được đánh số ở trên không đề cập…", dù truy xuất đã lấy đúng đoạn
  (DoS Cheat Sheet #19, AI chấm sát câu hỏi 85%; 5 đoạn rerank 0,64–0,76).
- **Nguyên nhân** (chạy lại đúng 2 lượt với lịch sử và nguồn trong DB, mỗi biến thể 3 lần):
  1. Câu nhắc của #21 ("Trả lời *chỉ* dựa trên các đoạn… *ở trên*") làm model quá khắt khe: từ chối 6/6; bỏ câu nhắc 5/6;
     câu nhắc chỉ yêu cầu gắn [n] 2/6.
  2. Model chép lời từ chối cũ trong lịch sử: không có câu nhắc vẫn lặp nguyên văn câu từ chối trước 3/3.
  3. Luật 3 bị hiểu quá sát chữ (đòi một mục đúng tên chủ đề). Đoạn gốc của ý "giới hạn tài nguyên" (Docker #23) không được lấy lại.
- **Cách xử lý:**
  - `citationReminder` chỉ yêu cầu gắn [n].
  - Luật 3: nội dung liên quan được tính dù khác tên gọi; trả lời phần có trước, chỉ từ chối khi không có đoạn nào liên quan.
  - `withoutRefusals` bỏ cả cặp câu hỏi và lời từ chối khỏi lịch sử gửi LLM. Nếu chỉ bỏ lời từ chối, model trả lời bù câu hỏi bị bỏ lửng
    bằng dữ liệu của câu trả lời cũ và gắn sai [n] (3/3).
  - `carryChunkIds`: các đoạn câu trả lời trước đã trích dẫn được thêm vào ứng viên trước bước rerank (chỉ cho người dùng đăng nhập).
- **Kết quả:** từ chối 0/6 (trước là 6/6). Còn 1/3 lần câu "DoS ở mức ứng dụng" chèn chi tiết Docker từ câu trả lời cũ và gắn [4] sai;
  hậu kiểm chấm 0,001 nên giao diện cảnh báo.

## 23. Mở panel nguồn rồi gửi câu hỏi: cả khung bị đẩy lên 49px
- **Nguyên nhân:** Panel nguồn `xl:h-screen` (100vh) nằm dưới thanh tài khoản desktop cao 49px (`py-1.5`, avatar 36px, viền 1px),
  nên tràn 49px. Thẻ gốc `overflow-hidden` giấu phần tràn, nhưng `scrollIntoView` (cuộn xuống cuối mỗi token) cuộn được cả thẻ
  `overflow-hidden`. Mô phỏng ở 1920×1000: panel đóng 0px, panel mở 49px.
- **Cách xử lý:** panel dùng `xl:h-full`. Cuộn xuống cuối và cuộn tới thẻ nguồn dùng `scrollToEnd` / `scrollIntoContainer`
  (`src/lib/scroll.ts`), chỉ cuộn đúng khung chứa, không dùng `scrollIntoView`. Trong mô phỏng, mỗi cách đều cho 0px.

## 24. Hội thoại dài hơn 40 tin nhắn: model không thấy các lượt mới nhất
- **Triệu chứng:** Chạy 22 câu liên tiếp. Ở câu 22, "Giải thích chi tiết hơn về cách làm đó" (ngay sau câu hỏi về thu hồi JWT) nhận
  "câu hỏi trước của bạn hỏi 'JWT nên lưu ở đâu phía client?'", tức câu 20.
- **Nguyên nhân:** route `conversations/[id]/messages` nạp lịch sử bằng `orderBy: asc, take: 40`, tức 40 tin nhắn **cũ nhất**.
  Từ câu 22 (42 tin nhắn trước đó), các lượt mới nhất bị bỏ khỏi cả lời gọi LLM, bước viết lại câu hỏi và `carryChunkIds`
  (lấy nhầm nguồn của câu trả lời 20). Câu viết lại của câu 22 là "JWT client-side storage best practices".
- **Cách xử lý:** nạp `orderBy: desc, take: 40` rồi đảo lại thứ tự thời gian.
- **Kết quả:** gửi tiếp vào đúng hội thoại đó (lượt 23–25, đã có hơn 40 tin nhắn): "cách làm đó" được giải thích là thu hồi JWT
  (TSL, denylist), nguồn JWT Cheat Sheet #38–#41 (rerank 0,81–0,95). "Câu hỏi ngay trước câu này" trả đúng lượt 24.

## 25. Hội thoại dài: bước viết lại quên chủ đề đầu tiên, lịch sử gửi lại không giới hạn
- **Triệu chứng** (22 câu liên tiếp, xem #24):
  1. Câu 19 "Lỗ hổng đầu tiên chúng ta bàn có liên quan gì đến Content Security Policy không?" được viết lại thành
     "first vulnerability discussed relation to Content Security Policy", không có chữ XSS. Truy xuất lấy 4 đoạn rerank ≤ 0,13,
     không có CSP Cheat Sheet. Câu trả lời vẫn đúng chỉ vì model trả lời thấy cả lịch sử.
  2. Mỗi câu hỏi gửi lại toàn bộ lịch sử: 40 tin nhắn ≈ 28 000 ký tự, cộng 6 000 ký tự đoạn tài liệu.
- **Nguyên nhân:** `historyForRewrite` chỉ giữ 10 câu hỏi gần nhất (câu 1 ra khỏi cửa sổ từ câu 11), trong khi model trả lời nhận
  nguyên 40 tin nhắn: hai bên nhìn hai phiên bản lịch sử khác nhau. Không có giới hạn ký tự cho lịch sử.
- **Cách xử lý:**
  - Route nạp tối đa 200 tin nhắn mới nhất (~100 lượt). `answerQuestion` bỏ lượt bị từ chối một lần rồi chia cho hai nơi dùng.
  - Bước viết lại nhận **mọi** câu hỏi trước, mỗi câu 120 ký tự.
  - `splitHistory` (`src/lib/chat-answer.ts`): model trả lời nhận các lượt mới nhất nguyên văn trong `HISTORY_CHAR_LIMIT` = 12 000 ký tự
    (trọn tin nhắn, bắt đầu từ một câu hỏi, luôn có lượt cuối). Câu hỏi của các lượt cũ hơn được liệt kê đánh số trong system prompt
    (`olderQuestionsNote`), không kèm câu trả lời. Trong giới hạn thì prompt không đổi.
- **Kết quả** (chạy lại 22 câu): câu 19 viết lại thành "first vulnerability XSS Content Security Policy CSP", nguồn gồm
  XSS Prevention và CSP Cheat Sheet, rerank cao nhất 0,78 (trước 0,13). Lịch sử gửi đi ≤ 12 000 ký tự từ câu 9. Câu 10
  ("câu hỏi đầu tiên") và câu 13 ("chủ đề thứ hai") vẫn đúng khi câu 1 chỉ còn trong danh sách câu hỏi cũ. Câu 22 vẫn đúng (#24).
- **Đánh đổi:** tóm tắt hội thoại dài chỉ biết câu hỏi của các lượt đã cắt, không biết câu trả lời (câu 11: mục XSS chỉ ghi tên chủ đề).

## 26. Câu hỏi nối tiếp dùng lại ý cũ nhưng gắn [n] của đoạn mới
- **Triệu chứng** (22 câu, #24): câu 3 "Trả lời ngắn gọn lại ý vừa rồi" gắn các ý về Twig vào `[1]` Java_Security (hậu kiểm 0,000–0,011);
  câu 6 "Hai lỗ hổng này khác nhau ở điểm nào?" gắn 4–6 câu về CSRF/SameSite vào một đoạn về XSS (≤ 0,007).
- **Nguyên nhân:** khi truy xuất bỏ sót đoạn gốc, model vẫn dùng ý từ câu trả lời cũ và gắn số của đoạn mới.
  `carryChunkIds` (#22) chỉ mang đoạn của **câu trả lời ngay trước** và xếp hạng chung, nên đoạn Symfony #8 (Twig) bị loại khỏi top 5;
  câu 6 lấy ý từ câu trả lời 1 và 4, không phải câu 5.
- **Thử nghiệm** (chạy lại trên hội thoại đã lưu, hậu kiểm của app, bỏ báo động nhầm: câu dẫn kết thúc bằng ":", mảnh < 25 ký tự,
  "đoạn bị cắt"):
  - 8 câu nối tiếp × 3 lần: hiện tại 2,6% trích dẫn yếu; giữ chỗ cho đoạn của mọi câu trả lời trong cửa sổ, không ngưỡng 4,8%
    (ép vào đoạn 0,04–0,08, đẩy ra đoạn tốt); có ngưỡng 0,1: 1,9%. Giữ chỗ chỉ cho đoạn của câu trả lời trước: câu 6 xấu hơn (3 lỗi).
  - Mô phỏng truy xuất bỏ sót (xoá đoạn gốc khỏi kết quả tìm), × 3 lần: câu 3 từ 6 lỗi (3/3 lần) xuống 1 (1/3); câu 6 từ 3 xuống 2.
- **Cách xử lý:** route gắn `citedChunkIds` vào từng câu trả lời trong lịch sử; `carriedChunkIds` (`src/lib/chat-answer.ts`) lấy đoạn
  của mọi câu trả lời trong cửa sổ gửi model (#25); `selectByRelevance` giữ tối đa 2 đoạn mang sang có rerank ≥ 0,1 dù ngoài top K.
- **Kết quả** (chạy lại 22 câu): câu 6 có Symfony #7 (định nghĩa XSS) và Symfony #9 (CSRF token), các ý đó trích đúng.
- **Chưa xử lý:** định nghĩa CSRF (CSRF Cheat Sheet #9) và ý SameSite chỉ đạt ~0,08 với câu hỏi so sánh, dưới ngưỡng, nên câu 6 vẫn gắn
  sai 2–3 câu. Mỗi câu chạy một lần dao động lớn: câu 17 cùng 5 nguồn mà 1 lỗi rồi 3 lỗi.

## 27. Câu bị từ chối mất khỏi đánh số; bước viết lại và model trả lời đếm "câu thứ N" khác nhau
- **Triệu chứng** (2 bộ 20 câu, `scratch-ctx/results2.json`, `results3.json`):
  - Bộ 3 có câu 6 (Luật An ninh mạng) và câu 7 bị từ chối. Câu 15 "đã hỏi tất cả bao nhiêu câu?" trả lời 9 (đúng là 15, tính cả câu đang hỏi).
    Câu 16 "câu hỏi thứ 6 là gì?" trả câu clickjacking (thực tế là câu 8). Câu 20 "những câu nào không tìm thấy tài liệu?" bỏ sót đúng các câu bị từ chối.
  - Bộ 3, câu 7 "Vậy còn ở châu Âu thì sao?" được viết lại thành "cookie attributes … GDPR Europe session management": mất chủ đề luật lưu trữ dữ liệu.
  - Bộ 2, câu 13 "lỗ hổng mình hỏi ở câu thứ hai thuộc mục nào trong OWASP Top 10?": bước viết lại hiểu đúng là IDOR, nhưng model trả lời
    hiểu là câu 7 (SSRF), nên câu trả lời nói về SSRF trong khi nguồn nói về BAC. Câu 19 (tóm tắt thành bảng) thiếu câu "phở", từ dòng 12 lệch số,
    và điền vào dòng 1 và 6 nội dung lấy từ câu trả lời 18.
- **Nguyên nhân:**
  - `withoutRefusals` (#22) bỏ cả cặp hỏi–đáp bị từ chối. Danh sách câu hỏi cho bước viết lại (`historyForRewrite`) và cho model trả lời
    (`olderQuestionsNote`, #25) đều được lập từ lịch sử đã bỏ, nên số thứ tự lệch và câu bị từ chối biến mất.
  - Model trả lời chỉ thấy câu hỏi cũ (đánh số) khi lịch sử vượt giới hạn, cộng các lượt gần đây không đánh số. Nó tự đếm trên các lượt
    nhìn thấy và không biết câu trả lời của các lượt đã cắt không được gửi.
- **Cách xử lý:**
  - `askedQuestions` (`src/lib/grounding.ts`): mọi câu hỏi theo thứ tự, câu có lời đáp là lời từ chối được đánh dấu
    `(not answered: nothing in the documents)`. Bước viết lại nhận lịch sử như đã lưu (còn lời từ chối) và dùng danh sách này.
  - `historyForAnswer` (`src/lib/chat-answer.ts`): các lượt nguyên văn vẫn bỏ lời từ chối và [n] như trước. Model trả lời nhận thêm `questionsNote`
    trong system prompt với mọi follow-up, ở cả hai chế độ: mọi câu hỏi, cùng cách đánh số với bước viết lại; "câu đang hỏi là câu N+1";
    các lượt bên dưới là câu k–N (trước đó không hiện câu trả lời); và cách bước viết lại hiểu câu đang hỏi ("was understood as: …").
  - `rewritePrompt`: chỉ hỏi câu thứ N là gì, đã hỏi bao nhiêu câu, câu nào chưa được trả lời thì là `CONVERSATION`. Hỏi thông tin mới về chủ đề
    của một câu cũ ("Quay lại câu hỏi đầu tiên…", "lỗ hổng ở câu thứ hai thuộc mục nào…") vẫn là tìm kiếm. Khi câu 6 giữ đúng số, "câu hỏi thứ 6
    là gì?" bị viết lại thành câu tìm kiếm về luật (4/4 lần) và nhận lời từ chối cố định. Luật bản đầu làm câu 13 bộ 2 thành `CONVERSATION` (2/2),
    nên phải tách hai trường hợp.
- **Kết quả** (chạy lại cả hai bộ; chạy lại bước viết lại trên hội thoại gốc mỗi câu 3 lần):
  - Bộ 3: câu 15 "15 câu", câu 16 trả đúng câu về Luật An ninh mạng. Trên hội thoại gốc (câu 6, 7 bị từ chối), câu 7 viết lại thành
    "GDPR data storage requirements for user data" (3/3), câu 16 là `CONVERSATION` (2/2).
  - Bộ 2: câu 13 trả lời "câu thứ hai là IDOR", phân loại con của BAC, rủi ro số một OWASP Top Ten 2021 (rerank 0,69). Câu 19: bảng đủ 19 dòng,
    câu "phở" ở dòng 12 ghi "không được trả lời", các câu 1–10 ghi "nội dung không hiển thị" thay vì bịa. Câu 9 đếm "3 câu về SSRF, câu 6–8".
- **Chưa xử lý:**
  - Câu trả lời ngoài cửa sổ 12 000 ký tự vẫn không được gửi (#25). Câu trả lời có nói "tài liệu không đề cập" nhưng có [n] không bị coi là từ chối,
    nên câu 20 bộ 3 ("những câu nào không tìm thấy tài liệu?") liệt kê theo các câu trả lời còn thấy, không đủ.
  - Nguồn của câu trả lời cũ không được gửi cho model: "câu trả lời thứ 7 dựa trên nguồn nào?" 1/3 lần là `CONVERSATION`, 2/3 lần là tìm kiếm.
  - Bộ 2 câu 14: truy xuất vẫn không thấy "A10: Server-Side Request Forgery" có trong kho.

## 28. Câu trả lời về chính cuộc trò chuyện bị coi là lời từ chối
- **Phát hiện khi rà soát #27:** câu trả lời ở chế độ hội thoại (`conversation`) không bao giờ có [n]. Nếu nó ngắn (≤ 400 ký tự) và có cụm
  "không đề cập" hoặc "không có thông tin", `isRefusal` coi nó là lời từ chối. Thử trên app (hội thoại 4 câu, `scratch-ctx/results4.json`):
  câu 3 "Câu nào mình hỏi mà tài liệu không đề cập?" nhận "Câu 1: … — tài liệu không đề cập." (92 ký tự, `isRefusal` = true). Câu trả lời
  cho câu 4 "Mình đã hỏi bao nhiêu câu…" cũng khớp mẫu từ chối.
- **Hậu quả trước khi sửa:** câu hỏi đó bị đánh dấu `(not answered: nothing in the documents)` và cả lượt bị bỏ khỏi các lượt gửi model
  (#22). Đúng loại câu "những câu nào không tìm thấy tài liệu?" (#27) sẽ tự liệt kê chính nó, và câu sau không thấy câu trả lời vừa rồi.
- **Cách xử lý:** route `conversations/[id]/messages` gắn `conversation` cho câu trả lời đã lưu khi `isConversationAnswer`: không lưu nguồn nào
  và không phải câu trả lời cố định `noSourcesAnswer` (`src/lib/grounding.ts`). Câu trả lời tài liệu luôn lưu nguồn, kể cả khi model từ chối.
  `isRefusedTurn` bỏ qua câu trả lời có `conversation`; `withoutRefusals` và `askedQuestions` dùng nó.
  Trong 231 câu trả lời đã có trong database, không câu nào bị đổi phân loại.
- **Kết quả:** câu 4 trả lời "Bạn đã hỏi 3 câu… câu số 3 đã được trả lời". Chạy lại hai bộ 20 câu (`results2b.json`, `results3b.json`):
  - Bộ 2: câu 13 "câu thứ hai" là IDOR, câu 19 bảng đủ dòng, câu 20 nói rõ câu trả lời 7 không còn trong ngữ cảnh.
  - Bộ 3: câu 15 "14 câu", câu 16 trả đúng câu về luật và ghi "chưa được trả lời", câu 20–21 liệt kê đúng câu 6.
  - 64/64 test qua, lint sạch.
- **Chưa xử lý (rà soát logic #27):**
  - Chat khách không lưu nguồn, nên không biết câu nào là câu trả lời hội thoại: lỗi này vẫn còn cho khách (tối đa 10 câu).
  - `questionsNote` liệt kê **mọi** câu hỏi, kể cả câu đã có trong các lượt gửi nguyên văn: 100 câu dài ≈ 21 000 ký tự trong system prompt,
    ngoài giới hạn lịch sử 12 000 ký tự (#25).
  - Route chỉ nạp 200 tin nhắn mới nhất: hội thoại hơn 100 lượt thì "câu hỏi đầu tiên" và "đã hỏi bao nhiêu câu" tính từ tin nhắn cũ nhất đã nạp.
  - Câu hỏi không có câu trả lời đã lưu (lỗi stream) được tính là "đã trả lời" trong danh sách đánh số.
  - Bộ 3 câu 7 ("Vậy còn ở châu Âu?") lần này không bị từ chối nhưng dùng nguồn rerank 0,01–0,02 (lỗi G, `RAG_MIN_RELEVANCE` = 0,01).
