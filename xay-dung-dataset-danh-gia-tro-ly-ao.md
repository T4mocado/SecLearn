# Hướng dẫn từng bước: xây dựng dataset đánh giá chất lượng trợ lý ảo (RAG chatbot)

> Phạm vi: dataset > 1000 mẫu, nhiều mức độ khó. Mỗi mẫu thuộc một trong hai dạng:
> **(A)** 1 câu hỏi + 1 câu trả lời chuẩn (reference answer), hoặc
> **(B)** 1 câu hỏi + danh sách chunk liên quan (qrels).
> Mọi khẳng định đều có nguồn ở mục **Nguồn** cuối tài liệu (ký hiệu [Sx]). Chỗ nào chưa kiểm chứng được từ nguồn gốc thì ghi rõ **(chưa kiểm chứng)**. Các con số đề xuất (tỷ lệ, số lượng) là khuyến nghị của tài liệu này, không phải con số do nguồn đưa ra, trừ khi có trích nguồn.

---

## Tóm tắt khuyến nghị

1. **Gộp hai dạng vào một schema**: mỗi mẫu có `question`, và tuỳ trường hợp có `reference_answer` (dạng A), `relevant_chunks` có nhãn mức độ liên quan (dạng B), hoặc cả hai (khuyến nghị cho phần lớn mẫu, vì khi đó đo được cả retrieval lẫn generation).
2. **Retrieval** (cần dạng B): MRR@10, Hit@k, Recall@k, nDCG@10 (nếu nhãn nhiều mức), MAP. **Generation** (cần dạng A): Factual Correctness / Answer Correctness bằng LLM-as-judge, kèm EM/F1 cho câu trả lời ngắn; Faithfulness và Answer/Response Relevancy không cần đáp án chuẩn.
3. **Lưu bằng chứng ở mức span của tài liệu gốc** (doc_id + offset), không chỉ chunk_id, để khi đổi cách chunking vẫn sinh lại qrels được.
4. **Nguồn câu hỏi**: log người dùng thật (càng nhiều càng tốt) + sinh tổng hợp (Ragas / InPars / Promptagator) → **người review 100% tập test**, chấm đôi khoảng 15–20% để đo Cohen's kappa.
5. **Bổ sung chunk liên quan bằng pooling** (gộp top-k từ nhiều retriever rồi cho người chấm), vì qrels thiếu làm sai lệch MRR/Recall.
6. **Kích thước**: khoảng 1.400 mẫu. Với n = 1000, khoảng tin cậy 95% của một tỷ lệ là khoảng ±3,1 điểm phần trăm; để phát hiện chênh lệch MRR 0,03 giữa hai hệ thống cần khoảng 550–800 câu (paired). Mỗi nhóm độ khó nên có ≥ 200–300 mẫu.

---

## Bước 1. Xác định phạm vi và mục tiêu đánh giá

- Liệt kê **use case** của trợ lý (tra cứu chính sách, hướng dẫn thủ tục, hỏi số liệu, so sánh sản phẩm...), **nguồn tri thức** (corpus), và **hành vi mong muốn** khi không có thông tin (từ chối / hỏi lại / chuyển người).
- Quyết định **đánh giá cái gì**:
  - *Retriever* (tìm đúng chunk không?) → cần mẫu dạng B.
  - *Generator / end-to-end* (trả lời đúng, bám ngữ cảnh không?) → cần mẫu dạng A; một số metric không cần đáp án chuẩn (Faithfulness, Response Relevancy) [S1][S4][S5].
  - *Khả năng từ chối*: cần câu hỏi **không trả lời được**. SQuAD 2.0 đã bổ sung hơn 50.000 câu hỏi không trả lời được do crowdworker viết đối kháng sao cho trông giống câu trả lời được. Mô hình đạt 86% F1 trên SQuAD 1.1 chỉ còn 66% trên SQuAD 2.0 [S12]. Đây là lý do cần một nhóm câu "không có đáp án" trong dataset.
- Chốt **bảng metric** trước khi gán nhãn (xem Bước 2), vì metric quyết định trường nào bắt buộc.

## Bước 2. Hiểu các metric và mỗi metric cần dạng mẫu nào

### 2.1 Metric retrieval (cần dạng B: câu hỏi + danh sách chunk liên quan)

Ký hiệu: với một câu hỏi q, hệ thống trả về danh sách xếp hạng; `rel_i` là mức liên quan của kết quả ở vị trí i (0 nếu không liên quan); R là tổng số chunk liên quan trong qrels.

| Metric | Công thức (trên 1 câu hỏi, rồi lấy trung bình trên các câu hỏi) | Ghi chú |
|---|---|---|
| **RR@k / MRR@k** | RR = 1/rank của chunk liên quan **đầu tiên** nếu rank ≤ k, ngược lại 0. MRR = trung bình RR | Script chính thức MS MARCO dùng `MaxMRRRank = 10`, cộng `1/(i+1)` ở vị trí khớp đầu tiên rồi `break`. Câu không có chunk liên quan trong top 10 được 0. Tổng chia cho số câu hỏi trong tập tham chiếu [S7] |
| **Hit Rate@k** (Success@k) | 1 nếu có ít nhất 1 chunk liên quan trong top-k, ngược lại 0 | ranx: `hit_rate` [S9]. Lưu ý MultiHop-RAG định nghĩa "Hit@K" là tỷ lệ bằng chứng chuẩn nằm trong top-K, tức gần với Recall@K [S14]. Cần ghi rõ định nghĩa khi báo cáo |
| **Recall@k** | (số chunk liên quan trong top-k) / R | Quan trọng với câu multi-hop (cần đủ mọi chunk) [S9] |
| **Precision@k** | (số chunk liên quan trong top-k) / k | [S9] |
| **AP / MAP** | AP = (Σ Precision@r tại mỗi vị trí r có chunk liên quan) / R. MAP = trung bình AP | [S9] |
| **nDCG@k** | DCG@k = Σ_{i≤k} gain(rel_i)/log2(i+1); nDCG = DCG/IDCG (IDCG là DCG của thứ tự lý tưởng) | ranx `ndcg` dùng gain = rel_i (tuyến tính); `ndcg_burges` dùng 2^rel_i − 1 [S9]. Phải ghi rõ đang dùng biến thể nào |

**Nhãn nhị phân hay nhiều mức?** MRR, Hit, Recall, Precision, MAP chỉ cần nhãn nhị phân (rel > 0 tính là liên quan). nDCG mới khai thác được nhãn nhiều mức. Đề xuất thang nhãn: `2` = chunk chứa trực tiếp câu trả lời, `1` = liên quan một phần / bối cảnh cần thiết, `0` = không liên quan (đã chấm). TREC ad hoc kinh điển dùng nhãn nhị phân 0/1 [S16][S17].

**Ví dụ tính tay.** Hai câu hỏi:

- q1: qrels `{c3: 2, c7: 1}`, hệ thống trả về `[c5, c3, c9, c7, c1]`
- q2: qrels `{c2: 1}`, hệ thống trả về `[c4, c8, c6, c1, c2]`

| | q1 | q2 | Trung bình (k=5) |
|---|---|---|---|
| RR@5 | 1/2 = 0,5 | 1/5 = 0,2 | **MRR@5 = 0,35** |
| Hit@5 | 1 | 1 | 1,0 |
| Hit@3 | 1 | 0 | 0,5 |
| Recall@5 | 2/2 = 1 | 1 | 1,0 |
| Recall@3 | 1/2 | 0 | 0,25 |
| P@5 | 2/5 | 1/5 | 0,3 |
| AP@5 | (1/2 + 2/4)/2 = 0,5 | (1/5)/1 = 0,2 | MAP@5 = 0,35 |
| nDCG@5 (gain tuyến tính) | DCG = 2/log2(3) + 1/log2(5) = 1,6926; IDCG = 2/1 + 1/log2(3) = 2,6309 → **0,6433** | 1/log2(6) = 0,3869 | 0,5151 |

(Các số trên đã được chạy lại bằng đoạn code ở Bước 10.)

### 2.2 Metric cho câu trả lời (cần dạng A: câu hỏi + đáp án chuẩn)

- **Exact Match (EM) và token F1 (SQuAD)**: script chính thức SQuAD v2.0 chuẩn hoá câu trả lời (chữ thường, bỏ dấu câu, bỏ mạo từ tiếng Anh `a|an|the`, gộp khoảng trắng), rồi tách token bằng khoảng trắng. EM = 1 nếu hai chuỗi đã chuẩn hoá bằng nhau. F1 tính trên các token chung. Với câu không có đáp án, đáp án đúng duy nhất là chuỗi rỗng, nên F1 = 1 chỉ khi cả hai cùng rỗng [S13]. **Chỉ phù hợp với đáp án ngắn, dạng trích xuất**; câu trả lời dài, tự do của chatbot sẽ bị chấm thấp oan.
- **ROUGE / BLEU / chrF**: đo trùng n-gram. Ragas vẫn liệt kê chúng trong nhóm "Natural Language Comparison" [S1]. Với câu trả lời diễn đạt khác nhưng đúng nghĩa thì các metric này phạt oan, nên chỉ dùng làm tín hiệu phụ.
- **BERTScore**: so khớp từng token của câu trả lời với từng token của đáp án chuẩn bằng contextual embedding thay vì khớp chuỗi [S19]. Ít nhạy với cách diễn đạt khác hơn, nhưng vẫn không kiểm tra được tính đúng sự thật.
- **LLM-as-judge (Ragas)**. Tên metric trong tài liệu Ragas hiện tại [S1]:
  - **Faithfulness** = số claim trong câu trả lời được ngữ cảnh truy xuất hỗ trợ / tổng số claim trong câu trả lời. Cần `user_input`, `response`, `retrieved_contexts`. **Không cần đáp án chuẩn** [S4].
  - **Response Relevancy** (API legacy: `ResponseRelevancy`; API collections: `AnswerRelevancy`) = trung bình cosine giữa embedding của câu hỏi gốc và N câu hỏi do LLM sinh ngược từ câu trả lời (N mặc định 3, tham số `strictness`). Cần `user_input`, `response` [S5].
  - **Context Precision**: Σ_k (Precision@k × v_k) / số chunk liên quan trong top K, với v_k ∈ {0,1}. Các biến thể: `LLMContextPrecisionWithReference` (cần `reference`), `LLMContextPrecisionWithoutReference` (dùng `response`), `NonLLMContextPrecisionWithReference` (cần `reference_contexts`), `IDBasedContextPrecision` (cần `retrieved_context_ids`, `reference_context_ids`) [S2].
  - **Context Recall**: bản LLM = số claim trong `reference` được ngữ cảnh truy xuất hỗ trợ / tổng claim trong `reference`. Bản Non-LLM và bản ID-based = tỷ lệ chunk/ID chuẩn được truy xuất. Lớp: `LLMContextRecall` / `ContextRecall` (collections), `NonLLMContextRecall`, `IDBasedContextRecall` [S3].
  - **Factual Correctness** (`FactualCorrectness`): tách `response` và `reference` thành các claim; precision = TP/(TP+FP), recall = TP/(TP+FN), mặc định mode `f1` [S6]. Đây là metric chính để so câu trả lời với đáp án chuẩn.
  - **Answer Correctness**: trang danh sách metric hiện tại của Ragas **không còn liệt kê** metric này. Hãy dùng Factual Correctness (hoặc nhóm "Nvidia Metrics": Answer Accuracy) [S1]. (Answer Correctness có thể vẫn còn trong code cũ: **chưa kiểm chứng**.)
  - Ragas ghi rằng API legacy (`LLMContextRecall`, `ResponseRelevancy`, ...) "sẽ deprecated ở v0.4 và bị gỡ ở v1.0". Nên viết code mới bằng `ragas.metrics.collections` [S2][S3][S5].

### 2.3 Ma trận: metric ↔ trường dữ liệu cần có

| Metric | `question` | `reference_answer` (A) | `relevant_chunks` (B) | output của hệ thống |
|---|---|---|---|---|
| MRR/Hit/Recall/P/MAP | ✓ | | ✓ (nhị phân đủ) | danh sách chunk xếp hạng |
| nDCG | ✓ | | ✓ (tốt nhất là nhiều mức) | danh sách chunk xếp hạng |
| Ragas IDBasedContextPrecision/Recall | | | ✓ (`reference_context_ids`) | `retrieved_context_ids` |
| Ragas LLM Context Recall / Context Precision (with reference) | ✓ | ✓ | | `retrieved_contexts` |
| EM / F1 / ROUGE / BERTScore | | ✓ | | `response` |
| Factual Correctness | | ✓ | | `response` |
| Faithfulness | ✓ | | | `response`, `retrieved_contexts` |
| Response/Answer Relevancy | ✓ | | | `response` |
| Tỷ lệ từ chối đúng | ✓ + nhãn `answerable=false` | | | `response` |

→ Mẫu có **cả A lẫn B** dùng được cho mọi metric. Nên đặt mục tiêu ≥ 70% mẫu có cả hai.

## Bước 3. Thiết kế schema dữ liệu

Tham chiếu hai định dạng chuẩn:

- **BEIR**: `corpus.jsonl` (`_id`, `title`, `text`), `queries.jsonl` (`_id`, `text`), `qrels/test.tsv` gồm 3 cột `query-id`, `corpus-id`, `score`, giữ dòng đầu làm header [S10].
- **TREC qrels**: `TOPIC ITERATION DOCUMENT# RELEVANCY` (ITERATION gần như luôn bằng 0) [S16].
- **Ragas `SingleTurnSample`**: `user_input`, `retrieved_contexts`, `response`, `reference`, `rubric` [S8], cùng `reference_contexts`, `retrieved_context_ids`, `reference_context_ids` dùng cho các metric non-LLM / ID-based [S2][S3].

**Đề xuất 3 file** (dễ chuyển sang BEIR/ranx/Ragas):

`corpus.jsonl`, mỗi dòng một chunk:
```json
{"chunk_id": "hr-policy-v3#0012", "doc_id": "hr-policy-v3", "doc_version": "2026-09-01",
 "title": "Chính sách nghỉ phép", "text": "...", "char_start": 10234, "char_end": 11020,
 "section_path": ["Chương 2", "Điều 5"], "content_hash": "sha1:..."}
```

`eval_set.jsonl`, mỗi dòng một mẫu:
```json
{
  "id": "q-000123",
  "question": "Nhân viên thử việc có được nghỉ phép năm không?",
  "reference_answer": "Không. Theo Điều 5, chỉ nhân viên chính thức mới ...",
  "answerable": true,
  "relevant_chunks": [
    {"chunk_id": "hr-policy-v3#0012", "grade": 2,
     "evidence": {"doc_id": "hr-policy-v3", "char_start": 10450, "char_end": 10610}},
    {"chunk_id": "hr-policy-v3#0013", "grade": 1}
  ],
  "difficulty": "medium",
  "question_type": "single_hop_paraphrase",
  "source": "user_log",
  "source_docs": ["hr-policy-v3"],
  "split": "test",
  "annotation": {"annotators": ["a1", "a2"], "agreement": true, "reviewed": true,
                 "judged_pool_depth": 20},
  "metadata": {"domain": "hr", "time_sensitive": false, "created_at": "2026-10-19",
               "dataset_version": "1.0.0", "generator": null}
}
```

`qrels.tsv` (xuất từ `eval_set.jsonl` để dùng với BEIR/trec_eval): `query-id  corpus-id  score`.

Lưu ý thiết kế:
- Mẫu dạng A thuần: `relevant_chunks: []`, có `reference_answer`. Mẫu dạng B thuần: `reference_answer: null`.
- Mẫu không trả lời được: `answerable: false`, `reference_answer` là câu từ chối mẫu (hoặc null), `relevant_chunks: []`. Khi tính MRR/Recall, **loại các câu này** khỏi mẫu số (vì R = 0) và báo cáo riêng tỷ lệ từ chối đúng.
- Lưu `evidence` ở mức offset ký tự trong tài liệu gốc: khi đổi chiến lược chunking, chunk mới nào chồng lấn với evidence span thì được gán nhãn lại tự động. Đây là khuyến nghị thực hành, không trích từ nguồn.

## Bước 4. Chuẩn bị corpus và chunking

1. Làm sạch tài liệu, chuẩn hoá Unicode (tiếng Việt nên đưa về **NFC**, vì dấu có thể được mã hoá dạng tổ hợp sẵn hoặc tách rời; khớp chuỗi EM/BM25 sẽ sai nếu trộn hai dạng).
2. Chốt chiến lược chunking của hệ thống đang đánh giá (kích thước, overlap, cắt theo heading).
3. **chunk_id phải ổn định**: tạo từ `doc_id + doc_version + vị trí` hoặc hash nội dung, không dùng số thứ tự sinh ngẫu nhiên. qrels tham chiếu chunk_id, nên id đổi là qrels hỏng.
4. Ghi `doc_version` để theo dõi khi tài liệu cập nhật. Câu hỏi về thông tin thay đổi theo thời gian cần gắn cờ. CRAG phân loại `static_or_dynamic` thành static / slow-changing / fast-changing / real-time và lưu `query_time` [S15].

## Bước 5. Thu thập câu hỏi gốc (seed)

**5a. Từ log người dùng thật (ưu tiên).** Lọc PII, gom cụm theo chủ đề, lấy mẫu phân tầng theo cụm để không bị lệch về vài câu hỏi phổ biến. Giữ nguyên cách viết thật (viết tắt, không dấu, lỗi chính tả). Đó chính là phần "khó" mà dữ liệu tổng hợp thường thiếu.

**5b. Sinh tổng hợp có kiểm soát.**
- **Ragas testset generation**: Ragas dùng cách tiếp cận dựa trên knowledge graph. Tài liệu được tách thành node, các *extractor* gắn thuộc tính (entity, keyphrase), *relationship builder* (vd. `JaccardSimilarityBuilder`) nối các node, rồi duyệt graph để sinh query [S11]. Bốn loại query: single-hop specific, single-hop abstract, multi-hop specific, multi-hop abstract [S11]. `default_query_distribution` gồm `SingleHopSpecificQuerySynthesizer` 0,5, `MultiHopAbstractQuerySynthesizer` 0,25, `MultiHopSpecificQuerySynthesizer` 0,25 [S20]. API: `TestsetGenerator(llm=..., embedding_model=...)`, `generator.generate_with_langchain_docs(docs, testset_size=...)`, hoặc `generator.generate(testset_size=..., query_distribution=...)` [S20]. Tự điều chỉnh phân bố theo bảng ở Bước 8. Khả năng sinh câu hỏi tiếng Việt chất lượng tốt: **chưa kiểm chứng**, cần thử pilot.
- **InPars**: dùng LLM few-shot sinh 1 câu hỏi cho mỗi tài liệu (lấy mẫu 100.000 tài liệu), sau đó chỉ giữ **top K = 10.000** cặp theo xác suất sinh câu hỏi p_q. Huấn luyện trên toàn bộ 100.000 cặp làm MRR@10 trên MS MARCO giảm khoảng 4 điểm so với lọc top-K [S21]. Bài học cho dataset đánh giá: **phải lọc** câu hỏi sinh tự động.
- **Promptagator**: prompt riêng cho từng task với tối đa 8 ví dụ. Lọc bằng **round-trip consistency**: câu hỏi sinh ra phải truy xuất lại được đoạn văn nguồn của nó; bộ lọc này loại các câu hỏi mơ hồ, chung chung, chất lượng thấp [S22].
- Gợi ý áp dụng: mỗi câu hỏi tổng hợp phải (1) trả lời được từ chunk nguồn (LLM hoặc người kiểm tra), (2) không chép nguyên văn câu trong chunk (nếu không sẽ thành "dễ" giả tạo), (3) qua round-trip check bằng retriever khác với retriever đang đánh giá (nếu không, dataset bị thiên vị về retriever đó). Điểm (3) là suy luận từ [S22], không phải khuyến nghị trực tiếp của bài báo.

**5c. Câu hỏi không trả lời được / ngoài phạm vi**: viết đối kháng giống SQuAD 2.0 (trông như trả lời được nhưng corpus không có) [S12]; câu ngoài domain; câu tiền đề sai. CRAG có loại `false_premise` [S15], MultiHop-RAG có loại `null` query (11,78%) [S14].

## Bước 6. Gán nhãn bởi người: đáp án chuẩn và chunk liên quan

1. **Viết hướng dẫn gán nhãn (annotation guideline)** có ví dụ cho từng trường hợp: thế nào là nhãn 2 / 1 / 0; đáp án chuẩn phải ngắn gọn, đầy đủ, chỉ dựa trên corpus, có trích dẫn evidence; quy tắc với câu hỏi mơ hồ (loại bỏ hoặc ghi nhiều đáp án hợp lệ, giống trường `alt_ans` của CRAG [S15]). Theo định nghĩa của TREC, một tài liệu là liên quan nếu *bất kỳ phần nào* của nó hữu ích cho chủ đề [S17]. Nên quyết định rõ quy tắc này cho chunk.
2. **Chấm đôi** một phần mẫu (khuyến nghị 15–20%) và đo **Cohen's kappa**: κ = (p_o − p_e)/(1 − p_e), với p_o là tỷ lệ đồng ý quan sát được và p_e là tỷ lệ đồng ý kỳ vọng do ngẫu nhiên [S23]. Có thể dùng `sklearn.metrics.cohen_kappa_score` (có tham số `weights` cho nhãn thứ bậc 0/1/2) [S24]. Nếu κ thấp thì sửa guideline rồi chấm lại vòng pilot trước khi chấm hàng loạt. Ngưỡng "chấp nhận được" (thường được nhắc là khoảng 0,6–0,8) là quy ước, **không có ngưỡng chuẩn duy nhất (chưa kiểm chứng từ nguồn gốc)**.
3. **Bất đồng** thì để người thứ ba phân xử, ghi vào `annotation`.

### 6.1 Pooling: tìm thêm chunk liên quan (rất quan trọng cho dạng B)

Vấn đề: chunk "nguồn" dùng để sinh câu hỏi thường **không phải chunk liên quan duy nhất**. Thông tin hay lặp lại ở nhiều tài liệu (FAQ, phiên bản cũ, phụ lục). Nếu qrels chỉ có 1 chunk nguồn:
- Retriever trả về một chunk khác cũng đúng sẽ bị tính là sai → **MRR, Hit, Precision bị đánh giá thấp**.
- R bị đếm thiếu → **Recall bị thổi phồng**. Zobel (SIGIR'98) chỉ ra rằng với TREC, recall bị ước lượng cao vì nhiều tài liệu liên quan chưa bao giờ được tìm thấy, ước tính chỉ 50–70% tài liệu liên quan được phát hiện [S18].
- Buckley & Voorhees (SIGIR 2004) cho thấy các measure chuẩn **không bền vững khi qrels thiếu nhiều** và đề xuất `bpref` [S25].

Cách làm theo TREC: gộp (union) top-k kết quả của nhiều hệ thống, chấm toàn bộ pool, tài liệu không có trong pool coi như không liên quan. TREC kinh điển dùng độ sâu pool 100 [S18]. Áp dụng thực tế:
1. Chạy 3–5 retriever khác nhau (BM25, 1–2 dense embedding, hybrid, có reranker) cho mỗi câu hỏi.
2. Gộp top-10 (hoặc top-20) của mỗi hệ thống → pool khoảng 20–50 chunk/câu.
3. Cho LLM chấm sơ bộ, người duyệt mọi chunk được LLM chấm ≥ 1 và một mẫu ngẫu nhiên các chunk bị chấm 0.
4. Lưu `judged_pool_depth`. Khi đánh giá một hệ thống mới, theo dõi tỷ lệ chunk **chưa được chấm** trong top-10 của nó. Nếu tỷ lệ này cao thì cần chấm bổ sung.

## Bước 7. Định nghĩa và đo độ khó

### 7.1 Taxonomy đề xuất (dựa trên các benchmark công khai)

| Mức | Loại câu hỏi | Căn cứ |
|---|---|---|
| **Dễ (L1)** | Factoid, 1 chunk, từ khoá trong câu hỏi trùng lặp nhiều với chunk | Ragas single-hop specific [S11] |
| **Trung bình (L2)** | Diễn đạt lại / cần khớp ngữ nghĩa, từ đồng nghĩa, viết tắt, không dấu; câu hỏi có điều kiện; single-hop abstract (cần diễn giải) | Ragas single-hop abstract [S11]; CRAG `simple_w_condition` [S15] |
| **Khó (L3)** | Multi-hop (bridge) qua ≥ 2 chunk/tài liệu; so sánh; tổng hợp/đếm/tính toán số; thời gian/phiên bản; câu hỏi tổng hợp trừu tượng | HotpotQA: khoảng 113k câu multi-hop, có câu so sánh, đánh dấu supporting facts [S26]; MultiHop-RAG: inference 816, comparison 856, temporal 583, null 301 (tổng 2.556) [S14]; CRAG: comparison, aggregation, set, multi-hop, post-processing [S15]; Ragas multi-hop specific/abstract [S11] |
| **Từ chối (L0)** | Không có đáp án trong corpus; ngoài phạm vi; tiền đề sai | SQuAD 2.0 [S12]; CRAG `false_premise` [S15]; MultiHop-RAG `null` [S14] |

Thêm trục phụ (metadata, không phải độ khó chính): độ phổ biến của thực thể (CRAG dùng head/torso/tail [S15]), độ biến động theo thời gian (static → real-time [S15]).

### 7.2 Đo độ khó bằng thực nghiệm (hiệu chỉnh nhãn)

Nhãn do người hoặc generator gán chỉ là giả thuyết. Sau khi có dataset, hãy đo:
1. **Rank của chunk vàng theo BM25**: rank 1 → dễ về mặt từ vựng; không có trong top-20 BM25 nhưng dense tìm được → khó về mặt từ vựng (L2); không retriever nào tìm được → kiểm tra lại nhãn hoặc xếp L3.
2. **Rank theo dense retriever baseline** (tương tự).
3. **Số chunk vàng cần thiết** (1 so với ≥ 2).
4. **Tỷ lệ thất bại của baseline end-to-end**: chạy 2–3 cấu hình RAG baseline; câu mà tất cả đều trả lời đúng là dễ, tất cả đều sai là khó.
5. Ghi cả `difficulty_declared` và `difficulty_empirical`; báo cáo metric theo từng mức.

Cách này là khuyến nghị thực hành tự xây dựng; ý tưởng "BM25 làm baseline mạnh" có trong BEIR [S27].

## Bước 8. Kích thước và phân bố mẫu

### 8.1 Vì sao > 1000 mẫu là hợp lý

- **Khoảng tin cậy của một tỷ lệ** (Hit@k, accuracy, tỷ lệ từ chối đúng): SE ≈ √(p(1−p)/n), CI95 ≈ ±1,96·SE. Trường hợp xấu nhất p = 0,5:

| n | ±CI95 |
|---|---|
| 100 | ±9,8 điểm % |
| 200 | ±6,9 |
| 300 | ±5,7 |
| 1000 | ±3,1 |
| 1400 | ±2,6 |

  → Muốn báo cáo **theo từng nhóm độ khó/loại** với sai số khoảng ±6–7 điểm thì mỗi nhóm cần khoảng 200+ mẫu. Có 4–5 nhóm thì tổng tự nhiên vượt 1000.
- Với metric liên tục (MRR, nDCG, Factual Correctness), dùng **bootstrap CI**: lấy mẫu lại có hoàn lại các câu hỏi khoảng 1000–10.000 lần và lấy phân vị 2,5% / 97,5%.
- **So sánh hai hệ thống (paired)**: số câu cần ≈ ((z_{α/2} + z_β)·σ_d / δ)², với σ_d là độ lệch chuẩn của *hiệu số điểm theo từng câu* giữa hai hệ thống và δ là chênh lệch muốn phát hiện. Với α = 0,05, power 0,8 (z ≈ 1,96 + 0,84):
  - σ_d = 0,30, δ = 0,03 → **785 câu**; σ_d = 0,25, δ = 0,03 → 546; σ_d = 0,30, δ = 0,05 → 283.
  - σ_d phải ước lượng từ **pilot** (vd. 200 câu). Đây đúng là tinh thần *topic set size design* của Sakai: dùng ba kỹ thuật thiết kế cỡ mẫu của Nagata (paired t-test, one-way ANOVA, confidence interval), cần ước lượng phương sai từ dữ liệu pilot [S28]. Các giá trị σ_d ở trên là **giả định minh hoạ**, không phải số liệu từ nguồn.
- Bằng chứng từ IR: Voorhees & Buckley (SIGIR 2002) cho thấy tỷ lệ lỗi khi kết luận hệ thống A tốt hơn B (kết luận bị đảo khi đổi bộ topic) **lớn hơn dự kiến**, nhất là khi ít topic; với 50 topic cần chênh MAP khoảng 0,05–0,06 mới tin cậy được ở mức 95% [S29] (con số 0,05–0,06 lấy từ tóm tắt NIST/trích dẫn thứ cấp, nên coi là bán kiểm chứng). Bộ TREC truyền thống chỉ có 50–100 topic [S28]. Dataset chatbot với hơn 1000 câu cho phép phát hiện chênh lệch nhỏ hơn nhiều.
- Dùng paired test có sẵn: `ranx.compare(..., max_p=0.01)` mặc định chạy two-sided paired Student's t-test [S9].

### 8.2 Phân bố đề xuất cho khoảng 1.400 mẫu

| Nhóm | Loại câu hỏi | Mức | Số mẫu | Dạng nhãn | Nguồn ưu tiên |
|---|---|---|---|---|---|
| 1 | Factoid 1 chunk, trùng từ khoá | L1 | 350 | A + B | log + tổng hợp |
| 2 | Diễn đạt lại / ngữ nghĩa / viết tắt / không dấu | L2 | 300 | A + B | log (chính) |
| 3 | Có điều kiện, thủ tục nhiều bước trong 1 chunk | L2 | 120 | A + B | log + tổng hợp |
| 4 | Single-hop abstract (giải thích, tóm tắt 1 chủ đề) | L2 | 80 | A (+B) | tổng hợp |
| 5 | Multi-hop bridge (≥ 2 chunk) | L3 | 150 | A + B (đủ mọi chunk) | tổng hợp + người viết |
| 6 | So sánh | L3 | 100 | A + B | tổng hợp + người viết |
| 7 | Số liệu / tổng hợp / tính toán | L3 | 60 | A + B | người viết |
| 8 | Thời gian / phiên bản tài liệu | L3 | 40 | A + B | người viết |
| 9 | Không có đáp án trong corpus (đối kháng) | L0 | 120 | A (câu từ chối) | người viết |
| 10 | Ngoài phạm vi / tiền đề sai | L0 | 80 | A (câu từ chối) | log + người viết |
| | **Tổng** | | **1.400** | | |

Theo mức: L1 = 350 (25%), L2 = 500 (36%), L3 = 350 (25%), L0 = 200 (14%). Mẫu có nhãn B (để tính MRR/Recall): khoảng 1.120–1.200 (nhóm 1–8; nhóm 4 chỉ gán chunk khi có thể). Đặt mục tiêu ≥ 30–40% câu hỏi xuất phát từ log thật.

**Bao nhiêu mẫu cần người kiểm tra?**
- **Tập test: 100%** được ít nhất 1 người review (đọc câu hỏi, đáp án, nhãn chunk). Mẫu sai trong tập test gây nhiễu trực tiếp lên mọi kết luận.
- **15–20%** (khoảng 200–280 mẫu) được chấm độc lập bởi 2 người để đo kappa.
- Pool chunk: người duyệt mọi chunk được LLM chấm liên quan, cộng mẫu ngẫu nhiên khoảng 10% các chunk bị chấm không liên quan (để ước lượng tỷ lệ bỏ sót).
- Nếu ngân sách hạn chế: dev set có thể chỉ review 30–50%, nhưng không bao giờ báo cáo kết quả cuối trên dev.

## Bước 9. Khử trùng lặp, chống rò rỉ, chia tập, quản lý phiên bản

1. **Dedup**: chuẩn hoá (NFC, chữ thường, bỏ dấu câu) → khớp chính xác; sau đó near-duplicate bằng cosine embedding (vd. > 0,95) hoặc MinHash; giữ 1 đại diện mỗi cụm. Ngưỡng này cần tự hiệu chỉnh.
2. **Chống rò rỉ (leakage)**:
   - Câu hỏi test **không được** xuất hiện trong few-shot prompt, dữ liệu fine-tune embedding/reranker, hay bộ FAQ được index.
   - Câu hỏi tổng hợp chép gần nguyên văn chunk thì loại bỏ hoặc viết lại (nếu không, kết quả lexical retriever bị thổi phồng).
   - Câu hỏi diễn đạt lại cùng một ý nên nằm cùng một split.
3. **Chia tập**: đây là dataset đánh giá nên chỉ cần **dev** (khoảng 25–30%, để tinh chỉnh prompt, top-k, ngưỡng) và **test** (khoảng 70–75%, giữ kín, chạy ít lần). Chia **phân tầng** theo `difficulty × question_type`, và chia theo tài liệu nguồn nếu muốn đo khả năng tổng quát hoá. CRAG cũng có trường `split` cho validation / public test [S15].
4. **Versioning**: đặt `dataset_version` theo semver; mỗi lần đổi corpus/chunking/nhãn thì tăng version và lưu changelog; lưu kèm hash của corpus. Không so sánh kết quả giữa hai version qrels khác nhau.
5. **Bảo trì**: định kỳ thêm câu hỏi mới từ log (nhất là các câu chatbot trả lời sai), loại câu hỏi mà tài liệu đã thay đổi đáp án.

## Bước 10. Code tính metric

### 10.1 Python thuần (đã chạy thử; in ra đúng các số ở ví dụ Bước 2)

```python
import math

def rank_list(run_q, k=None):
    ranked = sorted(run_q.items(), key=lambda x: (-x[1], x[0]))  # điểm giảm dần
    ids = [d for d, _ in ranked]
    return ids[:k] if k else ids

def rr_at_k(qrel_q, run_q, k):
    for i, d in enumerate(rank_list(run_q, k), start=1):
        if qrel_q.get(d, 0) > 0:
            return 1.0 / i
    return 0.0

def hit_at_k(qrel_q, run_q, k):
    return float(any(qrel_q.get(d, 0) > 0 for d in rank_list(run_q, k)))

def recall_at_k(qrel_q, run_q, k):
    rel = {d for d, g in qrel_q.items() if g > 0}
    return len(rel & set(rank_list(run_q, k))) / len(rel) if rel else 0.0

def precision_at_k(qrel_q, run_q, k):
    return sum(qrel_q.get(d, 0) > 0 for d in rank_list(run_q, k)) / k

def ap_at_k(qrel_q, run_q, k):
    R = sum(1 for g in qrel_q.values() if g > 0)
    hits, s = 0, 0.0
    for i, d in enumerate(rank_list(run_q, k), start=1):
        if qrel_q.get(d, 0) > 0:
            hits += 1
            s += hits / i
    return s / R if R else 0.0

def ndcg_at_k(qrel_q, run_q, k, exp_gain=False):
    g = (lambda r: 2 ** r - 1) if exp_gain else (lambda r: r)   # tuyến tính = ranx "ndcg"
    dcg = sum(g(qrel_q.get(d, 0)) / math.log2(i + 1)
              for i, d in enumerate(rank_list(run_q, k), start=1))
    ideal = sorted((r for r in qrel_q.values() if r > 0), reverse=True)[:k]
    idcg = sum(g(r) / math.log2(i + 1) for i, r in enumerate(ideal, start=1))
    return dcg / idcg if idcg > 0 else 0.0

def evaluate(qrels, run, k=10):
    fns = {f"mrr@{k}": rr_at_k, f"hit@{k}": hit_at_k, f"recall@{k}": recall_at_k,
           f"precision@{k}": precision_at_k, f"map@{k}": ap_at_k, f"ndcg@{k}": ndcg_at_k}
    # bỏ câu không có chunk liên quan (câu unanswerable) khỏi mẫu số
    qids = [q for q in qrels if any(g > 0 for g in qrels[q].values())]
    return {name: sum(fn(qrels[q], run.get(q, {}), k) for q in qids) / len(qids)
            for name, fn in fns.items()}

qrels = {"q1": {"c3": 2, "c7": 1}, "q2": {"c2": 1}}
run = {"q1": {"c5": 0.9, "c3": 0.8, "c9": 0.7, "c7": 0.6, "c1": 0.5},
       "q2": {"c4": 0.9, "c8": 0.8, "c6": 0.7, "c1": 0.6, "c2": 0.5}}
print(evaluate(qrels, run, k=5))
# {'mrr@5': 0.35, 'hit@5': 1.0, 'recall@5': 1.0, 'precision@5': 0.3, 'map@5': 0.35, 'ndcg@5': 0.5151}
```

### 10.2 ranx (định dạng dict giống hệt ở trên)

```python
from ranx import Qrels, Run, evaluate, compare
qrels_r, run_r = Qrels(qrels), Run(run)
evaluate(qrels_r, run_r, ["mrr@10", "hit_rate@10", "recall@10", "precision@10", "map@10", "ndcg@10"])
# so sánh nhiều hệ thống + paired t-test:
# report = compare(qrels=qrels_r, runs=[run_a, run_b], metrics=["mrr@10", "ndcg@10"], max_p=0.01)
```
`Qrels`, `Run`, `evaluate`, `compare` và các chuỗi dạng `"ndcg@5"`, `"map@5"`, `"mrr"`, `"mrr@100"` có trong docs ranx. Định danh `hit_rate`, `recall`, `precision`, `map`, `ndcg`, `ndcg_burges` có trên trang metrics [S9]. Chuỗi cụ thể `"hit_rate@10"` / `"recall@10"` được suy ra theo cùng quy ước `tên@k` (**chưa chạy thử**).

### 10.3 pytrec_eval (bọc trec_eval)

```python
import pytrec_eval
evaluator = pytrec_eval.RelevanceEvaluator(qrels, {"recip_rank", "ndcg_cut.10", "recall.10", "P.5", "map"})
per_query = evaluator.evaluate(run)   # {qid: {"recip_rank": ..., "ndcg_cut_10": ..., "recall_10": ..., "P_5": ...}}
```
`RelevanceEvaluator(qrel, {...})` và `evaluate(run)` lấy từ README; cú pháp tham số `'ndcg_cut.3'` và tên kết quả `ndcg_cut_10`, `recall_10`, `P_5`, `recip_rank` lấy từ test của thư viện [S30][S31]. Lưu ý: `recip_rank` của trec_eval **không có cutoff**. Muốn ra MRR@10 kiểu MS MARCO thì cắt run còn top-10 trước khi đánh giá (suy luận từ [S7], chưa kiểm chứng trong mã trec_eval). Qrels của trec_eval cũng cần mức liên quan là số nguyên.

### 10.4 Ragas

Đánh giá end-to-end (legacy API, theo trang "Evaluate a simple LLM application") [S32]:
```python
from ragas import EvaluationDataset, evaluate
from ragas.llms import LangchainLLMWrapper
from ragas.metrics import LLMContextRecall, Faithfulness, FactualCorrectness

records = [{
    "user_input": s["question"],
    "retrieved_contexts": ctx_texts,      # từ hệ thống RAG của bạn
    "response": answer,                   # từ hệ thống RAG của bạn
    "reference": s["reference_answer"],
} for s, ctx_texts, answer in outputs]

ds = EvaluationDataset.from_list(records)
result = evaluate(dataset=ds,
                  metrics=[LLMContextRecall(), Faithfulness(), FactualCorrectness()],
                  llm=LangchainLLMWrapper(your_langchain_chat_model))
print(result)   # {'context_recall': ..., 'faithfulness': ..., 'factual_correctness': ...}
```

Retrieval theo ID (không cần LLM; dùng trực tiếp nhãn dạng B) [S3]:
```python
from ragas.dataset_schema import SingleTurnSample
from ragas.metrics import IDBasedContextRecall
sample = SingleTurnSample(retrieved_context_ids=["c5", "c3", "c9"],
                          reference_context_ids=["c3", "c7"])
score = await IDBasedContextRecall().single_turn_ascore(sample)   # 0.5
```

API collections (khuyến nghị cho code mới) [S3]:
```python
from openai import AsyncOpenAI
from ragas.llms import llm_factory
from ragas.metrics.collections import ContextRecall
scorer = ContextRecall(llm=llm_factory("gpt-4o-mini", client=AsyncOpenAI()))
result = await scorer.ascore(user_input=..., retrieved_contexts=[...], reference=...)
print(result.value)
```
Ragas thay đổi API khá nhanh (legacy sẽ deprecated ở v0.4 [S2][S3]); hãy ghim phiên bản trong `requirements.txt`. Việc dùng LLM judge cho văn bản tiếng Việt cần kiểm định lại với nhãn người trên khoảng 100 mẫu (**khuyến nghị, chưa có nguồn đo cụ thể**).

## Bước 11. Lưu ý riêng cho tiếng Việt

- **EM/F1 kiểu SQuAD**: hàm chuẩn hoá chính thức chỉ bỏ mạo từ tiếng Anh và tách token theo khoảng trắng [S13]. Với tiếng Việt, khoảng trắng tách theo **âm tiết** chứ không theo từ ("nghỉ phép" là 2 token). F1 mức âm tiết thường cao hơn F1 mức từ vì các âm tiết lẻ dễ trùng. Đây là suy luận, **chưa kiểm chứng định lượng**. Hãy chọn một cách (âm tiết hoặc từ sau khi tách từ), ghi rõ, và giữ cố định.
- **UIT-ViQuAD**: hơn 23.000 cặp hỏi-đáp do người viết, trên 5.109 đoạn văn từ 174 bài Wikipedia tiếng Việt, đánh giá bằng EM và F1 [S33]. Bài báo dùng thư viện **pyvi** để tách từ khi thống kê dataset [S33]. Bài báo có cho biết họ tách từ khi *tính EM/F1* hay không thì **chưa kiểm chứng**. Kết quả của bài: XLM-R Large đạt F1 87,02% nhưng EM chỉ 68,98% trên test [S33], cho thấy khoảng cách lớn giữa EM và F1 với câu trả lời tiếng Việt.
- **BM25 tiếng Việt**: kết quả phụ thuộc cách tách token (âm tiết hay từ, ví dụ pyvi / VnCoreNLP) và việc chuẩn hoá dấu. Điều này ảnh hưởng trực tiếp tới cách đo độ khó "lexical" ở Bước 7.2 (**khuyến nghị, chưa có nguồn đo**). Nên cố định một tokenizer cho baseline.
- **Bộ dữ liệu retrieval tiếng Việt để đối chiếu định dạng**: *Zalo AI Legal Text Retrieval* được đóng gói thành task MTEB `ZacLegalTextRetrieval` trên HuggingFace (`GreenNode/zalo-ai-legal-text-retrieval-vn`): định dạng corpus / queries / qrels, test có khoảng 818 dòng query, 61,4k tài liệu, 793 dòng qrels, trung bình khoảng 1,006 tài liệu liên quan/câu, license MIT [S34]. Mỗi câu chỉ có khoảng 1 tài liệu liên quan, đúng là tình huống "qrels thưa" ở Bước 6.1, nên hãy cẩn trọng khi diễn giải Recall trên bộ này.
- ViMMRC: không kiểm chứng trong lần nghiên cứu này (**chưa kiểm chứng**).

## Checklist cuối

- [ ] Use case, hành vi từ chối, danh sách metric đã chốt
- [ ] Corpus chuẩn hoá NFC, chunk_id ổn định, có doc_version + offset
- [ ] Guideline gán nhãn có ví dụ; pilot khoảng 100 câu; kappa đạt yêu cầu
- [ ] Câu hỏi: ≥ 30–40% từ log thật; câu tổng hợp đã qua lọc (round-trip / LLM / người)
- [ ] Pooling từ ≥ 3 retriever cho các câu dạng B
- [ ] Phân bố theo bảng 8.2; mỗi nhóm báo cáo riêng có ≥ 100–200 mẫu
- [ ] Dedup, kiểm tra leakage, chia dev/test phân tầng
- [ ] Tính σ_d từ pilot → kiểm tra lại cỡ mẫu theo công thức 8.1
- [ ] Ghim version thư viện (ranx/pytrec_eval/ragas), version dataset, changelog
- [ ] Báo cáo kèm CI (bootstrap) và paired test khi so sánh hệ thống

---

## Nguồn

- [S1] Ragas, *List of available metrics*: https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/
- [S2] Ragas, *Context Precision*: https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/context_precision/
- [S3] Ragas, *Context Recall*: https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/context_recall/
- [S4] Ragas, *Faithfulness*: https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/faithfulness/
- [S5] Ragas, *Response Relevancy*: https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/answer_relevance/
- [S6] Ragas, *Factual Correctness*: https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/factual_correctness/
- [S7] Microsoft, MS MARCO passage ranking, official eval script `ms_marco_eval.py`: https://github.com/microsoft/MSMARCO-Passage-Ranking/blob/master/ms_marco_eval.py
- [S8] Ragas, *Evaluation Sample* (SingleTurnSample): https://docs.ragas.io/en/stable/concepts/components/eval_sample/
- [S9] ranx docs (Qrels/Run/evaluate/compare): https://amenra.github.io/ranx/ ; metrics: https://amenra.github.io/ranx/metrics/
- [S10] BEIR wiki, *Load your custom dataset*: https://github.com/beir-cellar/beir/wiki/Load-your-custom-dataset
- [S11] Ragas, *Testset generation for RAG* (knowledge graph, query types): https://docs.ragas.io/en/stable/concepts/test_data_generation/rag/
- [S12] Rajpurkar, Jia, Liang (2018), *Know What You Don't Know: Unanswerable Questions for SQuAD*: https://arxiv.org/abs/1806.03822
- [S13] SQuAD v2.0 official evaluation script: https://raw.githubusercontent.com/rajpurkar/SQuAD-explorer/master/evaluate-v2.0.py
- [S14] Tang & Yang (2024), *MultiHop-RAG*: https://arxiv.org/abs/2401.15391 (HTML: https://arxiv.org/html/2401.15391)
- [S15] Meta, CRAG dataset docs: https://github.com/facebookresearch/CRAG/blob/main/docs/dataset.md ; paper: https://arxiv.org/abs/2406.04744
- [S16] TREC qrels format: https://trec.nist.gov/data/qrels_eng/
- [S17] TREC relevance judgments (English): https://trec.nist.gov/data/reljudge_eng.html
- [S18] Zobel (1998), *How Reliable Are the Results of Large-Scale IR Experiments?*, SIGIR'98: https://ir.webis.de/anthology/1998.sigirconf_conference-98.38 ; abstract: https://people.eng.unimelb.edu.au/ammoffat/sigir98/abstracts/zobel.html ; PDF: https://www.cs.cornell.edu/courses/cs574/2002fa/assignments.org/zobel-sigir98.pdf
- [S19] Zhang et al. (2019), *BERTScore*: https://arxiv.org/abs/1904.09675
- [S20] Ragas, *Testset Generation for RAG* (getting started): https://docs.ragas.io/en/stable/getstarted/rag_testset_generation/
- [S21] Bonifacio et al. (2022), *InPars*: https://arxiv.org/abs/2202.05144 (chi tiết K = 10.000 / 100.000 lấy từ PDF)
- [S22] Dai et al. (2022), *Promptagator*: https://arxiv.org/abs/2209.11755 (chi tiết round-trip filter lấy từ PDF)
- [S23] Cohen (1960), *A Coefficient of Agreement for Nominal Scales*, Educational and Psychological Measurement: https://doi.org/10.1177/001316446002000104 (công thức chuẩn; không mở được bản gốc trong lần này)
- [S24] scikit-learn, `cohen_kappa_score`: https://scikit-learn.org/stable/modules/generated/sklearn.metrics.cohen_kappa_score.html (không fetch lại trong lần này)
- [S25] Buckley & Voorhees (2004), *Retrieval Evaluation with Incomplete Information*, SIGIR: https://ir.webis.de/anthology/2004.sigirconf_conference-2004.5/ ; https://www.nist.gov/node/761376
- [S26] Yang et al. (2018), *HotpotQA*: https://arxiv.org/abs/1809.09600
- [S27] Thakur et al. (2021), *BEIR*: https://arxiv.org/abs/2104.08663
- [S28] Sakai (2016), *Topic set size design*, Information Retrieval Journal: https://link.springer.com/article/10.1007/s10791-015-9273-z
- [S29] Voorhees & Buckley (2002), *The Effect of Topic Set Size on Retrieval Experiment Error*, SIGIR: https://www.nist.gov/node/707561
- [S30] pytrec_eval README: https://github.com/cvangysel/pytrec_eval ; ví dụ: https://raw.githubusercontent.com/cvangysel/pytrec_eval/master/examples/simple_cut.py
- [S31] pytrec_eval tests (tên measure): https://raw.githubusercontent.com/cvangysel/pytrec_eval/master/tests/pytrec_eval_tests.py
- [S32] Ragas, *Evaluate a simple LLM application*: https://docs.ragas.io/en/stable/getstarted/rag_eval/
- [S33] Nguyen et al. (2020), *A Vietnamese Dataset for Evaluating Machine Reading Comprehension* (UIT-ViQuAD): https://arxiv.org/abs/2009.14725
- [S34] HuggingFace dataset card `GreenNode/zalo-ai-legal-text-retrieval-vn`: https://huggingface.co/datasets/GreenNode/zalo-ai-legal-text-retrieval-vn
- (Tham khảo thêm) Es et al. (2023), *RAGAS: Automated Evaluation of Retrieval Augmented Generation*: https://arxiv.org/abs/2309.15217
