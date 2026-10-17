# Nghiên cứu: cách các hệ thống chatbot / RAG xử lý câu hỏi so sánh

> Ngày lập: 2026-10-17. Phạm vi: các câu hỏi so sánh ("So sánh A, B và C", "Lập bảng so sánh A, B, C", "cái nào tốt hơn",
> "trong các phương thức đó nên chọn cái nào") và câu hỏi nhiều khía cạnh ("so sánh X, Y, Z về cách tấn công **và** cách phòng chống").
> Tài liệu chỉ tổng hợp nguồn chính chủ: docs sản phẩm, mã nguồn framework trên GitHub, bài báo arXiv / ACL Anthology. Không sửa mã nguồn,
> không chạy lại thực nghiệm. Các số đo của SecLearn lấy từ đề bài (bộ 10 câu, bước viết lại chạy lại 3 lần mỗi câu) và `docs/ERRORS.md`.
>
> Quy ước đánh dấu:
> - **[Nguồn n]**: tài liệu chính chủ đã mở và đọc, link ở mục 6.
> - **[Code]**: mã nguồn SecLearn trên đĩa ngày lập (`src/lib/query.ts`, `src/lib/rag.ts`, `src/lib/rerank.ts`).
> - **[ERRORS #n]**: thực nghiệm đã ghi trong `docs/ERRORS.md`.
> - **[Đo]**: số đo trong đề bài của đợt này (chưa ghi vào `ERRORS.md`).
> - **[Suy luận]**: đề xuất / suy ra, chưa kiểm chứng bằng chạy thật.
> - **[Chưa kiểm chứng]**: không mở được nguồn chính chủ, chỉ thấy qua nguồn thứ cấp.
>
> Tài liệu này không lặp lại `docs/CONTEXT_MANAGEMENT_REVIEW.md` (cửa sổ lịch sử, carried chunks, caching) và các mục #29, #33, #34 của
> `docs/ERRORS.md` (tách chủ đề, HyDE `PASSAGE:`, `ENTITY:`), chỉ dẫn lại khi cần.

---

## 1. Tóm tắt

- **Mọi hệ thống chính đều tách câu so sánh thành truy vấn con *theo thực thể × khía cạnh*, không chỉ theo thực thể.** Ví dụ few-shot của
  LlamaIndex tách "Compare … revenue growth and EBITDA of Uber and Lyft" thành 4 câu hỏi con (2 công ty × 2 chỉ số) [Nguồn 2]. Google Vertex AI
  Search tách "jobs and hobbies … in common" của hai người thành 4 truy vấn tra cứu [Nguồn 14]. SecLearn hiện chỉ tách theo chủ đề, tối đa 3
  (`MAX_TOPIC_QUERIES`), nên câu "cách tấn công và cách phòng chống" chỉ lấy được đoạn định nghĩa [Đo].
- **Tách truy vấn là bước có cấu trúc, không phải một câu dặn trong prompt.** LlamaIndex và Haystack bắt LLM trả JSON / Pydantic có danh sách
  câu hỏi con [Nguồn 1, 2, 7]. Typed-RAG có bước riêng trích `compare_type` và `keywords_list` (các đối tượng được so sánh) [Nguồn 30].
  SecLearn chỉ có một câu điều kiện trong `QUERY_SHAPE`. Điều này khớp với kết quả đo: tách ổn định 3/3 với "So sánh XSS, CSRF và SQL injection",
  nhưng 0/3 với "Lập bảng so sánh TOTP, SMS OTP và FIDO2" và 0/6 với tham chiếu ngầm ("ba lỗ hổng đó") [Đo].
- **Ngân sách truy xuất được chia theo từng truy vấn con, rồi gộp.** Azure agentic retrieval chạy song song các subquery, rerank riêng từng
  subquery (tối đa 50 tài liệu mỗi lần), rồi gộp [Nguồn 8, 9]. Bài "Question Decomposition for RAG" lấy top-k = 10 cho *mỗi* truy vấn con, hợp
  lại và bỏ trùng, rồi rerank theo câu gốc [Nguồn 31]. MultiQueryRetriever (LangChain) và QueryFusionRetriever (LlamaIndex) hợp kết quả, bỏ trùng hoặc
  dùng RRF, và chỉ cắt top-k *sau khi* gộp [Nguồn 4, 5]. SecLearn giữ K = 5 cho cả câu và chỉ dành chỗ cho *một* đoạn tốt nhất mỗi chủ đề
  (`topicBest`) [Code], nên mỗi chủ đề thường chỉ có khoảng 1 đoạn [Đo].
- **Tổng hợp câu trả lời có hai kiểu.** (a) Trả lời từng câu hỏi con rồi gộp: LlamaIndex SubQuestionQueryEngine, Haystack cookbook, tốn thêm N lời gọi LLM
  [Nguồn 1, 7]. (b) Một lượt trả lời duy nhất trên bằng chứng đã gộp: Azure answer synthesis, Typed-RAG, bài QD+rerank [Nguồn 10, 30, 31].
  Với SecLearn (DeepSeek, mỗi lời gọi ~1-2 giây), kiểu (b) cộng với ngữ cảnh *được gắn nhãn theo ô (thực thể, khía cạnh)* là hợp lý hơn [Suy luận].
- **Không nguồn chính chủ nào đã mở mô tả quy tắc "ô bảng không có bằng chứng" riêng cho câu so sánh.** Hướng dẫn gần nhất là của Anthropic:
  cho phép mô hình nói "không đủ thông tin", và đánh dấu chỗ đã bỏ một khẳng định không có trích dẫn bằng `[]` [Nguồn 18]. Azure mức `medium` chạy
  *một* vòng truy xuất bổ sung khi bộ phân loại thấy kết quả chưa đủ liên quan [Nguồn 9]. Hai ý này gợi ý: nhận biết ô thiếu, tìm thêm đúng một
  lần cho ô đó, nếu vẫn thiếu thì ghi "—" và gom một ghi chú dưới bảng. Không nên viết 8 lần "Các đoạn tài liệu tìm được không đề cập…" [Suy luận].
- **Tham chiếu ngầm trong hội thoại là bài toán "viết lại câu hỏi trong ngữ cảnh"** (CANARD: 40 527 câu; QReCC: 80K cặp hỏi-đáp, baseline F1 19,10
  so với người 75,45) [Nguồn 32, 33]. Azure và Google đưa lịch sử hội thoại vào bước lập kế hoạch truy vấn [Nguồn 8, 14]. Riêng tham chiếu *tập hợp*
  ("ba lỗ hổng đó") cần biết tập thực thể của lượt trước. `historyForRewrite` hiện chỉ đưa câu hỏi cắt ngắn, không đưa các chủ đề đã tách [Code].
- **Câu so sánh khó ngay cả với benchmark và mô hình mạnh.** MultiHop-RAG có 856/2 556 câu so sánh (33,49%). GPT-4 chỉ đạt 0,56 khi dùng đoạn tìm được,
  so với 0,89 khi được đưa đúng bằng chứng [Nguồn 28]. Phần lớn khoảng cách nằm ở bước truy xuất, khớp với chẩn đoán của SecLearn [Đo].
- **Mỗi truy vấn con đều tốn chi phí.** Azure ghi rõ agentic retrieval "adds latency" so với một truy vấn và tính phí theo token rerank [Nguồn 8].
  Ở SecLearn, reranker chạy tuần tự, mỗi chủ đề chấm *toàn bộ* tập ứng viên gộp; 4 truy vấn trên ~100 ứng viên từng mất 2,7-4,2 giây [ERRORS #29].
  Vì vậy tăng số truy vấn con phải đi kèm thay đổi cách chấm điểm (mỗi truy vấn con chỉ chấm ứng viên của nó), nếu không độ trễ tăng tuyến tính [Suy luận].

---

## 2. Cách các hệ thống / khung hiện tại xử lý

### 2.1 LlamaIndex: SubQuestionQueryEngine, MultiStepQueryEngine, QueryFusionRetriever

**SubQuestionQueryEngine** [Nguồn 1, 2]
- *Sinh câu hỏi con:* `question_gen.generate(metadatas, query)` nhận câu hỏi và metadata của các "tool" (mỗi tool là một query engine / nguồn dữ liệu).
  LLM trả JSON `items`, mỗi phần tử gồm `sub_question` và `tool_name`. Mặc định dùng generator của OpenAI (function calling), lỗi thì quay về
  `LLMQuestionGenerator`.
- *Few-shot mẫu (prompt chính chủ):* "Compare and contrast the revenue growth and EBITDA of Uber and Lyft for year 2021" sinh ra 4 câu hỏi con:
  revenue growth của Uber, EBITDA của Uber, revenue growth của Lyft, EBITDA của Lyft. Nghĩa là tách theo **thực thể × khía cạnh**, mỗi câu con
  chỉ hỏi một ô của bảng so sánh.
- *Thực thi:* mỗi câu con chạy trên engine của tool tương ứng (truy xuất + trả lời riêng). `from_defaults` đặt `use_async=True` và chạy song song
  bằng `run_async_tasks`. Đường `_aquery` luôn dùng `asyncio.gather`.
- *Tổng hợp:* mỗi cặp hỏi-đáp con được bọc thành một node văn bản `"Sub question: …\nResponse: …"`. `response_synthesizer.synthesize` được gọi
  **một lần** trên các node đó. Node nguồn của các câu con được giữ lại qua `additional_source_nodes`, nên trích dẫn còn truy được.
- *Câu con lỗi / rỗng:* câu con ném lỗi thì trả `None` và bị lọc bỏ (`filter(None, …)`). Câu con trả chuỗi rỗng **vẫn** được đưa vào bước tổng hợp.
  Engine không có cơ chế riêng để báo "phía này không có bằng chứng".

**MultiStepQueryEngine** [Nguồn 3]: sinh câu hỏi tiếp theo *tuần tự*, dựa trên câu gốc và các câu trả lời đã có (`StepDecomposeQueryTransform`).
Mặc định `num_steps = 3`, dừng khi câu sinh ra chứa "none". Kiểu lặp này dành cho câu nhiều bước (multi-hop), không phải câu so sánh song song.

**QueryFusionRetriever** [Nguồn 4]: mặc định `num_queries = 4` (câu gốc + 3 câu do LLM sinh). Chế độ gộp gồm `reciprocal_rerank` (RRF, `k = 60.0`),
`relative_score`, `dist_based_score` và `simple` (mặc định: bỏ trùng, giữ điểm cao nhất). Top-k (`similarity_top_k`) cắt **sau khi gộp**. Chế độ `simple`
giống cách SecLearn lấy điểm của mỗi ứng viên là max theo các chủ đề.

### 2.2 LangChain: MultiQueryRetriever và "query decomposition"

- **MultiQueryRetriever** [Nguồn 5]: prompt mặc định yêu cầu "generate 3 different versions" của câu hỏi, mỗi dòng một câu. Số 3 chỉ nằm trong
  prompt, code không ép. Mỗi câu chạy qua retriever gốc (song song ở đường async), kết quả được hợp lại và bỏ trùng theo đẳng thức `Document`
  (`_unique_documents`, giữ thứ tự xuất hiện đầu tiên). `include_original` mặc định `False`. Kỹ thuật này là **đa dạng hoá diễn đạt**, không phải
  tách theo chủ đề: không có ngân sách theo truy vấn và không dành chỗ cho từng chủ đề.
- **Query decomposition:** trang hướng dẫn cũ `python.langchain.com/docs/use_cases/query_analysis/techniques/decomposition` hiện chuyển hướng 308
  sang trang RAG mới [Nguồn 6]. Trang mới chỉ còn một câu trong prompt mẫu: "Break complex questions into focused search queries" (mẫu agent
  dùng todo list). Nội dung chi tiết của hướng dẫn cũ (Pydantic `SubQuery` + function calling) chỉ thấy qua đoạn trích kết quả tìm kiếm.
  **[Chưa kiểm chứng]**: không mở được trang gốc.

### 2.3 Haystack (deepset): cookbook "query decomposition" [Nguồn 7]

- LLM tách câu hỏi thành đối tượng Pydantic `Questions`. Prompt yêu cầu "simplify complex queries into multiple queries that can be answered"
  một cách độc lập. Câu đơn giản giữ nguyên.
- Mỗi câu con được nhúng và truy xuất riêng (mặc định top 3 mỗi câu). Một lời gọi LLM điền câu trả lời cho từng câu con, rồi một lời gọi nữa suy luận
  trên các cặp hỏi-đáp để ra câu trả lời cuối. Ví dụ: "Who has more siblings, Jamie or Sansa?" tách thành hai câu, mỗi nhân vật một câu.
- Đây là kiểu "trả lời từng phần rồi gộp", tốn 1 + N + 1 lời gọi LLM.

### 2.4 Azure AI Search: agentic retrieval [Nguồn 8, 9, 10]

- *Lập kế hoạch truy vấn (preview):* ở mức `low` / `medium`, query và **lịch sử hội thoại** được gửi cho một LLM để sinh "focused subqueries".
  Mức `minimal` bỏ bước này. Mặc định là `low`. Docs nêu rõ các ca dùng: câu "with multiple asks", câu "that depend on earlier context in the conversation",
  câu có lỗi chính tả [Nguồn 8].
- *Thực thi:* mọi subquery chạy **đồng thời** (keyword, vector hoặc hybrid). **Mỗi subquery được semantic rerank riêng**. Kết quả được gộp thành
  một phản hồi thống nhất, kèm references và activity log [Nguồn 8].
- *Ngân sách:* mức `low` cho tối đa 50 tài liệu vào semantic ranking (10 nếu dùng L3 classification), 5 000 token câu trả lời. Mức `medium` cho
  10 000 token, 20 tài liệu nếu dùng L3 [Nguồn 9]. Ví dụ ước tính chi phí của docs giả định trung bình **3 subquery mỗi kế hoạch**, mỗi subquery rerank
  tối đa 50 chunk [Nguồn 8].
- *Vòng lặp khi thiếu bằng chứng (mức `medium`):* sau lần tìm đầu, một "semantic classifier" đánh giá kết quả. Nếu chưa đủ liên quan, dịch vụ chạy
  **đúng một** vòng tiếp theo với kế hoạch truy vấn sửa lại ("There's only one retry"), có thể đào sâu hoặc mở rộng [Nguồn 9]. Mức `auto`
  (preview 2026-08-01) chạy một lượt nhẹ trước và chỉ lập kế hoạch bằng LLM khi lượt đầu chưa đủ [Nguồn 9].
- *Tổng hợp:* `answerSynthesis` là **một** lời gọi LLM trên nội dung đã gộp, trích dẫn dạng `[ref_id:n]`, có thể tuỳ biến bằng `answerInstructions`
  [Nguồn 10]. Docs không mô tả cách xử lý khi một phía của câu so sánh không có bằng chứng.
- *Chi phí:* docs nêu agentic retrieval "adds latency compared to a single-query pipeline". Phí tính theo token rerank (Azure AI Search) cộng
  token lập kế hoạch (Azure OpenAI) [Nguồn 8].

### 2.5 OpenAI: file_search và Vector Store search [Nguồn 11, 12, 13]

- Trang file search của Responses API chỉ mô tả ở mức cao: tìm "semantic and keyword search", `max_num_results` giới hạn số kết quả. Kết quả
  `file_search_call` có trường `queries`, tức là danh sách, nhưng trang không nói các query này được sinh và chạy thế nào [Nguồn 12].
- Retrieval guide (Vector Store search API): `rewrite_query=true` bật viết lại truy vấn, câu đã viết lại trả về ở `search_query`. `ranking_options`
  có `ranker` và `score_threshold` (0-1). `hybrid_search` có trọng số RRF `embedding_weight` / `text_weight` [Nguồn 13]. Ví dụ trong docs chỉ có
  một query mỗi request.
- Docs file search (classic) của Azure OpenAI Assistants (đã ngừng, cùng công cụ của OpenAI) ghi công cụ này "Rewrites user queries…",
  "Breaks down complex user queries into multiple searches it can run in parallel", chạy cả keyword lẫn semantic, rerank trước khi trả lời. Mặc định:
  chunk 800 token, overlap 400, tối đa **20 chunk** vào ngữ cảnh [Nguồn 11]. **[Chưa kiểm chứng]** trên trang chính của OpenAI: trang Assistants
  file search của OpenAI trả 404 ngày lập.

### 2.6 Google Vertex AI Search: phương thức answer [Nguồn 14]

- *Query rephrasing* bật sẵn. Câu phức được tách thành câu con. Ví dụ chính chủ "What jobs and hobbies do Andie Ram and Arnaud Clément have in common?"
  tách thành 4 tra cứu (nghề và sở thích của từng người), tức là **thực thể × khía cạnh** như LlamaIndex.
- *Multi-turn synthesis:* câu nối tiếp được ghép với ngữ cảnh ("laptops for school" rồi "not mac" thành "laptops for school not mac").
- *Multi-step reasoning:* `maxRephraseSteps`, tối đa 5 bước (hop). Docs không thống nhất về giá trị mặc định giữa phần mô tả và ví dụ.
- *Query classification* (`ADVERSARIAL_QUERY`, `NON_ANSWER_SEEKING_QUERY`) tắt sẵn. Phân loại không đổi câu trả lời; muốn bỏ qua phải bật
  `ignore…`. `ignore_low_relevant_content` trả câu dự phòng khi nội dung không liên quan.
- Gemini grounding (API Gemini): không tìm thấy docs chính chủ mô tả việc tách câu so sánh. Không đưa vào.

### 2.7 Cohere: RAG với tool use [Nguồn 15, 16]

- Truy vấn tìm kiếm được sinh qua tool call có tham số `queries` (mảng). Docs viết: "The tool can generate zero, one or multiple search queries
  depending on the user query". Thay system message có thể đổi từ 2 lên 7 truy vấn cho cùng một câu [Nguồn 15].
- Ví dụ đầy đủ dặn: "If you need more than one search query, write a list of search queries" và nhắc phải truy xuất cho từng query [Nguồn 16].
- Mô hình được huấn luyện để trích dẫn chi tiết (`citations` theo từng đoạn văn bản). Docs không mô tả cách xử lý khi tài liệu không có câu trả lời
  cho một phần câu hỏi [Nguồn 15, 16].

### 2.8 Anthropic

- *Contextual Retrieval* [Nguồn 17]: thêm ngữ cảnh vào chunk trước khi nhúng. Contextual Embeddings + Contextual BM25 giảm 49% tỷ lệ truy xuất thất bại
  ở top-20. Thêm rerank thì giảm 67% (5,7% → 1,9%). Pipeline lấy 150 ứng viên, rerank, giữ 20. Trong các mức đã thử (5, 10, 20), đưa 20 chunk cho mô
  hình là tốt nhất. Bài không nói về nhiều truy vấn.
- *Reduce hallucinations* [Nguồn 18]: cho phép mô hình nói "không đủ thông tin". Với tài liệu dài, trích nguyên văn trước rồi mới phân tích. Kiểm tra
  từng khẳng định bằng trích dẫn: "If you can't find a supporting quote for a claim, remove that claim… and mark where it was removed with empty [] brackets".
  Đây là mẫu gần nhất cho "ô bảng không có bằng chứng".
- Perplexity: không tìm thấy tài liệu kỹ thuật chính chủ về cách tách truy vấn. Không đưa vào.

### 2.9 Bài báo về tách câu hỏi và viết lại truy vấn

| Bài | Cơ chế | Kết quả chính (theo abstract / bài) |
|---|---|---|
| Self-Ask [Nguồn 19] | Mô hình tự hỏi câu tiếp theo, tự trả lời (hoặc dùng search engine trả lời), rồi trả lời câu gốc | Định nghĩa "compositionality gap": trả lời đúng từng câu con nhưng sai câu ghép; khoảng này không giảm khi mô hình lớn hơn |
| Least-to-Most [Nguồn 20] | Tách bài toán thành các bài con, giải *tuần tự*, đáp án trước làm đầu vào cho bài sau | SCAN ≥ 99% mọi split so với CoT 16% |
| Decomposed Prompting [Nguồn 21] | Tách nhiệm vụ thành nhiệm vụ con giao cho các "handler" (LLM, mô hình, hàm, truy xuất) | Tốt hơn few-shot trước đó; có handler truy xuất cho multi-hop QA |
| IRCoT [Nguồn 22] | Xen kẽ truy xuất và chain-of-thought, mỗi câu suy luận dẫn lượt truy xuất kế tiếp | Truy xuất +21 điểm, QA +15 điểm (HotpotQA, 2Wiki, MuSiQue, IIRC) |
| Rewrite-Retrieve-Read [Nguồn 23] | Thêm bước viết lại truy vấn trước truy xuất; rewriter nhỏ huấn luyện bằng RL từ phản hồi của reader | "Consistent performance improvement" (abstract không có số) |
| Step-Back [Nguồn 24] | Trừu tượng hoá câu hỏi lên khái niệm / nguyên lý trước, rồi suy luận | PaLM-2L: MMLU Physics +7%, Chemistry +11%, TimeQA +27%, MuSiQue +7% |
| RAG-Fusion [Nguồn 25] | Sinh nhiều truy vấn, gộp bằng RRF | Câu trả lời đầy đủ hơn; **một số câu lạc đề khi truy vấn sinh ra không đủ sát câu gốc** |
| RRF [Nguồn 26, 27] | `score(d) = Σ 1/(k + rank_q(d))`, k mặc định 60 (Elasticsearch) | "RRF requires no tuning" (Elastic). Bản PDF gốc của Cormack 2009 tải được nhưng không trích được văn bản, nên công thức lấy từ docs Elastic |
| Question Decomposition for RAG [Nguồn 31] | Tách tối đa 5 câu con + giữ câu gốc; **top-k = 10 cho mỗi câu**, hợp và bỏ trùng, cross-encoder (bge-reranker-large) rerank **theo câu gốc** | MultiHop-RAG: Hits@10 0,781 → 0,872, MRR@10 0,464 → 0,635; HotpotQA F1 31,3 → 35,0. Ví dụ so sánh "Mars hay Venus nhiều vệ tinh hơn" tách thành một câu mỗi hành tinh |
| Typed-RAG [Nguồn 30] | Phân loại câu không-factoid; loại **Comparison** có Keyword Extractor trả `is_compare`, `compare_type` (difference / similarity / superior), `keywords_list`; truy xuất riêng cho từng keyword, bỏ trùng, rerank, rồi sinh câu trả lời "balanced" theo mục đích so sánh | Không có điểm riêng cho loại so sánh (chỉ 36/945 câu, 3,81%) |

**Benchmark có câu so sánh**
- *HotpotQA* [Nguồn 29]: abstract nêu "a new type of factoid comparison questions" để kiểm tra khả năng rút đúng dữ kiện và so sánh.
- *MultiHop-RAG* [Nguồn 28]: 2 556 câu, trong đó 856 câu so sánh (33,49%), định nghĩa là câu mà "the answer requires a comparison of evidence
  within the retrieval set", đáp án thường là có / không. Truy xuất tốt nhất (voyage-02 + bge-reranker-large) chỉ đạt Hits@4 0,6625. GPT-4 đạt
  0,56 với đoạn tìm được và 0,89 với bằng chứng đúng. Mixtral kém GPT-4 rõ ở câu so sánh và câu thời gian; số theo loại chỉ có trong hình 3.
- Không tìm được bài nào chuyên về **sinh bảng so sánh nhiều thực thể × khía cạnh** trong RAG. Các benchmark gần nhất là RAG trên bảng
  (MultiTableQA, T²-RAGBench), là bài toán ngược: đọc bảng chứ không viết bảng. Không đưa vào làm bằng chứng.

### 2.10 Viết lại câu hỏi trong hội thoại (tham chiếu ngầm)

- *CANARD* [Nguồn 32]: định nghĩa bài toán "question-in-context rewriting": viết lại câu phụ thuộc ngữ cảnh thành câu độc lập có cùng đáp án.
  Gồm 40 527 câu trên nền QuAC; huấn luyện mô hình Seq2Seq.
- *QReCC* [Nguồn 33]: 14K hội thoại, 80K cặp hỏi-đáp. Viết lại câu hỏi là một trong ba nhiệm vụ con (cùng truy xuất và đọc hiểu). Baseline F1 19,10
  so với người 75,45.
- *Sản phẩm:* Azure đưa lịch sử hội thoại vào bước lập kế hoạch subquery [Nguồn 8]. Google có "multi-turn synthesis" [Nguồn 14]. LangChain /
  LlamaIndex có condense-question (đã dẫn trong `CONTEXT_MANAGEMENT_REVIEW.md`).
- Không nguồn nào đã mở bàn riêng về tham chiếu tới **một tập** thực thể ("ba lỗ hổng đó", "các phương thức đó"). Ví dụ trong CANARD / QReCC chủ yếu là
  đại từ số ít [Suy luận, dựa trên mô tả bài toán; chưa đọc bộ dữ liệu].

---

## 3. Bảng đối chiếu các kỹ thuật

| Kỹ thuật | Giải quyết vấn đề gì | Chi phí / độ trễ | Bằng chứng |
|---|---|---|---|
| Tách theo thực thể (1 truy vấn / thực thể) | Truy vấn gộp làm loãng điểm của mọi đoạn | +1 lượt tìm vector mỗi thực thể; rerank tăng theo số truy vấn | Nguồn 30, 31; SecLearn ERRORS #29 (0,11 → 0,86-1,0) |
| Tách theo **thực thể × khía cạnh** | Câu nhiều khía cạnh chỉ lấy được đoạn định nghĩa | Số truy vấn = E × A (3 × 2 = 6); rerank tăng tương ứng | Nguồn 2 (Uber/Lyft 2 × 2), Nguồn 14 (2 người × 2 khía cạnh) |
| Đầu ra có cấu trúc (JSON / dòng có tiền tố) cho bước tách | Mô hình lúc tách lúc không | Không thêm lời gọi; prompt dài hơn | Nguồn 1, 2, 7, 30 |
| Bộ phân loại "câu so sánh" (`is_compare`, `compare_type`) | Nhận biết "cái nào tốt hơn", "nên chọn cái nào", bảng so sánh | Gộp vào bước viết lại thì 0 lời gọi thêm | Nguồn 30 |
| Top-k theo từng truy vấn con, gộp, bỏ trùng | Một chủ đề chiếm hết K chỗ | Nhiều ứng viên hơn để rerank | Nguồn 8, 9, 31 |
| Rerank từng truy vấn con chỉ trên ứng viên của nó | Độ trễ rerank tăng theo (số truy vấn × toàn bộ ứng viên) | Giảm số cặp chấm | Nguồn 8 ("each subquery … semantically reranked") |
| RRF để gộp danh sách | Gộp không cần chuẩn hoá điểm | Gần như 0 | Nguồn 4, 26, 27; nhưng ERRORS #34: RRF không có ngưỡng tuyệt đối |
| Đa dạng hoá diễn đạt (MultiQuery, RAG-Fusion) | Một cách diễn đạt bỏ sót đoạn đúng | +1 lời gọi LLM; có thể lạc đề | Nguồn 5, 25 |
| Step-back / trừu tượng hoá | Câu "cho ứng dụng ngân hàng" cần khái niệm chung (mức đảm bảo, chống phishing) | Thêm một truy vấn | Nguồn 24 |
| Vòng truy xuất bổ sung khi thiếu (một lần) | Một phía / một ô không có bằng chứng | +1 vòng tìm + rerank, chỉ khi thiếu | Nguồn 9 (Azure `medium`, đúng 1 lần) |
| Trả lời từng câu con rồi gộp | Kiểm soát rõ ô nào có / không có bằng chứng | +N lời gọi LLM (chạy song song được) | Nguồn 1, 7 |
| Một lượt tổng hợp trên ngữ cảnh gộp | Rẻ, một lời gọi | Mô hình phải tự ghép ô; dễ bỏ sót ô | Nguồn 10, 30, 31 |
| Đánh dấu khẳng định không có trích dẫn (`[]`), cho phép nói "không đủ thông tin" | Bịa ô hoặc lặp câu "không đề cập" | Prompt | Nguồn 18 |
| Viết lại câu hỏi trong ngữ cảnh hội thoại | "ba lỗ hổng đó", "các phương thức đó" | Đã có sẵn trong bước viết lại | Nguồn 8, 14, 32, 33 |

---

## 4. Áp dụng cho SecLearn

Hiện trạng liên quan, từ code [Code]:
- `QUERY_SHAPE` chỉ có câu: "If the message asks about several distinct topics (a comparison, "X and Y"), write one query per topic … at most three".
  `parseRewrite` cắt còn `MAX_TOPIC_QUERIES = 3` dòng.
- `retrieveChunks` chỉ coi là nhiều chủ đề khi `queries.length > 2` (câu gốc + ít nhất 2 truy vấn). Khi đó mỗi truy vấn lấy `ceil(limit/2)` ứng viên
  vector, cộng 20 ứng viên keyword chung và ứng viên HyDE. **Mỗi chủ đề rerank toàn bộ tập ứng viên gộp**, HyDE rerank thêm một lần nữa. Điểm của mỗi
  ứng viên là max theo các chủ đề (`bestScores`). `topicBest` lấy đúng một đoạn tốt nhất mỗi chủ đề (≥ `TOPIC_MIN_RELEVANCE`).
- `selectByRelevance` dành chỗ cho `topicBest` và carried chunks, phần còn lại lấy theo điểm, tổng cộng `RAG_TOP_K = 5`. `buildContext` dừng ở
  `CONTEXT_CHAR_LIMIT = 6000` ký tự. Với chunk trung bình ~580 ký tự (p90 777), ngân sách này chứa được ~7-10 đoạn nhưng chỉ dùng 5 [Đo].

### 4.1 Lỗi A: tách chủ đề không ổn định (TOTP / SMS OTP / FIDO2 0/3; tham chiếu ngầm 0/6)

Kỹ thuật tương ứng: bước tách có cấu trúc (2.1, 2.3), bộ phân loại so sánh (Typed-RAG, 2.9), viết lại trong ngữ cảnh (2.10).

Đề xuất [Suy luận]:
1. **Thêm dòng có cấu trúc vào bước viết lại**, cùng kiểu với `PASSAGE:` / `ENTITY:` (một lời gọi, không thêm lời gọi LLM). Ví dụ `COMPARE:` liệt kê
   các đối tượng cách nhau bằng " | ", và `ASPECTS:` liệt kê các khía cạnh được hỏi. Khi đó `planFromRewrite` **tự sinh** truy vấn theo thực thể
   (và × khía cạnh, xem 4.2) bằng code, thay vì trông vào việc mô hình tự viết 3 dòng. Lý do: mô hình nhận ra "đây là ba thứ" dễ hơn là nhớ quy tắc
   định dạng. Typed-RAG tách đúng bước này thành `keywords_list` [Nguồn 30].
2. **Thêm lưới an toàn bằng luật** trước / sau LLM: câu có từ khoá so sánh ("so sánh", "bảng so sánh", "khác nhau", "giống nhau", "tốt hơn",
   "nên chọn", "vs", "compare") mà bước viết lại trả về một dòng thì đánh dấu là nghi so sánh. Có thể gọi lại bước viết lại với chỉ dẫn ép tách, hoặc tách
   danh sách bằng dấu phẩy / "và" trong câu gốc. Lần gọi lại chỉ tốn chi phí ở các ca nghi ngờ, không phải mọi câu.
3. **Tham chiếu tập hợp:** `historyForRewrite` chỉ đưa câu hỏi cắt còn 120 ký tự và câu trả lời cuối 300 ký tự (theo `CONTEXT_MANAGEMENT_REVIEW.md`).
   Nên lưu **danh sách chủ đề / thực thể đã tách** của mỗi lượt (đã có trong `SearchPlan.queries` / `entity`) và đưa vào lịch sử cho bước viết lại,
   ví dụ `3. So sánh XSS, CSRF… [topics: XSS | CSRF | SQL injection]`. Thêm một câu vào `rewritePrompt`: "a plural reference (those three,
   các phương thức đó) means every topic of that earlier question; write one query per topic". Azure và Google đều đưa lịch sử vào bước lập kế hoạch
   [Nguồn 8, 14], nhưng không nói đưa dạng nào, nên đây là thiết kế riêng.
4. Chỉ số cần đo lại: tỷ lệ tách đúng trên chính bộ 10 câu (3 lần mỗi câu), tách riêng câu tường minh và câu tham chiếu ngầm.

Đánh đổi: prompt dài hơn làm tăng token đầu vào của bước viết lại (ERRORS #34 đã ghi 1,07 → 1,8-2,3 giây sau khi thêm HyDE). Luật từ khoá tiếng Việt có
thể bắt nhầm ("so sánh" trong câu không phải so sánh nhiều thực thể), nên luật chỉ kích hoạt kiểm tra, không tự tách.

### 4.2 Lỗi B: mỗi chủ đề chỉ ~1 đoạn; câu nhiều khía cạnh chỉ có đoạn định nghĩa; "phòng chống CSRF/SQLi không có" dù kho có

Kỹ thuật tương ứng: tách thực thể × khía cạnh (Nguồn 2, 14), top-k theo truy vấn con (Nguồn 8, 31), rerank theo từng truy vấn con (Nguồn 8).

Bằng chứng nội bộ: truy vấn ép theo khía cạnh tìm được CSRF#3 và gRPC#8 (prepared statements) với điểm 0,97-0,99 [Đo]. Đoạn có trong kho; truy vấn
theo chủ đề không chạm tới.

Đề xuất [Suy luận]:
1. **Sinh truy vấn theo ô** (thực thể, khía cạnh) từ `COMPARE:` × `ASPECTS:`, ví dụ "Cross-Site Request Forgery CSRF attack mechanism" và
   "Cross-Site Request Forgery CSRF prevention". Khi không có `ASPECTS:` thì giữ một truy vấn mỗi thực thể như hiện tại.
2. **Đổi giới hạn:** `MAX_TOPIC_QUERIES = 3` đang giới hạn số *dòng*. Nên tách thành giới hạn thực thể (3, hoặc 4) và giới hạn ô (ví dụ ≤ 6), cắt khía cạnh
   trước khi cắt thực thể.
3. **Đặt chỗ theo ô thay vì theo chủ đề:** mở rộng `topicBest` thành "đoạn tốt nhất của mỗi ô" (≥ `TOPIC_MIN_RELEVANCE`). Với câu so sánh, cho K
   lớn hơn 5: `CONTEXT_CHAR_LIMIT = 6000` đã chứa ~8 đoạn p50 (647 ký tự). Có thể đặt K = số ô + 2, chặn bởi `CONTEXT_CHAR_LIMIT`, hoặc nâng giới hạn ký tự
   riêng cho câu so sánh. Anthropic thấy 20 chunk tốt hơn 5 và 10 trong thí nghiệm của họ [Nguồn 17], nhưng chunk của họ dài hơn và mô hình khác. Không
   nên lấy thẳng con số 20.
4. **Gắn nhãn ô trong ngữ cảnh** (`buildContext`): nhóm đoạn theo ô, ví dụ `### CSRF: phòng chống`. Như vậy một lượt tổng hợp (kiểu Azure / Typed-RAG)
   biết ô nào có bằng chứng, mà không cần N lời gọi trả lời con như LlamaIndex / Haystack.
5. **Độ trễ rerank là ràng buộc chính.** Hiện tại số cặp chấm ≈ (số chủ đề + HyDE) × |ứng viên gộp|. Chuyển từ 3 chủ đề sang 6 ô theo cùng cách sẽ
   gấp đôi số cặp, trong khi 4 truy vấn từng mất 2,7-4,2 giây [ERRORS #29]. Cách Azure (mỗi subquery chỉ rerank kết quả của nó, tối đa 50) [Nguồn 8, 9]
   gợi ý: **mỗi ô chỉ rerank ứng viên của chính nó** (vector của truy vấn ô + phần keyword khớp), khoảng 10-15 ứng viên mỗi ô. 6 ô × 12 ≈ 72 cặp,
   ít hơn 4 × 100. Điểm chung của một ứng viên xuất hiện ở nhiều ô vẫn lấy max như hiện tại. Rủi ro: một đoạn tốt cho ô A nhưng chỉ được truy vấn ô B
   tìm ra sẽ không được chấm cho ô A. Cần đo.
6. Có thể bỏ rerank theo HyDE cho các truy vấn ô (khía cạnh đã cụ thể) để bù độ trễ. Cần đo lại ca STRIDE / OAuth2 của #34 trước khi bỏ.

Về RRF: dùng được để *xếp hạng* khi gộp danh sách của các ô (Nguồn 4, 27), nhưng ERRORS #34 đã cho thấy RRF / BM25 không có ngưỡng tuyệt đối và kéo
đoạn không liên quan vào câu ngoài tài liệu. Cổng liên quan vẫn phải là điểm rerank theo truy vấn của ô.

### 4.3 Lỗi C: câu có ngữ cảnh sử dụng ("cho ứng dụng ngân hàng") bỏ sót đoạn then chốt

Bằng chứng nội bộ: chỉ khi truy vấn nêu ngữ cảnh thì mới tìm được MFA#40 (0,90) [Đo].

Kỹ thuật tương ứng: coi ngữ cảnh là một **khía cạnh** (Google tách theo khía cạnh [Nguồn 14]); Step-back để đẩy lên khái niệm chung [Nguồn 24].

Đề xuất [Suy luận]:
- Thêm vào `QUERY_SHAPE`: "Keep the use context (banking, mobile app, internal admin) in every query, and add one query for the recommendation
  in that context". Thêm dòng `CONTEXT:` (hoặc gộp vào `ASPECTS:`) để code sinh truy vấn kiểu "MFA method recommended for high-value financial
  applications".
- Với câu "nên chọn cái nào / cái nào tốt hơn" (`compare_type = superior` theo Typed-RAG [Nguồn 30]), luôn thêm một truy vấn khuyến nghị
  (recommendation / strongest / phishing-resistant). Đoạn trả lời câu "nên chọn" thường nằm ở phần khuyến nghị, không nằm ở phần định nghĩa từng phương thức.
- Truy vấn kiểu Step-back ("authentication assurance levels") làm thêm 1 truy vấn. Chỉ nên thêm khi có ngữ cảnh sử dụng.

### 4.4 Lỗi D: bảng có 8 ô "Các đoạn tài liệu tìm được không đề cập đến X" (SMS OTP)

Kỹ thuật tương ứng: một vòng truy xuất bổ sung cho phần thiếu (Azure `medium`: đúng một lần [Nguồn 9]); cho phép nói thiếu thông tin và đánh dấu chỗ trống
(Anthropic [Nguồn 18]). Không nguồn nào đã mở quy định cách trình bày ô trống của bảng so sánh.

Đề xuất [Suy luận]:
1. **Phát hiện ô thiếu trước khi trả lời:** với nhãn ô ở 4.2, ô không có đoạn nào ≥ ngưỡng là "ô thiếu". Đây là phép tính trên điểm rerank,
   không cần LLM.
2. **Tìm bổ sung đúng một lần cho ô thiếu:** viết lại truy vấn ô bằng mẫu cố định (thêm tên đầy đủ, từ đồng nghĩa "weaknesses / risks / attacks
   against", HyDE riêng cho ô) và chỉ rerank ứng viên mới. Chỉ chạy khi có ô thiếu, nên câu bình thường không tốn thêm.
3. **Quy tắc trình bày trong system prompt** (`grounding.ts`): ô không có bằng chứng ghi "—". Dưới bảng có **một** câu liệt kê các ô thiếu ("Các
   đoạn tìm được không nói về: SMS OTP (chi phí, khôi phục)"). Câu này không gắn [n] (giữ quy tắc của #32). Nếu cả một thực thể không có bằng chứng thì
   nói một lần trước bảng và bỏ cột / hàng đó, thay vì điền mọi ô.
4. Giữ cách diễn đạt "Các đoạn tài liệu tìm được…" (không nói về cả kho) theo #34.

Đánh đổi: bước 2 thêm ~1 vòng tìm + rerank (ước khoảng 0,5-1 giây theo các số của #29 / #34, chưa đo) cho câu có ô thiếu. Bước 3 chỉ là prompt và
cần kiểm tra lại `NO_CLAIM_RE` để câu ghi chú gộp vẫn được nhận là câu "không đề cập".

### 4.5 Tổng hợp: một lượt hay từng câu con?

| Phương án | Lời gọi LLM thêm | Ưu | Nhược |
|---|---|---|---|
| Hiện tại + ngữ cảnh gắn nhãn ô (kiểu Azure / Typed-RAG) | 0 | Rẻ; giữ nguyên luồng `answerQuestion` và luồng trích dẫn | Mô hình vẫn có thể bỏ sót ô; cần prompt bảng |
| Trả lời từng ô rồi gộp (kiểu LlamaIndex / Haystack) | N (song song) + 1 | Mỗi ô có trạng thái có / không rõ ràng | 6 ô = 7 lời gọi; khó giữ đánh số [n] thống nhất giữa các câu trả lời con (#26, #32); tăng chi phí DeepSeek |

Khuyến nghị: phương án 1. Phương án 2 chỉ đáng thử nếu sau khi làm 4.2-4.4 mà tỷ lệ ô bị bỏ sót / ô sai vẫn cao [Suy luận].

### 4.6 Thứ tự đề xuất (theo tỷ lệ lợi ích / chi phí) [Suy luận]

1. Dòng `COMPARE:` / `ASPECTS:` + sinh truy vấn bằng code (4.1, 4.2 bước 1-2): không thêm lời gọi, sửa trực tiếp lỗi A và B.
2. Lưu chủ đề đã tách vào lịch sử cho bước viết lại (4.1 bước 3): sửa tham chiếu ngầm.
3. Đặt chỗ theo ô + K động trong `CONTEXT_CHAR_LIMIT` + nhãn ô trong `buildContext` (4.2 bước 3-4).
4. Rerank theo ứng viên của từng ô (4.2 bước 5). Bắt buộc nếu số ô > 3, vì độ trễ.
5. Ô thiếu: phát hiện + một vòng tìm bổ sung + quy tắc trình bày (4.4).
6. Ngữ cảnh sử dụng / truy vấn khuyến nghị (4.3).

Đo lại sau mỗi bước bằng bộ 10 câu hiện có (3 lần chạy lại bước viết lại), cộng các chỉ số của #29 / #34: số ô có đoạn ≥ 0,3, số câu "không đề cập"
sai, trích dẫn yếu < 0,1, thời gian truy xuất p50 / p90.

---

## 5. Những điểm chưa chắc chắn / chưa kiểm chứng

- **OpenAI file_search:** câu "Breaks down complex user queries into multiple searches it can run in parallel" và các mặc định (800/400 token,
  20 chunk) lấy từ docs Azure OpenAI Assistants (classic, đã ngừng) [Nguồn 11]. Trang tương ứng của OpenAI trả 404. Trang file_search hiện tại của
  Responses API không mô tả cơ chế bên trong [Nguồn 12]. Không rõ Responses API còn tách truy vấn như vậy không.
- **LangChain query decomposition:** trang hướng dẫn gốc đã chuyển hướng [Nguồn 6]. Chi tiết cũ chỉ thấy qua đoạn trích tìm kiếm.
- **Azure:** số liệu đánh giá (ví dụ "auto" giữ 97,6% recall và giảm 46,9% token lập kế hoạch) là của blog Microsoft Foundry. Trang blog trả 403 nên
  không đưa vào. Agentic retrieval phần lập kế hoạch vẫn là preview [Nguồn 8, 9].
- **MultiHop-RAG:** điểm theo loại câu (so sánh riêng) chỉ có trong hình 3, không đọc được số [Nguồn 28].
- **Typed-RAG:** không có điểm riêng cho câu so sánh; loại này chỉ chiếm 3,81% bộ dữ liệu [Nguồn 30].
- **Rerank theo câu gốc hay theo câu con:** bài QD+rerank chấm theo câu gốc và có lợi trên MultiHop-RAG tiếng Anh [Nguồn 31]. ERRORS #29 của SecLearn cho
  thấy truy vấn gộp làm điểm thấp (≤ 0,11) và truy vấn theo chủ đề tốt hơn. Hai kết quả không mâu thuẫn trực tiếp (khác câu hỏi, khác reranker, khác
  ngôn ngữ), nhưng nghĩa là "rerank theo câu gốc" không nên áp dụng cho SecLearn khi chưa đo.
- **RRF:** công thức và k = 60 lấy từ docs Elasticsearch và mã LlamaIndex [Nguồn 4, 27]. PDF gốc của Cormack et al. 2009 tải được nhưng không trích được
  văn bản trên máy này [Nguồn 26].
- **Tham chiếu tập hợp** ("ba lỗ hổng đó"): không nguồn đã mở nào xử lý riêng. Đề xuất 4.1 bước 3 là thiết kế riêng.
- **Độ trễ ước tính ở mục 4** (số cặp rerank, +0,5-1 giây cho vòng bổ sung) suy từ #29 / #34, chưa đo.
- **Không tìm được** nghiên cứu chuyên về sinh bảng so sánh nhiều thực thể × khía cạnh trong RAG, hay về cách trình bày ô không có bằng chứng.
- Gemini grounding và Perplexity: không tìm thấy tài liệu kỹ thuật chính chủ về tách câu so sánh. Không đưa vào.

---

## 6. Nguồn

Tất cả đã mở ngày 2026-10-17, trừ khi ghi chú khác.

### Framework (mã nguồn / docs chính chủ)
1. LlamaIndex, `sub_question_query_engine.py`: https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/query_engine/sub_question_query_engine.py
2. LlamaIndex, `question_gen/prompts.py` (few-shot Uber/Lyft): https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/question_gen/prompts.py
3. LlamaIndex, `multistep_query_engine.py`: https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/query_engine/multistep_query_engine.py
4. LlamaIndex, `fusion_retriever.py` (QueryFusionRetriever, RRF k = 60): https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/retrievers/fusion_retriever.py
5. LangChain, `multi_query.py` (MultiQueryRetriever, gói `langchain_classic`): https://github.com/langchain-ai/langchain/blob/master/libs/langchain/langchain_classic/retrievers/multi_query.py
6. LangChain, RAG docs (trang decomposition cũ `python.langchain.com/docs/use_cases/query_analysis/techniques/decomposition` chuyển hướng 308 về đây): https://docs.langchain.com/oss/python/langchain/rag
7. Haystack (deepset), cookbook "Advanced RAG: Query Decomposition": https://haystack.deepset.ai/cookbook/query_decomposition

### Docs nhà cung cấp
8. Microsoft, Agentic retrieval overview (Azure AI Search): https://learn.microsoft.com/en-us/azure/search/agentic-retrieval-overview
9. Microsoft, Set the retrieval reasoning effort: https://learn.microsoft.com/en-us/azure/search/agentic-retrieval-how-to-set-retrieval-reasoning-effort
10. Microsoft, Enable answer synthesis: https://learn.microsoft.com/en-us/azure/search/agentic-retrieval-how-to-answer-synthesis
11. Microsoft, Azure OpenAI Assistants file search (classic, archived): https://learn.microsoft.com/en-us/azure/foundry-classic/openai/how-to/file-search
12. OpenAI, File search (Responses API): https://developers.openai.com/api/docs/guides/tools-file-search
13. OpenAI, Retrieval (Vector Store search, `rewrite_query`, `ranking_options`): https://developers.openai.com/api/docs/guides/retrieval
14. Google Cloud, Vertex AI Search: Get answers and follow-ups (query rephrasing, `maxRephraseSteps`, query classification): https://docs.cloud.google.com/generative-ai-app-builder/docs/answer
15. Cohere, Retrieval Augmented Generation (RAG): https://docs.cohere.com/docs/retrieval-augmented-generation-rag
16. Cohere, RAG complete example: https://docs.cohere.com/docs/rag-complete-example
17. Anthropic, Introducing Contextual Retrieval: https://www.anthropic.com/news/contextual-retrieval
18. Anthropic, Reduce hallucinations: https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations

### Bài báo
19. Press và cộng sự, 2022. *Measuring and Narrowing the Compositionality Gap in Language Models* (Self-Ask). https://arxiv.org/abs/2210.03350
20. Zhou và cộng sự, 2022. *Least-to-Most Prompting Enables Complex Reasoning in Large Language Models*. https://arxiv.org/abs/2205.10625
21. Khot và cộng sự, 2022. *Decomposed Prompting: A Modular Approach for Solving Complex Tasks*. https://arxiv.org/abs/2210.02406
22. Trivedi và cộng sự, 2022. *Interleaving Retrieval with Chain-of-Thought Reasoning for Knowledge-Intensive Multi-Step Questions* (IRCoT). https://arxiv.org/abs/2212.10509
23. Ma và cộng sự, 2023. *Query Rewriting for Retrieval-Augmented Large Language Models* (Rewrite-Retrieve-Read). https://arxiv.org/abs/2305.14283
24. Zheng và cộng sự, 2023. *Take a Step Back: Evoking Reasoning via Abstraction in Large Language Models*. https://arxiv.org/abs/2310.06117
25. Rackauckas, 2024. *RAG-Fusion: a New Take on Retrieval-Augmented Generation*. https://arxiv.org/abs/2402.03367
26. Cormack, Clarke, Büttcher, 2009. *Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods* (SIGIR). https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf (tải được, không trích được văn bản)
27. Elastic, Reciprocal rank fusion (công thức, `rank_constant` = 60): https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reciprocal-rank-fusion
28. Tang, Yang, 2024. *MultiHop-RAG: Benchmarking Retrieval-Augmented Generation for Multi-Hop Queries*. https://arxiv.org/abs/2401.15391 (bản HTML: https://arxiv.org/html/2401.15391)
29. Yang và cộng sự, 2018. *HotpotQA: A Dataset for Diverse, Explainable Multi-hop Question Answering*. https://arxiv.org/abs/1809.09600
30. *Typed-RAG: Type-aware Multi-Aspect Decomposition for Non-Factoid Question Answering*, 2025. https://arxiv.org/abs/2503.15879 (bản HTML: https://arxiv.org/html/2503.15879)
31. *Question Decomposition for Retrieval-Augmented Generation*, 2025. https://arxiv.org/abs/2507.00355 (bản HTML: https://arxiv.org/html/2507.00355v1)
32. Elgohary, Peskov, Boyd-Graber, 2019. *Can You Unpack That? Learning to Rewrite Questions-in-Context* (CANARD), EMNLP-IJCNLP. https://aclanthology.org/D19-1605/
33. Anantha và cộng sự, 2020. *Open-Domain Question Answering Goes Conversational via Question Rewriting* (QReCC). https://arxiv.org/abs/2010.04898

> Lưu ý: nội dung các bài báo đã đối chiếu trên trang arXiv / ACL. Riêng tên tác giả của các bài 19-26, 28, 29, 33 ghi theo hiểu biết sẵn có,
> chưa đối chiếu lại trên trang abstract. Tác giả của bài 30 và 31 chưa ghi. Hãy kiểm tra trước khi đưa vào danh mục tài liệu tham khảo của luận văn.
> Docs của Azure agentic retrieval và Vertex AI thay đổi nhanh (preview). Hãy mở lại trước khi trích dẫn trong luận văn.

### File trong repo
- `src/lib/query.ts` (`QUERY_SHAPE`, `MAX_TOPIC_QUERIES`, `parseRewrite`, `rewritePrompt`, `historyForRewrite`, `planFromRewrite`)
- `src/lib/rag.ts` (`retrieveChunks`, `topicBest`, `buildContext`, `CONTEXT_CHAR_LIMIT`)
- `src/lib/rerank.ts` (`selectByRelevance`)
- `src/lib/env.ts` (`RAG_TOP_K = 5`)
- `docs/ERRORS.md` (#29, #32, #33, #34), `docs/CONTEXT_MANAGEMENT_REVIEW.md`
