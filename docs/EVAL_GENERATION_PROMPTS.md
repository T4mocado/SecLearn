# Nghiên cứu: prompt tách khẳng định, sinh câu hỏi và lọc dữ liệu đánh giá — các bài báo và repo đã công bố gì, và bộ prompt đề xuất cho SecLearn

> Ngày lập: 2026-10-18. Phạm vi: (1) tìm **nguyên văn** các prompt / lệnh có cấu trúc mà các bài báo và công cụ đánh giá RAG đã công bố để
> (a) tách câu trả lời / tài liệu thành khẳng định (statement, claim, atomic fact, proposition, key point), (b) sinh câu hỏi + đáp án từ tài liệu,
> (c) lọc, kiểm, phân loại lại và chấm liên quan; (2) ghi rõ prompt nằm ở đâu (file / dòng / phụ lục) và giấy phép; (3) đề xuất bộ prompt cho
> SecLearn theo thang L1-L7. Chỉ nghiên cứu; **không sửa mã nguồn, không sửa dữ liệu**.
>
> Tài liệu này **nối tiếp** `docs/EVAL_DATASET_RESEARCH.md` (gọi tắt **[R]**: độ đo, schema JSONL R §5.3, thang L1-L7 R §5.4) và
> `docs/EVAL_DATASET_CONSTRUCTION.md` (gọi tắt **[C]**: quy trình sinh ~3.400 ứng viên → lọc tự động → phân loại lại mức → người duyệt, C §6;
> tỉ lệ hỏng ~30%, prompt đơn giản cho 95% câu tra cứu một sự kiện, C §1). Những phần đó không nhắc lại.
>
> Quy ước đánh dấu:
> - **[Nguồn n]**: tài liệu chính chủ đã mở và đọc trong lần này (file mã nguồn trên GitHub tải bản raw, PDF / HTML bài báo trên arXiv), link ở mục 8.
>   Số đánh lại từ 1, **không trùng** số nguồn của [R] và [C].
> - **[Code]**: mã nguồn SecLearn trên đĩa ngày lập (`src/lib/llm.ts`, `src/lib/judge.ts`, `src/lib/grounding.ts`, `src/lib/env.ts`, `data/eval/set-a.jsonl`).
> - **[Suy luận]**: đề xuất hoặc đánh giá của người viết, chưa chạy thử. **Mọi prompt ở mục 6 là đề xuất của người viết**, không phải prompt của bài báo nào.
> - **[Chưa kiểm chứng]**: không mở được nguồn chính chủ, hoặc chỉ là hiểu biết sẵn có.
>
> **Cách trích dẫn.** Prompt nằm trong repo có giấy phép mở (Apache-2.0, MIT, CC BY-NC-SA) được trích **nguyên văn** (kèm file, dòng, commit hoặc tag).
> Prompt chỉ in trong bài báo (không có giấy phép mở cho riêng phần đó) hoặc trong repo **không khai giấy phép** thì chỉ **tóm tắt cấu trúc và các quy tắc**
> bằng lời của người viết, cộng tối đa một cụm ngắn trong ngoặc kép, và chỉ rõ bảng / phụ lục để người đọc mở PDF lấy nguyên văn khi cần dẫn trong luận văn.

---

## 1. Trả lời ngắn

**Có, rất nhiều prompt đã được công bố nguyên văn**, nhưng chủ yếu nằm trong **mã nguồn công cụ** (RAGAS, DeepEval, TruLens, RefChecker, ARES,
LlamaIndex, UMBRELA, Hugging Face cookbook) và **phụ lục** một số bài báo (Know Your RAG, MultiHop-RAG, Dense X, AttackQA, RAGEval, UAEval4RAG, InPars).
Các bộ dữ liệu an toàn thông tin (CyberMetric, SecEval) **mô tả** quy trình nhưng **không công bố** prompt sinh câu. CRAG và FreshQA để **người** viết câu
(kể cả câu tiền đề sai), nên không có prompt sinh.

| Nhóm | Công cụ / bài báo | Prompt công bố? | Ở đâu | Giấy phép nơi chứa prompt |
|---|---|---|---|---|
| Tách khẳng định | RAGAS `StatementGeneratorPrompt`, `ClaimDecompositionPrompt`, NLI, TP/FP/FN, context recall | Có, nguyên văn | `src/ragas/metrics/_faithfulness.py`, `_factual_correctness.py`, `_answer_correctness.py`, `_context_recall.py` [Nguồn 1] | Apache-2.0 |
| | FActScore | Có (câu lệnh + demo truy theo BM25) | `factscore/atomic_facts.py` [Nguồn 3] | MIT |
| | SAFE (Long-form factuality) | Có (sửa tham chiếu mơ hồ, xét liên quan, xét hỗ trợ) | `eval/safe/*.py` [Nguồn 4] | Apache-2.0 (phần `third_party/factscore` là MIT) |
| | RefChecker (bộ tách claim của RAGChecker) | Có | `refchecker/extractor/extractor_prompts.py`, `checker/checker_prompts.py` [Nguồn 5] | Apache-2.0 |
| | Dense X Retrieval (proposition) | Có, trong bài báo | Hình 8, Bảng 8 [Nguồn 6] | Bài báo (không kiểm giấy phép arXiv) |
| | DeepEval faithfulness | Có | `deepeval/metrics/faithfulness/templates/generate_claims.txt` [Nguồn 7] | Apache-2.0 |
| | TruLens groundedness | Có | `src/feedback/trulens/feedback/templates/rag.py` [Nguồn 8] | MIT |
| | RAGEval key points | Có | Hình 14-15 [Nguồn 14]; `prompts/keypoint_prompt.jsonl` | CC BY-NC-SA 4.0 (repo) |
| | MultiHop-RAG claim | Có, trong bài báo | Bảng 7 [Nguồn 15] | Repo không khai giấy phép |
| Sinh câu hỏi | HF cookbook "RAG evaluation" | Có | `notebooks/en/rag_evaluation.ipynb` [Nguồn 11] | Apache-2.0 |
| | LlamaIndex `generate_question_context_pairs` / `DatasetGenerator` | Có | `llama_dataset/legacy/embedding.py` (tag v0.12.0), `evaluation/dataset_generation.py` [Nguồn 10] | MIT |
| | ARES | Có (prompt mặc định ngắn) | `ares/synthetic_generator.py` [Nguồn 9] | Apache-2.0 |
| | RAGAS synthesizer (single-hop specific, multi-hop abstract / specific) + persona | Có | `src/ragas/testset/...` [Nguồn 1]; bản cũ v0.1 có "evolution" [Nguồn 2] | Apache-2.0 |
| | DeepEval Synthesizer + 7 kiểu evolution | Có | `deepeval/synthesizer/templates/template.py` [Nguồn 7] | Apache-2.0 |
| | Evol-Instruct (WizardLM) | Có | `Evol_Instruct/depth.py`, `breadth.py` [Nguồn 24] | Repo không có LICENSE gốc; `WizardLM/CODE_LICENSE` là Apache-2.0 |
| | Know Your RAG (khẳng định trước, câu hỏi sau) | Có, trong bài báo | Phụ lục E, G [Nguồn 12] | Bài báo |
| | DataMorgana | Có (template + bảng phân loại) | §3.2, Bảng 1 [Nguồn 13] | Bài báo |
| | RAGEval / DRAGONBall | Có, đủ 8 loại câu | `rageval/qar_generation/prompts/law_en.jsonl` [Nguồn 14] | CC BY-NC-SA 4.0 |
| | MultiHop-RAG (inference / comparison / temporal / null) | Có, trong bài báo | Bảng 8-11 [Nguồn 15] | Repo không khai giấy phép |
| | AttackQA | Có (hàm Python dựng prompt) | Phụ lục A.2.1 [Nguồn 19] | Bài báo |
| | InPars / InPars-v2 / Promptagator | InPars: có (Hình 2); Promptagator: chỉ prompt zero-shot một dòng, few-shot "sẽ công bố" | [Nguồn 20, 21] | Bài báo |
| | UAEval4RAG (câu không trả lời được, 6 loại) | Một phần (định nghĩa, ví dụ, prompt **kiểm**); prompt **sinh** chỉ mô tả | Phụ lục A, Bảng 6-13 [Nguồn 26] | Bài báo |
| | CyberMetric, SecEval | **Không** công bố prompt sinh | §III-B [Nguồn 17]; README [Nguồn 18] | Repo không khai giấy phép |
| | CRAG, FreshQA | Không có prompt sinh (người viết câu) | [Nguồn 16, 25] | — |
| Lọc / chấm | HF cookbook critique (groundedness / relevance / standalone, 1-5) | Có | [Nguồn 11] | Apache-2.0 |
| | Know Your RAG critique + **prompt phân loại loại câu** | Có, trong bài báo | Phụ lục D, I [Nguồn 12] | Bài báo |
| | RAGAS v0.1 `filter_question`, `evolution_elimination`, `answer_formulate` | Có | [Nguồn 2] | Apache-2.0 |
| | ARES / Promptagator round-trip | Thuật toán, không phải prompt | [Nguồn 9, 21] | — |
| | UMBRELA (tái hiện prompt Bing của Thomas và cộng sự) | Có | `qrel_zeroshot_bing.yaml` [Nguồn 22]; Hình 2 [Nguồn 23] | Apache-2.0 |

**Ba điều rút ra quan trọng nhất cho SecLearn** [Suy luận dựa trên các nguồn trên]:

1. **Đảo thứ tự "khẳng định trước, câu hỏi sau"** (Know Your RAG [Nguồn 12], MultiHop-RAG [Nguồn 15], RAGEval với config [Nguồn 14]) là cách đã công bố
   giúp đáp án bám tài liệu và đa dạng loại câu hơn prompt "viết câu hỏi từ đoạn này". Với SecLearn, "khẳng định" chính là **câu trích nguyên văn**
   (`gold_evidence.quote`), nên quote phải được chọn **trước** rồi mới viết câu hỏi.
2. **Không có prompt nào đã công bố tự bảo đảm "loại câu" được tuân thủ.** Mọi pipeline nghiêm túc đều có bước kiểm sau (RAGAS critic, HF critique,
   DataMorgana filtering, MultiHop-RAG GPT-4 kiểm 4 tiêu chí, UAEval4RAG verify, SecEval "answer calibration"). Know Your RAG đo được: kể cả với cách
   "khẳng định trước", câu được yêu cầu là *summary* vẫn bị gán *fact_single* **75%**, câu *reasoning* bị gán *unanswerable* **24%** [Nguồn 12, Hình 2].
3. **Quote nguyên văn chỉ có trong một số ít prompt** (AttackQA: references là văn bản nguyên văn; TruLens: `supporting_evidence` là câu từ SOURCE; RAGEval:
   bước "reference" riêng). Phần lớn prompt sinh câu (RAGAS, LlamaIndex, HF, DataMorgana) **không** đòi bằng chứng, nên SecLearn phải tự thêm yêu cầu này
   và **kiểm bằng máy** (khớp chuỗi trên markdown chuẩn, [C §6 bước 5a]).

---

## 2. Prompt tách khẳng định (statement / claim / atomic fact / proposition)

### 2.1 RAGAS [Nguồn 1]

Repo `explodinggradients/ragas` hiện chuyển hướng sang `vibrantlabsai/ragas` (GitHub API, ngày lập); đọc tại commit `298b682` (2026-02-24), Apache-2.0.
Mỗi prompt là một lớp `PydanticPrompt` gồm `instruction` + schema vào / ra (Pydantic) + ví dụ few-shot; thư viện tự ghép thành prompt yêu cầu JSON.

**(a) Tách câu trả lời thành statement — `StatementGeneratorPrompt`** (`src/ragas/metrics/_faithfulness.py`, dòng 34-37), dùng cho faithfulness và answer correctness:

```text
Given a question and an answer, analyze the complexity of each sentence in the answer. Break down each sentence into one or more fully understandable statements. Ensure that no pronouns are used in any statement. Format the outputs in JSON.
```

Ví dụ kèm theo: câu hỏi về Einstein, câu trả lời dùng "He…", đầu ra 4 statement đều thay "He" bằng "Albert Einstein" (dòng 40-55).

**(b) Kiểm statement với context — `NLIStatementPrompt`** (cùng file, dòng 73-74). Đầu ra mỗi statement: `statement` (nguyên văn), `reason`, `verdict` 0/1.

```text
Your task is to judge the faithfulness of a series of statements based on a given context. For each statement you must return verdict as 1 if the statement can be directly inferred based on the context or 0 if the statement can not be directly inferred based on the context.
```

**(c) Tách claim có điều chỉnh độ nguyên tử / độ phủ — `ClaimDecompositionPrompt`** (`_factual_correctness.py`, dòng 154-160), dùng cho `FactualCorrectness`:

```text
Decompose and break down each of the input sentences into one or more standalone statements. Each statement should be a standalone claim that can be independently verified.
Follow the level of atomicity and coverage as shown in the examples.
```

Điểm thiết kế đáng học: **độ nguyên tử (atomicity) và độ phủ (coverage) không nằm trong lời lệnh mà nằm trong ví dụ**. File có 4 bộ ví dụ
`LOW/HIGH_ATOMICITY × LOW/HIGH_COVERAGE` (dòng 100-152); `__post_init__` chọn bộ ví dụ theo tham số `atomicity`, `coverage` (mặc định `low`, `low`).
Ví dụ với cùng câu về Einstein: high/high cho 3 claim tách riêng ("…German theoretical physicist", "…developed the theory of relativity",
"…contributed to … quantum mechanics"); low/low gộp còn 2 claim.

**(d) Phân loại TP / FP / FN giữa câu trả lời và đáp án chuẩn — `CorrectnessClassifier`** (`_answer_correctness.py`, dòng 54), dùng cho answer correctness:

```text
Given a ground truth and an answer statements, analyze each statement and classify them in one of the following categories: TP (true positive): statements that are present in answer that are also directly supported by the one or more statements in ground truth, FP (false positive): statements present in the answer but not directly supported by any statement in ground truth, FN (false negative): statements found in the ground truth but not present in answer. Each statement can only belong to one of the categories. Provide a reason for each classification.
```

**(e) Context recall — `ContextRecallClassificationPrompt`** (`_context_recall.py`, dòng 45-49): lấy **đáp án chuẩn** làm "answer", hỏi từng câu có quy
được về context truy xuất hay không:

```text
Given a context, and an answer, analyze each sentence in the answer and classify if the sentence can be attributed to the given context or not. Use only 'Yes' (1) or 'No' (0) as a binary classification. Output json with reason.
```

Lưu ý: context recall của RAGAS tách theo **câu** của đáp án chuẩn, không theo claim. Đó là lý do [R §5.3] đề xuất lưu sẵn `reference_claims` để không phụ
thuộc cách tách câu [Suy luận].

### 2.2 FActScore (Min và cộng sự, 2023) [Nguồn 3]

Prompt **không** có lời lệnh tổng quát; nó là chuỗi demo lặp một mẫu cố định (`factscore/atomic_facts.py`, dòng 112-125, MIT):

```text
Please breakdown the following sentence into independent facts: {sentence}
- {fact 1}
- {fact 2}
```

Hàm `get_init_atomic_facts_from_sentence` ghép `n` demo cố định đầu tiên (n = 7 với tiểu sử, 8 với văn bản khác) cộng `k` demo gần nhất theo BM25
(k = 1 với tiểu sử, 0 với văn bản khác), rồi đến câu cần tách (dòng 101-125). Demo nằm trong `demons.json` / `demons_complex.json`.
Bài báo cho biết bước tách dùng InstructGPT và "hiệu quả, gần với người" [Nguồn 3, §4]. Bước kiểm (`factscorer.py`, dòng 216-223) dựng prompt
`"Answer the question about {topic} based on the given context."` + đoạn truy xuất + `"Input: {atom} True or False?\nOutput:"`.

Bài học: **demo được chọn theo độ giống câu đầu vào** (BM25) — cách rẻ để ví dụ khớp miền; SecLearn có thể chọn demo theo tên tài liệu OWASP [Suy luận].

### 2.3 SAFE — Search-Augmented Factuality Evaluator (Wei và cộng sự, 2024) [Nguồn 4]

SAFE dùng lại bước tách của FActScore (`get_atomic_facts.py`), rồi thêm ba prompt (repo `google-deepmind/long-form-factuality`, thư mục `eval/safe`,
Apache-2.0). Đáng giá nhất là **prompt "khử ngữ cảnh"** `_REVISE_FORMAT` (`classify_relevance.py`, dòng 105-129), trích phần quy tắc:

```text
Vague references include but are not limited to:
- Pronouns (e.g., "his", "they", "her")
- Unknown entities (e.g., "this event", "the research", "the invention")
- Non-full names (e.g., "Jeff..." or "Bezos..." when referring to Jeff Bezos)

Instructions:
1. The following STATEMENT has been extracted from the broader context of the given RESPONSE.
2. Modify the STATEMENT by replacing vague references with the proper entities from the RESPONSE that they are referring to.
3. You MUST NOT change any of the factual claims made by the original STATEMENT.
4. You MUST NOT add any additional factual claims to the original STATEMENT. For example, given the response "Titanic is a movie starring Leonardo DiCaprio," the statement "Titanic is a movie" should not be changed.
5. Before giving your revised statement, think step-by-step and show your reasoning. [...]
6. After showing your reasoning, provide the revised statement and wrap it in a markdown code block.
```

Prompt xét hỗ trợ cuối cùng `_FINAL_ANSWER_FORMAT` (`rate_atomic_fact.py`, dòng 51-72) có một điểm khác RAGAS: statement **không cần được nói thẳng**,
chỉ cần "strongly implied by the KNOWLEDGE", và phải suy luận từng bước, trình bày bằng chứng, rồi kết luận `[Supported]` / `[Not Supported]` trong ngoặc
vuông. Số liệu kiểm chứng: SAFE đồng ý với nhãn người của FActScore **72%** trên ~16 nghìn fact; trong 100 ca bất đồng, SAFE đúng **76%**, người đúng **19%**
[Nguồn 4, §4].

### 2.4 RefChecker — bộ tách / kiểm claim mà RAGChecker dùng [Nguồn 5]

`amazon-science/RefChecker` (Apache-2.0), `refchecker/extractor/extractor_prompts.py`, hằng `LLM_CLAIM_EXTRACTION_PROMPT_Q` (dòng 105-123), trích phần tiêu chí:

```text
You are an AI assistant, you can help to extract claims from a model-generated response for a question. In addition, you should attribute the claims to the sentences followed by the sentence ids.
Each claim should satisfy the following criteria:
* A claim is a piece of `knowledge point` in the response.
* A claim should be fine-grained. One claim should not contain more than one pieces of knowledge.
* A claim should be self-contained, it is not dependent on other claims.
* Each claim should truly reflect the meaning to be expressed in the response, and the information in the claim should be complete and unambiguous, and necessary conditions and attributes should not be missed. For example, for the text "Donald Trump won the presidential election in 2016.", the claim "Donald Trump won the presidential election" is a bad claim where it misses necessary information "in 2016", so a complete claim should be "Donald Trump won the presidential election in 2016".
* Some sentence in the response may not contain claims. Some sentence may contain one or more claims. A claim may occur across multiple sentences.
* Opinions, speculations or questions in the text are not claims.
[...]
1. You should first identify whether there are claims in the text. If there are no claims, output "Abstain".
[...]
Please note that this is an EXTRACTION task, so DO NOT care about whether the content of the text is factual or not, just extract the claims from it.
```

Ba ý đáng giữ cho SecLearn: (1) **không được bỏ điều kiện** ("in 2016") — trong an toàn thông tin điều kiện là cốt lõi ("*nếu* không có HttpOnly…");
(2) **gắn claim về số câu** (sentence id) — truy được claim đến câu trích dẫn [n] của SecLearn; (3) **"Abstain"** khi không có claim — khớp với câu
"tài liệu không đề cập" của SecLearn ([Code] `grounding.ts`, quy tắc 2-3). Bộ kiểm `LLM_CHECKING_PROMPT_Q` (`checker_prompts.py`, dòng 32-53) trả đúng
một từ `Entailment` / `Neutral` / `Contradiction` và cấm dùng kiến thức riêng: "Please DO NOT use your own knowledge for the judgement".

RAGChecker **không có prompt sinh câu hỏi riêng**: `scripts/synthesize_benchmark.py` gọi `TestsetGenerator` của **RAGAS v0.1** với phân bố
`simple / multi_context / reasoning / conditional = 0,25` mỗi loại, generator và critic là cùng một model Bedrock (mặc định `meta.llama3-1-70b-instruct-v1:0`)
[Nguồn 5, dòng 32-58].

### 2.5 Dense X Retrieval — proposition (Chen và cộng sự, 2023/EMNLP 2024) [Nguồn 6]

Prompt GPT-4 ở **Hình 8** (phụ lục B "Training the Propositionizer"); dùng để tạo 42 nghìn cặp đoạn → proposition, rồi chưng cất sang Flan-T5-large
(`chentong00/propositionizer-wiki-flan-t5-large`, Apache-2.0 theo repo `chentong0/factoid-wiki`). Tóm tắt 4 quy tắc (bản nguyên văn ở Hình 8):
(1) tách câu ghép thành câu đơn, **giữ nguyên cách diễn đạt của đầu vào khi có thể**; (2) thông tin mô tả đi kèm một thực thể có tên thì tách thành proposition
riêng; (3) **khử ngữ cảnh**: thêm bổ ngữ cần thiết và thay đại từ ("it", "he", "this", "that"…) bằng tên đầy đủ; (4) trả về danh sách chuỗi dạng JSON.
Đầu vào có dạng `Title: … Section: … Content: …` — tức **tiêu đề và mục được đưa vào để khử ngữ cảnh**. Bảng 8 là hướng dẫn gán nhãn chất lượng
proposition (có cần tách thêm không; có tự đứng được không: Yes / Maybe / No). Kết quả kiểm tay 50 đoạn: hầu như mọi proposition đều trung thành, một phần nhỏ
không tự đứng được [Nguồn 6, phụ lục C].

### 2.6 DeepEval [Nguồn 7]

`deepeval/metrics/faithfulness/templates/generate_claims.txt` (Apache-2.0, Jinja). Phần lệnh chính:

```text
Based on the given text, please extract a comprehensive list of FACTUAL, undisputed truths, that can inferred from the provided actual AI output.
These truths, MUST BE COHERENT, and CANNOT be taken out of context.
[...]
Only include claims that are factual, BUT IT DOESN'T MATTER IF THEY ARE FACTUALLY CORRECT. The claims you extract should include the full context it was presented in, NOT cherry picked facts.
You should NOT include any prior knowledge, and take the text at face value when extracting claims.
```

Ví dụ trong template cố ý chứa một sự kiện sai ("in 1968") và vẫn trích ra — minh hoạ "tách, không phán đúng sai", giống RefChecker.

### 2.7 TruLens groundedness [Nguồn 8]

`src/feedback/trulens/feedback/templates/rag.py`, lớp `Groundedness` (dòng 42-102, MIT): tách câu trả lời thành câu (`sentences_splitter_prompt`), rồi chấm
từng câu thang **0-3**. Điểm đáng học là đầu ra **bắt buộc kèm câu bằng chứng**:

```text
SOURCE: {premise}

STATEMENT: {hypothesis}

Respond ONLY with a single-line JSON object having exactly these keys:
  "criteria"             – copy of the STATEMENT verbatim
  "supporting_evidence"  – sentence(s) from SOURCE that support the STATEMENT, or the string NOTHING FOUND or ABSTENTION
  "score"                – an integer 0, 1, 2, or 3
```

Tiêu chí (dòng 45-52) có một quy tắc đặc biệt: câu **thừa nhận không biết** được tính là "abstention" và nhận điểm tối đa — tức không phạt câu
"tài liệu không đề cập" khi chấm groundedness. SecLearn cần quyết định tương tự cho câu "không đề cập" [Suy luận].

### 2.8 RAGEval key points [Nguồn 14]

RAGEval tách **đáp án chuẩn** (không phải câu trả lời của hệ) thành **3-5 key point** bằng prompt in-context (Hình 14; repo `keypoint_prompt.jsonl`):
"Based on the standard answer, you need to summarize the key points necessary to answer the question." Ví dụ cho câu so sánh tách thành 3 key point:
kết luận so sánh + giá trị của từng bên. Chấm bằng Hình 15: mỗi key point là `Relevant` / `Irrelevant` / `Wrong` so với câu trả lời. Đây chính là vai trò
của `reference_claims` trong schema SecLearn; RAGEval xác nhận nên **sinh key point một lần, lưu cùng bộ dữ liệu**, thay vì để judge tách lại mỗi lần chấm.

### 2.9 MultiHop-RAG claim (Tang và Yang, 2024) [Nguồn 15]

Bảng 7: GPT-4 nhận một câu bằng chứng trích từ bài báo, trả về `Claims`, `Claim Target` (một thực thể), `Claim Topic` (một cụm ngắn). Quy tắc: claim không
được chứa tham chiếu mơ hồ (he / she / it), dùng tên đầy đủ, nếu không có claim thì để trống, và "Don't generate the evidence yourself". Claim sau đó được
kiểm khớp với bằng chứng bằng UniEval [Nguồn 15, §3 bước 3]. Target / topic là **cầu nối** (bridge-entity / bridge-topic) để ghép câu nhiều bước (mục 3.11).

### 2.10 So sánh nhanh các thiết kế tách khẳng định

| Đặc điểm | RAGAS | FActScore | SAFE | RefChecker | Dense X | DeepEval | TruLens | RAGEval |
|---|---|---|---|---|---|---|---|---|
| Đơn vị đầu vào | câu trả lời + câu hỏi | từng câu | từng fact + câu trả lời | câu trả lời có id câu | đoạn + tiêu đề / mục | câu trả lời | câu trả lời → câu | đáp án chuẩn |
| Khử đại từ / ngữ cảnh | có ("no pronouns") | qua demo | có, prompt riêng | có ("self-contained") | có (quy tắc 3) | "cannot be taken out of context" | — | — |
| Giữ điều kiện | ngầm | — | không thêm / bớt | **có, nêu rõ** | — | "full context" | — | — |
| Gắn về nguồn | — | — | — | **id câu** | — | — | **câu bằng chứng** | đánh số [n] trong đáp án |
| Điều chỉnh độ mịn | qua ví dụ (atomicity × coverage) | qua demo | — | "fine-grained" | — | — | — | 3-5 điểm |
| Khi không có claim | — | — | — | "Abstain" | — | — | ABSTENTION = điểm tối đa | — |

---

## 3. Prompt sinh câu hỏi từ tài liệu

### 3.1 Prompt "đơn giản" — Hugging Face cookbook (Roucher) [Nguồn 11]

`huggingface/cookbook`, `notebooks/en/rag_evaluation.ipynb`, ô 12 (Apache-2.0). Đây cũng là "simple prompt" mà Know Your RAG dùng làm baseline
(phụ lục E, chỉ đổi đầu ra thành dict JSON) [Nguồn 12]:

```text
Your task is to write a factoid question and an answer given a context.
Your factoid question should be answerable with a specific, concise piece of factual information from the context.
Your factoid question should be formulated in the same style as questions users could ask in a search engine.
This means that your factoid question MUST NOT mention something like "according to the passage" or "context".

Provide your answer as follows:

Output:::
Factoid question: (your factoid question)
Answer: (your answer to the factoid question)

Now here is the context.

Context: {context}
Output:::
```

Notebook khuyên sinh **> 200 mẫu cho ~100 mẫu cuối** vì bước critique (mục 4.1) sẽ loại khoảng một nửa (ô markdown 13). Đây là prompt cho ra
**95% câu fact_single** khi Know Your RAG đo lại [Nguồn 12, §6.2] — tức chỉ phù hợp L1.

### 3.2 LlamaIndex [Nguồn 10]

`generate_question_context_pairs` là tên khác của `generate_qa_embedding_pairs`; prompt mặc định `DEFAULT_QA_GENERATE_PROMPT_TMPL`
(`llama-index-core/llama_index/core/llama_dataset/legacy/embedding.py`, dòng 52-66, tag `v0.12.0`, MIT; file này **không còn** ở nhánh `main` ngày lập):

```text
Context information is below.

---------------------
{context_str}
---------------------

Given the context information and not prior knowledge.
generate only questions based on the below query.

You are a Teacher/ Professor. Your task is to setup {num_questions_per_chunk} questions for an upcoming quiz/examination. The questions should be diverse in nature across the document. Restrict the questions to the context information provided."
```

`DatasetGenerator` (`evaluation/dataset_generation.py`, nhánh `main`, dòng 37-44 và 155-159) dùng gần như cùng nội dung, tách thành template ngữ cảnh
và `question_gen_query`. Nhược điểm [Suy luận]: vai "Teacher/Professor … quiz" sinh câu kiểu đề thi chứ không kiểu người dùng chatbot; không có đáp án,
không có bằng chứng; nhiều câu / lần gọi dễ trùng.

### 3.3 ARES [Nguồn 9]

Prompt mặc định (`ares/synthetic_generator.py`, dòng 32-40, Apache-2.0) rất ngắn, phần lớn chất lượng đến từ **few-shot trong miền** và **lọc round-trip**:

```text
You are an expert question-answering system. You must create a question for the provided document. The question must be answerable within the context of the document.
```

```text
You are an expert question-answering system. You must create an answer for the provided question. The answer must be answerable within the context of the document. Provide the answer alone without any additional text or formatting.
```

`LLM_Synthetic_Generation.py` ghép prompt + các ví dụ `Example n: / Document: / Question: / Answer:` + tài liệu (cắt ở ~4.096 ký tự), và có prompt sinh
**câu trả lời mâu thuẫn** (`Incorrect Answer:`) để làm mẫu âm (dòng 452-482). Lọc: `Filter_Synthetic_Queries.py`, dòng 83-123 — nhúng câu hỏi, truy xuất
top-20, **chỉ giữ nếu tài liệu top-1 đúng là tài liệu sinh ra câu** (bài báo §3.1 gọi đây là cách đã dùng ở Promptagator) [Nguồn 9].

### 3.4 InPars, InPars-v2, Promptagator — sinh truy vấn cho truy xuất [Nguồn 20, 21]

- **InPars** (Hình 2): prompt "Vanilla" là 3 cặp `Document: … / Relevant Query: …` lấy ngẫu nhiên từ MS MARCO rồi đến `Document: {document_text}` /
  `Relevant Query:`. Prompt "GBQ" (Guided by Bad Questions) đổi thành cặp `Good Question:` / `Bad Question:` — câu MS MARCO gốc làm câu *xấu*, câu viết tay
  cụ thể hơn làm câu *tốt*, để model sinh câu bám ngữ cảnh hơn. Giải mã tham lam (temperature 0); thử sampling 1,0 và top-p 0,95 không khác đáng kể; giữ
  **top 10.000 / 100.000** cặp theo xác suất sinh truy vấn [Nguồn 20].
- **InPars-v2**: GPT-J-6B, prompt GBQ, greedy; thay lọc theo xác suất bằng **điểm reranker monoT5-3B**, giữ top 10.000 [Nguồn 20b].
- **Promptagator** (§3.1-3.2, §4): prompt few-shot dạng `(e_doc(d1), e_query(q1), …, e_doc(dk), e_query(qk), e_doc(d))` với mô tả theo nhiệm vụ (vd.
  ArguAna: `Argument:{d}` / `Counter Argument:{q}`); bản zero-shot là một dòng `f'{d} Read the passage and generate a query.'`; sampling **temperature 0,7**;
  lọc round-trip giữ cặp chỉ khi tài liệu gốc xếp **top-1** (K = 1 tốt nhất). Bài báo nói prompt few-shot "will be released" — **không tìm thấy bản công bố**
  trong lần này [Chưa kiểm chứng] [Nguồn 21].

Bài học [Suy luận]: ý "câu tốt / câu xấu" của GBQ dùng được cho L2 (đưa ví dụ câu *xấu* là câu chép thuật ngữ tài liệu). Nhưng lọc round-trip là cho **dữ liệu
huấn luyện**; với **bộ đánh giá**, giữ chỉ câu mà retriever đã tìm đúng top-1 sẽ **loại đúng những câu khó** mà L2 / L4 / L5 muốn đo (xem 4.4).

### 3.5 RAGAS testset synthesizers [Nguồn 1, 2]

**Bản hiện tại** (`src/ragas/testset/synthesizers/`). `default_query_distribution` gồm 3 synthesizer: `SingleHopSpecificQuerySynthesizer`,
`MultiHopAbstractQuerySynthesizer`, `MultiHopSpecificQuerySynthesizer` (`__init__.py`, dòng 24-34). Mỗi kịch bản là tổ hợp (node, term / themes, **persona**,
**query_style**, **query_length**). `QueryStyle` = `MISSPELLED`, `PERFECT_GRAMMAR`, `POOR_GRAMMAR`, `WEB_SEARCH_LIKE`; `QueryLength` = `LONG`, `MEDIUM`,
`SHORT` (`base.py`, dòng 34-47).

Single-hop (`single_hop/prompts.py`, dòng 23-37):

```text
Generate a single-hop query and answer based on the specified conditions (persona, term, style, length) and the provided context. Ensure the answer is entirely faithful to the context, using only the information directly from the provided context.### Instructions:
1. **Generate a Query**: Based on the context, persona, term, style, and length, create a question that aligns with the persona's perspective and incorporates the term.
2. **Generate an Answer**: Using only the content from the provided context, construct a detailed answer to the query. Do not add any information not included in or inferable from the context.
3. **Additional Context** (if provided): If llm_context is provided, use it as guidance for what type of question to generate (e.g., comparison questions, how-to questions, application-based questions) and how to structure the answer accordingly. Still ensure the content comes only from the provided context.
```

(Chuỗi gốc thiếu khoảng trắng trước `### Instructions:` vì nối chuỗi Python — giữ nguyên.)

Multi-hop (`multi_hop/prompts.py`, dòng 71-92): các đoạn được gắn nhãn `<1-hop>`, `<2-hop>`…; quy tắc chính "Ensure the query uses information from at least two
segments and connects them meaningfully." Bản *abstract* ghép đoạn theo `summary_similarity` và dùng `themes`; bản *specific* ghép theo `entities_overlap`
(`multi_hop/abstract.py` dòng 35-37, `specific.py` dòng 33-35). Prompt `ConceptCombinationPrompt` (dòng 23-33) ghép khái niệm từ **ít nhất hai** node.
Persona sinh từ tóm tắt tài liệu (`persona.py`, dòng 31-35: "generate a single persona who would likely interact with or benefit from the content") và được
ghép với theme bằng `ThemesPersonasMatchingPrompt` (`synthesizers/prompts.py`). Node được chấm "khả năng sinh câu" 1-5 trước khi dùng
(`transforms/filters.py`, dòng 46-48: "score the content of the node in 1 to 5 range").

**Bản cũ v0.1.21** (`src/ragas/testset/prompts.py`, tag `v0.1.21`) dùng "evolution": sinh câu hạt giống rồi **viết lại cho khó hơn**. Đây là nơi có các quy tắc cụ
thể nhất về độ khó; ví dụ `reasoning_question_prompt` (dòng 15-23):

```text
Complicate the given question by rewriting question into a multi-hop reasoning question based on the provided context.
    Answering the question should require the reader to make multiple logical connections or inferences using the information available in given context.
    Rules to follow when rewriting question:
    1. Ensure that the rewritten question can be answered entirely from the information present in the contexts.
    2. Do not frame questions that contains more than 15 words. Use abbreviation wherever possible.
    3. Make sure the question is clear and unambiguous.
    4. phrases like 'based on the provided context','according to the context',etc are not allowed to appear in the question.
```

Cùng file: `multi_context_question_prompt` (dòng 43-55: "requires information derived from both context1 and context2"), `conditional_question_prompt` (dòng 73-82:
"introducing a conditional element", ≤ 25 từ), `compress_question_prompt` (dòng 100-102: "more indirect and shorter"), `conversational_question_prompt`
(dòng 120-122: tách thành **hai câu hỏi nối tiếp như hội thoại**), `seed_question_prompt` (dòng 217-219), `keyphrase_extraction_prompt` (dòng 185-187).
Các prompt lọc của bản này ở mục 4.2.

### 3.6 DeepEval Synthesizer [Nguồn 7]

`deepeval/synthesizer/templates/template.py` (Apache-2.0). `EvolutionTemplate.base_instruction` (dòng 718-720):

```text
I want you to act as an input rewriter.
    Your object is the rewrite a given `input` and must be factually correct according to the supporting information in `Context`.
    You MUST complicate the given `Input` using the following method:
```

Có 7 phương pháp: `multi_context`, `reasoning`, `concretizing`, `constrained`, `comparative_question`, `hypothetical_scenario`, `in_breadth` (dòng 723-1016).
Ví dụ `comparative_question_evolution` (dòng 918-930): "Rewrite `Input` to focus on comparing two or more entities, concepts, or processes. … should encourage a
detailed comparison that highlights similarities and differences. … must be fully answerable from information in `Context`. … should not contain more than 15 words."
`generate_synthetic_inputs` (dòng 110-140) có tham số `scenario`, `task`, `input_format`, và khi có nhiều file nguồn thì đòi mỗi input "MUST meaningfully combine
information from at least {target_files_per_context} different source files".

### 3.7 Evol-Instruct (WizardLM) — làm câu khó dần [Nguồn 24]

`nlpxucan/WizardLM`, `Evol_Instruct/depth.py` (dòng 1-8; mã của repo theo `WizardLM/CODE_LICENSE` Apache-2.0, repo gốc không có LICENSE chung):

```text
I want you act as a Prompt Rewriter.
Your objective is to rewrite a given prompt into a more complex version to make those famous AI systems (e.g., chatgpt and GPT4) a bit harder to handle.
But the rewritten prompt must be reasonable and must be understood and responded by humans.
[...]
You SHOULD complicate the given prompt using the following method:
{}
You should try your best not to make the #Rewritten Prompt# become verbose, #Rewritten Prompt# can only add 10 to 20 words into #The Given Prompt#.
'#The Given Prompt#', '#Rewritten Prompt#', 'given prompt' and 'rewritten prompt' are not allowed to appear in #Rewritten Prompt#
```

Bốn phương pháp "in-depth": thêm ràng buộc (`createConstraintsPrompt`), đào sâu (`createDeepenPrompt`), cụ thể hoá (`createConcretizingPrompt`: "replace general concepts
with more specific concepts"), đòi suy luận nhiều bước (`createReasoningPrompt`). "In-breadth" (`breadth.py`) tạo prompt mới cùng miền nhưng "even more rare".
**Elimination evolving** (bài báo §3.2) loại 4 kiểu hỏng: không tăng thông tin so với bản gốc (ChatGPT phán), câu trả lời chứa "sorry" và ngắn (< 80 từ),
câu trả lời chỉ có dấu câu / stop word, câu tiến hoá **chép chữ của prompt** ("given prompt", "#Rewritten Prompt#"…). RAGAS v0.1 và DeepEval rõ ràng dựa vào
khuôn này (cùng kiểu "rewrite to complicate", giới hạn số từ, cấm cụm "according to the context") [Suy luận].

Cảnh báo [Suy luận]: Evol-Instruct làm khó **lời lệnh** cho model, không đảm bảo câu vẫn **trả lời được từ tài liệu**; với RAG, mỗi bước tiến hoá phải kiểm lại
groundedness (RAGAS v0.1 làm vậy bằng critic ở mỗi bước, và Know Your RAG nói chính điều này làm chi phí tăng mạnh [Nguồn 12, §6]).

### 3.8 Know Your RAG — "khẳng định trước, câu hỏi sau" (de Lima và cộng sự, 2024) [Nguồn 12]

Pipeline (§6, phụ lục G, model Llama-3-70b): (G.1) tóm **chủ đề** (theme) của đoạn trong vài từ; (G.2) trích **tối đa 5 khẳng định sự kiện**; (G.3) gộp thành
**3 khẳng định tóm tắt**; (G.4) suy ra **3 kết luận suy luận**; (G.5) chọn ngẫu nhiên một khẳng định và sinh **một** câu hỏi "chỉ được trả lời bởi khẳng định đó".
Tóm tắt quy tắc (nguyên văn ở phụ lục G):

- G.2 sự kiện: mỗi khẳng định chứa **một** đơn vị thông tin; viết như câu trả lời cho câu hỏi sự kiện; hiểu được mà không cần nguồn khác; có thông tin ngữ cảnh
  lấy từ theme; chỉ chứa thông tin có trong đoạn và theme; độc lập với nhau. Đầu ra danh sách `> Statement`.
- G.3 tóm tắt: mỗi khẳng định tóm tắt gộp thông tin của **nhiều hơn một câu**; độc lập, không chồng lấn; câu hoàn chỉnh; tự hiểu được.
- G.4 suy luận: "reasoning conclusion" là thông tin **suy ra** khi phân tích nhiều khẳng định, **không** chứa thông tin có sẵn trực tiếp trong khẳng định nào.
- G.5 câu hỏi: dùng theme để tránh câu chung chung; ngắn, kiểu người dùng hỏi máy tìm kiếm; chỉ in ra câu hỏi.

Phụ lục F giải thích vì sao có theme: không có theme thì câu hỏi kiểu tài liệu đơn ("What's the city's population?"); có theme thì câu cụ thể kiểu kho nhiều tài
liệu ("What is the population of Paris?"). SecLearn là kho nhiều tài liệu → **cần theme** (tên cheat sheet + mục) [Suy luận].

Kết quả cần biết (Hình 2): với "khẳng định trước", yêu cầu *fact_single* → nhãn *fact_single* 87%; yêu cầu *summary* → 75% vẫn bị gán *fact_single*;
yêu cầu *reasoning* → 38% *reasoning*, 29% *fact_single*, **24% *unanswerable***. Tác giả giải thích: model gán nhãn thích *fact_single*, và **không phải đoạn
nào cũng đủ chất liệu** cho câu tóm tắt / suy luận. → SecLearn phải **chọn đoạn phù hợp cho từng mức** trước khi sinh (mục 6.2), và chấp nhận loại nhiều ở L5.

### 3.9 DataMorgana (Filice và cộng sự, 2025) [Nguồn 13]

Cấu hình JSON gồm nhiều **phân loại** (categorization), mỗi phân loại có các **loại loại trừ nhau** kèm `description` (chèn nguyên văn vào prompt) và
`probability`. Mỗi lần gọi: rút một loại cho mỗi phân loại (người dùng × câu hỏi), rút một tài liệu, sinh **k = 3** cặp ứng viên, lọc rồi chọn một
(§3.2). Template (§3.2) — tóm tắt: model là "user simulator", sinh N câu hỏi về **sự kiện trong tài liệu**; người dùng và người đọc **không có tài liệu**,
nên **không bao giờ** nhắc tác giả hay tài liệu; mỗi câu được đọc độc lập; trả mỗi cặp một dòng JSON `{"question": …, "answer": …}`; sau đó là hai danh sách
"They must be [mô tả loại người dùng]" và "It must be [mô tả loại câu hỏi]".

Bảng 1 — bốn phân loại câu hỏi dùng chung: **Factuality** (factoid / open-ended), **Premise** (direct / with-premise: mở đầu bằng tiền đề ngắn về bản thân người
dùng), **Phrasing** (concise-and-natural < 10 từ / verbose-and-natural > 9 từ / short-search-query < 7 từ / long-search-query > 6 từ), **Linguistic variation**
(similar-to-document: dùng cùng thuật ngữ / **distant-from-document: dùng từ hoàn toàn khác tài liệu**). Phân loại người dùng mặc định: expert / novice
("a regular user with no understanding of specialized terms").

Điểm quan trọng: DataMorgana ghi rõ bản đầu **không ép tính nhất quán giữa các loại** (chú thích 1) và lọc kiểm "context-free", đúng loại, trung thành tài
liệu — nhưng **không công bố prompt lọc**. Nghiên cứu ablation cho thấy cải thiện đa dạng chủ yếu đến từ **phân loại câu hỏi**, phân loại người dùng đóng góp
nhỏ (§5). Kiểm tay ~200 câu do Claude-3.5-Sonnet sinh: "close to perfect" về chất lượng chữ và liên quan (§4).

### 3.10 RAGEval / DRAGONBall (Zhu và cộng sự, 2024) [Nguồn 14]

Pipeline (Hình 2): tài liệu mẫu → **schema** → **config** (điền giá trị sự kiện) → **sinh tài liệu** → sinh **Question-Reference-Answer** từ config + tài liệu.
Bảy loại câu (§3.3, Bảng 13): Factual, Multi-hop Reasoning, Summarization, Multi-document Information Integration, Multi-document Comparison (gồm Numerical
Comparison, Temporal Sequence), Unanswerable. Repo `OpenBMB/RAGEval` có **đủ prompt** (`rageval/qar_generation/prompts/law_en.jsonl`, giấy phép repo
**CC BY-NC-SA 4.0**), mỗi dòng là `{prompt_type, system_prompt, user_prompt}`. Trích phần quy tắc của loại so sánh (dòng 5 của file, `Multi-document Comparison
Question`):

```text
Multi-document comparison questions require comparing relevant data and the sequence of events from the two configs provided to deeply understand the similarities and differences between the two cases. Please follow these steps to construct multi-document comparison questions:

1. Identify common points: Analyze the outlines and identify data points that can be compared, giving one keyword for each common point.
2. Construct the question: When designing the question, ensure that the answer requires synthesizing multiple parts of the configs. The question should be clear, precise, and unambiguous. The indicators or times in the question must be comparable and not a simple combination of two separate questions. The question should start with "According to the judgment of xx court and xx court".
3. Generate the answer: Based on the common points and the question, generate the answer. Ensure that the answer requires gathering and integrating information fragments from the configs. The answer should be logically clear and fluent.
```

Các loại còn lại cùng khuôn "định nghĩa → các bước → ví dụ JSON → `Output in JSON array format`": Factual (lọc cặp key-value ra được đáp án ngắn; nếu giá trị
tóm lại vẫn là một câu thì **bỏ**), Multi-hop (chọn **điểm đầu, điểm cuối, các bước trung gian**, ghi cả ba vào JSON), Irrelevant Unsolvable (câu dùng đúng tên
thực thể trong tài liệu nhưng hỏi điều tài liệu không có; `"ref": [""]`, `"answer": "Unable to answer."`). Bước **"single document reference"** riêng (dòng 6):
tìm **mọi** đoạn nguồn cho từng cặp hỏi-đáp, rồi **sửa đáp án**: thêm điều có trong reference mà đáp án thiếu, xoá điều đáp án có mà không tìm được reference.

Lưu ý giấy phép [Suy luận]: CC BY-NC-SA cho phép dùng phi thương mại (luận văn) có ghi công; prompt SecLearn **phỏng theo** sát văn bản RAGEval có thể bị coi là
tác phẩm phái sinh phải cùng giấy phép — an toàn nhất là viết lại bằng lời mình (như mục 6) và ghi "lấy ý tưởng từ".

### 3.11 MultiHop-RAG (Tang và Yang, 2024) [Nguồn 15]

Phụ lục A (Bảng 8-11), GPT-4, đầu vào là **tập 2-4 claim cùng bridge-entity / bridge-topic** (§3 bước 4). Tóm tắt (repo `yixuantt/MultiHop-RAG` không khai giấy phép):

- **Inference** (Bảng 8): tìm mối nối giữa các claim (chính là `<target>`); viết câu **không trả lời được nếu chỉ dựa vào một câu**, phải hiểu và nối thông tin
  của mọi nguồn; đáp án là `<target>`; mạch lạc, không mơ hồ; dùng bộ từ khoá `<key set>`.
- **Comparison** (Bảng 9): so sánh các yếu tố sự kiện **nêu rõ** trong claim từ các nguồn khác nhau; đáp án là tính từ so sánh, một câu khẳng định đồng ý, hoặc
  có / không.
- **Temporal** (Bảng 10): so sánh tính nhất quán hoặc trình tự đưa tin ở nhiều thời điểm; đáp án một từ.
- **Null** (Bảng 11 + §3): dùng **thực thể không có** trong tập bridge-entity và cả **nguồn tin hư cấu**; đáp án là "insufficient information".
- **Kiểm chất lượng** (§3 bước 5): người duyệt một mẫu con; GPT-4 kiểm mỗi mẫu theo 4 tiêu chí — dùng **mọi** bằng chứng, trả lời được **chỉ** từ bằng chứng, đáp án
  là một từ / thực thể, **đúng loại câu** đã định.

### 3.12 AttackQA (Badrinath Krishna, 2024) — miền an toàn thông tin [Nguồn 19]

Phụ lục A.2.1: hàm `get_prompt_for_doc(doc, count="three sets")`, Llama 3 8B Instruct, sinh tối đa 3 bộ `{question, thought, answer, references}` mỗi lần gọi.
Tóm tắt quy tắc: đáp án tránh từ không cụ thể ("many", "several", "few"); câu cụ thể, đầy đủ, tự đứng, đúng ngữ pháp, trả lời toàn diện; **chỉ** dùng nội dung
tài liệu; `thought` mở đầu bằng "To answer the question, I need"; `references` là "verbatim text from document that supports the answer"; ký tự đầu phải là
`[` và cuối là `]`. JSON hợp lệ 99% dù API không ép JSON. Lọc: G-Eval của DeepEval với **tiêu chí riêng cho câu hỏi** (mơ hồ, không bám chủ đề cụ thể của ngữ
cảnh, nói về chủ đề không có trong ngữ cảnh, quá rộng đến mức trả lời được bằng kiến thức ngoài) và **cho đáp án** (lạc đề, không dẫn nội dung liên quan, thiếu
đầy đủ, mơ hồ, chứa thông tin ngoài ngữ cảnh), thang 0-10 chia 10 (§3.5.1). Chỉ 30% cặp do LLM sinh; 70% còn lại sinh bằng **heuristic** từ quan hệ MITRE
ATT&CK (§3.4).

### 3.13 CyberMetric, SecEval — mô tả, không công bố prompt [Nguồn 17, 18]

- **CyberMetric** (§III-B): chia tài liệu thành khối 8.000 token, GPT-3.5-turbo sinh **10 câu trắc nghiệm / khối**; Falcon-180B duyệt lỗi ngữ pháp / ngữ nghĩa
  (loại 1,7%); người > 30 giờ loại thêm 2,3%. Bài báo **không in prompt**; repo `cybermetric/CyberMetric` chỉ có dữ liệu JSON, `CyberMetric_evaluator.py`, README.
- **SecEval** (README §Generation Process): tách theo cấu trúc (chương / mục; tactic / technique của ATT&CK) → GPT-4 sinh trắc nghiệm → **GPT-4 tự lọc** câu quá dễ
  hoặc không tự đứng (sửa nếu được, không thì bỏ) → **"answer calibration"**: đưa câu + văn bản nguồn cho GPT-4 trả lời lại; **lệch đáp án đã định thì bỏ** → phân
  9 chủ đề. Prompt **không công bố** (repo không có thư mục prompt; không khai giấy phép qua GitHub API) [Nguồn 18].

### 3.14 Câu do người viết: CRAG, FreshQA, MuSiQue

- **CRAG**: phần web do **người** viết câu (A.1.3); phần KG từ **600+ template** điền thực thể (§3.1, A.1.2). Câu tiền đề sai cũng do người viết và được
  người duyệt lại ("a wrong false-premise question" là một loại lỗi bị sửa, A.1.4). Phía **trả lời**, prompt baseline dặn: "If the question contains a false
  premise or assumption, answer “invalid question”." (A.3.1) [Nguồn 16].
- **FreshQA** (§2): người viết câu ở 4 loại, mỗi loại hai mức one-hop / multi-hop; với câu **tiền đề sai**, người viết phải kèm **giải thích ngắn vì sao câu sai**
  (chú thích 4) [Nguồn 25]. → Trường giải thích này nên có trong schema SecLearn (mục 6.3, L6c).
- **MuSiQue**: ghép câu đơn bước bằng máy rồi người viết lại; không có prompt LLM (2021) — chi tiết ở [C §2.1].

### 3.15 Câu không trả lời được — UAEval4RAG (Peng và cộng sự, ACL 2025) [Nguồn 26]

Sáu loại (Bảng 6): **Underspecified** (thiếu thông tin cốt yếu, vd. "Is a pet allowed?"), **False-presupposition** (giả định sai), **Nonsensical** (lỗi gõ, rào
cản ngôn ngữ, phi logic), **Modality-limited** (đòi định dạng vào / ra hệ không hỗ trợ), **Safety-concerned**, **Out-of-Database** (liên quan kho nhưng kho không
có đáp án). Cách sinh (§3.2):

- 5 loại đầu: chọn ngẫu nhiên một chunk → LLM sinh **một** câu không trả lời được **kèm giải thích vì sao thuộc loại đó** (dựa trên định nghĩa + ví dụ in-context)
  → đưa câu + giải thích + ví dụ cho LLM **kiểm lại**; chỉ giữ câu qua kiểm. Prompt **kiểm** loại underspecified in nguyên ở Bảng 8 (verdict `1` / `-1` kèm
  explanation); prompt **sinh** chỉ được mô tả, không in nguyên.
- Out-of-Database: trích 3-5 key phrase từ kho (Bảng 9) → tìm **tin mới** liên quan → sinh cặp hỏi-đáp từ tin → truy xuất 6 chunk gần nhất trong kho, hỏi lại
  với các chunk đó, so với đáp án từ tin bằng prompt `answer_verification` (Bảng 10); **chỉ khi các chunk không cho ra đáp án** mới xếp là out-of-database.
- Bài báo xếp underspecified là "khó", false-presupposition và out-of-database là "dễ" (§3.1, §5).

---

## 4. Prompt lọc, kiểm và chấm

### 4.1 Critique 1-5 của Hugging Face cookbook [Nguồn 11]

Ô 17 của notebook (Apache-2.0) có 3 prompt, cùng khung "Answer::: / Evaluation: (rationale) / Total rating: (1-5)" — **lý do viết trước điểm**:

- `question_groundedness_critique_prompt`: "how well one can answer the given question unambiguously with the given context" (1 = không trả lời được, 5 = rõ ràng,
  không mơ hồ).
- `question_relevance_critique_prompt`: hữu ích thế nào với **nhóm người dùng đích** (bản gốc: "machine learning developers building NLP applications with the
  Hugging Face ecosystem") — phải thay bằng người học an toàn web.
- `question_standalone_critique_prompt`: độc lập ngữ cảnh; nhắc "in the context" / "in the document" thì phải là 1; thuật ngữ / viết tắt khó vẫn có thể là 5 "it
  must simply be clear to an operator with access to documentation what the question is about".

Ngưỡng giữ (ô 20): **cả ba điểm ≥ 4**. Notebook dẫn nguồn tiêu chí là arXiv 2312.10003 (ô markdown 16) [Chưa kiểm chứng: chưa mở bài đó].

### 4.2 RAGAS v0.1: lọc câu, loại tiến hoá hỏng, kiểm trả lời được [Nguồn 2]

`src/ragas/testset/prompts.py`, tag `v0.1.21` (Apache-2.0):

- `filter_question_prompt` (dòng 390-399): hai tiêu chí **Independence** (tự đứng, không dựa vào tài liệu / bảng không được cung cấp) và **Clear Intent**; verdict 1/0
  kèm feedback gợi ý sửa. Nếu không đạt, `question_rewrite_prompt` (dòng 304-306) viết lại câu theo feedback.
- `evolution_elimination_prompt` (dòng 453-459), dùng để **phát hiện tiến hoá thất bại / trùng**:

  ```text
  Check if the given two questions are equal based on following requirements:
      1. They have same constraints and requirements.
      2. They have same depth and breadth of the inquiry.
      Output verdict as 1 if they are equal and 0 if they are not
  ```
- `question_answer_prompt` (dòng 143-146): "Answer the question using the information from the given context. Output verdict as '1' if answer is present '-1' if answer
  is not present in the context." — tức **trả lời lại từ context để kiểm trả lời được**.
- `context_scoring_prompt` (dòng 351-362): chấm **đoạn nguồn** 1-3 theo clarity / depth / structure / relevance trước khi sinh (đoạn kém thì bỏ).

### 4.3 Know Your RAG: critique 4 tiêu chí và **prompt phân loại loại câu** [Nguồn 12]

Phụ lục I (phỏng theo cookbook): `q_to_c_groundedness`, `a_to_c_groundedness` (các khẳng định của **đáp án** suy được từ context đến đâu), `q_feasibility` (từ câu hỏi
có **tìm lại** được đoạn này trong cả kho không — tức độ cụ thể), `stand_alone`; đều 1-5, đầu ra dict `{"evaluation": …, "rating": …}`.

Phụ lục D — **prompt gán nhãn loại câu** (dùng để phát hiện lệch loại; đây là tiền thân trực tiếp của bộ phân loại lại mức L1-L7, mục 6.5). Tóm tắt: đưa context và
câu hỏi; chọn **đúng một** nhãn trong danh sách — `fact_single` (đáp án đầy đủ **nêu thẳng** trong context và là **một giá trị đơn**), `summary` (nêu thẳng nhưng
là tóm tắt, quy trình, hay gồm nhiều phần), `reasoning` (không nêu thẳng nhưng **suy ra được**), `unanswerable` (không nêu thẳng, cũng không suy ra được);
trả JSON `{"label_name": …, "reason": …}`; cấm chọn nhãn ngoài danh sách và cấm in gì khác ngoài JSON.

### 4.4 Round-trip (ARES, Promptagator, InPars-v2) — dùng thế nào cho bộ đánh giá [Nguồn 9, 20, 21]

Ba nguồn đều lọc **dữ liệu huấn luyện** bằng "câu sinh ra phải tìm lại được đoạn gốc" (top-1 với ARES / Promptagator; top 10k theo reranker với InPars-v2).
Với **bộ đánh giá**, áp dụng y nguyên sẽ tạo thiên lệch: chỉ còn câu mà retriever hiện tại đã làm đúng, nên Recall@k đo trên bộ đó bị thổi lên [Suy luận].
Cách dùng đề xuất: **không** dùng làm bộ lọc cho L2 / L4 / L5; với L1 chỉ dùng **retriever khác** (vd. BM25 thuần, không phải hệ đang đánh giá) để phát hiện câu
mơ hồ đến mức không gắn được với đoạn nào (giống `q_feasibility` của Know Your RAG), và ghi kết quả vào trường chẩn đoán thay vì xoá câu [Suy luận].

### 4.5 Kiểm "trả lời được" và kiểm đáp án

- **TruLens `Answerability`** (`templates/rag.py`, dòng 105-117): "You are a ANSWERABILITY classifier; providing a score of {min_score} if the answer to the QUESTION does
  not exist in the SOURCE, and a {max_score} if the answer does exist in the SOURCE. Do not consider the quality of the answer, only if it exists or not." [Nguồn 8]
- **UAEval4RAG `answer_verification`** (Bảng 10): so câu trả lời với ground truth; `-1` nếu sai **hoặc** nếu câu trả lời tỏ ra không biết. Prompt "unanswered ratio"
  (Bảng 13) phân 3 lớp: `1` trả lời, `-1` từ chối / chỉ ra lỗi trong câu hỏi, `0` hỏi lại cho rõ — ví dụ trong bảng xếp câu "chỉ ra tiền đề sai" là **không trả lời**
  [Nguồn 26]. SecLearn nên coi đó là **hành vi đúng** cho L6c (mục 6.3).
- **SecEval "answer calibration"** và **MultiHop-RAG bước 5**: trả lời lại bằng một lượt độc lập, lệch thì bỏ (mục 3.11, 3.13).

### 4.6 Chấm liên quan đoạn — UMBRELA / Thomas và cộng sự [Nguồn 22, 23]

UMBRELA tái hiện prompt của Bing (Thomas và cộng sự); bài UMBRELA nói Hình 1 là "the exact prompt used". Bản trong repo `castorini/umbrela`
(`src/umbrela/prompts/prompt_templates/qrel_zeroshot_bing.yaml`, Apache-2.0):

```text
Given a query and a passage, you must provide a score on an integer scale of 0 to 3 with the following meanings:
0 = represent that the passage has nothing to do with the query, 
1 = represents that the passage seems related to the query but does not answer it, 
2 = represents that the passage has some answer for the query, but the answer may be a bit unclear, or hidden amongst extraneous information and 
3 = represents that the passage is dedicated to the query and contains the exact answer.

Important Instruction: Assign category 1 if the passage is somewhat related to the topic but not completely, category 2 if passage presents something very important related to the entire topic but also has some extra information and category 3 if the passage only and entirely refers to the topic. If none of the above satisfies give it category 0.

Query: {query}
Passage: {passage}

Split this problem into steps:
Consider the underlying intent of the search.
Measure how well the content matches a likely intent of the query (M).
Measure how trustworthy the passage is (T).
Consider the aspects above and the relative importance of each, and decide on a final score (O). Final score must be an integer value only.
Do not provide any code in result. Provide each score in the format of: ##final score: score without providing any reasoning.
```

Bản gốc của Thomas và cộng sự (Hình 2, TREC Robust) dùng thang 0-2 và có các phần **tuỳ chọn**: vai "search quality rater", câu "Assume that you are writing a report
on the subject of the topic…" để định nghĩa mức 1 / 2, mô tả `description` + `narrative` của chủ đề, và biến thể "five search engine raters" đòi nhiều điểm rồi lấy
chung. Các mức độ đồng ý và hạn chế khi thay người bằng LLM đã có ở [C §2.4].

So với `judge.ts` hiện tại của SecLearn ([Code]: hai điểm 0-100 `questionRelevance` và `answerContribution`, kèm `reason` tiếng Việt), UMBRELA khác ở: thang **0-3
có định nghĩa từng mức**, bước "ý định → khớp → tin cậy → điểm cuối", và **không đòi lý do** (để giảm chi phí). Để làm `pool_judgments` cho gold [C §4.7], nên dùng
thang rời rạc có định nghĩa như UMBRELA thay vì 0-100 [Suy luận].

### 4.7 Lọc đoạn nguồn trước khi sinh

- RAGAS hiện tại: `QuestionPotential` 1-5 trên node (mục 3.5); RAGAS v0.1: `context_scoring_prompt` (mục 4.2).
- Rahmani và cộng sự (test collection tổng hợp TREC DL 2023, §3): GPT-4 chấm **"passage quality" không phụ thuộc truy vấn**; loại đoạn nói về người mà không
  nêu tên, hoặc dùng từ chỉ rõ nghĩa khi có cả tài liệu ("we eventually chose the second solution…"); loại đoạn điểm < 50 (14,6%). Prompt không in trong bài, chỉ
  nói "details … in our GitHub" [Chưa kiểm chứng] [Nguồn 27].

---

## 5. Lỗi hay gặp mà các nguồn ghi nhận (không trùng [C §2.4])

| Lỗi | Nguồn ghi nhận | Biện pháp trong prompt / pipeline |
|---|---|---|
| Câu nhắc "theo đoạn văn / tài liệu / context" | HF cookbook, RAGAS v0.1, DeepEval, DataMorgana đều có quy tắc cấm riêng [Nguồn 11, 2, 7, 13] | Cấm trong prompt **và** lọc bằng regex tiếng Việt + critique stand-alone |
| Câu chung chung, không cụ thể đủ để tìm lại đoạn | Know Your RAG (lý do thêm theme, `q_feasibility`) [Nguồn 12]; AttackQA tiêu chí "quá rộng" [Nguồn 19] | Đưa theme = tên tài liệu + mục; critique feasibility |
| Model gán / sinh lệch về câu một sự kiện | Know Your RAG 95% với prompt đơn giản; 75% câu "summary" bị gán fact_single [Nguồn 12] | Prompt riêng cho từng mức; chọn đoạn theo mức; phân loại lại bằng model khác |
| Câu "suy luận" thật ra không trả lời được | Know Your RAG: 24-30% câu yêu cầu reasoning bị gán unanswerable [Nguồn 12] | L5 bắt buộc liệt kê bước suy luận, mỗi bước gắn quote; trả lời mù từ bằng chứng |
| Đáp án thừa / thiếu so với nguồn | RAGEval phải có bước reference riêng để thêm / xoá nội dung đáp án [Nguồn 14] | Mỗi claim phải trỏ tới một quote; claim không có quote thì xoá |
| Claim bỏ mất điều kiện / còn đại từ | RefChecker (ví dụ "in 2016"), SAFE (prompt revise), Dense X (một phần nhỏ không tự đứng) [Nguồn 5, 4, 6] | Quy tắc "giữ điều kiện, không đại từ" + bước khử ngữ cảnh |
| Tiến hoá thất bại: câu không thêm gì, chép chữ của prompt, model từ chối | Evol-Instruct elimination 4 kiểu [Nguồn 24]; RAGAS `evolution_elimination` [Nguồn 2] | So câu tiến hoá với câu gốc; regex chữ của prompt ("PASSAGE", "quote") |
| LLM vẫn bịa dù prompt kỹ | RAGEval phần Limitations [Nguồn 14] | Khớp quote bằng máy; người duyệt tập gold |
| Đa dạng thấp: LLM sinh câu "hiển nhiên" | DataMorgana §4 [Nguồn 13] | Rút loại theo xác suất (phân loại × người dùng); k ứng viên rồi chọn |
| Không nhất quán giữa các loại được rút | DataMorgana chú thích 1 [Nguồn 13] | Ma trận tổ hợp hợp lệ (vd. L2 không đi với "similar-to-document") |
| Lọc nhiều: khoảng một nửa câu bị loại | HF cookbook ô 13 [Nguồn 11]; CyberMetric loại 4% sau lọc thô [Nguồn 17] | Sinh dư ×1,7 (đã tính trong [C §6], 3.400 → ~2.000) |

---

## 6. Bộ prompt đề xuất cho SecLearn [Suy luận]

> **Toàn bộ mục này là đề xuất của người viết**, chưa chạy thử. Mỗi prompt ghi "Dẫn xuất từ" (nguồn ý tưởng), "Thay đổi" và "Lý do". Văn bản prompt viết bằng
> tiếng Anh vì (1) prompt hiện có của repo đều bằng tiếng Anh ([Code] `judge.ts`, `grounding.ts`), (2) đoạn nguồn OWASP bằng tiếng Anh, (3) quote phải giữ nguyên
> tiếng Anh; **đầu ra** câu hỏi, đáp án, claim là tiếng Việt. Gợi ý lưu mỗi prompt thành file có phiên bản (vd. `data/eval/prompts/gen-L4-v1.txt`) và ghi
> `source.prompt_version` trong JSONL [R §5.3].

### 6.1 Cài đặt chung

| Mục | Đề xuất | Căn cứ |
|---|---|---|
| Định dạng | JSON **object** ở gốc (`{"items": [...]}` hoặc `{"skip": true, ...}`), không phải mảng | [Code] `completeJson` gửi `response_format: {type: "json_object"}`; chế độ này của OpenAI đòi đầu ra là object và prompt phải có chữ "JSON" [Chưa kiểm chứng với DeepSeek] |
| Nhiệt độ | Sinh: 0,7-0,9; lọc / phân loại / chấm: 0 | Promptagator sampling 0,7 [Nguồn 21]; InPars thấy greedy và sampling không khác nhiều cho truy xuất [Nguồn 20]; nhiệt độ 0 là mặc định của `completeJson` [Code] |
| Số mẫu mỗi lần gọi | **k = 2-3 ứng viên cho cùng một đoạn và cùng một mức**, rồi lọc và chọn 1 | DataMorgana k = 3 [Nguồn 13]; AttackQA ≤ 3 / lần [Nguồn 19]; sinh nhiều câu / đoạn (LlamaIndex) dễ trùng [Suy luận] |
| Model sinh ≠ model lọc | Sinh bằng một họ (vd. DeepSeek), phân loại lại / trả lời mù / critique bằng họ khác (vd. OpenAI) | Repo đã hỗ trợ cả hai `LLM_PROVIDER` [Code]; RAGChecker dùng cùng model cho generator và critic [Nguồn 5] — không nên bắt chước; [C §6 bước 5b-c] |
| Lý do trước điểm | Mọi prompt chấm có trường `rationale` **đứng trước** `score` trong JSON | HF cookbook, SAFE, Know Your RAG [Nguồn 11, 4, 12] |
| Theme | Truyền `doc_title` + `section_path` cùng đoạn | Know Your RAG phụ lục F [Nguồn 12]; Dense X `Title / Section` [Nguồn 6] |
| Quyền từ chối | Mọi prompt sinh có lối ra `{"skip": true, "reason": …}` | RefChecker "Abstain" [Nguồn 5]; RAGEval "discard" [Nguồn 14]; Know Your RAG: không phải đoạn nào cũng hợp mọi loại [Nguồn 12] |
| Việc máy làm, không giao LLM | `char_start/char_end`, `doc_sha256`, `id`, khớp quote, đếm chồng lấn từ, bỏ trùng bằng cosine | [C §6 bước 5]; LLM chép quote hay sai một ký tự [Suy luận] |

### 6.2 Khối dùng chung cho mọi prompt sinh (`SYS-GEN`)

**Dẫn xuất từ:** DataMorgana (người dùng không có tài liệu, mỗi câu đọc độc lập), HF cookbook / RAGAS v0.1 (cấm "according to the context"), AttackQA (references nguyên
văn, tránh từ mơ hồ), RefChecker / RAGAS StatementGenerator (claim nguyên tử, không đại từ, giữ điều kiện). **Thay đổi:** thêm tiếng Việt, thêm lối ra `skip`, thêm quy
tắc quote không được sửa / dịch. **Lý do:** quote là khoá gắn gold vào văn bản [R §5.2], [C §4.6].

```text
You create evaluation data for SecLearn, a Vietnamese cybersecurity tutoring chatbot. SecLearn answers learners' questions ONLY from a library of English OWASP documents.

The learners who will ask your questions do NOT see the passages. Therefore:
- Never refer to "the passage", "the document", "the text", "the author", "this cheat sheet", a figure or a table. In Vietnamese, never write "theo tài liệu", "theo đoạn văn", "trong bài viết", "đoạn trên", "tài liệu này".
- Each question must be understandable on its own, by a learner who has never seen the passages.

Rules for every item:
R1. Use only information stated in the PASSAGES. Do not add facts, tools, numbers or advice from your own knowledge, even if they are correct.
R2. "quote" must be copied character-for-character from one PASSAGE: one or more consecutive sentences, at most 400 characters. Do not translate, fix typos, change punctuation, shorten with "...", or join sentences that are not next to each other.
R3. Write "question", "reference_answer" and "reference_claims" in natural Vietnamese. Keep established English technical terms that Vietnamese learners use (XSS, CSRF, cookie, token, session ID, hash) unless the instructions for this level say otherwise.
R4. "reference_claims": 2 to 5 short Vietnamese sentences. Each claim states exactly one fact, has no pronouns ("nó", "chúng", "điều này"), keeps every condition the passage attaches to the fact ("nếu", "khi", "chỉ khi"), and is supported by at least one of your quotes.
R5. "reference_answer" contains only what the claims contain, in 1 to 4 sentences. Avoid vague words ("nhiều", "một số", "vài") when the passage is specific.
R6. If the PASSAGES cannot support a good item of the requested level, do not force one: return {"skip": true, "reason": "<one sentence>"}.

Reply with one JSON object only, no markdown.
```

Phần **user** chung (chèn trước hướng dẫn riêng từng mức):

```text
PASSAGES:
[P1] document: {doc_file} | section: {section_path}
{passage_1_text}
[P2] ...
```

Đầu ra chung (một item; script thêm `id`, `split`, `version`, `language`, `doc_sha256`, `char_start/end`, `source`, `review`):

```json
{"items": [{
  "question": "...",
  "question_style": "accented | unaccented | mixed_vi_en",
  "level": "L1",
  "type": "lookup",
  "reference_answer": "...",
  "reference_claims": ["...", "..."],
  "gold_evidence": [{"passage": "P1", "quote": "...", "cell": null, "supports_claims": [0, 1]}],
  "compare_cells": [],
  "answerable": true,
  "unanswerable_reason": null,
  "question_en": "..."
}]}
```

`supports_claims` (chỉ số claim mà quote hỗ trợ) là trường thêm so với [R §5.3]: giúp kiểm R4 bằng máy và làm `gold_evidence ↔ reference_claims` khớp nhau như bước
"reference" của RAGEval [Nguồn 14]. `question_en` có trong kế hoạch [C §6 bước 4].

### 6.3 Prompt sinh theo mức

Mỗi prompt dưới đây là phần **user** nối sau `PASSAGES`. Bộ chọn đoạn (script) quyết định đoạn nào đưa vào mức nào — đây là chỗ khắc phục "không phải đoạn nào cũng hợp"
của Know Your RAG [Nguồn 12].

#### GEN-L1 — Tra cứu một đoạn

**Dẫn xuất từ:** Know Your RAG G.2 + G.5 (khẳng định trước, câu hỏi sau, dùng theme) [Nguồn 12]; HF cookbook factoid [Nguồn 11]. **Thay đổi:** "khẳng định" = câu trích
nguyên văn; cho phép câu hỏi "vì sao / để làm gì" ngắn chứ không chỉ factoid một giá trị (L1 của SecLearn gồm cả định nghĩa ngắn). **Lý do:** đáp án bám quote, giảm bịa.
**Đoạn:** 1 đoạn.

```text
Task: create ONE level-L1 item ("lookup").
Step 1. Pick one or two consecutive sentences from P1 that state a concrete, useful security fact (what something does, a requirement, a value, a recommendation). Copy them as the quote.
Step 2. Write a short Vietnamese question (under 20 words) that is answered completely by that quote alone. Use the topic from "document" and "section" so the question is specific (name the mechanism or attack), not generic.
Step 3. The question may reuse the passage's technical terms.
Set level "L1", type "lookup", answerable true, question_style "accented".
```

#### GEN-L2 — Diễn đạt lại / xuyên ngôn ngữ

**Dẫn xuất từ:** DataMorgana "distant-from-document" + người dùng "novice" + phrasing "short-search-query" [Nguồn 13]; RAGAS `QueryStyle` `MISSPELLED` / `WEB_SEARCH_LIKE`
[Nguồn 1]; InPars GBQ (ví dụ câu tốt / xấu) [Nguồn 20]. **Thay đổi:** script truyền **danh sách từ cấm** (từ nội dung của quote, cả dạng tiếng Anh) và **kiểu viết** rút ngẫu
nhiên; thêm một ví dụ câu *xấu* chép thuật ngữ. **Lý do:** L2 đo khả năng truy xuất khi câu không trùng từ tài liệu [R §5.4]; DataMorgana nêu dạng này nhưng không ép bằng
danh sách từ. Vẫn phải lọc chồng lấn từ bằng máy (≤ 30% token nội dung, [R §5.5]). **Đoạn:** 1 đoạn (thường là đoạn đã dùng cho L1).

```text
Task: create ONE level-L2 item ("paraphrase").
The learner is a beginner who does not know the official terms. Describe the situation or goal in everyday Vietnamese instead of naming the concept.
FORBIDDEN in the question (in any language, any spelling): {forbidden_terms}
Writing style for the question: {style}
  - "unaccented": Vietnamese without diacritics, like a quick chat message (e.g. "lam sao de ...").
  - "mixed_vi_en": Vietnamese with at most one common English word that is NOT in the forbidden list.
  - "accented": normal Vietnamese with diacritics, colloquial.
Bad L2 question (copies the document's terms): "HttpOnly cookie dùng để làm gì?"
Good L2 question for the same fact: "lam sao de trinh duyet khong cho JS doc cookie dang nhap"
Step 1. Pick the quote as in L1.
Step 2. Write the question so that the quote fully answers it, without any forbidden term.
Step 3. Write reference_answer and reference_claims normally: they MAY use the technical terms.
Set level "L2", type "paraphrase", question_style "{style}".
```

#### GEN-L3 — Nhiều đoạn, một chủ đề (liệt kê / các bước)

**Dẫn xuất từ:** Know Your RAG G.3 (khẳng định tóm tắt gộp > 1 câu) [Nguồn 12]; RAGEval Summarization / Information Integration [Nguồn 14]; CRAG "set" [R §5.4]. **Thay đổi:**
mỗi phần tử của danh sách phải có quote riêng, và phải lấy từ **≥ 2 đoạn** khác nhau. **Lý do:** mức L3 cần 2-5 gold [R §5.4]; câu liệt kê từ một đoạn thực chất là L1.
**Đoạn:** 2-4 đoạn cùng tài liệu, cùng mục cha hoặc kề nhau.

```text
Task: create ONE level-L3 item ("set": a list, the steps of a procedure, or all measures for one goal).
Step 1. Find one topic that is developed across at least TWO of the passages (for example several defenses against the same attack, or consecutive steps of one procedure).
Step 2. Write a Vietnamese question asking for the full list or all the steps (e.g. "Có những cách nào để ...", "Các bước để ... là gì?"). Do not say how many items there are.
Step 3. Give one gold_evidence entry per list item, each with its own quote. The quotes must come from at least two different passages.
Step 4. reference_answer lists every item; reference_claims has one claim per item (up to 5; if there are more than 5 items, choose a narrower topic).
If only one passage covers the topic, return skip.
Set level "L3", type "set".
```

#### GEN-L4 — So sánh

**Dẫn xuất từ:** RAGEval Multi-document Comparison ("comparable and not a simple combination of two separate questions") [Nguồn 14]; MultiHop-RAG comparison (chỉ so yếu tố
**nêu rõ**) [Nguồn 15]; DeepEval `comparative_question_evolution` [Nguồn 7]; RAGAS multi-hop `<1-hop>` / `<2-hop>` [Nguồn 1]. **Thay đổi:** bắt buộc điền `compare_cells`
(thực thể × khía cạnh) và **mỗi ô một quote**; khía cạnh mà một bên không có bằng chứng thì không được hỏi. **Lý do:** đánh giá L4 theo ô [R §5.3]; câu so sánh mà tài liệu
chỉ nói về một bên sinh ra đáp án bịa cho bên kia [Suy luận]. **Đoạn:** 2-3 đoạn, mỗi đoạn về một thực thể, cùng cụm chủ đề [C §5.4], thường khác tài liệu.

```text
Task: create ONE level-L4 item ("comparison").
Step 1. Identify 2 or 3 items (mechanisms, attacks, defenses, settings) that the passages describe, at most one main item per passage.
Step 2. Choose ONE aspect (or at most two) that the passages state EXPLICITLY for EVERY item (e.g. resistance to phishing, how revocation works, where the token is stored). If some item has no explicit evidence for the aspect, choose another aspect or return skip.
Step 3. Write one Vietnamese question that asks to compare the items on that aspect. It must not be two separate questions joined with "và".
Step 4. compare_cells: one {"item": ..., "aspect": ...} per item × aspect. For every cell, give at least one gold_evidence with "cell" set to the cell index (0-based) and a quote about that item and aspect.
Step 5. reference_answer states each item's position on the aspect and then the difference. reference_claims: one claim per cell plus at most one claim with the conclusion of the comparison.
Set level "L4", type "comparison".
```

#### GEN-L5 — Nhiều bước / tình huống

**Dẫn xuất từ:** MultiHop-RAG inference (không trả lời được nếu chỉ dùng một nguồn) [Nguồn 15]; RAGEval Multi-hop (điểm đầu, điểm cuối, bước trung gian) [Nguồn 14]; RAGAS v0.1
`reasoning_question_prompt`, `conditional_question_prompt` [Nguồn 2]; AttackQA `thought` [Nguồn 19]; Know Your RAG G.4 [Nguồn 12]. **Thay đổi:** tình huống cụ thể kiểu học viên
("ứng dụng của em…"); **`reasoning_steps` bắt buộc, mỗi bước trỏ tới một quote**; cấm bước dựa vào kiến thức ngoài. **Lý do:** 24-30% câu "reasoning" của Know Your RAG bị gán
unanswerable [Nguồn 12] — bắt gắn từng bước vào quote để lọc được bằng máy. `reasoning_steps` là trường thêm (lưu vào `review.notes` hoặc trường riêng). **Đoạn:** 2 đoạn có
cầu nối (cùng thực thể / chủ đề, giống bridge-entity của MultiHop-RAG), có thể khác tài liệu.

```text
Task: create ONE level-L5 item ("scenario": a concrete situation that needs facts from two passages to be combined).
Step 1. Find a link between two passages: a fact in one passage that changes or explains what the other passage says (e.g. P1 says where a token is stored is readable by scripts; P2 says XSS lets an attacker run scripts).
Step 2. Write a short Vietnamese scenario question as a learner or developer would ask it ("Ứng dụng của em ..., như vậy có rủi ro gì và nên sửa thế nào?"). Do not name the link or the conclusion in the question.
Step 3. Fill "reasoning_steps": 2 to 4 steps in Vietnamese; each step has {"step": "...", "passage": "P1", "quote": "..."}. Every step must be supported by its quote; the final conclusion must follow from the steps without outside knowledge.
Step 4. The question must NOT be answerable from either passage alone. If it is, or if a step needs knowledge that is not in the passages, return skip.
Set level "L5", type "scenario". gold_evidence = the quotes of the steps.
```

#### GEN-L6 — Không trả lời được (ba nhánh)

**L6(a) ngoài miền** — không cần prompt sinh từ đoạn; lấy từ danh sách viết tay + LLM viết thêm theo chủ đề đời thường (thời tiết, giá coin, bóng đá) [Suy luận]. `unanswerable_reason: "out_of_domain"`.

**L6(b) trong miền nhưng kho không có.** **Dẫn xuất từ:** UAEval4RAG out-of-database (từ khoá của kho → chủ đề gần → kiểm bằng truy xuất + so đáp án) [Nguồn 26]; RAGEval
Irrelevant Unsolvable (dùng đúng tên thực thể trong tài liệu nhưng hỏi điều tài liệu không có) [Nguồn 14]; MultiHop-RAG null [Nguồn 15]. **Thay đổi:** không dùng tin tức;
đầu vào là đoạn + **danh sách tiêu đề tài liệu của kho** (manifest) để model chọn chủ đề an ninh **có thật nhưng không có trong kho**, và câu phải "gần" đoạn (cùng công nghệ).
**Lý do:** câu gần chủ đề mới thử được lỗi bịa của SecLearn; câu xa thì retriever tự trả rỗng. Bắt buộc kiểm sau bằng grep + 2 retriever + người [C §6 bước 5g].

```text
Task: create ONE level-L6 item of kind "not_in_corpus".
LIBRARY TITLES (the only documents SecLearn has): {manifest_titles}
Step 1. Read P1 and find a closely related, real security question that a learner would naturally ask next, but that P1 does not answer and that none of the LIBRARY TITLES is about (e.g. a specific tool's configuration, a product-specific setting, a different technology).
Step 2. Write the Vietnamese question. It must sound as answerable as a normal question; do not hint that the information is missing.
Step 3. Explain in "why_unanswerable" (Vietnamese, one sentence) what is missing.
Set level "L6", type "unanswerable", answerable false, unanswerable_reason "not_in_corpus", reference_answer = a Vietnamese sentence saying the documents do not cover it, reference_claims [], gold_evidence [].
```

**L6(c) tiền đề sai.** **Dẫn xuất từ:** UAEval4RAG false-presupposition (sinh kèm giải thích, rồi kiểm lại) [Nguồn 26]; FreshQA (người viết kèm giải thích vì sao sai) [Nguồn 25];
CRAG "invalid question" [Nguồn 16]; [R §5.5] "lấy câu L1 rồi đổi một chi tiết". **Thay đổi:** phủ định / đảo **một fact đã trích nguyên văn** (khuyến nghị ↔ cấm, số, tên thuật
toán, ai làm gì), lưu cả quote **thật**; đáp án chuẩn là **chỉ ra tiền đề sai và nêu điều đúng**. **Lý do:** có quote thật thì người duyệt kiểm nhanh, và đo được hệ có phản bác
bằng đúng bằng chứng không. Theo phân loại của UAEval4RAG, chỉ ra lỗi là hành vi "không trả lời" đúng [Nguồn 26, Bảng 13].

```text
Task: create ONE level-L6 item of kind "false_premise".
Step 1. Pick one sentence from P1 that states a clear fact or recommendation. Copy it as the quote (this is the TRUE fact).
Step 2. Make the fact false by changing exactly one element: recommended <-> discouraged, a number or length, an algorithm or attribute name, or who performs an action. The false version must be plausible to a beginner.
Step 3. Write a Vietnamese question that takes the false version for granted (e.g. "Vì sao nên ...", "Khi nào thì ...") without stating it as a claim to check.
Step 4. "false_premise": the false statement in Vietnamese. "why_unanswerable": one Vietnamese sentence on what is wrong.
Step 5. reference_answer: say that the premise is wrong and state the true fact from the quote. reference_claims: the true fact (one or two claims). gold_evidence: the true quote.
Set level "L6", type "false_premise", answerable false, unanswerable_reason "false_premise".
```

(`set-a.jsonl` hiện để L6c với `answerable: false` [Code]; giữ quote thật trong `gold_evidence` vẫn tương thích schema.)

#### GEN-L7 — Hội thoại

**Dẫn xuất từ:** RAGAS v0.1 `conversational_question_prompt` (tách câu thành hai câu nối tiếp) [Nguồn 2]; DeepEval `ConversationalEvolutionTemplate` [Nguồn 7]. **Thay đổi:** đầu vào
là **một item L1 / L3 đã duyệt**; sinh `turns` (user + assistant ngắn) và câu tiếp nối dùng đại từ / tỉnh lược; thêm `question_rewritten` tự đứng (kiểu CANARD, [R §5.4]).
**Lý do:** câu L7 cố ý **không** tự đứng, nên critique stand-alone phải đảo ngược (mục 6.4); `question_rewritten` giúp tách lỗi viết lại câu khỏi lỗi truy xuất.

```text
Task: turn the APPROVED ITEM into ONE level-L7 item ("conversation").
APPROVED ITEM: {item_json}
Step 1. Write turns: a first user question about the same topic (Vietnamese) and a short assistant answer (1-2 sentences) that uses only the quotes of the approved item.
Step 2. Write the follow-up "question" that a learner would type next. It must depend on the turns: use a pronoun or ellipsis ("cái thứ hai", "còn cách kia thì sao", "vậy nó có ...") and must NOT be understandable alone.
Step 3. "question_rewritten": the same follow-up written as a complete, self-contained Vietnamese question.
Step 4. The answer to the follow-up must be supported by the approved item's quotes (you may reuse a subset). Do not add new facts.
Set level "L7", type "conversation", turns = [{"role": "user", ...}, {"role": "assistant", ...}].
```

### 6.4 CRIT — critique 1-5 trước khi người duyệt

**Dẫn xuất từ:** HF cookbook (groundedness, relevance, standalone, ngưỡng ≥ 4) [Nguồn 11]; Know Your RAG `a_to_c_groundedness`, `q_feasibility` [Nguồn 12]; AttackQA tiêu chí câu /
đáp án [Nguồn 19]. **Thay đổi:** gộp vào **một** lần gọi JSON; thay nhóm người dùng bằng người học an toàn web Việt Nam; thêm tiêu chí **tiếng Việt tự nhiên**; đảo stand-alone cho
L7; chấm trên **quote** chứ không trên cả đoạn (quote đã được máy xác nhận nằm trong tài liệu). **Lý do:** giảm chi phí (HF gọi 3 lần); quote là bằng chứng gold.
Chạy bằng model **khác họ** với model sinh, nhiệt độ 0.

```text
SYSTEM:
You review candidate evaluation items for SecLearn, a Vietnamese chatbot that teaches web security from English OWASP documents. Be strict: a bad item that passes costs more than a good item that is dropped. Reply with one JSON object only.

USER:
ITEM: {item_json}
EVIDENCE QUOTES (verified to exist in the documents): {quotes}
Score each criterion from 1 to 5. For each, write the rationale first, then the score.
- groundedness: can the question be answered clearly and unambiguously using only the evidence quotes? 1 = not at all, 5 = completely.
- answer_support: is every statement in reference_answer and reference_claims supported by the quotes? 1 = none, 5 = all, with no added facts.
- standalone: does the question make sense without the documents? Mentioning "the document", "đoạn văn", "tài liệu này", a figure or a table gives 1. Unfamiliar technical terms are fine. (If level is "L7", score instead whether the question is clear GIVEN the turns, and whether question_rewritten is self-contained.)
- usefulness: would a Vietnamese student learning web security plausibly ask this? 1 = trivia nobody needs (e.g. a date of a document revision), 5 = a core concept or practical decision.
- vietnamese: is the question natural Vietnamese that a learner would type (for "unaccented" style, natural chat without diacritics)? 1 = machine-translated or awkward, 5 = natural.
- specificity: could someone find the right passage in a library of about 140 OWASP documents from this question alone? 1 = far too vague, 5 = clearly pinpoints the topic. (For L2, judge the meaning, not the shared words.)
JSON: {"groundedness": {"rationale": "...", "score": 0}, "answer_support": {...}, "standalone": {...}, "usefulness": {...}, "vietnamese": {...}, "specificity": {...}}
```

Ngưỡng đề xuất: tất cả ≥ 4 (như HF), riêng `specificity` ≥ 3 cho L2 [Suy luận]. L6(b) bỏ `groundedness` / `answer_support`.

### 6.5 LEVEL — phân loại lại mức

**Dẫn xuất từ:** Know Your RAG phụ lục D (fact_single / summary / reasoning / unanswerable, chọn đúng một nhãn, JSON) [Nguồn 12]; MultiHop-RAG tiêu chí "đúng loại đã định" [Nguồn 15].
**Thay đổi:** mở rộng sang 7 mức của SecLearn, có định nghĩa phân biệt L1/L2 bằng **chồng lấn từ** (script truyền tỉ lệ đã đo) và L3/L5 bằng **nêu thẳng / phải suy ra**; **không cho
model xem nhãn của generator**; thêm `confidence`. **Lý do:** nhãn do generator tự khai không đáng tin [C §1]; ẩn nhãn để tránh thiên lệch xác nhận [Suy luận]. Lệch nhãn → đổi nhãn
nếu `confidence = high`, còn lại đưa người xử [C §6 bước 5c].

```text
SYSTEM:
You classify evaluation questions for a retrieval-augmented chatbot by the kind of work needed to answer them. Reply with one JSON object only.

USER:
QUESTION: {question}
TURNS (earlier conversation, may be empty): {turns}
EVIDENCE PASSAGES (the passages that contain the answer, may be empty): {passages}
WORD OVERLAP between question and evidence (measured by a script): {overlap_pct}%

Choose exactly one label:
- L1: the complete answer is stated explicitly in ONE passage, and the question uses the same key terms as the passage.
- L2: like L1 (one passage, stated explicitly), but the question avoids the passage's key terms: different wording, everyday Vietnamese, no diacritics, or Vietnamese words for English terms.
- L3: the complete answer is stated explicitly but spread over TWO OR MORE passages, as a list, a set of measures, or steps of one topic.
- L4: the question asks to compare two or more items, and the answer needs explicit evidence for each item.
- L5: the answer is NOT stated explicitly anywhere; it must be inferred by combining facts from two or more passages, or by applying them to a concrete situation.
- L6: the question cannot be answered from the passages: no relevant passage exists, it is outside cybersecurity, or it assumes something the passages contradict.
- L7: the question cannot be understood without the TURNS (it uses pronouns or ellipsis that refer to them).
If two labels fit, choose the higher-numbered one only when its condition is clearly met.
JSON: {"rationale": "...", "label": "L1|L2|L3|L4|L5|L6|L7", "confidence": "high|medium|low"}
```

### 6.6 BLIND — trả lời mù từ bằng chứng (round-trip theo nghĩa QA)

**Dẫn xuất từ:** RAGAS v0.1 `answer_formulate` (verdict 1 / -1) [Nguồn 2]; TruLens Answerability [Nguồn 8]; SecEval answer calibration [Nguồn 18]; CRAG "invalid question" [Nguồn 16].
**Thay đổi:** model khác họ chỉ nhận **câu hỏi + quote gold** (không thấy đáp án chuẩn), trả lời tiếng Việt và tự khai `status`; sau đó so với `reference_claims` bằng `CLAIM-CHECK` (6.8).
**Lý do:** đây là cách lọc "trả lời được chỉ từ bằng chứng" [C §6 bước 5b] không thiên về retriever (khác 4.4). Với L6(c), mong đợi `status = "false_premise"`.

```text
SYSTEM:
Answer the question using ONLY the evidence below. Do not use your own knowledge. Reply with one JSON object only.

USER:
QUESTION (Vietnamese): {question}
TURNS: {turns}
EVIDENCE: {quotes}
Return {"status": "answered|not_in_evidence|false_premise", "answer": "<Vietnamese answer, or empty>", "used_quotes": [<indexes>]}.
Use "false_premise" if the question assumes something the evidence contradicts; use "not_in_evidence" if the evidence does not contain the answer.
```

Quy tắc giữ: L1-L5, L7 cần `answered` và CLAIM-CHECK phủ ≥ 80% `reference_claims`; L6(b) chạy BLIND với top-k của 2 retriever (không phải quote) và cần `not_in_evidence`
(giống kiểm out-of-database của UAEval4RAG [Nguồn 26]); L6(c) cần `false_premise` [Suy luận].

### 6.7 CLAIM — tách khẳng định từ một câu trả lời tiếng Việt

Dùng cho: (1) tách lại `reference_answer` do người sửa, (2) chấm câu trả lời của SecLearn khi đánh giá (answer correctness / faithfulness).
**Dẫn xuất từ:** RAGAS `StatementGeneratorPrompt` (không đại từ) [Nguồn 1]; RefChecker (fine-grained, giữ điều kiện, gắn id câu, "Abstain", tách không phán đúng sai) [Nguồn 5];
SAFE revise (thay tham chiếu mơ hồ, không thêm / bớt fact) [Nguồn 4]; Dense X (giữ cách diễn đạt gốc) [Nguồn 6]; TruLens (abstention) [Nguồn 8]. **Thay đổi:** bỏ marker `[n]` của SecLearn
nhưng ghi lại để gắn claim ↔ đoạn trích dẫn; câu "tài liệu không đề cập…" thành **abstention** riêng, không phải claim. **Lý do:** đúng với quy tắc trích dẫn của SecLearn
([Code] `grounding.ts`, quy tắc 2-3), để đo riêng "từ chối một phần" [R §2.3].

```text
SYSTEM:
You split a Vietnamese answer from a cybersecurity tutor into atomic claims. This is an EXTRACTION task: do not judge whether claims are true. Reply with one JSON object only.

USER:
QUESTION: {question}
ANSWER (sentences are numbered; citation markers like [2] refer to source passages): {numbered_answer_sentences}

Rules:
1. A claim states exactly one piece of knowledge, in Vietnamese, as one sentence.
2. Replace pronouns and vague references ("nó", "cách này", "cookie đó") with the full names they refer to in the ANSWER or QUESTION. Do not change or add any fact.
3. Keep every condition, scope and exception ("nếu", "khi", "chỉ", "không áp dụng cho ..."). A claim without its condition is wrong.
4. Keep the answer's wording where possible; do not merge claims from unrelated sentences.
5. Greetings, opinions, questions back to the user and advice to read more are not claims.
6. Sentences that say the documents or passages do not cover something are "abstentions", not claims: list them separately.
7. For each claim, give the sentence numbers it comes from and the citation markers attached to those sentences.
If the answer has no claims, return {"claims": [], "abstentions": [...]}.
JSON: {"claims": [{"text": "...", "sentences": [1], "citations": [2]}], "abstentions": [{"text": "...", "sentences": [4]}]}
```

### 6.8 CLAIM-CHECK — so claim với đáp án chuẩn / bằng chứng

**Dẫn xuất từ:** RAGAS `CorrectnessClassifier` (TP / FP / FN) [Nguồn 1]; RefChecker 3 nhãn [Nguồn 5]; RAGEval key point Relevant / Irrelevant / Wrong [Nguồn 14]. **Thay đổi:** thêm nhãn
`contradicted` tách khỏi `not_supported` (trong an toàn thông tin, nói **ngược** khuyến nghị nghiêm trọng hơn thiếu ý); so với **cả** `reference_claims` và quote.

```text
SYSTEM:
You compare claims against reference facts. Do not use your own knowledge. Reply with one JSON object only.

USER:
REFERENCE CLAIMS (numbered): {reference_claims}
EVIDENCE QUOTES: {quotes}
CANDIDATE CLAIMS (numbered): {candidate_claims}
For each candidate claim: "supported" if a reference claim or quote states or directly implies it; "contradicted" if they state the opposite; "not_supported" otherwise. Give the reference claim numbers used.
For each reference claim: "covered" if some candidate claim states it, else "missing".
JSON: {"candidates": [{"id": 0, "rationale": "...", "label": "supported|contradicted|not_supported", "refs": [1]}], "references": [{"id": 1, "label": "covered|missing"}]}
```

### 6.9 REL — chấm liên quan đoạn cho pooling

**Dẫn xuất từ:** UMBRELA / Bing (0-3, ý định → khớp → tin cậy → điểm cuối) [Nguồn 22, 23]. **Thay đổi:** câu hỏi tiếng Việt, đoạn tiếng Anh (nói rõ đây không phải lý do trừ điểm);
bỏ "trustworthy" (mọi đoạn đều là OWASP); đòi JSON có lý do ngắn (để người duyệt pool đọc nhanh). Ánh xạ gợi ý sang `grade` của gold: 3 → 2, 2 → 1, 0-1 → 0 (vẫn lưu điểm 0-3 gốc
trong `pool_judgments`) [Suy luận]. **Lý do:** thang có định nghĩa từng mức dễ so với người hơn 0-100 của `judge.ts` hiện tại [Code].

```text
SYSTEM:
You judge whether a passage helps answer a learner's question. Reply with one JSON object only.

USER:
The question is in Vietnamese and the passage is in English; the language difference is NOT a reason to lower the score.
QUESTION: {question}
TURNS (if any): {turns}
PASSAGE ({doc_file} | {section_path}): {passage}
Scale:
0 = the passage has nothing to do with the question.
1 = the passage is related to the topic but does not answer the question.
2 = the passage contains part of the answer, or the answer is unclear or mixed with unrelated content.
3 = the passage is about the question and contains the exact answer (or one complete item of a list / one side of a comparison that the question asks for).
Steps: consider what the learner wants; check how well the passage content matches it; then decide the final score.
JSON: {"rationale": "<one short sentence>", "score": 0}
```

### 6.10 DUP — bỏ trùng mức ngữ nghĩa

**Dẫn xuất từ:** RAGAS v0.1 `evolution_elimination` (cùng ràng buộc, cùng độ sâu / độ rộng) [Nguồn 2]. **Thay đổi:** chỉ gọi LLM cho cặp có cosine nằm trong **dải nghi ngờ** (vd. 0,85-0,95);
trên dải → bỏ thẳng, dưới dải → giữ [Suy luận]; thêm "cùng tập bằng chứng". **Lý do:** bỏ trùng bằng cosine thuần dễ xoá nhầm cặp L1 / L2 cùng fact (cố ý giống nghĩa khác chữ) —
nên **chỉ so trong cùng mức**.

```text
Do these two questions ask for the same information, with the same conditions and the same depth, so that the same answer would be fully correct for both? Reply with one JSON object only: {"rationale": "...", "same": true|false}
Q1: {q1}
Q2: {q2}
```

### 6.11 Ánh xạ prompt vào quy trình [C §6]

| Bước [C §6] | Prompt | Model / nhiệt độ |
|---|---|---|
| 4. Sinh ứng viên | SYS-GEN + GEN-L1 … GEN-L7 (L7 sau khi đã duyệt L1 / L3) | Họ A, 0,7-0,9, k = 2-3 |
| 5a. Quote có trong markdown | (script khớp chuỗi, chuẩn hoá khoảng trắng; không LLM) | — |
| 5b. Trả lời được chỉ từ bằng chứng | BLIND + CLAIM-CHECK | Họ B, 0 |
| 5c. Phân loại lại mức | LEVEL | Họ B (hoặc C), 0 |
| 5d / 5f. Tham chiếu "tài liệu", chồng lấn từ L2 | (regex + đếm token) rồi CRIT | Họ B, 0 |
| 5e. Bỏ trùng | (cosine) + DUP | Họ B, 0 |
| 5g. L6(b) kho không có | (grep + top-20 hai retriever) + BLIND trên top-k | Họ B, 0 |
| 10. Pooling | REL | Họ B, 0 |
| Đánh giá hệ SecLearn | CLAIM + CLAIM-CHECK (answer correctness / faithfulness), REL (context precision) | Họ B, 0 |

Ghi chú vận hành [Suy luận]:

- **Thử nhỏ trước:** chạy mỗi prompt sinh trên ~20 đoạn, đọc tay toàn bộ, sửa prompt, tăng phiên bản (`gen-L4-v2`); chỉ khi tỉ lệ qua CRIT + LEVEL ổn định mới chạy cả 3.400.
- **Theo dõi tỉ lệ loại theo bước và theo mức** — đó là số liệu cho dataset card [C §6 bước 14] và cho chương phương pháp của luận văn.
- **Ví dụ few-shot lấy từ `set-a.jsonl`** (đã viết tay, đúng schema [Code]); không lấy ví dụ cùng tài liệu với đoạn đang sinh, để model không chép.
- **Không cho LLM thấy câu trả lời của SecLearn** khi sinh dữ liệu; bộ đánh giá phải độc lập với hệ được đánh giá.
- **Giấy phép:** prompt ở mục 6 viết mới, chỉ lấy ý tưởng; khi công bố prompt cùng bộ dữ liệu, ghi rõ nguồn ý tưởng như cột "Dẫn xuất từ". Nếu chép nguyên câu từ RAGEval
  (CC BY-NC-SA) thì phần đó phải theo điều kiện của giấy phép này.

---

## 7. Những gì chưa kiểm chứng / chưa tìm thấy

- **Promptagator** few-shot prompt: bài báo hứa công bố; chưa tìm thấy bản công bố [Nguồn 21].
- **DataMorgana** prompt lọc, **UAEval4RAG** prompt sinh (chỉ có định nghĩa, ví dụ, prompt kiểm), **Rahmani và cộng sự** prompt chấm chất lượng đoạn và sinh truy vấn bằng GPT-4
  ("in our GitHub", chưa mở) [Nguồn 13, 26, 27].
- **CyberMetric, SecEval**: không công bố prompt sinh; repo không khai giấy phép qua GitHub API (README của SecEval có mục "Licenses", chưa đọc) [Nguồn 17, 18].
- **arXiv 2312.10003** mà HF cookbook dẫn làm nguồn tiêu chí critique: chưa mở.
- Giấy phép riêng của từng bài báo trên arXiv (prompt trong phụ lục): chưa kiểm; vì vậy mục 2-3 chỉ tóm tắt các prompt đó.
- Hành vi `response_format: json_object` với DeepSeek (có đòi top-level object và chữ "JSON" như OpenAI không): chưa kiểm.
- SAFE: chỉ đọc prompt revise và final-answer; prompt xét liên quan `_RELEVANCE_FORMAT` và sinh truy vấn tìm kiếm chỉ xem qua cấu trúc [Nguồn 4].

---

## 8. Nguồn

### Công cụ (mã nguồn, tải bản raw từ GitHub ngày lập)
1. RAGAS, `vibrantlabsai/ragas` (trước là `explodinggradients/ragas`), Apache-2.0, commit `298b68274234c060deacab3cf5fb52aa3a20e885` (2026-02-24):
   `src/ragas/metrics/_faithfulness.py`, `_answer_correctness.py`, `_context_recall.py`, `_factual_correctness.py`;
   `src/ragas/testset/synthesizers/{__init__.py, base.py, prompts.py, single_hop/prompts.py, multi_hop/prompts.py, multi_hop/abstract.py, multi_hop/specific.py}`;
   `src/ragas/testset/persona.py`, `src/ragas/testset/transforms/filters.py`. https://github.com/vibrantlabsai/ragas
2. RAGAS v0.1.21, `src/ragas/testset/prompts.py`. https://github.com/vibrantlabsai/ragas/blob/v0.1.21/src/ragas/testset/prompts.py
3. Min, Krishna, Lyu, Lewis, Yih, Koh, Iyyer, Zettlemoyer, Hajishirzi, 2023. *FActScore: Fine-grained Atomic Evaluation of Factual Precision in Long Form Text Generation*.
   https://arxiv.org/abs/2305.14251 (§3-4); repo `shmsw25/FActScore` (MIT): `factscore/atomic_facts.py`, `factscore/factscorer.py`. https://github.com/shmsw25/FActScore
4. Wei và cộng sự, 2024. *Long-form factuality in large language models* (SAFE). https://arxiv.org/abs/2403.18802 (§3-4); repo `google-deepmind/long-form-factuality`
   (Apache-2.0; `third_party/factscore` MIT): `eval/safe/classify_relevance.py`, `rate_atomic_fact.py`, `get_atomic_facts.py`. https://github.com/google-deepmind/long-form-factuality
5. Amazon Science, RefChecker (Apache-2.0): `refchecker/extractor/extractor_prompts.py`, `refchecker/checker/checker_prompts.py`. https://github.com/amazon-science/RefChecker ;
   RAGChecker (Apache-2.0): `scripts/synthesize_benchmark.py`. https://github.com/amazon-science/RAGChecker
6. Chen, Wang, Chen, Yu, Ma, Zhao, Zhang, Yu, 2023 (EMNLP 2024). *Dense X Retrieval: What Retrieval Granularity Should We Use?* https://arxiv.org/abs/2312.06648
   (phụ lục B, Hình 8; phụ lục C, Bảng 8); repo `chentong0/factoid-wiki` (Apache-2.0). https://github.com/chentong0/factoid-wiki
7. DeepEval, `confident-ai/deepeval` (Apache-2.0): `deepeval/metrics/faithfulness/templates/generate_claims.txt`, `deepeval/synthesizer/templates/template.py`.
   https://github.com/confident-ai/deepeval
8. TruLens, `truera/trulens` (MIT): `src/feedback/trulens/feedback/templates/rag.py` (lớp `Groundedness`, `Answerability`, `Abstention`). https://github.com/truera/trulens
9. Saad-Falcon, Khattab, Potts, Zaharia, 2023. *ARES*. https://arxiv.org/abs/2311.09476 (§3.1); repo `stanford-futuredata/ARES` (Apache-2.0): `ares/synthetic_generator.py`,
   `ares/LLM_as_a_Judge_Adaptation/LLM_Synthetic_Generation.py`, `Filter_Synthetic_Queries.py`. https://github.com/stanford-futuredata/ARES
10. LlamaIndex, `run-llama/llama_index` (MIT): `llama-index-core/llama_index/core/llama_dataset/legacy/embedding.py` (tag `v0.12.0`),
    `llama-index-core/llama_index/core/evaluation/dataset_generation.py` (nhánh `main`). https://github.com/run-llama/llama_index
11. Roucher, Hugging Face Cookbook, *RAG Evaluation*, `huggingface/cookbook` (Apache-2.0): `notebooks/en/rag_evaluation.ipynb` (ô 12, 13, 16-20).
    https://github.com/huggingface/cookbook/blob/main/notebooks/en/rag_evaluation.ipynb

### Bài báo sinh dữ liệu RAG
12. Teixeira de Lima, Gupta, Berrospi, Mishra, Dolfi, Staar và cộng sự, 2024. *Know Your RAG: Dataset Taxonomy and Generation Strategies for Evaluating RAG Systems*.
    https://arxiv.org/abs/2411.19710 (§6, Hình 2, phụ lục D-I)
13. Filice, Horowitz và cộng sự, 2025. *Generating Diverse Q&A Benchmarks for RAG Evaluation with DataMorgana*. https://arxiv.org/abs/2501.12789 (§3.1-3.2, Bảng 1, §4-5)
14. Zhu, Luo, Xu và cộng sự, 2024. *RAGEval: Scenario Specific RAG Evaluation Dataset Generation Framework*. https://arxiv.org/abs/2408.01262 (§3.3, Hình 14-15, Limitations);
    repo `OpenBMB/RAGEval` (CC BY-NC-SA 4.0): `rageval/qar_generation/prompts/law_en.jsonl`, `keypoint_prompt.jsonl`, `code/law/en/qra_pipeline_*.py`. https://github.com/OpenBMB/RAGEval
15. Tang, Yang, 2024. *MultiHop-RAG*. https://arxiv.org/abs/2401.15391 (§3 bước 1-5, phụ lục A Bảng 7-11); repo `yixuantt/MultiHop-RAG` (không khai giấy phép qua GitHub API).
16. Yang, Sun, Xin và cộng sự, 2024. *CRAG – Comprehensive RAG Benchmark*. https://arxiv.org/abs/2406.04744 (§3.1, A.1.3-A.1.4, A.3.1)
17. Tihanyi, Ferrag, Jain và cộng sự, 2024. *CyberMetric*. https://arxiv.org/abs/2402.07688 (§III-B); repo `cybermetric/CyberMetric` (không khai giấy phép).
18. SecEval, `XuanwuAI/SecEval`, README §Generation Process. https://github.com/XuanwuAI/SecEval
19. Badrinath Krishna, 2024. *AttackQA*. https://arxiv.org/abs/2411.01073 (§3.4-3.5, phụ lục A.2.1)
20. Bonifacio, Abonizio, Fadaee, Nogueira, 2022. *InPars: Data Augmentation for Information Retrieval using Large Language Models*. https://arxiv.org/abs/2202.05144 (Hình 2, §3, §6.3);
    20b. Jeronymo và cộng sự, 2023. *InPars-v2*. https://arxiv.org/abs/2301.01820 (§2)
21. Dai, Zhao, Ma và cộng sự, 2022. *Promptagator: Few-shot Dense Retrieval From 8 Examples*. https://arxiv.org/abs/2209.11755 (§3.1-3.2, §4)

### Chấm liên quan
22. Upadhyay, Pradeep và cộng sự, 2024. *UMBRELA*. https://arxiv.org/abs/2406.06519 (§3.2, Hình 1); repo `castorini/umbrela` (Apache-2.0):
    `src/umbrela/prompts/prompt_templates/qrel_zeroshot_bing.yaml`. https://github.com/castorini/umbrela
23. Thomas, Spielman, Craswell, Mitra, 2023. *Large Language Models can Accurately Predict Searcher Preferences*. https://arxiv.org/abs/2309.10621 (Hình 2)

### Tăng độ khó, câu tiền đề sai, câu không trả lời được
24. Xu, Sun, Zheng, Geng, Zhao, Feng, Tao, Lin, Jiang, 2023 (ICLR 2024). *WizardLM: Empowering Large Language Models to Follow Complex Instructions* (Evol-Instruct). https://arxiv.org/abs/2304.12244 (§3.1-3.2);
    repo `nlpxucan/WizardLM`: `Evol_Instruct/depth.py`, `breadth.py`; `WizardLM/CODE_LICENSE` (Apache-2.0). https://github.com/nlpxucan/WizardLM
25. Vu, Iyyer, Wang và cộng sự, 2023. *FreshLLMs: Refreshing Large Language Models with Search Engine Augmentation* (FreshQA). https://arxiv.org/abs/2310.03214 (§2)
26. Peng, Choubey, Xiong, Wu, 2024 (ACL 2025). *Unanswerability Evaluation for Retrieval Augmented Generation* (UAEval4RAG). https://arxiv.org/abs/2412.12300 (§3.1-3.2, phụ lục A, Bảng 6-13)
27. Rahmani, Craswell, Yilmaz, Mitra, Campos, 2024. *Synthetic Test Collections for Retrieval Evaluation*. https://arxiv.org/abs/2405.07767 (§3)

### File trong repo
- `src/lib/llm.ts` (`completeJson`: `response_format: json_object`, `temperature` mặc định 0; nhánh DeepSeek tắt `thinking`), `src/lib/env.ts` (`LLM_PROVIDER` = mock / openai / deepseek,
  model mặc định), `src/lib/judge.ts` (prompt chấm nguồn 0-100), `src/lib/grounding.ts` (`groundedSystemPrompt`: quy tắc trích dẫn và câu "không đề cập"),
  `data/eval/set-a.jsonl` (20 mẫu viết tay: L1-L7, kiểu `lookup`, `paraphrase`, `set`, `comparison`, `scenario`, `unanswerable`, `false_premise`, `conversation`).
- File nguồn và PDF đã tải chỉ lưu trong thư mục scratchpad của phiên, không ghi vào repo.
