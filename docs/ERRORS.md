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
