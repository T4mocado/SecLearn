# Nghiên cứu: bộ dữ liệu và thang đo đánh giá chất lượng trợ lý ảo SecLearn

> Ngày lập: 2026-10-17. Phạm vi: cách xây một bộ đánh giá (dataset + độ đo) cho chatbot RAG của SecLearn. Mỗi mẫu là
> (a) câu hỏi + câu trả lời chuẩn, hoặc (b) câu hỏi + danh sách đoạn (chunk) liên quan chuẩn. Bộ đánh giá có nhiều mức độ khó để đo hiệu quả theo từng mức.
> Tài liệu gồm: độ đo truy xuất (MRR, Recall, nDCG...), độ đo câu trả lời và từ chối, các bộ dữ liệu có sẵn, tiêu chí của một bộ dữ liệu
> chuẩn, cách tự tạo, cỡ mẫu, và các lỗi hay gặp. Chỉ nghiên cứu, không sửa mã nguồn, không chạy thực nghiệm.
>
> Quy ước đánh dấu:
> - **[Nguồn n]**: tài liệu chính chủ đã mở và đọc (bài báo arXiv / ACL, docs chính thức, mã nguồn GitHub, dataset card Hugging Face), link ở mục 8.
> - **[Code]**: mã nguồn SecLearn trên đĩa ngày lập (`src/lib/chunking.ts`, `src/lib/ingest.ts`, `src/lib/rag.ts`, `src/lib/rerank.ts`,
>   `src/lib/grounding.ts`, `src/lib/judge.ts`, `src/lib/env.ts`, `prisma/schema.prisma`).
> - **[ERRORS #n]**: thực nghiệm đã ghi trong `docs/ERRORS.md`.
> - **[Suy luận]**: đề xuất hoặc tính toán của người viết, chưa kiểm chứng bằng chạy thật.
> - **[Chưa kiểm chứng]**: không mở được nguồn chính chủ, chỉ thấy qua nguồn thứ cấp (kết quả tìm kiếm, trang trích dẫn).
>
> Tài liệu này mở rộng mục 6 "Bộ dữ liệu đánh giá" của `docs/DATA_SOURCES.md`, không lặp lại phần giấy phép đã ghi ở đó trừ khi có thông tin mới.

---

## 1. Tóm tắt và khuyến nghị

### 1.1 Trả lời thẳng câu "ưu tiên dùng dataset có sẵn"

**Không có bộ dữ liệu công khai nào dùng được ngay để đánh giá SecLearn từ đầu đến cuối.** Lý do có ba lớp:

1. **Gold chunk phải nằm trong corpus của SecLearn.** Một mẫu dạng (b) "câu hỏi + đoạn liên quan" chỉ có nghĩa khi các đoạn đó là đoạn mà
   retriever của SecLearn *có thể* trả về, tức nằm trong các PDF admin đã nạp, sau khi bị cắt bằng `chunkMarkdown` [Code]. Một bộ dữ liệu
   trên corpus khác (Wikipedia, tin tức, văn bản luật) chỉ đo được retriever *trên corpus đó*, không đo được SecLearn.
2. **Các bộ an toàn thông tin hiện có đều là trắc nghiệm, không có đoạn bằng chứng.** CyberMetric, SecQA, SecEval, CTIBench (cti-mcq),
   CS-Eval, MMLU `computer_security` đều là câu hỏi 4 lựa chọn + đáp án chữ cái [Nguồn 26-30, 33]. Chúng đo kiến thức của LLM, không có
   gold passage nên không tính được MRR / Recall@k.
3. **Gần như toàn bộ bằng tiếng Anh (CS-Eval có thêm tiếng Trung)** [Nguồn 26-30]. Người dùng SecLearn hỏi tiếng Việt trên tài liệu chủ yếu
   tiếng Anh, nên kiểu câu khó nhất (xuyên ngôn ngữ Việt → Anh) không có bộ nào phủ. Các bộ tiếng Việt (UIT-ViQuAD 2.0, Zalo legal,
   VN-MTEB) đều là Việt → Việt trên Wikipedia, luật hoặc bản dịch MS MARCO [Nguồn 35, 38, 39].

Vì vậy dataset có sẵn chỉ tiết kiệm được ở **ba việc phụ**, còn phần lõi phải tự tạo từ corpus của SecLearn:

- **Mượn thang độ khó và cách chấm**: loại câu hỏi của CRAG (8 loại, chấm +1 / 0,5 / 0 / −1) [Nguồn 15], MultiHop-RAG (inference,
  comparison, temporal, null) [Nguồn 14], 4 năng lực của RGB (trong đó có negative rejection) [Nguồn 16], 4 kiểu câu của RAGAS [Nguồn 5].
- **Đánh giá thành phần (component benchmark)** cho embedding / reranker trên tiếng Việt: Zalo legal retrieval (818 truy vấn, 61,4 nghìn
  đoạn, giấy phép MIT) [Nguồn 39], các bộ VN-MTEB như `GreenNode/msmarco-vn`, `nq-vn`, `hotpotqa-vn` [Nguồn 38]. Nạp vào một **chỉ mục thử
  riêng**, không lẫn với corpus thật.
- **Câu hỏi hạt giống (seed)**: lọc các câu SecEval có nguồn là OWASP WSTG / MASTG [Nguồn 29], các câu CyberMetric / SecQA về chủ đề mà
  corpus có, rồi viết lại thành câu hỏi mở tiếng Việt và *gắn lại* gold evidence vào tài liệu của SecLearn. Chú ý giấy phép NC-SA và việc
  CyberMetric trên GitHub không ghi giấy phép (mục 3.1).

### 1.2 Kế hoạch đề xuất (xếp theo chi phí / thời gian tăng dần)

| Bước | Việc | Kết quả | Chi phí ước lượng |
|---|---|---|---|
| 0 | Chốt **schema JSONL** (mục 5.3), đóng băng một *snapshot corpus* (danh sách file + hash markdown), viết script chạy `retrieveChunks` / `answerQuestion` theo lô và tính độ đo bằng `ranx` hoặc `ir_measures` [Nguồn 7, 8] | Khung đo chạy được | 1-2 ngày công [Suy luận] |
| 1 | **Bộ smoke ~60 câu viết tay** (10 câu mỗi mức L1-L6), gold evidence là trích dẫn nguyên văn từ markdown. Dùng các câu đã gặp lỗi trong `docs/ERRORS.md` (#29, #34-#36) | Hồi quy nhanh mỗi lần sửa RAG | 1 ngày [Suy luận] |
| 2 | **Sinh tổng hợp** khoảng 2.000-2.500 câu từ chính corpus bằng LLM, theo phân bố mức độ khó ở mục 5.4, rồi lọc tự động | Bộ "silver" lớn để đo theo mức | Vài giờ máy + vài USD API, tính theo bảng giá nhà cung cấp [Suy luận] |
| 3 | **Người duyệt** một tập con 300-600 câu (≥ 50 câu mỗi mức), 2 người duyệt độc lập trên ~100 câu để tính Cohen's κ [Nguồn 47] | Bộ "gold" làm số báo cáo chính trong luận văn | 15-40 giờ người [Suy luận] |
| 4 | Benchmark thành phần trên Zalo legal / VN-MTEB (chỉ mục riêng) để chọn embedding và reranker | Số so sánh model, không phải số của SecLearn | 1-2 ngày [Suy luận] |
| 5 | Đo câu trả lời: answer correctness với reference, faithfulness / citation, đúng-sai khi từ chối (mục 2.2-2.3), LLM judge khác họ với model sinh câu hỏi, kiểm tra độ khớp với người trên tập con bước 3 | Bảng kết quả theo mức, có khoảng tin cậy | Theo số lời gọi judge [Suy luận] |

**Cỡ mẫu**: "hàng nghìn" là hợp lý cho *toàn bộ*, vì cần ~250-400 câu *mỗi mức* để khoảng tin cậy 95% của một tỉ lệ hẹp khoảng ±5-6 điểm
phần trăm (mục 6). 6 mức × 300 câu ≈ 1.800 câu. Không cần hàng nghìn câu *mỗi mức*. Webber, Moffat và Zobel cho rằng với cùng công sức
đánh giá, nhiều truy vấn đánh giá nông cho sức mạnh thống kê cao hơn ít truy vấn đánh giá sâu [Nguồn 44, Chưa kiểm chứng].

### 1.3 Năm lỗi dễ mắc nhất (chi tiết ở mục 7)

1. Gắn gold vào `DocumentChunk.id`: mỗi lần nạp lại tài liệu, `ingest.ts` xoá hết chunk rồi tạo chunk mới với `cuid()` mới [Code].
2. Chỉ báo MRR: MRR chỉ nhìn đoạn đúng *đầu tiên*, nên câu so sánh 3 thực thể chỉ lấy được 1 thực thể vẫn được MRR = 1 [Nguồn 7, 8].
3. Dùng cùng một LLM để sinh câu hỏi, trả lời và chấm. Zheng và cộng sự đã ghi nhận thiên lệch tự đề cao (self-enhancement) của LLM judge [Nguồn 25].
4. Dùng bộ đánh giá để chỉnh ngưỡng (`RAG_MIN_RELEVANCE`, `RAG_RELATIVE_MIN`...) rồi báo cáo trên chính bộ đó: cần tách dev / test.
5. Bỏ câu không trả lời được, hoặc báo trung bình không có khoảng tin cậy.

---

## 2. Độ đo

Ký hiệu: Q là tập câu hỏi; với mỗi câu q, `rel(q)` là tập đơn vị bằng chứng liên quan (R = |rel(q)|), `L_q` là danh sách đoạn trả về theo
thứ tự, `rel_i ∈ {0,1}` (hoặc mức điểm nếu có nhiều cấp) cho đoạn ở hạng i.

### 2.1 Độ đo truy xuất

| Độ đo | Công thức | Nguồn định nghĩa | Ghi chú |
|---|---|---|---|
| **Hit@k / Success@k** | 1 nếu có ít nhất một đoạn liên quan trong top k, ngược lại 0. Lấy trung bình trên Q | ir_measures `Success`, ranx `Hit Rate` (ranx ghi rằng nó bằng `success` của trec_eval) [Nguồn 7, 8] | Nhị phân. Hợp với câu chỉ cần 1 đoạn |
| **RR / MRR@k** | RR(q) = 1 / hạng của đoạn liên quan *đầu tiên* trong top k (0 nếu không có). MRR = trung bình RR | ir_measures `RR`, ranx `MRR` [Nguồn 7, 8] | Bỏ qua mọi đoạn liên quan sau đoạn đầu |
| **Precision@k** | (số đoạn liên quan trong top k) / k | ir_measures `P` (cutoff bắt buộc) [Nguồn 7]. ranx ghi `r / n`, n là số đoạn *đã trả về* [Nguồn 8] | Hai mẫu số khác nhau khi hệ trả ít hơn k đoạn (xem mục 7, lỗi 9) |
| **Recall@k** | (số đoạn liên quan trong top k) / R | ir_measures `R`, ranx `Recall` [Nguồn 7, 8] | Đo mức phủ. Hợp với câu nhiều đoạn |
| **AP / MAP** | AP(q) = (1/R) · Σ_k P@k · rel_k; MAP = trung bình AP | ranx, ir_measures [Nguồn 7, 8] | Nhị phân. Thưởng việc đặt *tất cả* đoạn đúng lên cao |
| **R-Precision** | P@R, với R = số đoạn liên quan của câu; cũng bằng Recall@R | ir_measures `Rprec`, ranx [Nguồn 7, 8] | Tự co theo số gold mỗi câu |
| **nDCG@k** | DCG@k = Σ_{i≤k} g(rel_i) / log2(i+1); nDCG@k = DCG@k / IDCG@k (IDCG: DCG của thứ tự lý tưởng). g(rel) = rel (Järvelin) hoặc 2^rel − 1 (Burges) | ranx có cả hai biến thể [Nguồn 8]; ir_measures cho chọn `dcg` và `gains` [Nguồn 7] | Duy nhất trong bảng hỗ trợ nhiều mức liên quan |

**Vì sao BEIR chọn nDCG@10.** BEIR (18 bộ dữ liệu) cần một độ đo dùng chung cho mọi tác vụ: Precision và Recall "không phụ thuộc thứ hạng",
còn MRR và MAP chỉ nhận nhãn nhị phân, nên nhóm tác giả chọn nDCG@k vì cân bằng được cả nhãn nhị phân lẫn nhãn nhiều mức. BEIR tính bằng
pytrec_eval, giao diện Python của trec_eval [Nguồn 9]. Cũng trong BEIR, nhiều bộ được gán nhãn từ ứng viên của truy xuất từ khoá, và
"đoạn chưa được đánh giá bị coi là không liên quan". Khi đánh giá thêm 980 cặp trên TREC-COVID, nDCG@10 của ANCE tăng từ 0,654 lên 0,735
[Nguồn 9]. Bài học cho SecLearn: nếu gold chỉ là những đoạn mà retriever hiện tại tìm ra, thì retriever khác sẽ bị phạt oan.

**MS MARCO.** Trang chính thức ghi corpus passage có 8,8 triệu đoạn, nhãn liên quan lấy từ đoạn được "đánh dấu là có câu trả lời", dữ liệu
chỉ cho nghiên cứu phi thương mại [Nguồn 10]. Leaderboard *document ranking* dùng MRR@100 [Nguồn 11]. Bản passage thường được trích là
MRR@10 [Chưa kiểm chứng: trang leaderboard passage không hiển thị được tên độ đo]. Nhãn thưa (khoảng 1 đoạn đúng mỗi truy vấn) là lý do MRR
hợp với MS MARCO, và cũng là lý do MRR không hợp với câu nhiều đoạn của SecLearn [Suy luận].

**Tranh luận về MRR.** Fuhr (SIGIR Forum 2017) lập luận rằng MRR và ERR vi phạm yêu cầu cơ bản của một độ đo (không phải thang khoảng),
nên lấy trung bình qua các truy vấn là không có nghĩa; Sakai phản biện [Nguồn 46, Chưa kiểm chứng: chỉ đọc qua tóm tắt và bài trích dẫn].
Với luận văn, cách an toàn là báo MRR *kèm* Hit@k và Recall@k, không dựa vào riêng MRR [Suy luận].

**Hoà điểm (ties).** Khi hai đoạn cùng điểm, thứ tự phụ thuộc cách công cụ phá hoà. trec_eval phá hoà theo docno chứ không theo thứ tự
đầu vào [Chưa kiểm chứng]. SecLearn nên xuất *danh sách đã xếp hạng* (hạng 1..k, sau rerank và sau `selectByRelevance`), rồi gán điểm giảm dần
giả lập (k, k−1, ...) trước khi đưa vào thư viện đo, để độ đo phản ánh đúng thứ tự mà model trả lời nhìn thấy [Suy luận].

**Nhiều gold cho một câu, và chunk chồng nhau.** Các chunk liên tiếp trong một mục chia sẻ câu cuối (tối đa `CHUNK_OVERLAP` = 80 ký tự),
và chunk mở đầu bằng tiêu đề mục [Code]. Một câu bằng chứng có thể nằm trong hai chunk. Nếu đếm theo chunk, Recall bị chia cho một R bị thổi
phồng. Nên định nghĩa đơn vị liên quan là **đơn vị bằng chứng** (một đoạn trích gold), và coi đơn vị đó "được tìm thấy" khi *bất kỳ* chunk
nào chứa nó có trong top k [Suy luận]. Với câu so sánh, thêm hai độ đo riêng:

- **Cell coverage@k** = (số ô (thực thể, khía cạnh) có ít nhất một bằng chứng trong top k) / (số ô).
- **All-cells@k** = 1 nếu mọi ô đều được phủ.

Hai độ đo này không có trong thư viện chuẩn; chúng là Recall@k tính trên ô, ánh xạ thẳng tới `CompareCell` của `rag.ts` [Code, Suy luận].

**RAGAS context precision khác MAP.** RAGAS định nghĩa Context Precision@K = Σ_k (Precision@k × v_k) / (số đoạn liên quan *trong top K*)
[Nguồn 1]. Mẫu số là số đoạn liên quan đã lấy được, không phải tổng R, nên một retriever chỉ lấy được 1/3 gold nhưng đặt nó ở hạng 1 vẫn
được 1,0. DeepEval Contextual Precision dùng cùng dạng [Nguồn 22]. Đừng gọi nó là MAP trong luận văn.

### 2.2 Độ đo câu trả lời

| Độ đo | Định nghĩa | Nguồn | Dùng cho SecLearn? |
|---|---|---|---|
| **Exact Match / token F1** (SQuAD) | EM: chuỗi trùng khớp sau chuẩn hoá; F1: chồng lấn token giữa dự đoán và đáp án. SQuAD có hơn 100 nghìn câu, đáp án là một đoạn của văn bản [Nguồn 19] | [Nguồn 19] (abstract báo F1, định nghĩa EM ở bài đầy đủ [Chưa kiểm chứng]) | Không. Câu trả lời của SecLearn dài, có trích dẫn, khác ngôn ngữ với tài liệu |
| **ROUGE / BLEU** | Chồng lấn n-gram với câu tham chiếu | — | Không nên làm số chính: phạt diễn đạt khác, phụ thuộc cách tách từ tiếng Việt [Suy luận] |
| **BERTScore** | Độ tương đồng từng token của câu sinh với từng token của câu tham chiếu, bằng embedding ngữ cảnh [Nguồn 20] | [Nguồn 20] | Chỉ phụ trợ. Không bắt được sai sự kiện (đổi "không nên" thành "nên" vẫn gần) [Suy luận] |
| **Faithfulness** (RAGAS) | (số khẳng định của câu trả lời được ngữ cảnh ủng hộ) / (tổng số khẳng định) [Nguồn 2] | [Nguồn 2] | Có. Tương ứng với "groundedness" của TruLens [Nguồn 21] |
| **Answer correctness** (RAGAS) | Kết hợp có trọng số giữa (a) F1 sự kiện = TP / (TP + 0,5·(FP + FN)) trên các khẳng định so với câu tham chiếu, và (b) độ tương đồng embedding. Trang docs không ghi trọng số mặc định [Nguồn 4] | [Nguồn 4] | Có, cho mẫu loại (a). Cần ghi rõ trọng số đã dùng |
| **Context recall** (RAGAS) | Bản LLM: (số khẳng định của câu tham chiếu được ngữ cảnh ủng hộ) / (tổng khẳng định). Bản ID: (số ID tham chiếu có trong ID đã lấy) / (tổng ID tham chiếu) [Nguồn 3] | [Nguồn 3] | Có. Bản LLM dùng được khi mẫu chỉ có câu trả lời chuẩn, không có gold chunk |
| **RAG triad** (TruLens) | Context relevance (từng chunk có liên quan câu hỏi), groundedness (từng khẳng định có trong ngữ cảnh), answer relevance (câu trả lời có trả lời đúng câu hỏi) [Nguồn 21] | [Nguồn 21] | Có. `judge.ts` đã chấm `questionRelevance` và `answerContribution` cho từng đoạn [Code] — gần với context relevance |
| **ARES** | Chấm context relevance, answer faithfulness, answer relevance bằng judge nhỏ được fine-tune trên dữ liệu tổng hợp, rồi dùng *prediction-powered inference* với "vài trăm" nhãn người để hiệu chỉnh sai số của judge [Nguồn 23] | [Nguồn 23] | Ý tưởng PPI rất hợp: dùng nhãn người ở bước 3 để hiệu chỉnh điểm judge trên bộ lớn |
| **RAGChecker** | Độ đo mức khẳng định: precision / recall / F1 tổng; claim recall và context precision của retriever; noise sensitivity, hallucination, faithfulness, self-knowledge, context utilization của generator. Tương quan với người tốt hơn các độ đo khác trong meta-evaluation của nhóm tác giả [Nguồn 24] | [Nguồn 24] | Có thể dùng để chẩn đoán lỗi nằm ở retriever hay generator |
| **Citation correctness** | Tỉ lệ câu có [n] mà đoạn [n] thật sự chứa nội dung đó; tỉ lệ câu không có trích dẫn | Không có chuẩn chung trong các nguồn đã đọc | Cần thiết vì SecLearn bắt buộc [n]. `uncitedSentences` trong `grounding.ts` đã tìm câu thiếu [n] [Code] |

### 2.3 Đánh giá từ chối ("tài liệu không đề cập")

- **RGB, negative rejection**: chỉ đưa tài liệu nhiễu, đo tỉ lệ model trả đúng câu từ chối cố định "I can not answer the question because of
  the insufficient information in documents". Hai biến thể: Rej (khớp chính xác) và Rej\* (ChatGPT phán có phải từ chối) [Nguồn 16]. Bộ RGB
  có 600 câu gốc + 200 câu tích hợp thông tin + 200 câu phản thực tế, nửa tiếng Anh nửa tiếng Trung [Nguồn 16].
- **CRAG**: mỗi câu trả lời được gán Perfect (1), Acceptable (0,5), Missing (0: "I don't know", xin lỗi, rỗng, hỏi lại) hoặc Incorrect (−1).
  Truthfulness = trung bình điểm. Bịa bị phạt nặng hơn không trả lời [Nguồn 15].
- **MultiHop-RAG** có 301 câu loại *null* (không có trong corpus) trên 2.556 câu [Nguồn 14].
- **UIT-ViQuAD 2.0** thêm hơn 12 nghìn câu không trả lời được, có trường `is_impossible` và `plausible_answers` (đáp án nghe hợp lý nhưng sai)
  [Nguồn 35].

Đề xuất cho SecLearn [Suy luận]: lập ma trận 2×2 (câu *trả lời được* / *không trả lời được* × hệ *trả lời* / *từ chối*), báo:
**refusal precision** (trong các lần từ chối, bao nhiêu là đúng), **refusal recall** (trong các câu không trả lời được, bao nhiêu bị từ chối),
**false refusal rate** (câu trả lời được mà hệ nói "không đề cập" — chính là lỗi đã ghi ở [ERRORS #34]), và điểm kiểu CRAG trên toàn bộ.
Phát hiện từ chối có thể dùng `isRefusal()` (regex tiếng Việt và tiếng Anh, ≤ 400 ký tự, không có [n]) [Code], nhưng cần kiểm tra lại bằng
judge trên tập con, giống Rej so với Rej\* của RGB.

### 2.4 Điểm yếu của LLM judge

- Zheng và cộng sự ghi nhận thiên lệch **vị trí**, **độ dài** (verbosity) và **tự đề cao** (self-enhancement), cùng khả năng suy luận hạn chế;
  judge mạnh như GPT-4 đạt trên 80% đồng ý với người [Nguồn 25]. 80% cũng có nghĩa là khoảng 1/5 phán quyết khác người.
- ARES cho thấy cần một tập nhãn người để hiệu chỉnh điểm judge [Nguồn 23]; RAGChecker kiểm tra độ đo của mình bằng meta-evaluation với người
  [Nguồn 24]. SecLearn nên làm tương tự: trên tập con bước 3, tính độ đồng ý (κ) giữa judge và người cho từng độ đo trước khi tin điểm judge
  trên bộ lớn [Suy luận].
- Faithfulness của RAGAS có thể thay LLM bằng classifier HHEM-2.1-Open của Vectara để kiểm tra chéo [Nguồn 2].

### 2.5 Bảng chọn độ đo theo loại câu

| Loại câu (mục 5.4) | Retrieval chính | Retrieval phụ | Câu trả lời |
|---|---|---|---|
| L1 tra cứu một đoạn | MRR@5, Hit@5 | Hit@1 | Answer correctness, faithfulness |
| L2 diễn đạt lại / xuyên ngôn ngữ | Hit@5, MRR@5 | So sánh có / không dịch truy vấn (`RAG_TRANSLATE_QUERY`) | Như L1 |
| L3 nhiều đoạn, một tài liệu | Recall@5, nDCG@5 | R-Precision | Answer correctness (thiếu ý = FN) |
| L4 so sánh | Cell coverage@k, All-cells@k | Recall@k, nDCG@k | Answer correctness theo từng ô, citation correctness |
| L5 nhiều bước / tình huống | Recall@k, nDCG@k | MAP | Answer correctness, RAGChecker claim recall |
| L6 không trả lời được | Tỉ lệ trả về rỗng sau ngưỡng rerank | Điểm rerank lớn nhất | Refusal precision / recall, điểm CRAG |
| Hội thoại nhiều lượt | Như loại của câu sau khi viết lại | Đúng / sai của câu viết lại | Như trên |

k = 5 khớp với `RAG_TOP_K = 5` [Code]. Với câu so sánh, k là số đoạn sau `cellsTopK` [Code].

---

## 3. Các bộ dữ liệu có sẵn

Cột "Dùng cho SecLearn" phân biệt: **E2E** (đo SecLearn từ đầu đến cuối trên corpus thật), **Thành phần** (đo embedding / reranker trên chỉ
mục riêng), **Seed** (lấy câu hỏi rồi tự gắn lại bằng chứng), **Thang đo** (chỉ mượn cách phân loại hoặc chấm điểm).

### 3.1 An toàn thông tin

| Bộ | Kích thước | Định dạng | Ngôn ngữ | Giấy phép | Nhãn độ khó | Dùng cho SecLearn |
|---|---|---|---|---|---|---|
| **CyberMetric** [Nguồn 26] | 4 bản: 80 / 500 / 2.000 / 10.000 câu | MCQ 4 lựa chọn (`question`, `answers` A-D, `solution`). GPT-3.5 + RAG sinh từ NIST, RFC, bài báo, sách; chuyên gia duyệt hơn 200 giờ | Anh | **Mâu thuẫn**: HF card ghi Apache-2.0; repo GitHub không ghi giấy phép (như `DATA_SOURCES.md`) | Không | Seed, chỉ nội bộ cho đến khi làm rõ giấy phép |
| **SecQA** [Nguồn 27] | 242 câu (v1: 127, v2: 115) | MCQ + giải thích, GPT-4 sinh từ giáo trình *Computer Systems Security: Planning for Success* | Anh | CC BY-NC-SA 4.0 | v1 cơ bản, v2 khó hơn | Seed / smoke |
| **SecEval** [Nguồn 29] | 2.126 câu (README ghi "hơn 2000") | JSON: `id, source, question, choices, answer, topics, keyword`; GPT-4 sinh từ tài liệu gồm **OWASP WSTG, OWASP MASTG**, Mozilla Web Security Guidelines, CWE, ATT&CK, D3FEND, giáo trình CS161, 6.858 | Anh | Dữ liệu CC BY-NC-SA 4.0, mã MIT | Theo chủ đề, không theo mức | **Seed tốt nhất**: lọc theo `source` OWASP, câu nào trùng tài liệu SecLearn có thì viết lại |
| **CTIBench** [Nguồn 28] | 5.610 dòng: cti-mcq 2.500, cti-rcm 1.000 (+ rcm-2021 1.000), cti-vsp 1.000, cti-ate 60, cti-taa 50 | MCQ; CVE → CWE; CVE → vector CVSS; mô tả → ID ATT&CK; báo cáo → tác nhân | Anh | CC BY-NC-SA 4.0 (HF) | Không | Chỉ khi nạp CWE / ATT&CK. Lưu ý: bài báo tự mâu thuẫn (nguồn cti-mcq cộng lại 2.400) |
| **CS-Eval** [Nguồn 30] | 4.369 câu, 11 nhóm, 42 lĩnh vực con | Trắc nghiệm, đúng / sai, trích xuất kiến thức | Trung, Anh | Dữ liệu CC BY-NC-SA 4.0, mã MIT | 3 mức nhận thức: knowledge, ability, application | **Thang đo**: 3 mức nhận thức đáng mượn. Chưa rõ đáp án có công khai |
| **AttackQA** [Nguồn 31] | 25.335 cặp hỏi-đáp + rationale | Khoảng 80% sinh bằng Llama 3 8B, lọc bằng Llama 3 70B fine-tune | Anh | Bài báo CC BY 4.0; trang không có link tải dữ liệu | Không rõ | Tham khảo quy trình sinh + lọc. Không thấy có nhãn đoạn bằng chứng |
| **SECURE** [Nguồn 32] | 6 bộ (ICS), trang không ghi kích thước | Trích xuất, hiểu, suy luận kiến thức | Anh | Không rõ | Theo năng lực | Ngoài phạm vi (ICS) |
| **MMLU computer_security** [Nguồn 33] | test 100, validation 11, dev 5 | MCQ | Anh | Trang không ghi | Không | Smoke test kiến thức LLM, quá nhỏ |
| **shahrukh95/OWASP-question-answer-dataset** [Nguồn 34] | 273 dòng | CSV `Question`, `Answer` (câu trả lời mở), về OWASP Mobile Top 10 2023 | Anh | **Không ghi**, không có dataset card | Không | Seed nếu corpus có OWASP Mobile Top 10; không phân phối lại |

**Kết luận mục 3.1**: không bộ nào có gold passage. Bộ duy nhất có câu trả lời mở là bộ OWASP Mobile 273 dòng, không giấy phép. SecEval có
trường `source` trỏ tới OWASP nên lọc được câu liên quan corpus, nhưng vẫn phải tự gắn gold evidence và dịch sang tiếng Việt [Nguồn 29, Suy luận].

### 3.2 Tiếng Việt

| Bộ | Kích thước | Định dạng | Miền | Giấy phép | Nhãn độ khó | Dùng cho SecLearn |
|---|---|---|---|---|---|---|
| **UIT-ViQuAD 2.0** (VLSP 2021 ViMRC) [Nguồn 35] | 39,6 nghìn dòng (train 28,5k, validation 3,81k, test 7,3k); hơn 12 nghìn câu không trả lời được | Kiểu SQuAD 2.0: `context, question, answers{text, answer_start}, is_impossible, plausible_answers` | Wikipedia tiếng Việt, người gán nhãn | Trang HF không ghi | Có / không trả lời được | Thành phần (đọc hiểu, từ chối tiếng Việt); mẫu tốt cho *cách gán nhãn bằng offset ký tự* |
| **ViNewsQA** [Nguồn 36] | 22.057 cặp, hơn 4.416 bài tin sức khoẻ | Đáp án là đoạn trích, crowd-worker viết | Tin y tế | "công khai cho nghiên cứu" | Không | Ít liên quan |
| **ViMMRC 2.0** [Nguồn 37, Chưa kiểm chứng] | 699 đoạn, 5.273 câu (bản 1.0: 417 văn bản, 2.783 câu) | Trắc nghiệm đọc hiểu, văn học lớp 1-12 | Giáo dục | Chưa kiểm tra | Theo lớp | Không |
| **Zalo AI legal text retrieval** (gói MTEB `ZacLegalTextRetrieval`) [Nguồn 39] | 818 truy vấn, 61,4 nghìn đoạn, 793 qrels (trung bình 1,01 đoạn đúng mỗi truy vấn) | Kiểu BEIR: corpus / queries / qrels | Luật | MIT | Không | **Thành phần**: đo embedding tiếng Việt Việt → Việt; nhãn thưa nên hợp MRR |
| **VN-MTEB** [Nguồn 38] | 41 bộ, 6 tác vụ (retrieval, classification, pair-classification, clustering, rerank, STS) | Dịch tự động từ MTEB bằng LLM + lọc bằng embedding, giữ tên riêng và code | Đa miền | Bài báo CC BY 4.0; giấy phép từng bộ chưa kiểm tra | Không | **Thành phần**: `msmarco-vn`, `nq-vn`, `hotpotqa-vn` (đa bước), `fiqa-vn`... |

**Không tìm thấy** bộ truy xuất xuyên ngôn ngữ *câu hỏi tiếng Việt → tài liệu tiếng Anh* nào trong các nguồn đã đọc. Đây là kiểu khó nhất
của SecLearn (`needsTranslation`, `RAG_TRANSLATE_QUERY`, [ERRORS #31]) [Code] và phải tự tạo. Có thể ghép: lấy câu hỏi tiếng Việt của
`msmarco-vn` với corpus *tiếng Anh gốc* của MS MARCO để có một bộ Việt → Anh [Suy luận; cần kiểm tra ID của VN-MTEB có giữ nguyên ID của
bản gốc hay không].

### 3.3 Benchmark RAG tổng quát có phân loại độ khó

| Bộ | Kích thước | Định dạng | Phân loại | Giấy phép | Dùng cho SecLearn |
|---|---|---|---|---|---|
| **BEIR** [Nguồn 9] | 18 bộ | corpus / queries / qrels | Theo miền, tác vụ | Trang arXiv hiển thị CC BY-SA 4.0 (của bài báo) | Thành phần; định dạng qrels nên chép |
| **MS MARCO** [Nguồn 10] | 8,8 triệu đoạn, hơn 1 triệu truy vấn QnA | q + đoạn liên quan (thưa) | Không | Chỉ nghiên cứu phi thương mại | Thành phần |
| **HotpotQA** [Nguồn 13] | 113 nghìn cặp Wikipedia | q + đáp án + *supporting facts* mức câu; có loại câu so sánh | Bridge / comparison | Chưa kiểm tra | Thang đo: gold mức câu là ý hay cho đơn vị bằng chứng |
| **KILT** [Nguồn 12] | 11 bộ trên cùng một snapshot Wikipedia [số bộ: Chưa kiểm chứng] | Đáp án + provenance | Theo tác vụ | Chưa kiểm tra | Thang đo: chấm câu trả lời *chỉ khi* provenance đúng |
| **MultiHop-RAG** [Nguồn 14] | 2.556 câu trên 609 bài tin tiếng Anh (9-12/2023) | q + đáp án + bằng chứng; báo MRR@10, MAP@10, Hits@10, Hits@4 | Inference 816, comparison 856, temporal 583, null 301 | Trang bài báo CC BY-SA 4.0 | Thang đo; có thể nạp 609 bài vào chỉ mục riêng để thử bước tách câu so sánh |
| **CRAG** [Nguồn 15] | 4.409 cặp, 5 miền | q + đáp án + API giả lập web / KG | 8 loại: simple, simple w. condition, set, comparison, aggregation, multi-hop, post-processing-heavy, false premise | Chưa rõ (giấy phép trên arXiv là của bài báo) | **Thang đo + cách chấm** |
| **RGB** [Nguồn 16] | 600 + 200 + 200 câu, Anh / Trung | q + tài liệu (có nhiễu) | 4 năng lực: noise robustness, negative rejection, information integration, counterfactual robustness | Chưa kiểm tra | Thang đo cho L6 |
| **FRAMES** [Nguồn 17] | 824 câu | q + đáp án + 2-6 (có thể hơn) link Wikipedia | 5 loại suy luận: numerical, tabular, multiple constraints, temporal, post processing | Apache-2.0 | Thang đo |
| **RAGBench** [Nguồn 18] | khoảng 100 nghìn mẫu, 5 miền công nghiệp (vd. sách hướng dẫn) | Có nhãn giải thích được (TRACe) | Theo miền | CC BY 4.0 | Thang đo; dữ liệu có thể dùng để kiểm tra judge |

### 3.4 Cách dùng bộ ngoài cho đúng

1. **Component benchmark trên chỉ mục riêng.** Tạo một bảng / schema thử (hoặc một database riêng), nạp corpus của bộ ngoài (vd. Zalo legal),
   chạy *cùng* embedding + reranker + `selectByRelevance`, tính MRR@10, nDCG@10. Kết quả trả lời "BKAI bi-encoder hay bge-m3 tốt hơn trên tiếng
   Việt", không trả lời "SecLearn tốt đến đâu" [Suy luận].
2. **Không nạp bộ đánh giá vào corpus thật.** `DATA_SOURCES.md` đã nhắc: nạp vào thì "lộ đề".
3. **Seed + gắn lại bằng chứng**: lấy câu hỏi ngoài, người hoặc LLM tìm đoạn trả lời trong tài liệu SecLearn; câu không tìm được thì chuyển thành
   mẫu L6 "trong miền nhưng ngoài corpus" — rất có giá trị cho đo từ chối [Suy luận].
4. **Ghi rõ trong luận văn** số nào đo trên corpus nào.

---

## 4. Thế nào là một bộ dữ liệu đánh giá "chuẩn"

Danh sách kiểm tra, tổng hợp từ cách các benchmark trên được xây và từ các lỗi của chúng:

| # | Tiêu chí | Căn cứ |
|---|---|---|
| 1 | **Gold gắn với corpus và phiên bản corpus cố định** (snapshot, như KILT dùng một snapshot Wikipedia cho mọi tác vụ) | [Nguồn 12] |
| 2 | **Gold không bị thiên lệch theo một retriever**: đánh giá cả đoạn do nhiều hệ khác nhau tìm ra (pooling), nếu không đoạn đúng chưa gán nhãn bị tính là sai | BEIR, TREC-COVID [Nguồn 9] |
| 3 | **Có câu không trả lời được**, gồm cả câu có "đáp án nghe hợp lý" | ViQuAD 2.0, RGB, CRAG, MultiHop-RAG [Nguồn 14-16, 35] |
| 4 | **Có nhãn loại / mức độ khó rõ ràng**, định nghĩa thành văn | CRAG 8 loại, MultiHop-RAG 4 loại, CS-Eval 3 mức [Nguồn 14, 15, 30] |
| 5 | **Định dạng chuẩn** (corpus / queries / qrels kiểu BEIR, hoặc JSONL) để chạy được bằng `ranx` / `ir_measures` | [Nguồn 7-9] |
| 6 | **Kiểm tra chất lượng bởi người**, có số giờ hoặc độ đồng ý được ghi lại | CyberMetric hơn 200 giờ chuyên gia [Nguồn 26]; ARES dùng nhãn người để hiệu chỉnh [Nguồn 23] |
| 7 | **Đủ lớn mỗi nhóm cần báo cáo** để khoảng tin cậy hẹp | Card và cộng sự [Nguồn 42], mục 6 |
| 8 | **Tách dev / test** và không dùng test để chỉnh tham số | [Suy luận]; Card và cộng sự cảnh báo kết quả bị phóng đại khi thiếu sức mạnh thống kê [Nguồn 42] |
| 9 | **Giấy phép rõ ràng** | CyberMetric mâu thuẫn giữa HF và GitHub [Nguồn 26] |
| 10 | **Tài liệu hoá** (dataset card: cách tạo, model đã dùng, phân bố, hạn chế) | Các bộ trên HF có card; bộ OWASP 273 dòng không có card nên khó tin [Nguồn 34] |
| 11 | **Không trùng lặp** (câu gần trùng, câu chép nguyên văn từ tài liệu) | ViQuAD 2.0 có bước bỏ câu hỏi / đáp án trùng [Nguồn 35] |
| 12 | **Phản ánh câu hỏi thật của người dùng** (ngôn ngữ, cách viết không dấu, câu tiếp nối trong hội thoại) | [ERRORS #31, #35], [Suy luận] |

---

## 5. Cách tạo bộ dữ liệu

### 5.1 Quy trình đề xuất

```
snapshot corpus (file + sha256 markdown)
   │
   ├─► chọn đoạn nguồn theo tài liệu / mục (phân tầng theo tài liệu để mọi tài liệu đều có câu)
   │
   ├─► LLM A sinh câu hỏi theo mức (prompt riêng cho từng mức, xem 5.4), trả JSON có trích dẫn nguyên văn
   │      evidence = chuỗi trích nguyên văn từ markdown, không phải chunk id
   │
   ├─► lọc tự động
   │      • trích dẫn có thật trong markdown (so khớp chuỗi sau chuẩn hoá khoảng trắng)
   │      • chồng lấn từ vựng câu hỏi ↔ bằng chứng không quá cao (xem 5.5)
   │      • bỏ trùng (embedding cosine giữa câu hỏi > ngưỡng)
   │      • LLM B (khác họ) trả lời chỉ từ bằng chứng → bỏ câu mà bằng chứng không đủ trả lời
   │
   ├─► người duyệt tập con (≥ 50 câu / mức), 2 người trên ~100 câu → Cohen's κ
   │
   └─► đóng băng: dataset vX.Y + snapshot corpus + cấu hình RAG (env) + commit hash
```

**Công cụ sẵn có**:
- **RAGAS testset generator** dựng knowledge graph từ tài liệu (splitter, extractor thực thể / cụm từ khoá, relationship builder theo chồng lấn
  thực thể, vd. Jaccard), rồi dùng các *query synthesizer*. Có 4 kiểu câu: single-hop specific, single-hop abstract, multi-hop specific,
  multi-hop abstract; mỗi kịch bản gồm nhóm node, độ dài câu (ngắn / vừa / dài), văn phong (web search, chat); persona được ghi là "Coming soon"
  [Nguồn 5]. Phân bố mặc định trong mã nguồn: `SingleHopSpecificQuerySynthesizer`, `MultiHopAbstractQuerySynthesizer`,
  `MultiHopSpecificQuerySynthesizer`, mỗi loại 1/3 (bỏ loại nào không có cụm node phù hợp) [Nguồn 6]. Mỗi mẫu có `user_input`,
  `reference_contexts`, `reference` [Nguồn 5].
  Lưu ý: splitter của RAGAS *khác* `chunkMarkdown`, nên `reference_contexts` không trùng chunk của SecLearn; phải ánh xạ lại bằng văn bản
  (mục 5.2) [Suy luận].
- **LlamaIndex `generate_question_context_pairs(nodes, llm, num_questions_per_chunk=2)`** trả `EmbeddingQAFinetuneDataset` gồm
  `queries`, `relevant_docs`, `corpus`; `RetrieverEvaluator` tính `mrr`, `hit_rate`... [Nguồn 40]. Kiểu này sinh câu hỏi *từ một chunk*, nên
  chỉ cho câu L1 có đúng 1 gold, và gold là chính chunk sinh ra câu → rất dễ thiên lệch từ vựng (mục 5.5).
- **Evol-Instruct** (WizardLM): tăng độ khó bằng 5 phép "in-depth" — thêm ràng buộc, đào sâu, cụ thể hoá, tăng số bước suy luận, làm phức tạp
  đầu vào — và "in-breadth" (sinh câu mới cùng miền, hiếm hơn); bỏ bản tiến hoá không thêm thông tin, bị LLM từ chối, hoặc chép chữ trong prompt
  [Nguồn 41]. Có thể dùng để nâng câu L1 thành L3 / L5, nhưng phải *sinh lại gold* sau khi tiến hoá [Suy luận].
- **Quy trình sinh + lọc của AttackQA**: model nhỏ sinh, model lớn được fine-tune để loại cặp kém [Nguồn 31]. Với SecLearn, bước lọc có thể là
  LLM judge + luật đơn giản [Suy luận].

### 5.2 Gắn gold vào văn bản, không gắn vào chunk id

Bằng chứng từ mã nguồn [Code]:
- `ingest.ts`: mỗi lần nạp (lại) một tài liệu, `prisma.documentChunk.deleteMany({ where: { documentId } })` rồi chèn chunk mới; `id` là
  `cuid()` (`schema.prisma`), nên ID đổi sau mỗi lần nạp. `chunkIndex` cũng đổi khi `CHUNK_SIZE`, `CHUNK_OVERLAP` hay thuật toán cắt đổi
  (đã đổi ở [ERRORS #30], #33).
- `Document.id` cũng là `cuid()`: tải lại cùng file tạo tài liệu mới. Neo theo `filename` / `title` + sha256 của markdown.
- Nội dung chunk **không phải một đoạn liên tục** của markdown: `chunkMarkdown` chèn tiêu đề mục ở đầu chunk, đổi tiêu đề chung chung thành
  "Mục cha — Cons", và chunk liền kề chồng nhau ≤ 80 ký tự. `DocumentChunk` không lưu offset bắt đầu / kết thúc. Vì vậy không thể ánh xạ
  offset ký tự của markdown sang chunk một cách trực tiếp.
- `ingest.ts` có thể **bỏ qua** chunk khi nhúng lỗi (`skipped`, tối đa 5 lỗi liên tiếp): gold có thể không có trong chỉ mục dù có trong tài liệu.

Do đó [Suy luận]:
- `gold_evidence` lưu `{document: filename, doc_sha256, quote: "đoạn trích nguyên văn", char_start, char_end}` trên **markdown** (giống
  `answer_start` của ViQuAD [Nguồn 35]).
- Khi chấm: chuẩn hoá khoảng trắng của cả quote và chunk, coi chunk là liên quan nếu nó chứa ≥ X% số ký tự (hoặc số câu) của quote; mặc định
  đề xuất: chứa trọn quote, hoặc ≥ 50% khi quote dài hơn một chunk. Ghi ngưỡng vào cấu hình đánh giá.
- Trước mỗi lần chạy, kiểm tra "gold coverage": mọi quote phải tìm thấy trong ít nhất một chunk của chỉ mục hiện tại; quote nào mất thì báo lỗi
  dữ liệu, không tính là lỗi retriever.
- Một quote nằm ở 2 chunk (chồng nhau) vẫn là **một** đơn vị bằng chứng (mục 2.1).

### 5.3 Schema JSONL đề xuất

```json
{
  "id": "seclearn-eval-000123",
  "version": "1.0",
  "split": "test",
  "question": "So sánh TOTP, SMS OTP và FIDO2 về khả năng chống phishing",
  "language": "vi",
  "question_style": "accented",
  "turns": [],
  "level": "L4",
  "type": "comparison",
  "compare_cells": [
    {"item": "TOTP", "aspect": "phishing"},
    {"item": "SMS OTP", "aspect": "phishing"},
    {"item": "FIDO2", "aspect": "phishing"}
  ],
  "answerable": true,
  "unanswerable_reason": null,
  "reference_answer": "…",
  "reference_claims": ["TOTP có thể bị lừa nhập trên trang giả", "…"],
  "gold_evidence": [
    {
      "document": "Multifactor_Authentication_Cheat_Sheet.pdf",
      "doc_sha256": "…",
      "quote": "…",
      "char_start": 10234,
      "char_end": 10610,
      "cell": 0,
      "grade": 2
    }
  ],
  "source": {"method": "synthetic", "generator": "model-x", "seed": null, "prompt_version": "gen-L4-v2"},
  "review": {"status": "verified", "annotators": ["a1", "a2"], "notes": ""}
}
```

Giải thích một số trường [Suy luận]:
- `turns`: lịch sử hội thoại cho câu tiếp nối ("ba lỗ hổng đó", [ERRORS #35]); rỗng với câu đơn.
- `question_style`: `accented` / `unaccented` / `mixed_vi_en` — `needsTranslation` coi câu không dấu cũng cần dịch [Code].
- `grade`: 2 = trả lời trực tiếp, 1 = liên quan một phần, để tính nDCG nhiều mức; các độ đo nhị phân dùng ngưỡng `grade ≥ 1` (tham số `rel` của
  ir_measures [Nguồn 7]).
- `reference_claims`: tách sẵn khẳng định để tính answer correctness / context recall kiểu RAGAS mà không phụ thuộc bước tách của judge [Nguồn 3, 4].
- `split`: `dev` (chỉnh tham số) / `test` (chỉ báo cáo).

### 5.4 Thang độ khó và số lượng mục tiêu

Ánh xạ từ các benchmark: CRAG (simple, set, comparison, multi-hop, false premise) [Nguồn 15], MultiHop-RAG (inference, comparison, null)
[Nguồn 14], RAGAS (single / multi-hop × specific / abstract) [Nguồn 5], CS-Eval (knowledge, ability, application) [Nguồn 30], RGB (negative
rejection) [Nguồn 16].

| Mức | Tên | Định nghĩa | Ví dụ | Số gold | Tương ứng | Mục tiêu (silver / gold người duyệt) |
|---|---|---|---|---|---|---|
| L1 | Tra cứu một đoạn | Câu tiếng Việt, đáp án nằm trong 1 đoạn, có thuật ngữ trùng tài liệu | "HttpOnly cookie dùng để làm gì?" | 1 | CRAG simple, RAGAS single-hop specific | 400 / 80 |
| L2 | Diễn đạt lại / xuyên ngôn ngữ | Như L1 nhưng không dùng thuật ngữ của tài liệu, viết không dấu, hoặc dùng từ Việt thay từ Anh | "lam sao de trinh duyet khong cho JS doc cookie dang nhap" | 1 | — (riêng của SecLearn) | 400 / 80 |
| L3 | Nhiều đoạn, một chủ đề | Cần gộp ≥ 2 đoạn (liệt kê, các bước) | "Liệt kê các biện pháp phòng chống CSRF" | 2-5 | CRAG set, RAGAS single-hop abstract | 350 / 70 |
| L4 | So sánh | ≥ 2 thực thể (× khía cạnh), thường khác tài liệu | "So sánh XSS, CSRF và SQLi về cách tấn công và phòng chống" | ≥ số ô | CRAG comparison, MultiHop-RAG comparison, HotpotQA comparison | 350 / 70 |
| L5 | Nhiều bước / tình huống | Suy luận nối 2 bằng chứng, hoặc áp dụng vào tình huống | "Ứng dụng lưu JWT trong localStorage và có lỗi XSS thì rủi ro gì, sửa thế nào?" | 2+ | CRAG multi-hop, MultiHop-RAG inference, CS-Eval application | 300 / 60 |
| L6 | Không trả lời được | (a) ngoài miền ("thời tiết hôm nay"), (b) trong miền nhưng corpus không có, (c) tiền đề sai ("OWASP Top 10 2021 xếp CSRF hạng 1 vì sao?") | — | 0 | RGB negative rejection, CRAG false premise, MultiHop-RAG null, ViQuAD 2.0 | 400 / 80 (a:b:c ≈ 1:2:1) |
| (L7) | Hội thoại | Câu tiếp nối dựa vào lượt trước | "còn cái thứ hai thì sao?" | tuỳ | CANARD / QReCC (xem `COMPARISON_QUESTIONS_RESEARCH.md`) | 200 / 40 (tuỳ chọn) |

Tổng khoảng 2.200-2.400 câu silver và 420-480 câu gold người duyệt [Suy luận]. L6 chiếm khoảng 1/6, gần tỉ lệ null của MultiHop-RAG
(301/2.556 ≈ 12%) [Nguồn 14] nhưng cao hơn vì từ chối sai đã là lỗi lặp lại của SecLearn [ERRORS #32, #34].

Nhãn mức nên được **kiểm chứng sau khi chạy**: nếu một câu "L5" được mọi cấu hình trả lời đúng thì có thể nó chỉ là L1. Báo kết quả theo mức
*đã gán* và kiểm tra độ khó thực nghiệm (tỉ lệ đúng của baseline theo mức phải giảm dần) [Suy luận].

### 5.5 Các kỹ thuật kiểm soát chất lượng

- **Chống thiên lệch từ vựng.** Câu sinh từ một đoạn thường chép thuật ngữ của đoạn đó, làm keyword search và vector search trông tốt hơn thực tế.
  Đo tỉ lệ token câu hỏi xuất hiện trong bằng chứng; với L2 đặt trần (vd. ≤ 30% token nội dung) và yêu cầu LLM "không dùng các từ sau" [Suy luận].
  Hiện tượng gần nhất có nguồn là thiên lệch của nhãn được tạo từ truy xuất từ khoá trong BEIR [Nguồn 9].
- **Dịch sang tiếng Việt.** Sinh thẳng câu tiếng Việt từ tài liệu tiếng Anh thay vì sinh tiếng Anh rồi dịch, để có câu "tự nhiên". VN-MTEB phải
  dùng LLM + embedding để lọc bản dịch kém và giữ nguyên tên riêng, code [Nguồn 38] — cùng yêu cầu khi dịch seed từ SecEval [Suy luận].
- **Câu không trả lời được.** Sinh loại (b) bằng cách lấy chủ đề an ninh có thật nhưng không có trong corpus (đối chiếu danh sách tài liệu), và
  kiểm tra bằng retriever + người rằng corpus thật sự không có. Loại (c) lấy câu L1 rồi đổi một chi tiết thành sai [Suy luận]. Cần thêm "đáp án
  nghe hợp lý" như `plausible_answers` của ViQuAD 2.0 [Nguồn 35].
- **Bỏ trùng.** Bỏ câu có cosine embedding > ngưỡng với câu khác, và giới hạn số câu mỗi tài liệu / mỗi mục để corpus lớn không lấn át [Suy luận].
- **Hướng dẫn gán nhãn** cho người duyệt (1-2 trang): khi nào một đoạn là "liên quan" (grade 2 / 1 / 0), câu nào là tiền đề sai, cách chấm câu
  trả lời một phần đúng (theo thang CRAG Perfect / Acceptable / Missing / Incorrect [Nguồn 15]).
- **Độ đồng ý giữa người gán nhãn**: Cohen's κ = (p_o − p_e) / (1 − p_e), p_o là tỉ lệ đồng ý quan sát, p_e là tỉ lệ đồng ý ngẫu nhiên từ phân bố
  nhãn của mỗi người; có bản weighted (linear / quadratic) cho nhãn có thứ tự như grade 0/1/2 [Nguồn 47]. Ngưỡng diễn giải thường dùng
  (Landis & Koch: 0,61-0,80 "substantial") [Chưa kiểm chứng]. Nếu κ thấp, sửa hướng dẫn rồi gán lại trước khi gán phần còn lại.
- **Pooling khi gán gold chunk**: cho người xem hợp các top-10 từ nhiều cấu hình (vector, keyword, có / không HyDE, có / không dịch) để tránh
  thiên lệch theo một retriever [Nguồn 9, Suy luận].

### 5.6 Chi phí

- **Có nguồn**: CyberMetric dùng hơn 200 giờ chuyên gia để duyệt các bộ 80-10.000 câu trắc nghiệm [Nguồn 26]. Bài báo không cho biết bao nhiêu
  câu được duyệt từng câu một.
- **Ước lượng LLM** [Suy luận]: sinh một câu ≈ 1.000-2.000 token vào (đoạn nguồn + prompt) và 200-400 token ra; lọc bằng LLM thứ hai ≈ chừng ấy
  nữa. 2.500 câu × 2 lời gọi ≈ 5-10 triệu token. Nhân với bảng giá hiện hành của nhà cung cấp; với model giá rẻ, mức này thường dưới vài chục USD.
  Chạy đánh giá: mỗi câu gồm viết lại truy vấn + trả lời + 1-3 lời gọi judge, nên một lượt đo 2.000 câu tốn cỡ vài nghìn lời gọi.
- **Ước lượng người** [Suy luận]: duyệt câu + gold evidence 2-5 phút một mẫu → 450 mẫu ≈ 15-40 giờ; thêm 100 mẫu gán đôi để tính κ.

---

## 6. Cỡ mẫu và ý nghĩa thống kê

**Card và cộng sự (EMNLP 2020)**: nhiều thực nghiệm NLP thiếu sức mạnh thống kê; nhiều test set của GLUE quá nhỏ để so sánh có ý nghĩa với
SOTA; thiết kế đánh giá người thường gặp không phát hiện được khác biệt nhỏ; với dịch máy, test set 2.000 câu cho khoảng 75% sức mạnh để phát
hiện chênh 1 BLEU [Nguồn 42]. Webber, Moffat và Zobel (CIKM 2008): ước lượng phương sai từ thử nghiệm trước có biên sai số rộng; thêm truy vấn
dần dần cho tới khi đạt sức mạnh gây thiên lệch; với cùng công sức, nhiều truy vấn nông tốt hơn ít truy vấn sâu [Nguồn 44, Chưa kiểm chứng].
Sakai có hẳn phương pháp *topic set size design* (chọn số truy vấn tối thiểu theo sức mạnh hoặc độ rộng khoảng tin cậy) [Nguồn 45, Chưa kiểm chứng].
Dror và cộng sự (ACL 2018) cho thấy kiểm định ý nghĩa thường bị bỏ qua hoặc dùng sai trong NLP, và việc chọn kiểm định phụ thuộc tác vụ và độ đo
[Nguồn 43].

**Khoảng tin cậy 95% cho một tỉ lệ** (Hit@5, tỉ lệ từ chối đúng...), xấp xỉ chuẩn ±1,96·√(p(1−p)/n), trường hợp xấu nhất p = 0,5 [Suy luận, tính tay]:

| n mỗi mức | ± (điểm %) |
|---|---|
| 50 | 13,9 |
| 100 | 9,8 |
| 200 | 6,9 |
| 300 | 5,7 |
| 400 | 4,9 |
| 1.000 | 3,1 |

Suy ra [Suy luận]:
- **Báo cáo theo mức** cần khoảng 300-400 câu mỗi mức để khoảng tin cậy hẹp cỡ ±5 điểm; 6 mức → khoảng 2.000 câu. Đây là lý do hợp lý cho "hàng
  nghìn" trong yêu cầu.
- **So sánh hai cấu hình trên cùng bộ câu** (vd. có / không HyDE) là so sánh *ghép cặp*, mạnh hơn nhiều so với hai khoảng tin cậy độc lập: dùng
  McNemar cho độ đo nhị phân (Hit@k, từ chối đúng), và paired bootstrap hoặc permutation (randomization) test cho MRR, nDCG, điểm judge. Có thể
  dùng thẳng các kiểm định có trong `ranx` [Chưa kiểm chứng: trang metrics đã đọc không liệt kê kiểm định].
- **Bộ gold người duyệt 50-80 câu mỗi mức** chỉ đủ để (1) kiểm tra judge với người và (2) ước lượng sai số của bộ silver, không đủ hẹp để làm số
  chính theo mức. Cách ARES dùng prediction-powered inference — điểm judge trên bộ lớn + hiệu chỉnh bằng nhãn người trên bộ nhỏ [Nguồn 23] — là cầu
  nối giữa hai bộ.
- **Bootstrap khoảng tin cậy** cho mọi số trung bình: lấy mẫu lại câu hỏi có hoàn lại 1.000-10.000 lần, lấy phân vị 2,5% và 97,5%.
- **Tính ngẫu nhiên của pipeline**: bước viết lại truy vấn bằng LLM cho kết quả khác nhau giữa các lần chạy (3 lần chạy cho 3/3 và 0/3 với hai câu
  so sánh, xem `COMPARISON_QUESTIONS_RESEARCH.md`). Cần chạy mỗi cấu hình ≥ 3 lần hoặc cố định temperature và báo độ lệch giữa các lần [Suy luận].

---

## 7. Những điều cần biết để tránh sai lầm

### Thiết kế dữ liệu

1. **Gold gắn vào chunk id hoặc chunkIndex.** `ingest.ts` xoá và tạo lại chunk với `cuid()` mới mỗi lần nạp; `chunkIndex` đổi khi đổi thuật toán cắt
   [Code]. Gắn vào `{document, sha256, quote, char_start, char_end}` (mục 5.2).
2. **Gold chỉ lấy từ retriever hiện tại.** Retriever khác tìm được đoạn đúng nhưng chưa gán nhãn sẽ bị tính sai; BEIR ghi nhận nDCG@10 của ANCE tăng
   từ 0,654 lên 0,735 khi đánh giá bổ sung [Nguồn 9]. Dùng pooling nhiều cấu hình.
3. **Thiếu câu không trả lời được.** Hệ luôn trả lời sẽ được điểm cao giả. Các benchmark lớn đều có nhóm này [Nguồn 14-16, 35]. SecLearn có lỗi cả hai
   chiều: gắn [n] vào câu "không đề cập" [ERRORS #32] và nói "không đề cập" khi tài liệu có [ERRORS #34].
4. **Câu hỏi chép từ ngữ của tài liệu.** Làm keyword search (`to_tsvector('english', …)`) [Code] và embedding trông tốt hơn thực tế; người dùng thật
   hỏi tiếng Việt, không dấu. Cần L2 riêng và đo chồng lấn từ vựng (mục 5.5).
5. **Dùng cùng một LLM để sinh câu, trả lời và chấm.** Thiên lệch tự đề cao [Nguồn 25]. Hiện `judge.ts` dùng chính LLM chat (`completeJson`) [Code];
   khi đánh giá, judge nên là model khác họ, và model sinh câu hỏi khác model trả lời.
6. **Nhãn mức độ khó chỉ theo ý người sinh.** Kiểm chứng bằng tỉ lệ đúng thực tế (mục 5.4).
7. **Không tách dev / test, hoặc chỉnh ngưỡng trên test.** SecLearn có nhiều ngưỡng tinh chỉnh tay (`RAG_MIN_RELEVANCE` 0,01, `RAG_MIN_RELEVANCE_EN`
   0,05, `RAG_RELATIVE_MIN` 0,1, `RAG_MIN_KEEP` 2) [Code]. Chỉnh trên `dev`, báo trên `test`; đừng sửa câu test sau khi xem kết quả [Suy luận].
8. **Giấy phép.** NC-SA (SecQA, SecEval, CTIBench, CS-Eval) cho phép phái sinh phi thương mại cùng giấy phép; CyberMetric mâu thuẫn HF / GitHub; bộ OWASP
   273 dòng không có giấy phép [Nguồn 26-30, 34]. Đừng công bố lại bản dịch khi chưa rõ.

### Độ đo và cài đặt

9. **Mẫu số Precision@k khi hệ trả ít hơn k đoạn.** `selectByRelevance` có thể trả 0-5 đoạn [Code]. trec_eval / ir_measures chia cho k, ranx ghi chia
   cho số đoạn đã trả về [Nguồn 7, 8]. Chọn một và ghi rõ; với câu L6, danh sách rỗng là *đúng*, không được tính là 0 điểm.
10. **Chỉ báo MRR.** MRR bỏ qua mọi đoạn đúng sau đoạn đầu [Nguồn 7, 8] và bị Fuhr phê phán về thang đo [Nguồn 46, Chưa kiểm chứng]. Với L3-L5 báo
    Recall@k / nDCG@k; với L4 báo Cell coverage (mục 2.1).
11. **Đếm chunk chồng nhau như nhiều gold.** Một câu bằng chứng nằm trong 2 chunk do `CHUNK_OVERLAP` [Code]; tính Recall trên đơn vị bằng chứng.
12. **Gọi RAGAS context precision là MAP.** Mẫu số khác (mục 2.1) [Nguồn 1].
13. **Đo retrieval ở sai điểm của pipeline.** SecLearn có nhiều tầng: ứng viên vector + keyword (`RAG_CANDIDATES` 20) → rerank → ngưỡng → K cuối →
    `buildContext` cắt theo `CONTEXT_CHAR_LIMIT` 6.000 ký tự [Code]. Đo cả Recall@20 (ứng viên) lẫn Recall@5 (sau rerank) và Recall trong ngữ cảnh
    thật sự đưa cho model, để biết lỗi nằm ở tầng nào [Suy luận].
14. **Khớp từ khoá tiếng Việt.** Chỉ mục keyword dùng cấu hình `'english'` của PostgreSQL [Code]; các độ đo dựa trên token (F1, ROUGE) cho tiếng
    Việt phụ thuộc cách tách từ (âm tiết hay từ ghép). Nếu dùng, ghi rõ bộ tách từ và chuẩn hoá dấu [Suy luận].
15. **Hoà điểm.** Thư viện phá hoà theo ID chứ không theo thứ tự hệ thống [Chưa kiểm chứng]; truyền hạng chứ không truyền điểm thô (mục 2.1).
16. **Coi phát hiện từ chối bằng regex là chân lý.** `isRefusal` chỉ bắt vài mẫu câu và giới hạn 400 ký tự [Code]; RGB báo cả bản khớp chuỗi lẫn bản
    LLM phán [Nguồn 16]. Kiểm tra regex với judge / người trên tập con.
17. **Gold bị mất khỏi chỉ mục.** Chunk có thể bị bỏ khi nhúng lỗi [Code]; chạy kiểm tra "gold coverage" trước mỗi lượt đo (mục 5.2).

### Báo cáo và vận hành

18. **Báo trung bình không có khoảng tin cậy, hoặc so sánh không ghép cặp.** Xem mục 6 [Nguồn 42, 43].
19. **Không phiên bản hoá.** Mỗi kết quả phải gắn: phiên bản dataset, snapshot corpus (sha256), commit, các biến `RAG_*`, `CHUNK_*`, `EMBED_MODEL`,
    URL reranker, model LLM và judge, prompt version [Suy luận]. Không có các thông tin này thì không so sánh được giữa các lần sửa trong `ERRORS.md`.
20. **Judge trôi (drift).** Model judge qua API có thể đổi phiên bản; cố định tên model có ngày phát hành, temperature 0, lưu nguyên văn đầu ra judge, và
    chấm lại một tập neo cố định mỗi lần đổi judge [Suy luận].
21. **Không tính tính ngẫu nhiên của bước viết lại truy vấn.** Chạy lặp và báo độ lệch (mục 6).
22. **Bỏ qua câu hội thoại.** Nhiều lỗi của SecLearn nằm ở tham chiếu ngầm và đánh số câu trong hội thoại dài [ERRORS #27, #35]; bộ chỉ có câu đơn sẽ
    không phát hiện được.
23. **Trộn số của bộ ngoài với số của SecLearn.** Kết quả trên Zalo legal / VN-MTEB là số của embedding / reranker trên corpus khác (mục 3.4).
24. **Quá tin bộ silver.** Bộ tổng hợp có lỗi gold; luôn báo kèm số trên bộ gold người duyệt và độ đồng ý judge–người [Nguồn 23, 25].

---

## 8. Nguồn

### Độ đo và công cụ
1. RAGAS, Context Precision: https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/context_precision/
2. RAGAS, Faithfulness: https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/faithfulness/
3. RAGAS, Context Recall: https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/context_recall/
4. RAGAS, Answer Correctness: https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/answer_correctness/
5. RAGAS, Testset generation for RAG: https://docs.ragas.io/en/stable/concepts/test_data_generation/rag/
6. RAGAS, mã nguồn `default_query_distribution`: https://github.com/explodinggradients/ragas/blob/main/src/ragas/testset/synthesizers/__init__.py
7. ir_measures, Measures: https://ir-measur.es/en/latest/measures.html
8. ranx, Metrics: https://amenra.github.io/ranx/metrics/
9. Thakur, Reimers, Rücklé, Srivastava, Gurevych, 2021. *BEIR: A Heterogenous Benchmark for Zero-shot Evaluation of Information Retrieval Models*.
   https://arxiv.org/abs/2104.08663 (bản HTML đã đọc: https://ar5iv.labs.arxiv.org/html/2104.08663)
10. MS MARCO, trang chính thức: https://microsoft.github.io/msmarco/
11. *Significant Improvements over the State of the Art? A Case Study of the MS MARCO Document Ranking Leaderboard*, 2021. https://arxiv.org/abs/2102.12887
    (tác giả chưa đối chiếu)
12. Petroni và cộng sự, 2020. *KILT: a Benchmark for Knowledge Intensive Language Tasks*. https://arxiv.org/abs/2009.02252
13. Yang và cộng sự, 2018. *HotpotQA*. https://arxiv.org/abs/1809.09600
14. Tang, Yang, 2024. *MultiHop-RAG*. https://arxiv.org/html/2401.15391
15. *CRAG — Comprehensive RAG Benchmark*, 2024. https://arxiv.org/abs/2406.04744 (HTML: https://arxiv.org/html/2406.04744); mã: https://github.com/facebookresearch/CRAG
16. Chen và cộng sự, 2023. *Benchmarking Large Language Models in Retrieval-Augmented Generation* (RGB). https://arxiv.org/abs/2309.01431 (HTML: https://arxiv.org/html/2309.01431)
17. Google, FRAMES benchmark (dataset card): https://huggingface.co/datasets/google/frames-benchmark; bài báo: https://arxiv.org/abs/2409.12941
18. *RAGBench: Explainable Benchmark for Retrieval-Augmented Generation Systems*, 2024. https://arxiv.org/abs/2407.11005; dữ liệu: https://huggingface.co/datasets/rungalileo/ragbench
19. Rajpurkar và cộng sự, 2016. *SQuAD: 100,000+ Questions for Machine Comprehension of Text*. https://arxiv.org/abs/1606.05250
20. Zhang và cộng sự, 2019. *BERTScore*. https://arxiv.org/abs/1904.09675
21. TruLens, The RAG Triad: https://www.trulens.org/getting_started/core_concepts/rag_triad/
22. DeepEval, Contextual Precision: https://deepeval.com/docs/metrics-contextual-precision
23. Saad-Falcon và cộng sự, 2023. *ARES: An Automated Evaluation Framework for Retrieval-Augmented Generation Systems* (NAACL 2024). https://arxiv.org/abs/2311.09476
24. Ru và cộng sự, 2024. *RAGChecker: A Fine-grained Framework for Diagnosing Retrieval-Augmented Generation*. https://arxiv.org/abs/2408.08067
25. Zheng và cộng sự, 2023. *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena*. https://arxiv.org/abs/2306.05685

### Bộ dữ liệu an toàn thông tin
26. CyberMetric: bài báo https://arxiv.org/abs/2402.07688; dataset card https://huggingface.co/datasets/tihanyin/CyberMetric; repo https://github.com/cybermetric/CyberMetric
27. SecQA: https://huggingface.co/datasets/zefang-liu/secqa; bài báo https://arxiv.org/abs/2312.15838
28. CTIBench: bài báo https://arxiv.org/html/2406.07599; dữ liệu https://huggingface.co/datasets/AI4Sec/cti-bench; mã https://github.com/xashru/cti-bench
29. SecEval: https://github.com/XuanwuAI/SecEval
30. CS-Eval: bài báo https://arxiv.org/abs/2411.16239; repo https://github.com/CS-EVAL/CS-Eval
31. AttackQA, 2024: https://arxiv.org/abs/2411.01073
32. SECURE, 2024: https://arxiv.org/abs/2405.20441
33. MMLU, subset `computer_security`: https://huggingface.co/datasets/cais/mmlu/viewer/computer_security
34. shahrukh95/OWASP-question-answer-dataset: https://huggingface.co/datasets/shahrukh95/OWASP-question-answer-dataset

### Bộ dữ liệu tiếng Việt
35. UIT-ViQuAD 2.0: bài báo VLSP 2021 ViMRC https://arxiv.org/abs/2203.11400; bản trên HF https://huggingface.co/datasets/taidng/UIT-ViQuAD2.0
36. ViNewsQA: https://arxiv.org/abs/2006.11138
37. ViMMRC 2.0: https://arxiv.org/abs/2303.18162 [số liệu lấy từ đoạn trích kết quả tìm kiếm, Chưa kiểm chứng]
38. VN-MTEB: https://arxiv.org/abs/2507.21500; tổ chức GreenNode trên HF: https://huggingface.co/GreenNode
39. Zalo AI legal text retrieval (gói MTEB): https://huggingface.co/datasets/GreenNode/zalo-ai-legal-text-retrieval-vn

### Tạo dữ liệu
40. LlamaIndex, Retrieval evaluation: https://developers.llamaindex.ai/python/framework/module_guides/evaluating/usage_pattern_retrieval/
41. Xu và cộng sự, 2023. *WizardLM: Empowering Large Language Models to Follow Complex Instructions* (Evol-Instruct). https://arxiv.org/html/2304.12244

### Thống kê và phương pháp đánh giá
42. Card và cộng sự, 2020. *With Little Power Comes Great Responsibility* (EMNLP). https://aclanthology.org/2020.emnlp-main.745/
43. Dror, Baumer, Shlomov, Reichart, 2018. *The Hitchhiker's Guide to Testing Statistical Significance in Natural Language Processing* (ACL). https://aclanthology.org/P18-1128/
    (chỉ đọc được abstract; bảng chọn kiểm định trong PDF chưa trích được)
44. Webber, Moffat, Zobel, 2008. *Statistical Power in Retrieval Experimentation* (CIKM), DOI 10.1145/1458082.1458158.
    https://people.eng.unimelb.edu.au/ammoffat/abstracts/wmz08cikm.html [Chưa kiểm chứng: nội dung lấy qua kết quả tìm kiếm]
45. Sakai, 2018. *Laboratory Experiments in Information Retrieval* (Springer); Sakai, 2014. *Topic Set Size Design with Variance Estimates from Two-Way ANOVA* (EVIA).
    https://research.nii.ac.jp/ntcir/workshop/OnlineProceedings11/EVIA/abstract_evia.html [Chưa kiểm chứng]
46. Fuhr, 2017. *Some Common Mistakes In IR Evaluation, And How They Can Be Avoided*, SIGIR Forum 51(3). [Chưa kiểm chứng: chỉ thấy qua kết quả tìm kiếm]
47. scikit-learn, `cohen_kappa_score`: https://scikit-learn.org/stable/modules/generated/sklearn.metrics.cohen_kappa_score.html

> Lưu ý: tên tác giả của các bài 12, 13, 16, 19, 20, 23, 24, 41 ghi theo hiểu biết sẵn có, chưa đối chiếu lại trên trang abstract. Các bài 11, 15, 18
> chưa ghi tác giả. Giấy phép hiển thị trên trang arXiv là của *bài báo*, không phải của dữ liệu. Hãy kiểm tra trước khi đưa vào danh mục tài liệu
> tham khảo của luận văn. Không mở được trang ACM của Voorhees & Buckley 2002 (*The effect of topic set size on retrieval experiment error*, HTTP 403),
> nên tài liệu này không dùng bài đó.

### File trong repo
- `src/lib/chunking.ts` (`chunkMarkdown`, `GENERIC_HEADING_RE`, chồng lấn câu)
- `src/lib/ingest.ts` (`deleteMany` rồi chèn chunk mới, bỏ qua chunk lỗi, `to_tsvector('english', …)`)
- `prisma/schema.prisma` (`Document`, `DocumentChunk`: `id @default(cuid())`, không có offset)
- `src/lib/env.ts` (`RAG_TOP_K`, `RAG_CANDIDATES`, `RAG_MIN_RELEVANCE*`, `RAG_RELATIVE_MIN`, `RAG_MIN_KEEP`, `CHUNK_SIZE`, `CHUNK_OVERLAP`)
- `src/lib/rag.ts` (`retrieveChunks`, `CompareCell`, `CONTEXT_CHAR_LIMIT`), `src/lib/rerank.ts` (`selectByRelevance`, `cellsTopK`)
- `src/lib/grounding.ts` (`isRefusal`, `uncitedSentences`), `src/lib/judge.ts` (`judgeSources`)
- `docs/DATA_SOURCES.md` mục 6, `docs/COMPARISON_QUESTIONS_RESEARCH.md`, `docs/ERRORS.md` (#27, #30-#36)
