# Rà soát cơ chế quản lý ngữ cảnh hội thoại của chatbot SecLearn

> Ngày lập: 2026-10-17. Phạm vi: đọc mã nguồn trên đĩa ở nhánh `fix/chat-context`, gồm cả các thay đổi chưa commit
> (`carryFor` có `inOrder`, `questionsNote` có `reformat`, tiêu đề chung chung trong `chunking.ts`). Không chạy app, không truy vấn DB.
> Không sửa mã nguồn.
>
> Quy ước đánh dấu:
> - **[Code]**: mã nguồn chứng minh (dẫn file và dòng, đánh số theo file trên đĩa ngày lập).
> - **[ERRORS #n]**: kết quả thực nghiệm đã ghi trong `docs/ERRORS.md`.
> - **[Suy luận]**: rút ra từ code nhưng chưa kiểm chứng khi chạy thật.
> - **[Nguồn]**: tài liệu chính chủ (docs framework, bài báo arXiv, docs nhà cung cấp mô hình), có link ở mục 7.
>
> Tài liệu này không lặp lại `docs/ERRORS.md` (nhật ký từng lỗi) và `docs/CHATBOT_VS_CHATGPT.md` (so sánh sản phẩm). Lưu ý:
> mục 4.4 ("Truy xuất chỉ dựa vào câu hỏi cuối") và lỗi "40 tin cũ nhất" trong `CHATBOT_VS_CHATGPT.md` **đã lỗi thời**. Code hiện tại
> đã viết lại câu hỏi (#21, #25) và đã sửa thứ tự nạp lịch sử (#24).

---

## 1. Tóm tắt

**Kết luận ngắn:** Cơ chế ngữ cảnh hiện tại tốt hơn mức "RAG cơ bản" nhiều. Nó đã có các kỹ thuật chuẩn: viết lại câu hỏi nối tiếp thành truy vấn độc lập
(query condensation), tách truy vấn theo chủ đề, phân loại ý định (tìm kiếm / hỏi về hội thoại / làm lại câu trả lời), cửa sổ lịch sử có giới hạn,
mang đoạn tài liệu đã trích dẫn sang lượt sau, và đánh số câu hỏi thống nhất giữa bước viết lại và bước trả lời. Mỗi quyết định đều có thực nghiệm
trong `ERRORS.md` (#21–#33).

Các giới hạn còn lại tập trung ở 4 điểm:

1. **Không có bộ nhớ tóm tắt.** Câu trả lời nằm ngoài cửa sổ 12 000 ký tự bị bỏ hẳn, chỉ còn lại câu hỏi. "Tóm tắt cả cuộc trò chuyện" trong hội thoại dài
   không thể đúng.
2. **Mọi ngân sách tính bằng ký tự, không tính bằng token.** Danh sách câu hỏi (`questionsNote`) không có giới hạn và nằm ngoài ngân sách lịch sử.
3. **Thứ tự prompt làm mất prompt caching.** Đoạn tài liệu thay đổi mỗi lượt nằm trong system prompt, **trước** lịch sử. Vì vậy phần lịch sử
   không bao giờ trúng cache của DeepSeek, trong khi giá trúng cache rẻ hơn khoảng 50 lần.
4. **Chat khách và một số đường biên chưa được bảo vệ.** Khách không có carried chunks, không có cờ `conversation`, lịch sử do client gửi.
   Reindex làm mất carried chunks của hội thoại cũ. Lượt bị lỗi stream để lại câu hỏi mồ côi.

Không có bộ nhớ dài hạn theo người dùng (xuyên hội thoại). Đây là lựa chọn hợp lý cho phạm vi luận văn, nhưng cần nói rõ khi bảo vệ.

---

## 2. Cơ chế hiện tại

### 2.1 Luồng xử lý một lượt chat (người dùng đã đăng nhập)

```
POST /api/chat/conversations/[id]/messages
 │
 ├─ 1. Nạp 200 tin nhắn MỚI NHẤT của hội thoại (desc rồi reverse)        route.ts:22, 30-37
 ├─ 2. Lưu tin nhắn user vào DB (trước khi trả lời)                     route.ts:53-59
 ├─ 3. Dựng history: mỗi câu trả lời kèm citedChunkIds + cờ conversation route.ts:74-85
 │
 └─ answerQuestion()                                                    chat-answer.ts:116-158
     ├─ 4. planSearch(): 1 lời gọi LLM viết lại câu hỏi                   query.ts:155-173
     │      input : MỌI câu hỏi trước (120 ký tự/câu, đánh số) + câu trả lời cuối (300 ký tự)
     │      output: intent = search | conversation, queries = [câu gốc, ≤3 truy vấn tiếng Anh], reformat?
     ├─ 5. historyForAnswer(): bỏ cặp bị từ chối, xoá [n],               chat-answer.ts:91-107
     │      giữ các lượt mới nhất ≤ 12 000 ký tự (splitHistory)          chat-answer.ts:20-43
     ├─ 6. questionsNote(): mọi câu hỏi đánh số + "đã hiểu là…" + REFORMAT grounding.ts:90-117
     │
     ├─ intent = conversation → LLM trả lời CHỈ từ lịch sử, không truy xuất, không nguồn  chat-answer.ts:135-145
     │
     └─ intent = search
         ├─ 7. retrieveChunks(): vector (mỗi truy vấn) + keyword (tsvector) + carried chunks  rag.ts:105-162
         │      → lọc menu trang → rerank cross-encoder → selectByRelevance (ngưỡng, giữ chỗ topic/carry)
         ├─ 8. buildContext(): đánh số [1..k], cắt ở 6000 ký tự          rag.ts:318-342
         ├─ 9. 0 nguồn → câu trả lời cố định, KHÔNG gọi LLM              chat-answer.ts:154-156
         └─10. streamChatCompletion(): system(luật + đoạn + questionsNote) + lượt cũ + câu hỏi + nhắc [n]  llm.ts:80-94
 │
 ├─11. Sau stream: hậu kiểm trích dẫn (cross-encoder) rồi LLM chấm nguồn   verify.ts:65-75
 └─12. onDone: lưu câu trả lời + snapshot nguồn (JSON) vào Message        route.ts:106-125
```

Chat khách (`/api/chat/guest/messages`) dùng chung `answerQuestion`, nhưng lịch sử do client gửi lên và không có `citedChunkIds`
hay cờ `conversation` (`src/app/api/chat/guest/messages/route.ts:45`). Không có gì được lưu phía server ngoài bộ đếm quota. **[Code]**

### 2.2 Chi tiết theo từng khía cạnh

| Khía cạnh | Cách làm hiện tại | Bằng chứng |
|---|---|---|
| **Chọn và cắt lịch sử** | Route nạp tối đa 200 tin mới nhất. Model trả lời nhận các lượt mới nhất **nguyên văn**, trọn tin nhắn, tổng ≤ `HISTORY_CHAR_LIMIT` = 12 000 ký tự, bắt đầu từ một câu hỏi, luôn có ít nhất lượt cuối (kể cả khi lượt cuối dài hơn 12 000). Lượt bị từ chối bị bỏ cả cặp hỏi–đáp. Dấu `[n]` bị xoá khỏi câu trả lời cũ. | **[Code]** `route.ts:22,34`; `chat-answer.ts:20,26-43,96-99`; `grounding.ts:171-181` |
| **Ngân sách token** | Không đếm token ở đâu cả. Mọi giới hạn tính bằng ký tự: lịch sử 12 000, context 6 000, câu hỏi khi viết lại 120/câu, câu trả lời cuối 300, `questionsNote` 200/câu (**không giới hạn số câu**). Lúc ingest, `tokenCount` ước lượng bằng `length/4`. | **[Code]** `chat-answer.ts:20`; `rag.ts:24`; `query.ts:9-10`; `grounding.ts:63`; `src/lib/ingest.ts:30` |
| **Viết lại câu hỏi (condensation)** | Có. Một lời gọi LLM ngắn (`max_tokens` 120, timeout 8 s, temperature 0). Bỏ qua khi chưa có lịch sử và câu hỏi đã là tiếng Anh. Lỗi hoặc hết giờ thì tìm bằng câu gốc. Truy vấn = `[câu gốc, ...các câu viết lại]`, tối đa 3 câu viết lại, mỗi chủ đề một câu. Prompt có luật giải đại từ ("it" là chủ đề gần nhất; "chủ đề thứ nhất" đếm theo thứ tự hỏi), không thêm thuật ngữ cũ, và nhãn `REFORMAT` / `CONVERSATION` / `NONE`. | **[Code]** `query.ts:6-7,59,99-108,115-148,155-188` |
| **Phân loại ý định** | `conversation`: trả lời chỉ từ lịch sử, không nguồn. `reformat`: làm lại câu trả lời trước, mang đoạn cũ sang. `search`: mặc định. | **[Code]** `query.ts:26-34,176-188`; `chat-answer.ts:135-145` |
| **Mang đoạn tài liệu qua các lượt** | Chỉ người dùng đăng nhập. Lấy `chunkId` mà các câu trả lời **trong cửa sổ** đã trích (theo `[n]` trong nội dung + snapshot nguồn), câu mới nhất trước. Lượt thường: thêm vào ứng viên, rerank chung, giữ tối đa 2 đoạn có điểm ≥ 0,1 dù ngoài top K. Lượt REFORMAT: giữ tới `RAG_TOP_K` đoạn theo thứ tự ưu tiên, không ngưỡng. | **[Code]** `chat-answer.ts:56-83`; `rag.ts:132,165-191`; `rerank.ts:50-85`; `src/lib/sources.ts:343-346` |
| **Lắp prompt và thứ tự** | `[system: persona + 6 luật + "Passages: ---<đoạn>---" + questionsNote]`, sau đó các lượt cũ (user/assistant, không `[n]`), rồi câu hỏi mới + lời nhắc gắn `[n]` (chỉ khi có lịch sử). Chế độ hội thoại: system prompt riêng + questionsNote + các lượt. | **[Code]** `llm.ts:80-94`; `grounding.ts:28-46,52-61,127-133` |
| **Tóm tắt / bộ nhớ ngắn hạn** | Không có tóm tắt. Thay vào đó, `questionsNote` liệt kê mọi câu hỏi (không có câu trả lời) và báo model biết các lượt nào đang hiện. | **[Code]** `grounding.ts:90-117`; **[ERRORS #25]** phần "Đánh đổi" |
| **Bộ nhớ dài hạn, theo người dùng** | Không có. `User` không có trường hồ sơ/sở thích. Mỗi `Conversation` độc lập. Chỉ phần tạo quiz đọc 12 tin cuối của một hội thoại. | **[Code]** `prisma/schema.prisma:48-61,72-85`; `src/app/api/quizzes/generate/route.ts:21` |
| **Quan hệ trích dẫn và ngữ cảnh** | `buildContext` trả đúng các chunk đã vào prompt nên nguồn hiển thị khớp với cái model thấy. Luật 5 cấm nhắc lại sự kiện chỉ có trong câu trả lời cũ. `[n]` bị xoá khỏi lịch sử vì số cũ trỏ tới đoạn cũ. Hậu kiểm từng câu có `[n]` bằng cross-encoder. | **[Code]** `rag.ts:318-342`; `grounding.ts:40-41`; `chat-answer.ts:96-98`; `verify.ts:17-59` |
| **Chuyển chủ đề** | Không có cơ chế phát hiện riêng. Dựa vào (a) luật viết lại "chỉ chủ đề câu mới nhất hỏi", (b) ngưỡng 0,1 cho carried chunks, (c) ngưỡng tương đối của rerank. Lịch sử nguyên văn của chủ đề cũ vẫn ở trong cửa sổ 12 000 ký tự. | **[Code]** `query.ts:135`; `chat-answer.ts:65-66`; `rag.ts:78-85` |
| **Lưu trong DB** | `Message(role, content, sources Json?)`. `sources` là snapshot các chunk (id, nội dung, điểm vector/rerank, hậu kiểm, chấm điểm). **Không lưu**: truy vấn viết lại, intent, cờ reformat, số token, tóm tắt. | **[Code]** `prisma/schema.prisma:87-98`; `route.ts:113-120` |

### 2.3 Những gì đã làm tốt (nên giữ và nêu khi bảo vệ)

- **Viết lại và trả lời dùng cùng một cách đánh số câu hỏi**, kể cả câu bị từ chối (`askedQuestions`). Nhờ vậy hai bước không hiểu "câu thứ 6" khác nhau.
  Các framework phổ biến không xử lý việc này. **[Code]** `grounding.ts:76-82`; **[ERRORS #27]**
- **Model được báo cách bước viết lại hiểu câu hỏi** ("was understood as: …"), nên truy xuất và trả lời không lệch chủ đề. **[Code]** `grounding.ts:111`
- **Tách truy vấn theo chủ đề cho câu so sánh** và giữ chỗ cho đoạn tốt nhất của mỗi chủ đề. Đây là dạng multi-query / RAG-Fusion có kiểm soát
  (không sinh thêm góc nhìn tự do, nên tránh được nhược điểm lệch đề mà bài RAG-Fusion tự nêu). **[Code]** `query.ts:82-85`; `rag.ts:126-148`; **[Nguồn]** RAG-Fusion
- **Ngưỡng liên quan + câu trả lời cố định khi không có nguồn** (không gọi LLM). Giống tinh thần CRAG (đánh giá chất lượng truy xuất rồi mới quyết định hành động),
  chỉ khác là CRAG mở rộng bằng web search còn SecLearn từ chối. **[Code]** `chat-answer.ts:154-156`; `rerank.ts:84`; **[Nguồn]** CRAG
- **Hybrid search (vector + tsvector) + reranker**. Đây là tổ hợp mà bài Contextual Retrieval của Anthropic báo cáo là hiệu quả nhất. **[Code]** `rag.ts:129-133`; **[Nguồn]** Contextual Retrieval
- **Đoạn tài liệu được gắn tiêu đề mục** (và tiêu đề chung chung được ghép mục cha). Đây là một dạng rẻ của "contextual chunk". **[Code]** `chunking.ts:95-160`
- **Mỗi quyết định đều có thí nghiệm A/B trên hội thoại thật** (#21–#33). Đây là điểm mạnh về phương pháp.

---

## 3. So sánh với các kỹ thuật quản lý ngữ cảnh RAG phổ biến

| Kỹ thuật | Thực hành phổ biến (nguồn) | Trạng thái trong repo | Khoảng trống |
|---|---|---|---|
| Viết lại câu hỏi theo lịch sử | LangChain `create_history_aware_retriever`: prompt "đừng trả lời, chỉ viết lại thành câu độc lập", rồi mới truy xuất. LlamaIndex `condense_question` / `condense_plus_context`. Nghiên cứu: conversational query rewriting (Yu và cộng sự, 2020). | **Có, mạnh hơn mẫu chuẩn**: kèm dịch sang tiếng Anh, tách chủ đề, intent, REFORMAT (`query.ts:115-188`). | Bước viết lại chỉ thấy câu trả lời cuối (300 ký tự), không thấy câu trả lời cũ hơn. Nếu "cái đó" trỏ tới một ý trong câu trả lời trước nữa thì không giải được. Câu gốc luôn được truy xuất kèm, kể cả khi nó chỉ là "nói thêm đi". |
| Chèn ngữ cảnh truy xuất vào prompt | LlamaIndex `context` / `condense_plus_context` chèn đoạn vào **system prompt**. | Giống: đoạn nằm trong system prompt (`grounding.ts:44`). | Phù hợp với mẫu chuẩn, nhưng xung đột với prompt caching (xem dòng "Prompt caching"). Đoạn tài liệu là dữ liệu, nhưng lại được đặt ở vai trò có thẩm quyền cao nhất. |
| Cắt lịch sử theo ngân sách | LangChain `trim_messages` / middleware: cắt theo **token**, giữ tin đầu + các tin cuối. LlamaIndex `Memory(token_limit=30000, chat_history_token_ratio=0.7)`. | Cắt theo **ký tự** (12 000), trọn tin, bắt đầu từ câu hỏi (`chat-answer.ts:26-43`). | Không có tokenizer. Tiếng Việt có dấu tốn token khác tiếng Anh nên 12 000 ký tự không cố định về token **[Suy luận]**. `questionsNote` nằm ngoài ngân sách. |
| Tóm tắt lịch sử cũ | LangChain `SummarizationMiddleware(trigger=("tokens", 4000), keep=("messages", 20))`. LlamaIndex: tin cũ bị "flush" sang khối nhớ dài hạn (`FactExtractionMemoryBlock`, `VectorMemoryBlock`). `ChatSummaryMemoryBuffer` nay đã deprecated. | **Không có.** Chỉ giữ danh sách câu hỏi. | "Tóm tắt toàn bộ", "câu trả lời số 3 nói gì", "so sánh với điều bạn nói lúc đầu" sai khi câu trả lời đó đã ra khỏi cửa sổ (**[ERRORS #25, #27]**). |
| Bộ nhớ phân tầng / dài hạn | MemGPT: "virtual context management", chuyển dữ liệu giữa các tầng nhớ như hệ điều hành. LlamaIndex `VectorMemoryBlock` (truy xuất lại tin cũ bằng vector). | Không có. Không truy xuất được tin cũ của chính hội thoại, không có bộ nhớ theo người dùng. | Hội thoại hơn 100 lượt bị cắt ở 200 tin (`route.ts:22`). Không cá nhân hoá theo tiến độ học. |
| Mang ngữ cảnh truy xuất qua lượt | Mẫu chuẩn của LangChain/LlamaIndex **truy xuất lại từ đầu mỗi lượt**, không mang chunk cũ. | **Có, vượt mẫu chuẩn**: carried chunks có ngưỡng và giữ chỗ (`chat-answer.ts:56-83`). | Chỉ cho người đăng nhập. Mất khi reindex (chunk id đổi). Không dùng snapshot đã lưu để dự phòng. |
| Truy xuất theo nhu cầu | Self-RAG: model tự quyết định **khi nào** cần truy xuất bằng reflection token. | Có dạng đơn giản: intent `conversation` bỏ qua truy xuất (`chat-answer.ts:135`). | Phân loại sai thành `conversation` thì câu hỏi kiến thức được trả lời không có nguồn. Không có kiểm tra lại. |
| Đánh giá chất lượng truy xuất | CRAG: bộ đánh giá nhẹ cho ra độ tin cậy, quyết định hành động (dùng, sửa, tìm thêm). | Ngưỡng rerank tuyệt đối/tương đối + fixed reply (`rag.ts:78-85`, `rerank.ts:50-85`). LLM-judge chạy **sau** khi đã trả lời (`judge.ts`). | Không có vòng "truy xuất lại khi điểm thấp", ví dụ viết lại truy vấn khác rồi tìm lần hai. |
| Vị trí thông tin trong prompt | "Lost in the Middle" (Liu và cộng sự, 2023): model dùng thông tin ở đầu/cuối tốt hơn ở giữa. Anthropic: đặt tài liệu dài ở đầu, câu hỏi ở cuối, cải thiện tới 30%. | Đoạn tài liệu ở đầu (system), lịch sử ở giữa, câu hỏi ở cuối. **Phù hợp.** | `questionsNote` (có thể dài tới ~20 000 ký tự) nằm **sau** đoạn tài liệu, đẩy đoạn tài liệu ra xa câu hỏi hơn **[Suy luận]**. |
| Prompt caching | DeepSeek: cache tự động, chỉ trúng khi **khớp trọn tiền tố**. Giá trúng cache $0,003 so với trượt $0,15 / 1M token (deepseek-flash, giờ thấp điểm), khoảng 50 lần. OpenAI: "đặt chỉ dẫn ổn định và tài liệu dùng chung lên đầu". | Đoạn tài liệu (đổi mỗi lượt) nằm ngay sau phần luật, trước lịch sử. Chỉ phần luật có thể trúng cache. | Toàn bộ lịch sử (tới 12 000 ký tự) bị tính giá trượt cache ở **mọi** lượt **[Suy luận từ docs DeepSeek; chưa đo `prompt_cache_hit_tokens`]**. |
| Ngữ cảnh hoá chunk khi index | Anthropic Contextual Retrieval: thêm 50–100 token mô tả vị trí chunk trong tài liệu trước khi embed. Giảm thất bại truy xuất 35%, 49% khi kèm BM25, 67% khi thêm rerank. | Một phần: tiêu đề mục ở đầu chunk, tên tài liệu trong prompt (không có trong embedding). | Chunk không mang tên tài liệu/cheat sheet trong embedding và tsvector. Ví dụ đoạn "SMS — Cons" vẫn chỉ đạt 0,12 (**[ERRORS #33]**). |
| HyDE | Sinh "tài liệu giả định" rồi embed nó để tìm (Gao và cộng sự, 2022). | Không có. | Có thể giúp câu hỏi đời thường ("mật khẩu mạnh cần gì") khớp văn phong cheat sheet; cần đo, vì tốn thêm một lời gọi LLM. |
| API trạng thái | DeepSeek `/chat/completions` là stateless: client phải tự gửi lại lịch sử mỗi lần. | Đúng: lịch sử do server dựng lại từ DB mỗi lượt (người đăng nhập). Khách thì do client gửi. | Lịch sử của khách không đáng tin (xem 4.6). |

---

## 4. Giới hạn hiện tại (xếp theo mức ảnh hưởng)

### 4.1 Câu trả lời ra khỏi cửa sổ là mất hẳn, không có tóm tắt (cao)
- **Code:** `splitHistory` chỉ trả câu hỏi của các lượt cũ (`chat-answer.ts:41`). `questionsNote` nói rõ với model "answers to earlier questions are not shown"
  (`grounding.ts:104-105`). Chế độ `conversation` cũng chỉ nhận đúng các lượt đó (`chat-answer.ts:133,136-143`).
- **Kịch bản hỏng:** hội thoại 25 câu, mỗi câu trả lời khoảng 1 500 ký tự, nên cửa sổ chỉ chứa khoảng 4 lượt cuối. Câu 26: "Tóm tắt lại 3 biện pháp chống XSS bạn nêu ở câu 2".
  Bước viết lại nhận ra "câu 2 = XSS" nên đi tìm lại, và câu trả lời có thể là **danh sách mới**, khác những gì bot đã nói. Câu "Tóm tắt toàn bộ cuộc trò chuyện
  thành bảng" chỉ điền được nội dung của 4 lượt cuối; các dòng khác ghi "nội dung không hiển thị" (đúng như **[ERRORS #27]**, câu 19 bộ 2).
- **So với thực hành chuẩn:** LangChain `SummarizationMiddleware` và LlamaIndex `Memory` (flush sang khối nhớ dài hạn) giải quyết đúng trường hợp này. **[Nguồn]**

### 4.2 `questionsNote` không có giới hạn và nằm ngoài ngân sách (cao khi hội thoại dài)
- **Code:** liệt kê **mọi** câu hỏi, mỗi câu tối đa 200 ký tự (`grounding.ts:63,96-100`), kể cả các câu đã có nguyên văn trong cửa sổ. Không tính vào `HISTORY_CHAR_LIMIT`.
- **Hệ quả:** 100 câu × khoảng 205 ký tự ≈ 20 000 ký tự trong system prompt, lớn hơn cả ngân sách lịch sử (12 000) và context (6 000). Đã ghi nhận nhưng chưa xử lý
  ở **[ERRORS #28]**. Prompt dài thêm, đắt hơn, và đẩy đoạn tài liệu xa câu hỏi hơn **[Suy luận]**.
- Ước lượng trường hợp xấu nhất của một lời gọi: luật ~2 300 + đoạn 6 000 + questionsNote ~20 000 + lịch sử 12 000 (có thể vượt nếu lượt cuối dài) + câu hỏi ≤ 4 000
  ≈ 45 000 ký tự. Con số này còn xa cửa sổ 1M token của `deepseek-flash` **[Nguồn: DeepSeek pricing]**, nên vấn đề là **chi phí, độ trễ và độ tập trung**,
  không phải tràn context.

### 4.3 Thứ tự prompt không thân thiện với prompt caching (trung bình, ảnh hưởng chi phí)
- **Code:** `system = luật + Passages(đổi mỗi lượt) + questionsNote(đổi mỗi lượt)`, rồi mới đến lịch sử (`llm.ts:88,93`; `grounding.ts:28-46`).
- **Hệ quả:** cache của DeepSeek chỉ trúng khi khớp trọn tiền tố. Tiền tố chung giữa hai lượt liên tiếp chỉ là phần luật (khoảng 2 300 ký tự), nên toàn bộ lịch sử bị tính
  giá trượt cache. Theo bảng giá, trượt đắt hơn trúng khoảng 50 lần **[Nguồn: DeepSeek KV cache, pricing]**. **Chưa đo** (`usage.prompt_cache_hit_tokens` chưa được log).
- Luật 3 chèn chuỗi theo `locale` vào **giữa** phần luật (`grounding.ts:37`). Phần luật vẫn ổn định theo từng ngôn ngữ nên không gây hại thêm.

### 4.4 Chuyển chủ đề chỉ được xử lý gián tiếp (trung bình)
- **Code:** không có bước phát hiện chủ đề mới. Lịch sử nguyên văn của chủ đề cũ vẫn đi cùng. Carried chunks chỉ lọc bằng điểm ≥ 0,1 (`chat-answer.ts:66`).
  Ở chế độ REFORMAT thì **không ngưỡng** (`chat-answer.ts:82`).
- **Kịch bản hỏng:** người dùng hỏi 5 câu về JWT, rồi gõ "Giải thích đơn giản hơn về CORS". Nếu bước viết lại gắn nhầm `REFORMAT` (vì có chữ "đơn giản hơn"),
  thì tối đa `RAG_TOP_K` đoạn JWT bị **giữ chỗ không ngưỡng** và chiếm vị trí của đoạn CORS. **[Suy luận]** Rule REFORMAT yêu cầu "chỉ đổi câu trả lời trước",
  nhưng không có kiểm tra hậu nghiệm, ví dụ so sánh truy vấn viết lại với chủ đề trước.
- Truy vấn gốc luôn nằm trong `queries` (`query.ts:187`). Với 2 truy vấn, cả câu gốc (ví dụ "nói thêm đi") cũng được dùng để chấm rerank (`rag.ts:139`).
  Điểm `bestScores` lấy max nên câu gốc vô nghĩa ít khi gây hại, nhưng vẫn tốn một lượt embed và một lượt rerank.

### 4.5 Carried chunks không bền (trung bình)
- **Reindex làm mất liên kết:** ingest xoá toàn bộ chunk của tài liệu rồi tạo id mới bằng `randomUUID()` (`src/lib/ingest.ts:26,116`). `fetchChunksById` lọc theo id
  nên trả rỗng, không báo lỗi (`rag.ts:165-191`). Sau lần reindex ở #33 (5 972 đoạn), mọi hội thoại cũ mất carried chunks, kể cả REFORMAT. Trong khi đó
  nội dung chunk **đã có sẵn** trong snapshot `Message.sources`.
- **Khách không có:** route khách không gắn `citedChunkIds` (`guest/messages/route.ts:45`), nên REFORMAT của khách chỉ dựa vào luật prompt (**[ERRORS #32]** đã ghi).
- **Thêm một lần embed:** `fetchChunksById` embed lại `queries.at(-1)` dù câu đó vừa được embed trong `retrieveCandidates` (`rag.ts:132,168`). Tốn thời gian, không sai.

### 4.6 Lịch sử của khách do client gửi (trung bình, bảo mật)
- **Code:** `history` lấy từ body (`guest/messages/route.ts:45`), tối đa 40 tin × 8 000 ký tự (`src/lib/validations.ts:8-16`). Client chỉ gửi nó cho khách
  (`src/components/chat/chat-panel.tsx:264`).
- **Cải thiện so với lúc viết `CHATBOT_VS_CHATGPT.md`:** model trả lời nay chỉ nhận ≤ 12 000 ký tự, nên rủi ro khuếch đại chi phí đã giảm.
- **Còn lại:** khách có thể bịa lượt `assistant` để dẫn dắt model (prompt injection qua lịch sử). Không có cờ `conversation`, nên lỗi #28 vẫn xảy ra với khách
  (**[ERRORS #28]** đã ghi). Bước viết lại vẫn nhận mọi câu hỏi do client gửi.

### 4.7 Đường biên lưu trữ: lượt lỗi để lại câu hỏi mồ côi (trung bình)
- **Code:** tin nhắn user được lưu **trước** khi trả lời (`route.ts:53-59`). Câu trả lời chỉ được lưu trong `onDone`, chạy sau khi hậu kiểm và LLM chấm xong
  (`sse.ts:40-45`). Nếu stream lỗi hoặc người dùng bấm dừng (`req.signal`), nhánh `catch` không lưu gì (`sse.ts:48-54`; `cancel` rỗng `sse.ts:56-58`).
- **Hệ quả:** lịch sử có hai tin `user` liền nhau. `askedQuestions` coi câu không có câu trả lời là "đã trả lời" (`grounding.ts:79-80`; reply là câu user tiếp theo,
  không phải refusal). Bước viết lại có thể đọc nhầm "Last answer". **[ERRORS #28]** đã ghi một phần. Câu trả lời một nửa (người dùng dừng giữa chừng) cũng mất hẳn.

### 4.8 LLM-judge và hậu kiểm dùng câu hỏi thô, không dùng câu đã viết lại (thấp–trung bình, ảnh hưởng số liệu đánh giá)
- **Code:** `finalizeSources({ question: parsed.data.content, ... })` (`route.ts:101`; khách `guest/messages/route.ts:58`). `judgeUser` đưa nguyên câu đó cho
  judge (`src/lib/judge.ts:22-25`).
- **Kịch bản:** với câu "Trả lời ngắn gọn lại ý vừa rồi", judge chấm `questionRelevance` của các đoạn so với câu không có chủ đề, nên điểm thấp giả tạo.
  Số liệu này ảnh hưởng tới panel nguồn và bất kỳ thống kê nào dùng điểm judge trong luận văn. **[Suy luận]**

### 4.9 Câu trả lời cuối trong bước viết lại có thể là lời từ chối (thấp)
- **Code:** `historyForRewrite` lấy `history.findLast(assistant)` (`query.ts:102`), kể cả câu trả lời cố định "không tìm thấy". Câu đó chứa danh sách gợi ý
  "mật khẩu mạnh, MFA, SQL injection, XSS, quản lý phiên" (`grounding.ts:9,17`).
- **Rủi ro:** sau một câu bị từ chối, câu nối tiếp mơ hồ ("vậy còn cái kia?") có thể bị viết lại theo một chủ đề trong danh sách gợi ý. **[Suy luận, chưa tái hiện]**

### 4.10 Không có bộ nhớ theo người dùng / xuyên hội thoại (thấp với phạm vi luận văn)
- Không có hồ sơ người học, chủ đề đã học, hay độ khó phù hợp (`schema.prisma:48-61`). Chatbot không biết bài học (`Lesson`) hay kết quả quiz. Điều này đã được nêu
  trong `CHATBOT_VS_CHATGPT.md` mục 4.10, nên ở đây chỉ ghi nhận.

### 4.11 Không lưu "dấu vết quyết định" của mỗi lượt (thấp, ảnh hưởng gỡ lỗi và đánh giá)
- Truy vấn viết lại, intent, cờ REFORMAT và số token không được lưu (`route.ts:113-120`). Mọi phân tích ở `ERRORS.md` phải chạy lại bước viết lại, và kết quả
  dao động giữa các lần chạy (**[ERRORS #26, #32]**). Bộ thử nghiệm hội thoại (`scratch-ctx/`) bị `.gitignore` (`scratch-*/`), không nằm trong repo.

---

## 5. Cần sửa đổi (lỗi và rủi ro nên xử lý ngay)

| # | Vấn đề | Đề xuất | File | Công sức |
|---|---|---|---|---|
| 5.1 | `questionsNote` không giới hạn (4.2) | Chỉ liệt kê đầy đủ các câu **ngoài** cửa sổ. Câu trong cửa sổ chỉ ghi số thứ tự, hoặc rút còn 60–80 ký tự. Đặt trần tổng (ví dụ 4 000 ký tự); khi vượt, gộp các câu cũ nhất thành "câu 1–40: chủ đề SQLi, XSS, …". Giữ nguyên cách đánh số (#27). | `src/lib/grounding.ts:90-117`, `src/lib/chat-answer.ts:91-107` | S |
| 5.2 | Carried chunks mất sau reindex (4.5) | Khi `fetchChunksById` thiếu id, dùng nội dung từ snapshot `sources` đã lưu (đã có `content`, `documentId`, `documentTitle`), kiểm tra tài liệu còn `ready` và đúng quyền. Hoặc gán id ổn định theo `(documentId, hash(content))`. | `src/lib/rag.ts:165-191`, route `[id]/messages/route.ts:74-85` | S–M |
| 5.3 | Lượt lỗi để lại câu hỏi mồ côi (4.7) | Trong `onError` / `cancel`: lưu phần đã sinh, đánh dấu `incomplete`, hoặc xoá tin user. `askedQuestions` coi câu không có reply là "chưa trả lời". Cân nhắc lưu câu trả lời **trước** bước LLM-judge (30 s), rồi `update` nguồn sau. | `src/lib/sse.ts:48-58`, `[id]/messages/route.ts:97-126`, `src/lib/grounding.ts:76-82` | S |
| 5.4 | Judge chấm theo câu hỏi thô (4.8) | Truyền thêm `plan.queries.slice(1)` (cách hiểu câu hỏi) cho `finalizeSources` / `judgeUser`, ví dụ "Question (understood as: …)". | `src/lib/chat-answer.ts` (trả `plan`), `src/lib/judge.ts:22-25`, 2 route | S |
| 5.5 | Lời từ chối làm "Last answer" cho bước viết lại (4.9) | Dùng câu trả lời cuối **không phải** lời từ chối (`isRefusedTurn`), hoặc ghi "(last answer: not found in documents)". | `src/lib/query.ts:102` | S |
| 5.6 | REFORMAT không ngưỡng khi phân loại sai (4.4) | Chỉ chấp nhận REFORMAT khi truy vấn viết lại gần chủ đề câu trước (so cosine với truy vấn của lượt trước, cần lưu ở 6.1), hoặc khi carried chunks có điểm tối thiểu (ví dụ 0,02). | `src/lib/query.ts:176-188`, `src/lib/chat-answer.ts:75-83` | S–M |
| 5.7 | Lịch sử khách không đáng tin (4.6) | Lưu lịch sử khách phía server theo `guestKey` (bảng có sẵn `GuestQuota`; thêm bảng tin nhắn khách có hạn 7 ngày), hoặc ký HMAC từng câu trả lời server đã sinh và bỏ lượt `assistant` không có chữ ký. Cách thứ hai đồng thời cho phép gửi kèm `citedChunkIds` của khách. | `src/app/api/chat/guest/messages/route.ts`, `prisma/schema.prisma`, `src/lib/validations.ts` | M |

---

## 6. Có thể phát triển

Ước lượng công sức: **S** ≤ 1 ngày, **M** 2–4 ngày, **L** ≥ 1 tuần (gồm đo lại bằng bộ hội thoại hiện có).

| # | Hướng phát triển | Lợi ích | File chính | Công sức |
|---|---|---|---|---|
| 6.1 | **Lưu dấu vết mỗi lượt**: thêm cột `Message.meta Json?` gồm `queries`, `intent`, `reformat`, `usage` (prompt/completion/`prompt_cache_hit_tokens`), thời gian từng bước. | Gỡ lỗi không cần chạy lại, có số liệu cho luận văn, là tiền đề cho 5.6, 6.3, 6.4. | `prisma/schema.prisma:87-98`, `src/lib/llm.ts:111-138` (bật `stream_options.include_usage` nếu DeepSeek hỗ trợ: **chưa kiểm chứng**), route | S |
| 6.2 | **Tóm tắt cuộn (rolling summary)**: khi các lượt rời cửa sổ 12 000 ký tự, sinh tóm tắt các câu trả lời đó (giữ tên chủ đề, các ý chính, nguồn đã dùng), lưu vào `Conversation.summary` và cập nhật dần. Đưa vào chỗ của phần câu hỏi cũ trong `questionsNote`. Cần quy tắc: tóm tắt là "điều bot đã nói", **không được trích [n]** (cùng tinh thần luật 5). | Giải quyết 4.1: "tóm tắt cả cuộc trò chuyện", "câu trả lời số 3 nói gì". Giống `SummarizationMiddleware` của LangChain. | `src/lib/chat-answer.ts`, `src/lib/grounding.ts`, `prisma/schema.prisma:72-85`, route | M |
| 6.3 | **Sắp lại prompt cho caching**: `[system: luật cố định]` → các lượt cũ → `[user: questionsNote + Passages + câu hỏi + nhắc [n]]`. Tiền tố "luật + lịch sử" ổn định giữa các lượt nên trúng cache. Đoạn tài liệu vẫn nằm ngay trước câu hỏi (đúng "Lost in the Middle", đúng khuyến nghị đặt câu hỏi ở cuối), và được bọc như dữ liệu (`<passages>`), không còn ở vai trò system. Lưu ý: lượt cũ lưu trong prompt phải giữ nguyên văn bản giữa các lượt thì mới khớp tiền tố. | Giảm chi phí input (đo bằng 6.1). Đồng thời đáp ứng đề xuất 15 của `CHATBOT_VS_CHATGPT.md` (đưa context ra khỏi system). **Bắt buộc A/B lại** tỉ lệ trích dẫn yếu và từ chối (#22 cho thấy model nhạy với vị trí câu nhắc). | `src/lib/llm.ts:80-94`, `src/lib/grounding.ts:28-46,127-133` | M |
| 6.4 | **Ngân sách theo token**: thay ký tự bằng ước lượng token (thư viện tokenizer, hoặc hệ số riêng cho tiếng Việt hiệu chỉnh bằng `usage` thật từ 6.1). Một hàm `budget()` chia tổng (ví dụ 8k token) cho luật / đoạn / ghi chú / lịch sử theo thứ tự ưu tiên, như `chat_history_token_ratio` của LlamaIndex. | Thay ba hằng số rời rạc (12 000 / 6 000 / không giới hạn) bằng một ngân sách có kiểm soát. | `src/lib/chat-answer.ts:20`, `src/lib/rag.ts:24`, `src/lib/grounding.ts:63` | M |
| 6.5 | **Truy xuất lại tin cũ của chính hội thoại** (episodic memory): embed các câu trả lời đã lưu, và khi câu hỏi nhắc tới lượt cũ ngoài cửa sổ ("câu thứ 3", "lúc đầu bạn nói") thì chèn lại đúng lượt đó. Câu hỏi đã được đánh số nên có thể tra trực tiếp theo số, không cần vector. | Rẻ hơn tóm tắt cho câu hỏi kiểu "câu trả lời số N". Giống `VectorMemoryBlock` / MemGPT ở mức nhỏ. | `src/lib/query.ts` (thêm nhãn "REFERS n"), `src/lib/chat-answer.ts` | M |
| 6.6 | **Truy xuất sửa sai kiểu CRAG**: khi điểm rerank tốt nhất nằm giữa ngưỡng và một mức "chắc chắn" (ví dụ 0,05–0,3), viết lại truy vấn lần hai (từ khoá khác, tên đầy đủ, hoặc HyDE) rồi tìm lại trước khi trả lời. | Giảm các ca "tài liệu không đề cập" dù kho có (**[ERRORS #32]** câu metadata endpoint, **[ERRORS #33]** SMS OTP). | `src/lib/rag.ts:105-162`, `src/lib/query.ts` | M |
| 6.7 | **Contextual chunk khi index**: thêm tên tài liệu/cheat sheet và chuỗi tiêu đề mục vào văn bản được embed và `searchText` (không cần đưa vào nội dung hiển thị). Có thể thêm 1–2 câu mô tả bằng LLM như Contextual Retrieval. | Theo Anthropic, ngữ cảnh hoá chunk giảm 35–67% thất bại truy xuất. Với SecLearn, giúp các đoạn "— Cons" phân biệt được ngữ cảnh của mình. | `src/lib/chunking.ts`, `src/lib/ingest.ts:20-40` | M (cần reindex) |
| 6.8 | **Phát hiện chuyển chủ đề tường minh**: bước viết lại trả thêm `NEW_TOPIC` / `SAME_TOPIC`. Khi chủ đề mới: không mang carried chunks, rút cửa sổ lịch sử nguyên văn xuống 1–2 lượt (các lượt cũ đã có trong questionsNote/tóm tắt). | Giảm nhiễu từ chủ đề cũ, giảm token. | `src/lib/query.ts:115-188`, `src/lib/chat-answer.ts:91-107` | S–M |
| 6.9 | **Đưa bộ đánh giá hội thoại nhiều lượt vào repo** (`scripts/eval-context/`): các bộ 20–22 câu đã dùng trong #24–#33, có chỉ số tỉ lệ trích dẫn yếu, tỉ lệ từ chối, đúng/sai khi hỏi "câu thứ N", và token/lượt. Chạy nhiều lần lấy trung bình. | Mọi thay đổi ở mục 5–6 có thể đo hồi quy. Là bằng chứng định lượng cho luận văn. | `scripts/`, `.gitignore` (hiện bỏ qua `scratch-*/`) | S–M |
| 6.10 | **Bộ nhớ theo người học** (xuyên hội thoại): ghi các chủ đề đã hỏi, bài học đã xem, điểm quiz, rồi đưa một khối "hồ sơ" ngắn vào prompt (giống `StaticMemoryBlock`). | Cá nhân hoá, gắn chatbot với nền tảng học. Cần chú ý quyền riêng tư và phạm vi luận văn. | `prisma/schema.prisma`, `src/lib/chat-answer.ts` | L |

**Thứ tự gợi ý:** 6.1 và 6.9 (để đo được) → 5.1, 5.3, 5.4, 5.5 (nhanh) → 5.2 → 6.3 (đo chi phí cache) → 6.2 hoặc 6.5 → các mục còn lại.

---

## 7. Nguồn tham khảo

### File trong repo (gốc `F:\Graduation_thesis\seclearn_v2\`)
- `src/lib/chat-answer.ts` (cửa sổ lịch sử, carried chunks, `answerQuestion`)
- `src/lib/query.ts` (viết lại câu hỏi, intent, REFORMAT)
- `src/lib/rag.ts` (truy xuất hybrid, `buildContext`, `CONTEXT_CHAR_LIMIT`)
- `src/lib/rerank.ts` (`selectByRelevance`)
- `src/lib/grounding.ts` (system prompt, `questionsNote`, `askedQuestions`, `withoutRefusals`)
- `src/lib/llm.ts` (`chatRequestMessages`, gọi DeepSeek/OpenAI)
- `src/lib/env.ts` (mặc định `LLM_PROVIDER=deepseek`, model `deepseek-flash`, `RAG_TOP_K=5`)
- `src/lib/sse.ts`, `src/lib/verify.ts`, `src/lib/judge.ts`, `src/lib/ingest.ts`, `src/lib/chunking.ts`, `src/lib/sources.ts`, `src/lib/validations.ts`
- `src/app/api/chat/conversations/[id]/messages/route.ts`, `src/app/api/chat/guest/messages/route.ts`
- `src/components/chat/chat-panel.tsx`, `prisma/schema.prisma`
- `docs/ERRORS.md` (#21–#33), `docs/CHATBOT_VS_CHATGPT.md`

### Docs framework
- LangChain, Short-term memory (trim / delete / summarize, `SummarizationMiddleware`): https://docs.langchain.com/oss/python/langchain/short-term-memory
- LangChain, Add chat history (`create_history_aware_retriever`, contextualize question): https://python.langchain.com/docs/use_cases/question_answering/chat_history
- LangChain API, `ConversationalRetrievalChain` (deprecated, trỏ sang history-aware retriever): https://python.langchain.com/v0.2/api_reference/langchain/chains/langchain.chains.conversational_retrieval.base.ConversationalRetrievalChain.html
- LlamaIndex, Chat engine usage pattern (`condense_question`, `context`, `condense_plus_context`): https://developers.llamaindex.ai/python/framework/module_guides/deploying/chat_engines/usage_pattern/
- LlamaIndex, Memory (`token_limit`, `chat_history_token_ratio`, memory blocks; `ChatMemoryBuffer` / `ChatSummaryMemoryBuffer` deprecated): https://developers.llamaindex.ai/python/framework/module_guides/deploying/agents/memory/

### Bài báo
- Liu và cộng sự, 2023. *Lost in the Middle: How Language Models Use Long Contexts*. https://arxiv.org/abs/2307.03172
- Packer và cộng sự, 2023. *MemGPT: Towards LLMs as Operating Systems*. https://arxiv.org/abs/2310.08560
- Yan và cộng sự, 2024. *Corrective Retrieval Augmented Generation* (CRAG). https://arxiv.org/abs/2401.15884
- Asai và cộng sự, 2023. *Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection*. https://arxiv.org/abs/2310.11511
- Gao và cộng sự, 2022. *Precise Zero-Shot Dense Retrieval without Relevance Labels* (HyDE). https://arxiv.org/abs/2212.10496
- Rackauckas, 2024. *RAG-Fusion: a New Take on Retrieval-Augmented Generation*. https://arxiv.org/abs/2402.03367
- Yu và cộng sự, 2020. *Few-Shot Generative Conversational Query Rewriting*. https://arxiv.org/abs/2006.05009

### Docs nhà cung cấp mô hình
- DeepSeek, Context caching (tự động, khớp trọn tiền tố, `prompt_cache_hit_tokens`): https://api-docs.deepseek.com/guides/kv_cache
- DeepSeek, Models & pricing (`deepseek-flash`, context 1M, giá trúng/trượt cache): https://api-docs.deepseek.com/quick_start/pricing
- DeepSeek, Multi-round conversation (API stateless, client tự gửi lịch sử): https://api-docs.deepseek.com/guides/multi_round_chat
- OpenAI, Prompt caching (khớp trọn tiền tố, nội dung ổn định đặt trước): https://developers.openai.com/api/docs/guides/prompt-caching
- Anthropic, Prompting best practices: long context (tài liệu dài ở đầu, câu hỏi ở cuối, tới 30%): https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- Anthropic, Introducing Contextual Retrieval: https://www.anthropic.com/news/contextual-retrieval

> Lưu ý: giá và tên model của DeepSeek lấy ngày 2026-10-17. Hãy mở lại trang pricing trước khi dùng con số trong luận văn.
> Các nhận định đánh dấu **[Suy luận]** (đặc biệt 4.3 về cache, 4.4 về REFORMAT nhầm, 4.9) cần được đo bằng 6.1 và 6.9 trước khi trình bày như kết quả.
