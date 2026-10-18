# Nâng cấp tính năng sinh bộ câu trắc nghiệm (Ôn tập) của SecLearn

> Ngày lập: 2026-10-18. Phạm vi: khảo sát code hiện tại, các sản phẩm và nghiên cứu về sinh câu hỏi trắc nghiệm (MCQ), rồi đề xuất hướng nâng cấp. **Không sửa code.** Đầu ra vẫn **chỉ là MCQ một đáp án đúng**, nhưng chất lượng cao hơn.
>
> Quy ước:
> - **[Code]**: đọc trực tiếp trong repo, có `file:dòng`.
> - **[Đã kiểm chứng]**: đọc trực tiếp nguồn chính chủ (trang sản phẩm / blog kỹ thuật / help center / bài báo arXiv, ACL Anthology / repo GitHub), link ngay cạnh.
> - **[Không công bố]**: nguồn chính chủ không mô tả chi tiết đó, hoặc chỉ có nguồn thứ ba nên **không dùng làm dữ kiện**.
> - **[Suy luận]** / **[Đề xuất]**: ý kiến của người viết, không phải dữ kiện.

---

## 0. Tóm tắt

1. **Vấn đề lớn nhất không nằm ở prompt mà ở đầu vào.** Trang Ôn tập chỉ gửi `{ locale }` [Code] `src/app/[locale]/on-tap/page.tsx:68-72`. Mô hình không nhận bài học, không nhận chunk RAG, không nhận chủ đề, chỉ một system prompt một dòng: "Exactly 5 MCQs for beginner cybersecurity review" [Code] `src/lib/llm.ts:309`. Vì vậy câu sinh ra là câu nhớ kiến thức chung chung, không bám tài liệu và không có độ khó.
2. **Không có kiểm tra chất lượng**: chỉ cần ≥ 3 câu là nhận [Code] `src/lib/llm.ts:334-342`. Không kiểm `correctOptionId ∈ options`, không kiểm trùng lặp, không có giải thích, không có nguồn trích dẫn.
3. **Kết quả làm bài bị bỏ phí**: API chấm trả `details` từng câu [Code] `src/app/api/quizzes/[id]/attempts/route.ts:29-39,60`, nhưng UI chỉ lấy `score` [Code] `src/app/[locale]/on-tap/[id]/page.tsx:65`. Người học không biết sai câu nào, sai vì sao.
4. **Đề xuất ưu tiên** (chi tiết ở §4):
   - (P0) Sinh câu **từ chunk RAG** đã có (`retrieveChunks` + `buildContext`), mỗi câu mang `sourceIndex` + câu trích dẫn chứng.
   - (P0) Schema câu hỏi giàu hơn: `bloom`, `difficulty`, `concept`, `explanation` cho **từng lựa chọn**, `misconception` cho mỗi distractor.
   - (P0) Bộ kiểm tra hai tầng: **luật cứng** (theo danh sách lỗi kỹ thuật của NBME) + **LLM-as-judge** (giải lại câu hỏi mà không xem đáp án; giải chỉ với các lựa chọn để bắt lộ đáp án).
   - (P1) Dạng câu **tình huống / phân tích artefact** đặc thù an ninh mạng: đoạn log, HTTP request, code có lỗ hổng, email phishing, "tấn công gì?", "biện pháp tốt nhất?", "bước tiếp theo?".
   - (P1) Hiển thị kết quả từng câu + giải thích + link về đoạn nguồn; **ôn lại câu sai** (tạo bộ mới tập trung vào khái niệm đã sai).
   - (P2) Ước lượng độ khó bằng "học sinh mô phỏng" (LLM đóng vai người học), rồi thích ứng độ khó theo người học.

---

## 1. Hiện trạng trong code

### 1.1 Luồng hiện tại

```
on-tap/page.tsx  --POST {locale}-->  /api/quizzes/generate  --> generateQuizJson()  --> 1 lần gọi LLM (JSON mode)
                                                     |                                        |
                                    (conversationId? → 12 tin cuối)                  parse JSON, ≥3 câu là OK
                                                     v
                                     prisma.quiz.create(questions)  --> on-tap/[id] làm bài --> attempts: chỉ hiện điểm
```

| Khía cạnh | Hiện trạng | Bằng chứng |
|---|---|---|
| Nhà cung cấp LLM | SDK `openai`, `LLM_PROVIDER` = `deepseek` (baseURL `api.deepseek.com`) hoặc `openai`; mặc định model `deepseek-flash` / `gpt-4o-mini`; DeepSeek tắt chế độ thinking | [Code] `src/lib/llm.ts:57-67`, `src/lib/llm.ts:320-322`, `src/lib/env.ts:75-80` |
| Prompt | Một system prompt duy nhất, 1 câu: trả JSON `titleVi, titleEn, description, questions[{prompt, options[{id,text}], correctOptionId}]`, "Exactly 5 MCQs for beginner cybersecurity review (Ôn tập). Options ids a-d." | [Code] `src/lib/llm.ts:305-310` |
| Đầu vào user | `JSON.stringify({ locale, topicHint, conversationSnippet: …slice(0, 2000) })` | [Code] `src/lib/llm.ts:311-318` |
| UI gửi gì | **Chỉ `locale`**, không `topicHint`, không `conversationId` | [Code] `src/app/[locale]/on-tap/page.tsx:68-72` |
| Ngữ cảnh nguồn | Không có bài học, không có RAG. Chỉ có (nếu API được gọi với `conversationId`) 12 tin nhắn gần nhất của hội thoại | [Code] `src/app/api/quizzes/generate/route.ts:17-28` |
| Tham số sinh | `temperature: 0.5`, `response_format: json_object` | [Code] `src/lib/llm.ts:303-304` |
| Kiểm tra đầu ra | `JSON.parse` + `questions.length >= 3`. Không Zod, không kiểm id lựa chọn, không kiểm số lựa chọn, không kiểm đáp án đúng có trong options | [Code] `src/lib/llm.ts:334-342` |
| Độ khó | Không có tham số; prompt cố định "beginner" | [Code] `src/lib/llm.ts:309` |
| Chế độ mock | 5 câu tĩnh, đáp án luôn là `a` | [Code] `src/lib/llm.ts:209-294` |
| Lưu trữ | `Quiz` (title, description, `source`, `basedOnConversationId`) và `Question` (`prompt`, `options` Json, `correctOptionId`, `order`, `locale`). **Không có** giải thích, Bloom, độ khó, khái niệm, nguồn chunk | [Code] `prisma/schema.prisma:158-187`; ghi tại `src/app/api/quizzes/generate/route.ts:38-60` |
| Hiển thị / chấm | GET ẩn `correctOptionId` [Code] `src/app/api/quizzes/[id]/route.ts:36`. POST attempt tính `details` từng câu và lưu `answers` Json [Code] `src/app/api/quizzes/[id]/attempts/route.ts:29-52`. UI chỉ đọc `score` [Code] `src/app/[locale]/on-tap/[id]/page.tsx:65` |
| Validation request | `generateQuizSchema = { locale?, conversationId?, topicHint? (≤200) }` | [Code] `src/lib/validations.ts:69-73` |

### 1.2 Hạ tầng sẵn có có thể dùng lại

| Thành phần | Dùng cho MCQ thế nào | Vị trí |
|---|---|---|
| `retrieveChunks()` (vector + keyword, rerank, ngưỡng liên quan) | Lấy đoạn tài liệu theo chủ đề / bài học làm **nguồn duy nhất** để sinh câu | [Code] `src/lib/rag.ts:128` |
| `buildContext()` đánh số `[n]` + trả `sources` khớp với cái model thấy | Cho mỗi câu ghi `sourceIndex`, lưu `chunkId` | [Code] `src/lib/rag.ts:431-461` |
| `completeJson()` | Gọi JSON mode chung; nên thay đoạn gọi riêng trong `generateQuizJson` | [Code] `src/lib/llm.ts:158-192` |
| Cross-encoder rerank (`rerankScores`, `rerankPairs`) | Kiểm "câu trích dẫn chứng có thật sự hỗ trợ đáp án không", và chống trùng câu hỏi | [Code] `src/lib/rerank.ts:27-43` |
| `verifyCitations()` (claim ↔ chunk bằng cross-encoder, không tốn token LLM) | Mẫu sẵn để kiểm đáp án đúng có bằng chứng trong chunk | [Code] `src/lib/verify.ts:17` |
| `judgeSources()` (LLM chấm 0-100 theo rubric, trả JSON) | Mẫu sẵn cho LLM-as-judge chấm câu hỏi | [Code] `src/lib/judge.ts:7-20,47` |

Lưu ý: bài học (`Lesson`/`LessonTranslation`) **không** được ingest vào RAG; RAG chỉ chứa `DocumentChunk` của `Document` (chunk 800 ký tự, overlap 80) [Code] `prisma/schema.prisma:119-156`, `src/lib/env.ts:47-48`; điều này cũng đã được ghi ở `docs/CHATBOT_VS_CHATGPT.md:179`.

### 1.3 Ý tưởng đã có trong `docs/`

- `docs/CHATBOT_VS_CHATGPT.md:180-181,234`: đã nhận xét UI chỉ gửi `locale`, quiz không bám RAG, có thể ra đáp án sai; đề xuất sinh từ chunk RAG và kiểm `correctOptionId ∈ options`.
- `docs/PREMIUM_CONTENT_RESEARCH.md:174,328`: khuyến nghị gắn **mức Bloom** (remember / understand / apply / analyze) cho từng câu quiz.
- `docs/EVAL_GENERATION_PROMPTS.md:515-517` và `docs/EVAL_DATASET_CONSTRUCTION.md:104-105`: cách CyberMetric, SecEval, CTIBench sinh MCQ và lỗi điển hình (nhiều đáp án đúng, đáp án LLM sai, tham chiếu "chương 4").
- `docs/DATA_SOURCES.md:124-126`: CyberMetric / SecQA / CTIBench có thể dùng **đánh giá nội bộ**, không phải nội dung phát hành (vướng giấy phép).

---

## 2. Các sản phẩm hiện nay sinh MCQ từ tài liệu như thế nào

Chỉ ghi những gì tài liệu chính chủ nói. Phần lớn sản phẩm **không công bố** pipeline bên trong (prompt, cách sinh distractor, kiểm định).

| Sản phẩm | Dữ kiện đã kiểm chứng | Không công bố / chưa kiểm chứng |
|---|---|---|
| **Google NotebookLM** (flashcard + quiz) | Quiz và flashcard "grounded only in your source materials"; người dùng chỉnh **chủ đề** và **độ khó**, chia sẻ bằng link; quản trị bật tắt qua admin console (Workspace Updates, 11/09/2025) [Đã kiểm chứng] ([Google Workspace Updates](https://workspaceupdates.googleblog.com/2025/09/flashcards-quizzes-reports-notebook-lm-google-education.html)). Nút **"explain"** giải thích vì sao trả lời sai, **có trích dẫn về nguồn** (blog Google, 08/09/2025) [Đã kiểm chứng] ([Google Blog](https://blog.google/technology/google-labs/notebooklm-student-features/)) | Cách sinh distractor, kiểm định, thang độ khó [Không công bố] |
| **Duolingo** (sinh bài tập bằng LLM) | Prompt kiểu "Mad Lib": phần cố định theo loại bài (vd. số lựa chọn, giới hạn độ dài) + phần biến đổi (ngôn ngữ, **CEFR level**, chủ đề, điểm ngữ pháp, loại bài). Mô hình sinh một lô (vd. 10 câu), Learning Designer chọn 3 câu tốt nhất rồi sửa; "teaching experts always have the final say". Birdbrain chọn bài "at the perfect difficulty level" theo điểm mạnh/yếu [Đã kiểm chứng] ([Duolingo Blog](https://blog.duolingo.com/large-language-model-duolingo-lessons)). Duolingo Max dùng GPT-4; nhân viên rà soát nội dung AI về độ chính xác và giọng; người học báo lỗi từng tin nhắn AI [Đã kiểm chứng] ([Duolingo Blog – Max](https://blog.duolingo.com/duolingo-max/)) | Cách Birdbrain kết hợp với bài sinh tự động [Không công bố] |
| **Khanmigo** (công cụ giáo viên) | Mở Khanmigo trên bài/video, yêu cầu câu trắc nghiệm hoặc tự luận, có thể thêm chuẩn (standard) của bài; nên xin kèm đáp án, Khanmigo đưa đáp án đúng kèm giải thích [Đã kiểm chứng] ([Khan Academy Blog](https://blog.khanacademy.org/?p=16522)) | Cách tạo distractor / nhắm misconception: bài chỉ nói "target every student misunderstanding" mà không nêu phương pháp [Không công bố] |
| **Microsoft Forms – Copilot** | Sinh quiz kèm đáp án đúng từ ý định hoặc **nội dung dán vào**; tùy chọn "Including answer explanations" để mỗi câu có giải thích; viết lại từng câu; FAQ khuyên **rà soát bản nháp** trước khi gửi [Đã kiểm chứng] ([Forms Blog 1](https://techcommunity.microsoft.com/blog/microsoftformsblog/create-quizzes-with-copilot-in-forms/4193986), [Forms Blog 2](https://techcommunity.microsoft.com/blog/microsoftformsblog/copilot-in-forms-generate-quiz-with-answer-explanations-and-rewrite-questions-wi/4226904), [FAQ](https://support.microsoft.com/en-us/office/frequently-asked-questions-about-copilot-in-forms-c9941b72-b32e-4c7e-9af9-e603929bb1d2)) | Kiểm định nội bộ [Không công bố] |
| **Kahoot!** | Trình sinh từ PDF tạo câu hỏi + đáp án từ nội dung file; các loại Quiz, True/False, Slider, Type answer; cho sửa trước khi lưu (theo kết quả tìm kiếm trên help center; trang bị chặn khi tải trực tiếp) [Chưa kiểm chứng toàn văn] ([Kahoot Help](https://support.kahoot.com/hc/en-us/articles/40988856361747), [Kahoot Blog](https://kahoot.com/blog/2024/01/17/ai-pdf-question-generator-for-educators/)) | Pipeline [Không công bố] |
| **Coursera Coach** | "Help Me Practice": Coach đặt câu hỏi cho người học (Socratic), thích ứng mức thành thạo và phản hồi câu trả lời [Đã kiểm chứng qua kết quả tìm kiếm blog chính chủ] ([Coursera Blog](https://blog.coursera.org/coursera-coach-leveraging-genai-to-empower-learners)) | Sinh MCQ thế nào [Không công bố] |
| **Quizlet** (Magic Notes, AI practice tests) | Help center và trang tính năng trả 403 khi tải; chỉ có thông cáo báo chí (08/2023) qua bên thứ ba nói Magic Notes biến ghi chú thành flashcard và **practice test** [Chưa kiểm chứng] | Cơ chế thích ứng, cách sinh distractor [Không công bố] |
| **Wayground (Quizizz), Gimkit, Brilliant, Canvas, Anki add-on** | Không tìm được tài liệu chính chủ mô tả cách sinh câu hỏi. Moodle chỉ thấy plugin bên thứ ba OneClickQuiz nhận "subject + desired cognitive level" (bài báo [arXiv 2510.03374](https://arxiv.org/pdf/2510.03374)) | [Không công bố] |
| **CompTIA (Security+, CySA+, PenTest+…)** | **PBQ** "test your ability to perform a task or solve a problem using a simulated environment"; môi trường có thể là firewall, sơ đồ mạng, hệ điều hành; simulation giới hạn chức năng nhưng cho nhiều cách làm đúng, virtual environment là máy ảo thật [Đã kiểm chứng] ([CompTIA Blog](https://www.comptia.org/en-us/blog/what-is-a-performance-based-question/)) | Số PBQ/đề, cách chấm [Không công bố trên trang này] |
| **ISC2 (CISSP CAT)** | 100-150 câu "multiple choice and advanced item types" (đồ thị/bảng, tính toán, sắp thứ tự, kéo thả/hotspot, **tình huống**) [Đã kiểm chứng qua kết quả tìm kiếm trang ISC2] ([ISC2 Exam Outline](https://www.isc2.org/Notice/New-Cert/Exam-Outline)). CAT: câu đầu "well below the passing standard"; sau mỗi câu ước lượng lại năng lực; câu kế tiếp chọn sao cho thí sinh có "approximately a 50% chance"; dừng khi khoảng tin cậy 95% vượt ngưỡng hoặc đạt tối đa 150 câu; 25 câu pretest không tính điểm [Đã kiểm chứng] ([ISC2 CAT FAQ](https://www.isc2.org/certifications/computerized-adaptive-testing)) | — |
| **TryHackMe / HTB Academy** | Bài trong room là câu hỏi điền đáp án ngắn / flag, không phải MCQ; help center không mô tả định dạng câu [Chưa kiểm chứng chi tiết] ([TryHackMe Help](https://help.tryhackme.com/en/articles/6633511-creating-your-first-room)) | — |

**Điểm chung rút ra [Suy luận]:**
- Sản phẩm mạnh đều **bám nguồn** (NotebookLM, Kahoot PDF, Forms dán nội dung) và có **giải thích** (NotebookLM có trích dẫn nguồn, Forms, Khanmigo).
- Độ khó là tham số người dùng chọn (NotebookLM) hoặc do mô hình người học chọn (Duolingo Birdbrain, ISC2 CAT).
- Duolingo cho thấy mô hình "**sinh dư rồi lọc**" (sinh 10, giữ 3) và **tham số hoá prompt** (CEFR, chủ đề, điểm ngữ pháp). SecLearn có thể làm tương tự với (khái niệm, mức Bloom, dạng câu).
- Chứng chỉ an ninh mạng (CompTIA, ISC2) đánh giá **áp dụng trong tình huống**, không chỉ định nghĩa. Đây là khoảng cách lớn nhất của bộ câu hiện tại.

---

## 3. Kỹ thuật từ nghiên cứu

### 3.1 Hướng dẫn viết câu (item-writing)

- **NBME, *Constructing Written Test Questions for the Basic and Clinical Sciences* (ấn bản 4, 2016)** [Đã kiểm chứng] ([bản PDF do UConn lưu](https://health.uconn.edu/faculty-development/wp-content/uploads/sites/69/2017/06/constructing_written_test_questions.pdf); trang chính thức hiện là ấn bản 6, phải đăng ký tải: [nbme.org](https://www.nbme.org/item-writing-guide)). Năm quy tắc cho câu "one-best-answer":
  1. Mỗi câu tập trung vào **một khái niệm / testing point quan trọng**, lấy từ blueprint.
  2. Đánh giá **áp dụng kiến thức, không nhớ sự kiện rời rạc**: cần một *vignette* (tình huống) làm kích thích; không có vignette thì câu thường chỉ là nhớ.
  3. Lead-in phải "focused, closed, and clear"; **quy tắc che lựa chọn (cover-the-options)**: đọc stem + lead-in, che các lựa chọn, vẫn đoán được đáp án.
  4. Mọi lựa chọn **đồng nhất và hợp lý**.
  5. Rà soát để loại **lỗi kỹ thuật**. Hai nhóm lỗi:
     - *Irrelevant difficulty*: lựa chọn quá dài, số liệu không nhất quán, từ mơ hồ, lựa chọn không đồng nhất, không theo thứ tự logic, "None of the above", stem rườm rà, **stem phủ định**.
     - *Testwiseness*: gợi ý ngữ pháp; lựa chọn theo cặp / bao trùm; từ tuyệt đối ("always", "never"); **đáp án đúng dài hơn / cụ thể hơn**; **từ trong stem lặp lại ở đáp án**; *convergence* (đáp án đúng chung nhiều yếu tố nhất với các lựa chọn khác).
  - Chương phân tích câu: độ khó = P-value (tỉ lệ làm đúng; > 0,95 hoặc < 0,30 ít thông tin) và độ phân biệt = tương quan point-biserial giữa câu và tổng điểm.
- **Haladyna, Downing & Rodriguez (2002)**: 31 hướng dẫn viết MCQ, kiểm chứng bằng đồng thuận của 27 sách đo lường và 27 nghiên cứu từ 1990 [Đã kiểm chứng] ([UMN Experts](https://experts.umn.edu/en/publications/a-review-of-multiple-choice-item-writing-guidelines-for-classroom/)).
- **Số lựa chọn**: meta-analysis 80 năm của Rodriguez (2005), *Educational Measurement: Issues and Practice* 24(2), kết luận 3 lựa chọn là tối ưu trong đa số bối cảnh [Chỉ đọc được tóm tắt thứ cấp, chưa đọc toàn văn]. [Suy luận] SecLearn giữ 4 lựa chọn cho quen thuộc với đề chứng chỉ, nhưng **thà 3 distractor tốt còn hơn 1 distractor vô lý**; cho phép 3 lựa chọn khi verifier loại bớt.

### 3.2 Sinh theo mức Bloom và mục tiêu học tập

- Scaria, Chenna & Subramani (AIED 2024): 5 LLM sinh câu theo các mức Bloom; LLM tạo được câu chất lượng ở nhiều mức "when prompted with adequate information", nhưng **đánh giá tự động bằng LLM chưa ngang chuyên gia** [Đã kiểm chứng] ([arXiv 2408.04394](https://arxiv.org/abs/2408.04394)).
- Doughty et al. (ACE 2024): hệ thống GPT-4 sinh MCQ từ **ngữ cảnh khoá học + learning objective cấp module**; so 651 câu LLM với 449 câu người viết trên 246 LO; câu LLM có ngôn ngữ rõ, **một đáp án đúng**, distractor tốt và khớp LO [Đã kiểm chứng] ([arXiv 2312.03173](https://arxiv.org/abs/2312.03173)).
- [Suy luận] Bài học rút ra: **truyền mục tiêu học tập + mức Bloom + nguồn** cho từng câu tốt hơn là xin "5 câu về X".

### 3.3 Distractor từ misconception

- Feng et al. (Findings NAACL 2024): LLM sinh distractor **hợp lệ** nhưng "less adept at anticipating common errors or misconceptions among real students" [Đã kiểm chứng] ([arXiv 2404.02124](https://arxiv.org/abs/2404.02124)).
- DiVERT (Fernandez et al., 2024): học **biểu diễn lỗi bằng văn bản** đứng sau mỗi distractor rồi sinh distractor theo lỗi đó; mô hình 7B vượt GPT-4o; nhãn lỗi được giáo viên đánh giá ngang nhãn người viết [Đã kiểm chứng] ([arXiv 2406.19356](https://arxiv.org/abs/2406.19356)).
- Eedi (Kaggle 2024): mỗi distractor của họ được thiết kế để lộ **một misconception cụ thể**; cuộc thi yêu cầu ghép distractor ↔ mô tả misconception [Đã kiểm chứng qua blog chính chủ] ([Eedi](https://www.eedi.com/news/from-wrong-answers-to-real-insights-how-we-used-a-kaggle-challenge-to-map-student-misconceptions)).
- Survey: Alhazmi et al. (EMNLP 2024) tổng hợp phương pháp, bộ dữ liệu và chỉ số đánh giá distractor generation [Đã kiểm chứng] ([arXiv 2402.01512](https://arxiv.org/abs/2402.01512)).
- [Suy luận] Hệ quả cho SecLearn: buộc mô hình **ghi rõ misconception** cho từng distractor (vd. "nhầm XSS reflected với stored", "cho rằng HTTPS chống được phishing") thay vì chỉ "đáp án sai". Sau này có thể **khai thác câu sai thật** của người học (`QuizAttempt.answers`) để biết misconception nào phổ biến.

### 3.4 Tự phê bình, kiểm định, LLM-as-judge

- **MCQG-SRefine** (NAACL 2025): đầu vào = ca bệnh + **topic** + **test point**; GPT-4 sinh context, câu hỏi, đáp án, distractor; một bước **tự giải câu hỏi kèm lập luận**; chấm theo rubric (context 9 tiêu chí, câu hỏi 5, đáp án 5, distractor 7, lập luận 3); sửa; dừng khi > 90% điểm tối đa hoặc sau 4 vòng. Chuyên gia chọn bản này 72,5% thắng / 10% hoà / 17,5% thua so với GPT-4 thường; câu dễ giảm ~80% khi topic do chuyên gia chọn. LLM-as-judge rút gọn 10 tiêu chí đạt kappa 0,539 với chuyên gia (người–người 0,667) [Đã kiểm chứng] ([arXiv 2410.13191](https://arxiv.org/html/2410.13191v4)).
- **SecEval** (MCQ an ninh mạng): tách nguồn theo cấu trúc (chương/mục; tactic/technique ATT&CK) → GPT-4 sinh → GPT-4 tìm câu **quá dễ hoặc không tự đứng được** để sửa hoặc bỏ → **answer calibration**: đưa câu + nguồn cho GPT-4 giải, nếu khác đáp án gốc thì bỏ [Đã kiểm chứng] ([SecEval README](https://github.com/XuanwuAI/SecEval/blob/main/README.md)).
- **Phát hiện lỗi viết câu tự động**: Moore et al. (EC-TEL 2023) dùng rubric **19 Item-Writing Flaws**; phương pháp luật bắt 91% lỗi người gán, GPT-4 chỉ 79% [Đã kiểm chứng] ([arXiv 2307.08161](https://arxiv.org/abs/2307.08161)). Công cụ mã nguồn mở SAQUET kết hợp GPT-4 + embedding, báo > 94% [Đã kiểm chứng] ([arXiv 2405.20529](https://arxiv.org/abs/2405.20529)). [Suy luận] Nghĩa là **luật cứng rẻ và đáng tin hơn LLM** với các lỗi hình thức; LLM để kiểm ngữ nghĩa.
- **Lộ đáp án qua lựa chọn**: Balepur et al. (ACL 2024): LLM chỉ xem các lựa chọn (không có câu hỏi) vẫn vượt baseline ở 11/12 trường hợp, tới +0,33 accuracy [Đã kiểm chứng] ([arXiv 2402.12483](https://arxiv.org/abs/2402.12483)). [Đề xuất] Dùng chính điều này làm bộ lọc: nếu mô hình đoán đúng **chỉ từ các lựa chọn**, câu có thể đang lộ đáp án (đáp án dài hơn, chi tiết hơn…).
- Lỗi điển hình của MCQ do LLM sinh trong an ninh mạng: nhiều đáp án đúng, đáp án LLM sai, tham chiếu "Hình 1 / chương 4" (CyberMetric, CTIBench) [đã tổng hợp tại `docs/EVAL_DATASET_CONSTRUCTION.md:104-105`].

### 3.5 Độ khó, IRT, thích ứng

- **ISC2 CAT** chọn câu sao cho xác suất đúng ≈ 50% và ước lượng lại năng lực sau mỗi câu (§2) [Đã kiểm chứng].
- **IRT với "đám đông nhân tạo"**: Lalor et al. (EMNLP 2019) ước lượng tham số IRT từ câu trả lời của nhiều mô hình thay cho người; tương quan với tham số từ người ở mức trung bình đến cao; mã `py-irt` [Đã kiểm chứng] ([ACL Anthology D19-1434](https://aclanthology.org/D19-1434/)).
- **Học sinh mô phỏng**: *Generative Students* (L@S 2024): 45 hồ sơ học sinh GPT-4 theo **knowledge component đã nắm / đang nhầm / chưa có**; câu trả lời tương quan cao với học sinh thật, cùng phát hiện các câu khó [Đã kiểm chứng] ([arXiv 2405.11591](https://arxiv.org/abs/2405.11591)). Acquaye et al. (Findings ACL 2026): mô phỏng lớp học bằng LLM, fit IRT, tương quan với độ khó NAEP tới 0,75-0,82; LLM **đoán độ khó trực tiếp thì kém** [Chỉ đọc kết quả tìm kiếm abstract] ([arXiv 2601.09953](https://arxiv.org/abs/2601.09953)).
- **Dự đoán độ khó từ văn bản**: BEA 2024 Shared Task (NBME, 466 câu USMLE) [Đã kiểm chứng qua ACL Anthology] ([2024.bea-1.44](https://aclanthology.org/2024.bea-1.44.pdf)); survey Benedetto et al., ACM Computing Surveys 55(9), DOI 10.1145/3556538.
- **Theo dõi mức thành thạo / ôn cách quãng**: pyBKT (Bayesian Knowledge Tracing, EDM 2021) [Đã kiểm chứng] ([arXiv 2105.00385](https://arxiv.org/abs/2105.00385)); FSRS (lịch ôn theo mô hình Difficulty-Stability-Retrievability, mã nguồn mở) [Đã kiểm chứng tồn tại repo] ([open-spaced-repetition](https://github.com/open-spaced-repetition)).

---

## 4. Đề xuất cho SecLearn

### 4.1 Bảng xếp hạng (tác động / công sức cho đồ án)

| # | Đề xuất | Tác động | Công sức | Chạm vào code |
|---|---|---|---|---|
| **P0-1** | **Sinh từ nguồn**: người dùng chọn bài học / chủ đề / hội thoại → `retrieveChunks` lấy 4-8 chunk → `buildContext` đánh số → prompt bắt mỗi câu ghi `sourceIndex` và `evidence` (câu trích nguyên văn từ chunk) | Rất cao: hết câu chung chung, có thể kiểm đúng/sai | Thấp-TB | `src/app/[locale]/on-tap/page.tsx:64-80` (form chọn chủ đề), `src/lib/validations.ts:69-73` (thêm `lessonSlug`, `topic`, `count`, `difficulty`), `src/app/api/quizzes/generate/route.ts:17-36`, `src/lib/llm.ts:194-357` (tách ra `src/lib/quiz-gen.ts`), dùng lại `src/lib/rag.ts:128,431` |
| **P0-2** | **Schema câu giàu hơn + Zod** (xem §5.2): `bloom`, `difficulty`, `concept`, `questionType`, `explanation` mỗi lựa chọn, `misconception` mỗi distractor, `sourceChunkId`, `evidence` | Cao | Thấp | `prisma/schema.prisma:176-187` (thêm cột Json `meta` hoặc cột riêng), `src/app/api/quizzes/generate/route.ts:47-55` |
| **P0-3** | **Verifier luật cứng** (không tốn token): đúng 4 (hoặc 3) lựa chọn, id duy nhất, `correctOptionId ∈ options`, không trùng lựa chọn, không "tất cả/không đáp án nào", không stem phủ định, đáp án đúng không dài hơn hẳn (vd. > 1,5× trung vị), không lặp từ khoá stem chỉ ở đáp án, không tham chiếu "đoạn [n] / tài liệu" trong stem, xáo vị trí đáp án đúng | Cao (chặn lỗi NBME nhóm testwiseness) | Thấp | hàm mới `validateItem()` trong `src/lib/quiz-gen.ts`; test kiểu `src/lib/judge.test.ts` |
| **P0-4** | **Verifier LLM** (một lần gọi JSON cho cả lô): (a) **giải mù**: đưa stem + lựa chọn + chunk, không đưa đáp án → khác đáp án gốc thì bỏ (như SecEval); (b) **chỉ lựa chọn**: đưa các lựa chọn không có stem → đoán đúng với độ tự tin cao thì gắn cờ lộ đáp án; (c) rubric ngắn: một đáp án đúng duy nhất, distractor hợp lý, cover-the-options, đúng mức Bloom | Cao | TB | dùng `completeJson` `src/lib/llm.ts:158`; mẫu rubric như `src/lib/judge.ts:7-20` |
| **P0-5** | **Kiểm bằng chứng bằng cross-encoder**: điểm `rerankPairs([[stem + đáp án đúng, evidence]])` dưới ngưỡng → bỏ; `evidence` phải là chuỗi con của chunk | TB-Cao, gần như miễn phí | Thấp | `src/lib/rerank.ts:32`, mẫu `src/lib/verify.ts:17` |
| **P1-1** | **Dạng câu an ninh mạng** (§4.2): tình huống, phân tích artefact (log, HTTP, code, email), "tấn công gì", "biện pháp tốt nhất", "bước tiếp theo trong ứng phó sự cố", "sắp thứ tự" quy về MCQ | Rất cao (đây là thứ phân biệt với "câu nhớ") | TB (chủ yếu prompt + render code block) | prompt trong `src/lib/quiz-gen.ts`; render markdown cho `prompt` ở `src/app/[locale]/on-tap/[id]/page.tsx:89-111` |
| **P1-2** | **Kết quả từng câu + giải thích + link nguồn** sau khi nộp | Cao cho người học, dễ demo | Thấp | `src/app/[locale]/on-tap/[id]/page.tsx:54-71` (đọc `details`), `src/app/api/quizzes/[id]/attempts/route.ts:29-62` (trả thêm `explanation`, nguồn) |
| **P1-3** | **Sinh dư rồi chọn** (kiểu Duolingo): sinh 8-10 ứng viên cho 5 câu, lọc qua P0-3/4/5, **khử trùng** bằng embedding cosine hoặc cross-encoder giữa các stem, giữ câu phủ nhiều `concept` và mức Bloom khác nhau | Cao | Thấp-TB | `src/lib/embed.ts:179` (`embedTexts`) hoặc `src/lib/rerank.ts:32` |
| **P1-4** | **Blueprint theo mức Bloom / độ khó**: người dùng chọn Dễ/Vừa/Khó → ánh xạ phân phối (vd. Vừa = 1 remember, 2 understand/apply, 2 apply/analyze) | TB-Cao | Thấp | `generateQuizSchema` + prompt |
| **P1-5** | **Ôn lại câu sai**: nút "Luyện lại phần sai" → lấy `concept` + `sourceChunkId` của câu sai trong `QuizAttempt.answers` → sinh câu **mới** cùng khái niệm, khác bề mặt (đổi tình huống), cộng distractor đúng misconception người học đã chọn | Cao (cá nhân hoá, điểm cộng luận văn) | TB | `src/app/api/quizzes/generate/route.ts` (thêm `fromAttemptId`), đọc `prisma/schema.prisma:189-201` |
| **P2-1** | **Ước lượng độ khó bằng học sinh mô phỏng**: 3-5 "persona" (mới học / nhầm khái niệm X / khá) trả lời; tỉ lệ đúng → nhãn độ khó thực nghiệm, so với nhãn mô hình tự gắn | TB (tốt cho chương đánh giá) | TB | script offline trong `scripts/` |
| **P2-2** | **Thích ứng**: theo dõi mức thành thạo mỗi `concept` (Elo đơn giản hoặc BKT), chọn câu ~50-70% xác suất đúng; lịch ôn cách quãng | TB | Cao | bảng mới `ConceptMastery`; quá phạm vi nếu thời gian ít |
| **P2-3** | **Chuẩn hoá khái niệm theo taxonomy**: gắn `concept` vào CWE / ATT&CK technique / OWASP Top 10 để thống kê điểm yếu và câu "tấn công nào" | TB | TB-Cao (cần ingest CWE/ATT&CK, xem `docs/DATA_SOURCES.md`) | ingest + metadata `DocumentChunk.metadata` `prisma/schema.prisma:119-134` |

### 4.2 Dạng câu MCQ cho an ninh mạng (vẫn 1 đáp án đúng)

[Đề xuất] Mỗi dạng = một "template" (giống phần cố định trong prompt Mad Lib của Duolingo). Ví dụ chỉ minh hoạ dạng, nội dung thật phải lấy từ chunk.

| Dạng (`questionType`) | Bloom | Khung stem | Nguồn distractor (misconception) |
|---|---|---|---|
| `scenario_identify` – "đây là tấn công gì?" | Analyze | Mô tả tình huống / triệu chứng → "Kiểu tấn công nào phù hợp nhất?" | Tấn công có triệu chứng gần giống (phishing vs. pretexting, stored vs. reflected XSS, DoS vs. DDoS) |
| `artifact_log` – đọc log | Analyze | Đoạn log (auth.log, web access log) trong code block → "Dòng log cho thấy điều gì?" | Đọc nhầm trường, nhầm IP nguồn/đích, nhầm brute force với credential stuffing |
| `artifact_http` / `artifact_code` – tìm lỗ hổng | Analyze | HTTP request hoặc 5-15 dòng code → "Lỗ hổng chính là gì?" / "Dòng nào gây lỗi?" | Lỗ hổng khác cùng lớp (SQLi vs. command injection), lỗi không khai thác được |
| `best_mitigation` | Evaluate | Tình huống + ràng buộc → "Biện pháp **hiệu quả nhất** là gì?" | Biện pháp có thật nhưng không chặn đúng vector (WAF khi gốc là thiếu parameterized query; mật khẩu dài hơn khi vấn đề là phishing) |
| `next_step` – ứng phó sự cố | Apply | "Bạn vừa phát hiện X. Bước **tiếp theo** là gì?" | Bước đúng nhưng sai thứ tự (xoá máy trước khi thu chứng cứ) |
| `ordering_as_mcq` | Understand/Apply | "Thứ tự đúng của các giai đoạn là?" với 4 hoán vị | Hoán vị đổi hai bước dễ nhầm |
| `concept_contrast` | Understand | "Điểm khác biệt chính giữa A và B là?" | Thuộc tính đúng của A gán cho B |
| `phishing_spot` | Apply | Email/URL mẫu → "Dấu hiệu đáng ngờ nhất là?" | Đặc điểm bình thường nhìn có vẻ lạ |
| `recall` (giữ ít) | Remember | Định nghĩa | — (tối đa 1/5 câu) |

[Suy luận] Hai dạng `best_mitigation` và `next_step` cần **"một đáp án tốt nhất"** chứ không phải "đáp án duy nhất đúng", nên verifier (P0-4) phải hỏi "có lựa chọn nào khác cũng có thể đúng nhất không?" và prompt phải nêu ràng buộc để loại mơ hồ (theo NBME Rule 3-4).

### 4.3 Những điều không nên làm [Suy luận]

- Không sinh câu từ kiến thức mô hình khi không có chunk (sẽ quay lại vấn đề hiện tại). Nếu RAG không trả chunk đủ liên quan → báo người dùng chọn chủ đề khác, giống `noSourcesAnswer` của chat.
- Không dùng nội dung CyberMetric / SecQA / CTIBench làm câu phát hành cho người học (giấy phép, xem `docs/DATA_SOURCES.md:124-126`); chỉ dùng làm bộ so sánh.
- Không tin hoàn toàn LLM-as-judge (kappa chỉ "moderate" trong MCQG-SRefine; Scaria et al. cũng thấy đánh giá tự động kém chuyên gia). Cần một mẫu người chấm cho chương đánh giá.

---

## 5. Pipeline đề xuất

### 5.1 Các bước

```
[1] Chọn phạm vi        lessonSlug | topic | conversationId | fromAttemptId, difficulty, count (5-10)
        |
[2] Lấy nguồn           retrieveChunks(query = tiêu đề+tóm tắt bài / topic) -> buildContext -> [1..k]
        |                (không đủ chunk liên quan -> dừng, báo người dùng)
[3] Lập blueprint       1 lần gọi JSON: trích 5-8 "testing point" {concept, learningObjective, sourceIndex}
        |                + gán (bloom, questionType) theo phân phối độ khó
[4] Sinh ứng viên       1 lần gọi JSON: ~1,6 x count câu theo schema §5.2 (stem, 4 lựa chọn,
        |                explanation mỗi lựa chọn, misconception mỗi distractor, evidence)
[5] Luật cứng           validateItem(): cấu trúc, NBME testwiseness, evidence ⊂ chunk, xáo đáp án
        |
[6] Kiểm bằng chứng     rerankPairs(stem+đáp án, evidence) >= ngưỡng
        |
[7] Verifier LLM        giải mù + chỉ-lựa-chọn + rubric; (tuỳ chọn) 1 vòng sửa câu bị cờ (kiểu SRefine)
        |
[8] Khử trùng & chọn    cosine stem; ưu tiên phủ concept và Bloom khác nhau -> count câu
        |
[9] Lưu                 Question + meta (bloom, difficulty, concept, type, explanations, sourceChunkId, evidence,
                         verifier scores)
```

Chi phí [Suy luận]: 3 lần gọi LLM (blueprint, sinh, verify) + 1 request cross-encoder, so với 1 lần gọi hiện nay. Với `deepseek-flash` thì chấp nhận được; bước 3 có thể gộp vào bước 4 nếu cần nhanh.

### 5.2 Schema đầu ra đề xuất (JSON, kiểm bằng Zod)

```json
{
  "questions": [{
    "concept": "SQL injection – parameterized queries",
    "learningObjective": "Chọn biện pháp chặn SQLi phù hợp cho một truy vấn cụ thể",
    "bloom": "evaluate",
    "difficulty": "medium",
    "questionType": "best_mitigation",
    "stem": "…tình huống + đoạn code trong ```…```",
    "leadIn": "Biện pháp nào hiệu quả nhất để …?",
    "options": [
      {"id": "a", "text": "…", "correct": true,  "explanation": "…vì …"},
      {"id": "b", "text": "…", "correct": false, "misconception": "Cho rằng lọc ký tự đặc biệt là đủ", "explanation": "…"},
      {"id": "c", "text": "…", "correct": false, "misconception": "…", "explanation": "…"},
      {"id": "d", "text": "…", "correct": false, "misconception": "…", "explanation": "…"}
    ],
    "sourceIndex": 2,
    "evidence": "câu trích nguyên văn trong đoạn [2] ủng hộ đáp án đúng"
  }]
}
```

Lưu trữ [Đề xuất]: giữ nguyên `Question.prompt/options/correctOptionId` (để UI cũ chạy), thêm một cột `meta Json?` (bloom, difficulty, concept, questionType, explanations, misconceptions, sourceChunkId, evidence, verifier) — một migration nhỏ, không phá dữ liệu cũ. `correctOptionId` lấy từ lựa chọn có `correct: true` **sau khi xáo**.

### 5.3 Khung prompt sinh câu (rút gọn)

[Đề xuất] Gộp các quy tắc NBME (§3.1) thành chỉ thị ngắn, có ví dụ một câu tốt và một câu xấu:

- Chỉ dùng thông tin trong các đoạn được đánh số; mỗi câu dựa trên **một** đoạn và trích `evidence` nguyên văn.
- Stem có tình huống cụ thể (người, hệ thống, artefact); lead-in là **một câu hỏi đóng**; người giỏi phải trả lời được khi che lựa chọn.
- 4 lựa chọn cùng loại, cùng độ dài tương đương, cùng cấu trúc ngữ pháp; không "tất cả các ý trên", "không ý nào", không "luôn luôn/không bao giờ", không câu phủ định.
- Mỗi distractor phải đúng với **một misconception có tên**, nghe hợp lý với người mới học, nhưng sai rõ ràng theo đoạn nguồn.
- Không nhắc "đoạn [n]", "theo tài liệu" trong stem.
- Ngôn ngữ theo `locale`; giữ thuật ngữ tiếng Anh khi thông dụng.

---

## 6. Đánh giá cho luận văn

| Chỉ số | Cách đo | Gợi ý nguồn phương pháp |
|---|---|---|
| Tỉ lệ câu qua verifier | % ứng viên qua P0-3/4/5 | — |
| Đúng đáp án / một đáp án đúng | Người chấm (2 người, mẫu 50-100 câu) + giải mù bằng một LLM khác | SecEval answer calibration; MCQG-SRefine |
| Lỗi viết câu | Đếm theo 19 IWF hoặc danh sách NBME | Moore et al. 2023; NBME ch.3 |
| Bám nguồn | `evidence` ⊂ chunk; điểm cross-encoder; người chấm "câu trả lời được chỉ từ đoạn này?" | — |
| Phân bố Bloom | Người chấm gán Bloom, so với nhãn mô hình (kappa) | Scaria et al. 2024 |
| Lộ đáp án | Accuracy của LLM khi chỉ xem lựa chọn (càng gần 25% càng tốt) | Balepur et al. 2024 |
| Độ khó / phân biệt | P-value, point-biserial trên người dùng thật (nếu đủ lượt) hoặc học sinh mô phỏng | NBME ch.4; Lu & Wang 2024; Lalor et al. 2019 |
| So sánh A/B | Bộ cũ (`generateQuizJson` hiện tại) vs. pipeline mới, cùng chủ đề, người chấm mù | — |

---

## 7. Giới hạn của khảo sát

- Quizlet, Wayground, Gimkit, Brilliant, Canvas, Anki add-on, HTB Academy: không đọc được tài liệu chính chủ mô tả cơ chế sinh câu (trang bị chặn 403 hoặc không có). Kahoot help center chỉ đọc qua kết quả tìm kiếm.
- Rodriguez (2005) và Acquaye et al. (2026) chỉ đọc qua tóm tắt/kết quả tìm kiếm, chưa đọc toàn văn.
- NBME: trích từ ấn bản 4 (2016) do UConn lưu; ấn bản 6 hiện hành cần đăng ký tải, có thể khác chi tiết.

## 8. Nguồn

- Google Workspace Updates (11/09/2025): https://workspaceupdates.googleblog.com/2025/09/flashcards-quizzes-reports-notebook-lm-google-education.html
- Google Blog, NotebookLM student features (08/09/2025): https://blog.google/technology/google-labs/notebooklm-student-features/
- Duolingo Blog, LLM lessons: https://blog.duolingo.com/large-language-model-duolingo-lessons
- Duolingo Blog, Duolingo Max (14/03/2023): https://blog.duolingo.com/duolingo-max/
- Khan Academy Blog, AI generators: https://blog.khanacademy.org/?p=16522
- Microsoft Forms Blog: https://techcommunity.microsoft.com/blog/microsoftformsblog/create-quizzes-with-copilot-in-forms/4193986 ; https://techcommunity.microsoft.com/blog/microsoftformsblog/copilot-in-forms-generate-quiz-with-answer-explanations-and-rewrite-questions-wi/4226904 ; FAQ: https://support.microsoft.com/en-us/office/frequently-asked-questions-about-copilot-in-forms-c9941b72-b32e-4c7e-9af9-e603929bb1d2
- Kahoot Help: https://support.kahoot.com/hc/en-us/articles/40988856361747 ; Blog: https://kahoot.com/blog/2024/01/17/ai-pdf-question-generator-for-educators/
- Coursera Blog: https://blog.coursera.org/coursera-coach-leveraging-genai-to-empower-learners
- CompTIA, What is a PBQ: https://www.comptia.org/en-us/blog/what-is-a-performance-based-question/
- ISC2 CAT FAQ: https://www.isc2.org/certifications/computerized-adaptive-testing ; Exam outline: https://www.isc2.org/Notice/New-Cert/Exam-Outline
- NBME, Constructing Written Test Questions (4th ed., 2016): https://health.uconn.edu/faculty-development/wp-content/uploads/sites/69/2017/06/constructing_written_test_questions.pdf ; https://www.nbme.org/item-writing-guide
- Haladyna, Downing, Rodriguez (2002), Applied Measurement in Education 15(3): https://experts.umn.edu/en/publications/a-review-of-multiple-choice-item-writing-guidelines-for-classroom/
- Scaria et al., AIED 2024: https://arxiv.org/abs/2408.04394
- Doughty et al., ACE 2024: https://arxiv.org/abs/2312.03173
- Feng et al., Findings NAACL 2024: https://arxiv.org/abs/2404.02124
- Fernandez et al., DiVERT: https://arxiv.org/abs/2406.19356
- Alhazmi et al., Distractor Generation survey: https://arxiv.org/abs/2402.01512
- Eedi, Kaggle misconceptions: https://www.eedi.com/news/from-wrong-answers-to-real-insights-how-we-used-a-kaggle-challenge-to-map-student-misconceptions
- Yao et al., MCQG-SRefine (NAACL 2025): https://arxiv.org/abs/2410.13191
- SecEval README: https://github.com/XuanwuAI/SecEval/blob/main/README.md
- Moore et al., EC-TEL 2023: https://arxiv.org/abs/2307.08161 ; SAQUET: https://arxiv.org/abs/2405.20529
- Balepur et al., ACL 2024: https://arxiv.org/abs/2402.12483
- Lalor et al., EMNLP 2019: https://aclanthology.org/D19-1434/
- Lu & Wang, Generative Students (L@S 2024): https://arxiv.org/abs/2405.11591
- Acquaye et al., Findings ACL 2026: https://arxiv.org/abs/2601.09953
- BEA 2024 shared task paper: https://aclanthology.org/2024.bea-1.44.pdf
- pyBKT: https://arxiv.org/abs/2105.00385 ; FSRS: https://github.com/open-spaced-repetition
- OneClickQuiz (Moodle plugin): https://arxiv.org/pdf/2510.03374
