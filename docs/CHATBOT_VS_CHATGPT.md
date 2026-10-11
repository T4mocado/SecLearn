# Chatbot SecLearn so với ChatGPT: điểm mạnh, điểm yếu và cách bảo vệ trước hội đồng

> Ngày lập: 2026-10-10. Phạm vi: chỉ đọc mã nguồn trong repo `seclearn_v2`, không chạy app, không truy vấn DB.
>
> Quy ước đánh dấu:
> - **[Code]**: mã nguồn chứng minh (có dẫn file + dòng).
> - **[Suy luận]**: rút ra từ code/dữ liệu nhưng chưa kiểm chứng khi chạy thật.
> - **[Docs]**: chỉ README/ghi chú nói vậy, code có thể khác.
> - **[OpenAI]**: thông tin về ChatGPT lấy từ trang chính thức của OpenAI (xem mục Nguồn). Lưu ý: khi tải trực tiếp, `openai.com`, `chatgpt.com` và `help.openai.com` đều trả về HTTP 403, nên nội dung lấy qua công cụ tìm kiếm giới hạn trong các domain chính thức đó. **Trước khi bảo vệ, hãy tự mở lại từng link**, vì giá và tính năng của ChatGPT thay đổi thường xuyên.

---

## 1. Tóm tắt

**Kết luận ngắn:** Về chất lượng trả lời tổng quát, chatbot SecLearn **không hơn được** ChatGPT. Nó gọi một mô hình thương mại giá rẻ (DeepSeek `deepseek-flash`, tắt chế độ suy luận) qua API, kèm một lớp RAG đơn giản trên vài tài liệu PDF do admin tải lên. Lý do chính đáng để dùng chatbot này thay vì ChatGPT **không nằm ở mô hình** mà nằm ở **sản phẩm**. Cụ thể:

1. Câu trả lời bám vào kho tài liệu do giảng viên/admin chọn lọc, có phân quyền tài liệu công khai và tài liệu cho người đã đăng nhập.
2. Embedding được tối ưu cho tiếng Việt (BKAI `vietnamese-bi-encoder` + tách từ `pyvi`), chạy cục bộ.
3. Người học không cần tài khoản OpenAI và không phải trả phí; khách được hỏi thử 10 câu.
4. Chatbot nằm chung nền tảng với bài học và phần ôn tập (quiz), lịch sử hội thoại lưu trong Postgres của nhà trường.
5. Persona "gia sư bảo mật cho người mới" cố định, có thể đổi nhà cung cấp LLM bằng biến môi trường.

**Nhưng** phần lớn các lợi thế trên hiện mới ở mức tiềm năng, chưa được hiện thực đầy đủ:

- Không hiển thị trích dẫn nguồn.
- Không có ngưỡng độ liên quan.
- Chatbot không biết gì về bài học (`Lesson`) và tiến độ học của người dùng.
- Chưa có cơ chế an toàn riêng cho các yêu cầu tấn công.
- Rate limit dễ bị vượt qua.
- Có một lỗi lịch sử hội thoại (chỉ gửi 40 tin **cũ nhất**).
- Không có bộ đánh giá chất lượng.

ChatGPT miễn phí hiện có Projects (tải file lên rồi hỏi), Study mode (gia sư theo phương pháp Socratic) và tìm kiếm web. Vì vậy câu hỏi *"sao không dùng ChatGPT?"* là câu hỏi rất thật. Cách trả lời trung thực nhất là định vị chatbot như **một thành phần của nền tảng học có kiểm soát nội dung**, không phải "một ChatGPT tốt hơn", rồi bổ sung bằng chứng đo lường (xem mục 6–7).

---

## 2. Chatbot hoạt động thế nào (theo code thực tế)

### 2.1 Luồng xử lý một câu hỏi

```
Trình duyệt (ChatPanel)
  ├─ Khách:        POST /api/chat/guest/messages      (gửi kèm history từ localStorage)
  └─ Đã đăng nhập: POST /api/chat/conversations/:id/messages (history lấy từ DB)
        │
        ├─ Kiểm tra cấu hình LLM + embedding
        ├─ (Khách) kiểm tra và tăng hạn mức theo cookie
        ├─ retrieveChunks(): embed câu hỏi → pgvector cosine → top-K=5 chunk
        ├─ formatContext(): "[i] (score=…)\n<nội dung>"
        ├─ streamChatCompletion(): system prompt + context (≤6000 ký tự) + history + câu hỏi
        │      → DeepSeek API (OpenAI-compatible), stream token
        └─ SSE "token"/"done"/"error" → client ghép chữ; (đã đăng nhập) lưu câu trả lời vào DB
```

| Thành phần | Thực tế trong code | Bằng chứng |
|---|---|---|
| LLM | Mặc định `LLM_PROVIDER=deepseek`, model `deepseek-flash`; hỗ trợ thêm `openai` (`gpt-4o-mini`) và `mock` | **[Code]** `src/lib/env.ts:8`, `src/lib/env.ts:54-59`; `.env` dòng 6, 11 |
| Gọi API | SDK `openai` trỏ `baseURL: https://api.deepseek.com` | **[Code]** `src/lib/llm.ts:51-61` |
| Tham số | `temperature: 0.4`, `stream: true`, gửi `thinking: {type:"disabled"}` cho DeepSeek | **[Code]** `src/lib/llm.ts:91-103` |
| System prompt | 5 câu tiếng Anh: gia sư bảo mật thân thiện cho người mới; dùng context khi phù hợp; nếu thiếu context thì nói rõ và đưa hướng dẫn chung an toàn; "Never invent CVE numbers"; ưu tiên ngôn ngữ theo locale | **[Code]** `src/lib/llm.ts:70-79` |
| Embedding (đang cấu hình) | `EMBED_PROVIDER=huggingface`, model `bkai-foundation-models/vietnamese-bi-encoder`, 768 chiều, gọi server cục bộ `HF_EMBED_URL=http://127.0.0.1:8008` | **[Code]** `.env` dòng 15, 17, 19, 21; `src/lib/embed.ts:43-85`; `scripts/embed_server.py:14-43` |
| Tách từ tiếng Việt | `pyvi.ViTokenizer` trước khi encode, `max_seq_length = 256` | **[Code]** `scripts/embed_server.py:18-20, 24, 33` |
| Vector store | Postgres + pgvector, cột `vector(768)`, truy vấn `ORDER BY embedding <=> query` (cosine), `LIMIT RAG_TOP_K` (=5) | **[Code]** `prisma/schema.prisma:117-129`; `src/lib/rag.ts:22-41`; `src/lib/env.ts:28` |
| Chỉ mục ANN | **Không có** chỉ mục HNSW/IVFFlat, nên mỗi truy vấn quét tuần tự | **[Code]** các file `prisma/migrations/*/migration.sql` chỉ có `ADD COLUMN embedding vector(N)` |
| Ingest | Chỉ nhận PDF do admin tải lên: `pdf-parse`, bỏ header/footer, chuyển sang Markdown, cắt chunk 800 ký tự (overlap 80), embed **tuần tự từng chunk**, chạy kiểu "fire-and-forget" trong tiến trình web | **[Code]** `src/app/api/admin/documents/route.ts:43-45`; `src/lib/ingest.ts:11-31, 67-109, 174-176`; `src/lib/pdf-cleanup.ts:43-80`; `src/lib/rag.ts:72-92` |
| Phân quyền tài liệu | Khách chỉ truy xuất `public`; người đăng nhập truy xuất `public` + `authenticated` | **[Code]** `src/app/api/chat/guest/messages/route.ts:44-47`; `src/app/api/chat/conversations/[id]/messages/route.ts:61-64` |
| Bộ nhớ hội thoại | Khách: lưu trong `localStorage`, client tự gửi `history` (tối đa 40 tin); đã đăng nhập: bảng `Conversation`/`Message` trong Postgres; bản nháp khách được chuyển vào tài khoản khi đăng nhập | **[Code]** `src/components/chat/chat-panel.tsx:100-147, 238-242`; `src/lib/validations.ts:5-17`; `prisma/schema.prisma:72-96`; `src/app/api/chat/conversations/migrate/route.ts:20-57` |
| Hạn mức | Khách 10 câu/cookie (`guest_chat_id`, hạn 7 ngày); người đăng nhập **không giới hạn** | **[Code]** `src/lib/env.ts:27, 114`; `src/lib/guest.ts:6-58`; `src/messages/vi.json:24` |
| Streaming | Server-Sent Events (`token`/`done`/`error`) | **[Code]** `src/lib/sse.ts:1-48`; `src/components/chat/chat-panel.tsx:19-54` |
| Song ngữ | Chọn ngôn ngữ trả lời theo `locale` (vi/en); thông báo lỗi song ngữ | **[Code]** `src/lib/llm.ts:75`; `src/lib/errors.ts:1-91` |
| Tool calling / web / upload của người học | **Không có** | **[Code]** không có `tools` trong `src/lib/llm.ts`; route chat chỉ nhận `content`, `locale`, `history` (`src/lib/validations.ts:5-17`) |
| Gắn với quiz | API `/api/quizzes/generate` có thể nhận `conversationId` để sinh 5 câu trắc nghiệm từ 12 tin gần nhất | **[Code]** `src/app/api/quizzes/generate/route.ts:17-36`; `src/lib/llm.ts:125-288` |

### 2.2 Kho tri thức thực tế

- Seed tạo một tài liệu nhỏ "SecLearn starter notes" (3 đoạn: mật khẩu, phishing, 2FA). **[Code]** `prisma/seed.ts:91-165`
- Trong `data/uploads/` có các file PDF mang tiền tố timestamp do app đặt tên (`1791567511670-owasp_MFA_cheatsheet.pdf`, `1791604713918-NIST.CSWP.29.pdf`). Cách đặt tên này khớp với `saveUploadedPdf` (`src/lib/ingest.ts:157`), nên **[Suy luận]** kho RAG hiện chỉ gồm khoảng 2 PDF tiếng Anh (OWASP MFA Cheat Sheet, NIST CSWP 29) cộng với seed. Chưa truy vấn DB để xác nhận.
- `data/uploads/cheatsheets/` chứa khoảng 144 file **HTML** OWASP Cheat Sheet, nhưng **không có đoạn code nào ingest HTML** (upload chỉ nhận PDF, `src/app/api/admin/documents/route.ts:43-45`). Kho tài liệu lớn này hiện **không** được chatbot dùng. **[Code + Suy luận]**
- Bài học (`Lesson`/`LessonTranslation`) **không** được đưa vào RAG: `retrieveChunks` chỉ đọc bảng `DocumentChunk` (`src/lib/rag.ts:26-35`). **[Code]**

---

## 3. Điểm mạnh so với ChatGPT (chỉ những gì code chứng minh)

### 3.1 Câu trả lời bám vào kho tài liệu do người dạy kiểm soát
- Mỗi câu hỏi đều được truy xuất top-5 đoạn từ kho do admin tải lên rồi đưa vào system prompt. **[Code]** `src/lib/rag.ts:13-41`, `src/lib/llm.ts:76-78`
- Admin quản lý vòng đời tài liệu: tải lên, theo dõi trạng thái `pending/ready/failed`, Reindex, đổi `visibility`. **[Code]** `src/app/api/admin/documents/route.ts`, `src/app/api/admin/documents/[id]/reindex/route.ts:8-23`, `src/lib/validations.ts:62-65`
- Có phân tầng truy cập: tài liệu `authenticated` chỉ dùng cho người đã đăng nhập. **[Code]** hai route chat nêu ở 2.1
- So với ChatGPT: người dùng ChatGPT cũng có thể tự tải file vào Projects (gói Free tối đa 5 file/project) **[OpenAI – Projects]**. Khác biệt là ở SecLearn **giảng viên chọn và cấu hình kho một lần cho mọi học viên**, học viên không phải tự đi tìm tài liệu.

### 3.2 Tối ưu truy xuất cho tiếng Việt
- Dùng model embedding chuyên tiếng Việt (BKAI) và tách từ bằng `pyvi`, cả lúc ingest lẫn lúc truy vấn (dùng chung `embedText`). **[Code]** `src/lib/env.ts:11, 64`; `scripts/embed_server.py:14-33`; `src/lib/rag.ts:18`; `src/lib/ingest.ts:84`
- Trả lời theo `locale`, giao diện và thông báo lỗi song ngữ. **[Code]** `src/lib/llm.ts:75`; `src/messages/vi.json`
- Cần nói rõ: ChatGPT cũng hỗ trợ tiếng Việt (giao diện có tiếng Việt và mô hình trả lời theo ngôn ngữ người hỏi) **[OpenAI – language settings]**. Lợi thế của SecLearn chỉ nằm ở **truy xuất tài liệu tiếng Việt**, không phải ở khả năng nói tiếng Việt. Ngoài ra kho hiện tại toàn tài liệu tiếng Anh (xem 4.5).

### 3.3 Embedding chạy cục bộ, kho tài liệu và lịch sử nằm trong hạ tầng nhà trường
- Việc embed tài liệu và câu hỏi chạy trên server Python cục bộ `127.0.0.1:8008`. **[Code]** `.env` dòng 21; `scripts/embed_server.py:43`
- Tài liệu, chunk và lịch sử hội thoại lưu trong Postgres tự quản. **[Code]** `prisma/schema.prisma:72-129`
- **Giới hạn của lập luận "dữ liệu không rời nền tảng":** câu hỏi, lịch sử và các đoạn tài liệu truy xuất được **vẫn gửi sang DeepSeek** (`src/lib/llm.ts:54-58, 91-95`). Không được nói "dữ liệu không ra ngoài". Chỉ có thể nói: "kho tài liệu gốc và bản ghi hội thoại do nền tảng giữ; phần gửi đi nhà cung cấp LLM giới hạn ở câu hỏi, lịch sử và tối đa 6000 ký tự context". Chính sách dữ liệu API của DeepSeek **chưa được kiểm chứng** trong tài liệu này.
- Ngược lại, với ChatGPT bản cá nhân, OpenAI có thể dùng hội thoại để huấn luyện mô hình nếu bật "Improve the model for everyone" (người dùng tự tắt được), còn các gói Business/Enterprise/Edu mặc định không dùng để huấn luyện **[OpenAI – Data controls]**.

### 3.4 Không cần tài khoản OpenAI, không mất phí cho người học, có hạn mức kiểm soát
- Khách hỏi được 10 câu mà không cần đăng ký, sau đó được mời đăng nhập; người đăng nhập dùng không giới hạn. **[Code]** `src/lib/guest.ts:22-58`; `src/messages/vi.json:21-24`
- Nhà cung cấp LLM dùng mô hình "flash" giá rẻ. Theo bảng giá DeepSeek, model Flash có giá đầu vào/đầu ra cỡ vài chục xu USD cho mỗi 1 triệu token **[DeepSeek – pricing; con số lấy qua kết quả tìm kiếm, cần kiểm tra lại]**.
- Lưu ý: ChatGPT cũng có gói Free 0 USD **[OpenAI – pricing]**, nên "miễn phí" không phải là lợi thế tuyệt đối. Lợi thế thật là **nhà trường trả chi phí, không cần tài khoản bên thứ ba và kiểm soát được hạn mức** (dù cơ chế hạn mức hiện còn yếu, xem 4.8).

### 3.5 Phạm vi và persona cố định cho người mới học
- System prompt khóa vai trò "beginner cybersecurity tutor", nhiệt độ thấp (0.4), cấm bịa số CVE. **[Code]** `src/lib/llm.ts:70-79, 96`
- Gợi ý câu hỏi mở đầu đúng chủ đề (mật khẩu, phishing, 2FA). **[Code]** `src/messages/vi.json:30-34`
- Mức độ có thật nhưng nhỏ: ChatGPT có Study mode, cũng là một bộ "system instructions" sư phạm và dùng được ở mọi gói **[OpenAI – Study mode]**.

### 3.6 Kiến trúc mở, đổi nhà cung cấp dễ, demo không cần key
- Chỉ cần đổi `LLM_PROVIDER`/`LLM_MODEL` (deepseek/openai/mock) và `EMBED_PROVIDER` (openai/local/huggingface/mock). Không có fallback "giả" khi cấu hình thật bị lỗi: lỗi được trả về rõ ràng. **[Code]** `src/lib/env.ts:3-32`; `src/lib/llm.ts:40-49, 81-84`; `src/lib/embed.ts:159-178`
- Có cảnh báo cấu hình lúc khởi động. **[Code]** `src/instrumentation.ts:1-9`; `src/lib/env.ts:74-110`

### 3.7 Gắn với hệ sinh thái học tập (một phần)
- Hội thoại có thể làm đầu vào sinh bộ câu "Ôn tập" và lưu kết quả làm bài (`QuizAttempt`). **[Code]** `src/app/api/quizzes/generate/route.ts:17-36`; `prisma/schema.prisma:153-196`
- **Nhưng giao diện chưa dùng tính năng này** (xem 4.10).

---

## 4. Điểm yếu và hạn chế (thẳng thắn)

### 4.1 Mô hình nền yếu hơn và phụ thuộc API trả trước
- Dùng `deepseek-flash` với `thinking` bị tắt để trả lời nhanh **[Code]** `src/lib/llm.ts:97-100`. Đây là lựa chọn ưu tiên tốc độ và chi phí, không ưu tiên khả năng suy luận. Tên tham số tắt thinking (`thinking: {type: "disabled"}`) **chưa được đối chiếu** với tài liệu DeepSeek hiện hành. Tài liệu DeepSeek mô tả điều khiển thinking theo từng request, nhưng tài liệu này không xác minh được cú pháp chính xác.
- `docs/ERRORS.md` ghi lại hai sự cố hết tiền: OpenAI 429 (hết credit embedding) và DeepSeek 402 (Insufficient Balance). Khi hết số dư, chatbot **ngừng hoạt động**. **[Docs]** `docs/ERRORS.md:5-9, 31-35`
- Ngoài DeepSeek, phần embedding còn phụ thuộc một server Python chạy tay (`python scripts/embed_server.py`). Server này dùng `HTTPServer` đơn luồng **[Code]** `scripts/embed_server.py:10, 43` và không có trong `docker-compose.yml`.

### 4.2 Không có trích dẫn nguồn cho người học
- `formatContext` chỉ ghi `[i] (score=…)` + nội dung, **không có tên tài liệu, không có trang**. **[Code]** `src/lib/rag.ts:65-70`
- Route không trả danh sách nguồn về client; SSE chỉ có `token/done/error`. **[Code]** `src/lib/sse.ts:29-41`
- Cột `DocumentChunk.metadata` có trong schema nhưng ingest không ghi gì vào đó, nên mất số trang. **[Code]** `prisma/schema.prisma:125`; `src/lib/ingest.ts:85-92`
- Hệ quả: người học **không kiểm chứng được** câu trả lời. Đây lại chính là lợi thế đáng ra RAG phải mang lại so với ChatGPT.

### 4.3 Không có ngưỡng độ liên quan, nguy cơ "ảo giác có căn cứ"
- Luôn lấy top-5 chunk dù điểm cosine thấp; không lọc theo `score`. **[Code]** `src/lib/rag.ts:22-41`
- Việc nhận ra "context không đủ" hoàn toàn dựa vào LLM tự đánh giá. **[Code]** `src/lib/llm.ts:73`
- Kho chỉ có vài tài liệu, nên phần lớn câu hỏi sẽ nhận context **không liên quan** nhưng vẫn bị coi là "Retrieved context". **[Suy luận]**

### 4.4 Truy xuất chỉ dựa vào câu hỏi cuối
- Query embed chỉ là `parsed.data.content`, không viết lại câu hỏi theo lịch sử. Câu hỏi nối tiếp kiểu "giải thích thêm ý 2" sẽ truy xuất sai. **[Code]** `src/app/api/chat/guest/messages/route.ts:44-47`; `src/app/api/chat/conversations/[id]/messages/route.ts:61-64`
- Không có hybrid search (BM25 + vector), không reranker. **[Code]** `src/lib/rag.ts`

### 4.5 Lệch ngôn ngữ giữa model embedding và kho tài liệu
- Model embedding chuyên tiếng Việt, trong khi kho thực tế toàn tài liệu tiếng Anh (OWASP, NIST). **[Code + Suy luận]** `.env` dòng 17; mục 2.2
- Một bi-encoder tiếng Việt chưa chắc khớp tốt giữa câu hỏi tiếng Việt và đoạn văn tiếng Anh. **Chưa có số đo** để khẳng định tốt hay xấu.
- `max_seq_length = 256` token trong khi chunk dài 800 ký tự. Văn bản dài sau khi tách từ có thể bị cắt cuối. **[Code]** `scripts/embed_server.py:24`; `src/lib/env.ts:29` **[Suy luận về mức ảnh hưởng]**

### 4.6 Fallback âm thầm, trái với tuyên bố "không có mock im lặng"
- Mọi lỗi của truy vấn vector (ví dụ sai số chiều) bị `catch {}` nuốt mất, rồi chuyển sang so khớp từ khóa thô trên **3 chunk đầu của 5 tài liệu**. Người dùng và admin không được báo. **[Code]** `src/lib/rag.ts:42-62`
- Seed: nếu embed lỗi thì gán **vector băm ngẫu nhiên** cho tài liệu mẫu, làm việc truy xuất tài liệu này trở nên vô nghĩa. **[Code]** `prisma/seed.ts:139-154`
- README nói "no silent mock when provider ≠ mock" **[Docs]** `README.md:14`. Hai chỗ trên mâu thuẫn với tuyên bố đó.

### 4.7 Lỗi và lỗ hổng cụ thể trong code
1. **Lịch sử hội thoại sai (bug thật):** route lấy `messages: { orderBy: { createdAt: "asc" }, take: 40 }`, tức **40 tin cũ nhất**. Khi hội thoại dài hơn 40 tin, mô hình không còn thấy các tin gần đây. **[Code]** `src/app/api/chat/conversations/[id]/messages/route.ts:21-24`
   - Sửa: `orderBy: desc, take: N` rồi đảo ngược thứ tự.
2. **Lịch sử của khách do client gửi lên:** khách có thể giả mạo các lượt `assistant` để dẫn dắt mô hình (prompt injection). Mỗi request cho phép tới 40 × 8000 ký tự lịch sử, tức khoảng 320 nghìn ký tự, làm **khuếch đại chi phí token** chỉ trong 1 "câu hỏi" được tính quota. **[Code]** `src/lib/validations.ts:8-16`; `src/app/api/chat/guest/messages/route.ts:43-50`
3. **Migrate nhận nội dung tùy ý từ client**, kể cả lượt `assistant` giả, rồi lưu vào DB như hội thoại thật. **[Code]** `src/app/api/chat/conversations/migrate/route.ts:20-44`
4. **Context nằm trong system prompt, không được đánh dấu là dữ liệu không tin cậy.** Một PDF chứa câu lệnh kiểu "ignore previous instructions" sẽ có quyền của system prompt (indirect prompt injection). **[Code]** `src/lib/llm.ts:76-78`
   - Mức rủi ro thấp hơn vì chỉ admin được tải tài liệu, nhưng tài liệu lại lấy từ nguồn ngoài.
5. **Lộ chi tiết lỗi nội bộ cho người học:** thông điệp lỗi chứa nguyên chi tiết lỗi từ nhà cung cấp và hướng dẫn sửa `.env`/API key (ví dụ "402 Insufficient Balance"). **[Code]** `src/lib/errors.ts:62-69`; `src/lib/sse.ts:36-41`; `src/messages/vi.json:27-29`
6. **Tốn quota khi lỗi:** quota khách bị tăng **trước** khi gọi LLM, nên lỗi API vẫn trừ lượt. Với người đăng nhập, tin `user` được lưu trước; nếu LLM lỗi hoặc client hủy thì không có câu trả lời nào được lưu (`cancel()` rỗng). **[Code]** `src/app/api/chat/guest/messages/route.ts:38-41`; `src/app/api/chat/conversations/[id]/messages/route.ts:41-47`; `src/lib/sse.ts:44-46`
7. **Tài liệu và mã lệch nhau:**
   - `README.md:12` và `docker-compose.yml:34-35` mặc định OpenAI/1536 chiều, trong khi schema là `vector(768)` (`prisma/schema.prisma:123`).
   - `docs/ERRORS.md:20` nói dùng `HF_EMBED_URL` thì không cần token, nhưng code vẫn bắt buộc `HF_TOKEN` khác rỗng (`src/lib/embed.ts:37-39`) và gửi token đó tới URL cục bộ (`src/lib/embed.ts:52`).
   - Trong Docker, `127.0.0.1:8008` trỏ vào chính container app, vốn không chạy embed server. **[Suy luận]**

### 4.8 Không có rate limit thật, chi phí khó kiểm soát
- Hạn mức khách chỉ dựa vào cookie: xóa cookie là có thêm 10 câu. Không giới hạn theo IP. **[Code]** `src/lib/guest.ts:6-20`
- Người đăng nhập không có giới hạn nào; tìm kiếm `rate limit|throttle|captcha|moderation` trong `src/` không ra kết quả. Middleware bỏ qua `/api`. **[Code]** `src/middleware.ts:7`
- Không có ngân sách token tổng cho mỗi request. Chỉ có context bị cắt ở 6000 ký tự. **[Code]** `src/lib/llm.ts:77`

### 4.9 Không có lớp an toàn chuyên cho nội dung tấn công
- Không gọi moderation, không có danh sách chủ đề cấm. System prompt không nói gì về việc từ chối viết mã độc hay khai thác hệ thống trái phép. **[Code]** `src/lib/llm.ts:70-79`
- Toàn bộ hành vi an toàn **phụ thuộc vào chính sách của DeepSeek**.
- Ngược lại, OpenAI công bố chính sách cấm hoạt động mạng độc hại nhưng vẫn cho phép giáo dục an ninh mạng (dual-use) **[OpenAI – system card/usage]**. Với một nền tảng dạy bảo mật, đây là điểm hội đồng dễ hỏi.

### 4.10 Tích hợp với nền tảng còn mỏng
- Chatbot **không đọc** bài học, kết quả quiz hay tiến độ học. Chỉ có `DocumentChunk` được truy xuất. **[Code]** `src/lib/rag.ts:26-35`; `prisma/schema.prisma:131-196`
- Trang Ôn tập gọi `/api/quizzes/generate` **chỉ với `locale`**, không gửi `conversationId` hay `topicHint`. Tính năng "sinh quiz từ hội thoại" có ở API nhưng không dùng tới. **[Code]** `src/app/[locale]/on-tap/page.tsx:68-72`
- Quiz sinh ra không bám RAG, chỉ dựa vào kiến thức của mô hình. Kiểm tra JSON sơ sài: không kiểm tra `correctOptionId` có nằm trong `options` không, chỉ cần ≥3 câu. Có thể ra đáp án sai. **[Code]** `src/lib/llm.ts:236-249, 265-273`
- Bài học không có nút kiểu "hỏi chatbot về bài này". **[Code]** `src/app/[locale]/lessons/[slug]/page.tsx` không tham chiếu chat

### 4.11 Trải nghiệm người dùng
- Câu trả lời hiển thị dạng **văn bản thô** (`white-space: pre-wrap`), không render Markdown hay code block. Ký hiệu `**`, `#` hiện nguyên. **[Code]** `src/components/chat/chat-panel.tsx:392`; `src/app/globals.css:83-84`
  - Mặt tích cực: an toàn trước XSS.
- Không có nút dừng sinh, không có nút sửa câu hỏi hay tạo lại câu trả lời, không có phản hồi 👍/👎. **[Code]** `chat-panel.tsx`
- Chỉ nhận văn bản: không cho người học tải file hay ảnh, không duyệt web, không chạy code, không có giọng nói. Trong khi đó ChatGPT Free có tìm kiếm, tải file/ảnh (có giới hạn) và memory giới hạn **[OpenAI – pricing / file uploads]**.

### 4.12 Thiếu đánh giá và khả năng mở rộng
- Không có test đơn vị hay bộ đánh giá RAG. Glob `**/*.{test,spec}.ts*` không ra file nào. `scripts/smoke.ts` chỉ kiểm tra route trả về SSE (dòng 44-53) với provider mock.
- Không ghi log truy xuất (chunk nào, điểm bao nhiêu) để phân tích.
- Không có ANN index; ingest embed tuần tự từng chunk, chạy trong tiến trình web, nên mất việc khi restart. **[Code]** `src/lib/ingest.ts:81-109, 174-176`

---

## 5. Khi nào nên dùng ChatGPT thay vì chatbot này

| Tình huống | Lý do |
|---|---|
| Câu hỏi ngoài phạm vi kho tài liệu (CVE mới, tin tức bảo mật, công cụ mới) | Chatbot không có web search và kho chỉ vài tài liệu; ChatGPT có Search ở gói Free **[OpenAI – pricing]** |
| Cần phân tích file, log, ảnh chụp màn hình, đoạn code dài | SecLearn chỉ nhận text ≤4000 ký tự (`src/lib/validations.ts:6`); ChatGPT hỗ trợ tải file/ảnh **[OpenAI – file uploads]** |
| Bài toán cần suy luận nhiều bước (phân tích cấu hình, review code bảo mật) | SecLearn tắt thinking và dùng model Flash (`src/lib/llm.ts:97-100`) |
| Hội thoại dài, cần ngữ cảnh xuyên phiên | Bug 40 tin cũ nhất (4.7.1); không có memory xuyên hội thoại; ChatGPT có Memory/Reference chat history **[OpenAI – Memory]** |
| Muốn tự học theo kiểu Socratic, có quiz và gợi ý | ChatGPT Study mode có ở mọi gói **[OpenAI – Study mode]** |
| Khi nhà trường hết credit DeepSeek hoặc server embedding tắt | Chatbot ngừng hoạt động (`docs/ERRORS.md:31-35`) |

---

## 6. Đề xuất cải thiện (theo thứ tự ưu tiên)

### Ưu tiên 1: sửa lỗi và lấp lỗ hổng (vài giờ)
1. **Sửa lịch sử hội thoại**: `orderBy: { createdAt: "desc" }, take: 20`, sau đó `.reverse()`. File: `src/app/api/chat/conversations/[id]/messages/route.ts:23`.
2. **Giới hạn tổng ngân sách lịch sử** (ví dụ 12 tin hoặc khoảng 6000 ký tự) cho cả hai route. Với khách, nên lưu lịch sử phía server theo `guestKey` thay vì tin `history` từ client. File: `src/lib/validations.ts:8-16`, `src/app/api/chat/guest/messages/route.ts:43`.
3. **Rate limit theo IP + user** (ví dụ token bucket trong Postgres hoặc Redis) cho `/api/chat/*` và `/api/auth/register`. Quota khách nên kết hợp cookie với IP. File: `src/lib/guest.ts`.
4. **Ẩn chi tiết lỗi nhà cung cấp** với người học; chỉ ghi log ở server. File: `src/lib/errors.ts:62-69`, `src/lib/sse.ts:37-40`, `src/messages/vi.json:27-29`.
5. **Bỏ `catch {}` âm thầm** ở `src/lib/rag.ts:42`; ít nhất phải log lỗi và báo trạng thái "RAG degraded". Bỏ fallback vector băm ở `prisma/seed.ts:147-154`.
6. **Đồng bộ tài liệu/cấu hình**: README, `docker-compose.yml:34-35` (768/huggingface), thêm service embed vào compose, bỏ yêu cầu `HF_TOKEN` khi có `HF_EMBED_URL` (`src/lib/embed.ts:37-39`).

### Ưu tiên 2: biến RAG thành lợi thế thật (1–3 ngày)
7. **Trích dẫn nguồn**:
   - Lưu `{page, documentTitle}` vào `DocumentChunk.metadata` khi ingest (`src/lib/ingest.ts:18, 85-92`; `pdf-parse` đã trả về từng trang).
   - `formatContext` ghi `[i] <tiêu đề> – trang p`.
   - Yêu cầu mô hình trích `[i]`.
   - Gửi thêm SSE event `sources` để UI hiển thị link.
   - Đây là **điểm khác biệt dễ chứng minh nhất** so với ChatGPT.
8. **Ngưỡng độ liên quan**: lọc `score < τ` (hiệu chỉnh trên tập đánh giá). Nếu không còn chunk nào thì trả lời theo kiểu "ngoài tài liệu khóa học" và nói rõ. File: `src/lib/rag.ts:22-41`.
9. **Ingest bài học và OWASP Cheat Sheets HTML** đã có sẵn trong `data/uploads/cheatsheets/` (khoảng 144 file). Thêm bộ ingest HTML/Markdown và đưa `LessonTranslation.content` vào kho. File: `src/lib/ingest.ts`, `src/lib/rag.ts`.
10. **Viết lại câu hỏi theo lịch sử** (query rewriting) trước khi embed; cân nhắc **hybrid search** (Postgres `tsvector` + pgvector) và tạo **HNSW index** cho cột embedding.
11. **Đánh giá cross-lingual**: so sánh BKAI với một model đa ngôn ngữ (ví dụ `multilingual-e5` hoặc `bge-m3`, cần tự kiểm chứng) trên bộ câu hỏi tiếng Việt / tài liệu tiếng Anh, đo Recall@5 và MRR.

### Ưu tiên 3: tích hợp sư phạm, lý do để chọn SecLearn thay vì ChatGPT (3–7 ngày)
12. **Ngữ cảnh người học**: đưa vào system prompt bài học đang xem và các câu quiz sai gần đây (`QuizAttempt.answers`), để chatbot gợi ý ôn đúng chỗ yếu. ChatGPT không có dữ liệu này.
13. **Nối UI quiz với hội thoại**: nút "Tạo Ôn tập từ cuộc trò chuyện này" gửi `conversationId` (`src/app/[locale]/on-tap/page.tsx:68-72`). Sinh quiz **từ chunk RAG** và kiểm tra `correctOptionId ∈ options` (`src/lib/llm.ts:265-273`).
14. **Chế độ gia sư**: thêm hướng dẫn Socratic (gợi ý trước, đáp án sau) và nút "giải thích đơn giản hơn". Đây là cách bám sát Study mode của ChatGPT nhưng gắn với nội dung khóa học.
15. **Chính sách an toàn riêng**: system prompt nêu rõ phạm vi (phòng thủ, lab hợp pháp), từ chối hướng dẫn tấn công hệ thống thật; thêm bộ phân loại đầu vào. Đánh dấu context là dữ liệu không tin cậy (bọc trong thẻ, đặt ở message `user` thay vì `system`).
16. **Render Markdown an toàn** (ví dụ `react-markdown` không bật HTML), thêm nút Stop/Regenerate và 👍/👎 lưu vào DB.

### Ưu tiên 4: bằng chứng cho luận văn
17. **Bộ đánh giá**: khoảng 50–100 câu hỏi tiếng Việt có đáp án và nguồn chuẩn từ OWASP/NIST.
    - Đo: Recall@k của retriever; độ đúng và tỉ lệ trích dẫn đúng của câu trả lời; tỉ lệ từ chối đúng câu ngoài phạm vi.
    - So sánh 3 cấu hình: (a) SecLearn, (b) cùng LLM nhưng không RAG, (c) ChatGPT Free.
    - Đây là cách duy nhất để **chứng minh** lợi thế, thay vì chỉ khẳng định.
18. **Ghi log** truy xuất và độ trễ, tính chi phí trung bình mỗi câu hỏi từ trường `usage` của API.

---

## 7. Gợi ý cách trình bày trước hội đồng

**Câu hỏi dự kiến:** *"Sao sinh viên không dùng luôn ChatGPT?"*

**Khung trả lời trung thực (khoảng 1 phút):**
1. **Thừa nhận ngay:** "ChatGPT mạnh hơn về mô hình và tính năng tổng quát (search, file, memory, study mode). Em không cạnh tranh ở đó."
2. **Định vị lại:** "Chatbot của em là **một thành phần** của nền tảng học có kiểm soát. Giảng viên quyết định nguồn kiến thức, phân quyền tài liệu, người học không cần tài khoản bên thứ ba, lịch sử nằm trong hệ thống của trường, và nó nối với phần Ôn tập."
3. **Đưa bằng chứng:** trình bày bảng kết quả của bộ đánh giá ở mục 6, bước 17. Ví dụ: "Trên N câu hỏi về OWASP, cấu hình RAG trả lời đúng X%, có trích nguồn Y%, so với Z% khi không có RAG." *Nếu chưa có số liệu, đừng tuyên bố "chính xác hơn ChatGPT".*
4. **Nói rõ giới hạn và hướng phát triển:** kho tài liệu còn nhỏ; chưa có trích dẫn hoặc ngưỡng liên quan (nếu chưa làm); phụ thuộc API DeepSeek; định hướng cá nhân hóa theo kết quả quiz.

**Những câu không nên nói (vì code không chứng minh hoặc mâu thuẫn):**
- "Dữ liệu không rời khỏi hệ thống." Câu hỏi và context vẫn gửi tới DeepSeek (`src/lib/llm.ts:54-58`).
- "Chatbot hiểu tiến độ học của sinh viên." Chưa có (4.10).
- "Chatbot trích dẫn nguồn." Chưa có (4.2).
- "Chatbot an toàn hơn ChatGPT." Không có lớp an toàn riêng (4.9).
- "Không bao giờ dùng mock/fallback." Có fallback âm thầm (4.6).

**Câu hỏi phụ có thể gặp và hướng trả lời:**
- *"Sao chọn DeepSeek?"* Chi phí thấp, API tương thích OpenAI, đổi nhà cung cấp bằng biến môi trường (`src/lib/env.ts:8`, `src/lib/llm.ts:51-61`). Kèm theo bảng chi phí trung bình mỗi câu đo được.
- *"Sao dùng embedding tiếng Việt khi tài liệu là tiếng Anh?"* Trả lời bằng số đo cross-lingual ở mục 6, bước 11. Nếu chưa đo, thừa nhận đây là giả thuyết cần kiểm chứng.
- *"Chống prompt injection thế nào?"* Hiện chỉ admin được tải tài liệu, lịch sử khách do client gửi. Nêu kế hoạch ở các bước 2 và 15.
- *"Mở rộng cho 1000 sinh viên được không?"* Nêu các điểm nghẽn: embed server đơn luồng, không có ANN index, ingest trong tiến trình web, không rate limit. Nêu hướng xử lý.

---

## 8. Nguồn

### File trong repo (đường dẫn tuyệt đối gốc `F:\Graduation_thesis\seclearn_v2\`)
- `src/lib/llm.ts` (system prompt, gọi DeepSeek/OpenAI, sinh quiz)
- `src/lib/rag.ts` (truy xuất pgvector, fallback, chunking)
- `src/lib/embed.ts` (embedding: mock/local/huggingface/openai)
- `src/lib/env.ts` (cấu hình, mặc định, hạn mức)
- `src/lib/ingest.ts`, `src/lib/pdf-cleanup.ts`, `src/lib/text-sanitize.ts` (ingest PDF)
- `src/lib/sse.ts`, `src/lib/errors.ts`, `src/lib/session.ts`, `src/lib/guest.ts`, `src/lib/validations.ts`
- `src/app/api/chat/guest/messages/route.ts`
- `src/app/api/chat/conversations/route.ts`, `src/app/api/chat/conversations/[id]/route.ts`, `src/app/api/chat/conversations/[id]/messages/route.ts`, `src/app/api/chat/conversations/migrate/route.ts`
- `src/app/api/quizzes/generate/route.ts`, `src/app/[locale]/on-tap/page.tsx`
- `src/app/api/admin/documents/route.ts`, `src/app/api/admin/documents/[id]/reindex/route.ts`
- `src/components/chat/chat-panel.tsx`, `src/app/globals.css`, `src/messages/vi.json`
- `src/middleware.ts`, `src/instrumentation.ts`
- `prisma/schema.prisma`, `prisma/seed.ts`, `prisma/migrations/*/migration.sql`
- `scripts/embed_server.py`, `scripts/smoke.ts`
- `README.md`, `docs/ERRORS.md`, `.env.example`, `.env` (chỉ đọc các biến không bí mật), `docker-compose.yml`, `package.json`
- `data/uploads/` (danh sách file)

### Nguồn chính thức về ChatGPT / OpenAI
(Tải trực tiếp bị 403; nội dung lấy qua tìm kiếm giới hạn domain chính thức. Cần mở lại để xác nhận.)
- Study mode (ra mắt): https://openai.com/index/chatgpt-study-mode/
- Study mode (help): https://help.openai.com/en/articles/11780217-using-study-mode-in-chatgpt
- Bảng giá / tính năng gói Free (Search, upload giới hạn, memory giới hạn, Projects): https://chatgpt.com/pricing/ và https://openai.com/chatgpt/pricing/
- Data controls (tắt "Improve the model for everyone", Temporary Chat, Business/Enterprise/Edu không train mặc định): https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt
- How your data is used to improve model performance: https://help.openai.com/en/articles/5722486-how-your-data-is-used-to-improve-model-performance
- Projects in ChatGPT (Free: 5 file/project): https://help.openai.com/en/articles/10169521-projects-in-chatgpt
- Memory: https://help.openai.com/en/articles/8590148-memory-faq
- Upload file: https://help.openai.com/en/articles/8555545-file-uploads-faq
- GPTs / knowledge: https://help.openai.com/en/articles/8843948-knowledge-in-gpts (các nguồn mâu thuẫn về giới hạn file và quyền tạo GPT trên gói cá nhân; **chưa xác minh**, không dùng làm luận điểm)
- Ngôn ngữ giao diện (có tiếng Việt): https://help.openai.com/en/articles/8357869-how-to-change-your-language-setting-in-chatgpt
- Chính sách an ninh mạng (cấm hoạt động mạng độc hại, cho phép giáo dục dual-use): https://deploymentsafety.openai.com/gpt-5-6 ; trang Usage Policies https://openai.com/policies/usage-policies/ **không tải được**, cần tự kiểm tra.

### Nguồn về DeepSeek
- Danh sách model (`deepseek-flash`): https://api-docs.deepseek.com/api/list-models/
- Bảng giá: https://api-docs.deepseek.com/quick_start/pricing-details-usd (số liệu giá **cần kiểm tra lại**)
- Chính sách dữ liệu API của DeepSeek: **chưa kiểm chứng** trong tài liệu này.
