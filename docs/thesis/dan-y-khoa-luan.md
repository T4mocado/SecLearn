# Dàn ý chi tiết báo cáo khóa luận tốt nghiệp — SecLearn

> Lập ngày 2026-10-23. Căn cứ: quy định viết báo cáo khóa luận của Khoa CNTT – NEU (fit.neu.edu.vn/post/mot-so-quy-dinh-viet-bao-cao-khoa-luan),
> hai khóa luận mẫu (Phạm Thị Mai – *Chatbot song ngữ RAG tra cứu môn học*, 2025; Nguyễn Minh Quang – *Hệ thống điều hướng tương tác AI*),
> và trạng thái hiện tại của repo (`README.md`, `Detali-design.md`, `GLOSSARY.md`, `docs/adr/`, `Dataset/CARD.md`, `docs/EVAL_*.md`).
>
> Thuật ngữ trong báo cáo dùng đúng `GLOSSARY.md` (corpus, snapshot corpus, gold span, bộ đánh giá, mức L1–L7, cụm chủ đề, hạn mức, số chính, gold set / silver set…).

---

## 0. Định hướng chung

**Tên đề tài (đề xuất, chốt với GVHD):**
*Xây dựng trợ lý ảo hỏi đáp an toàn ứng dụng web dựa trên RAG và bộ dữ liệu đánh giá tiếng Việt* (SecLearn).

**Điểm khác so với hai khóa luận mẫu — nên nhấn mạnh xuyên suốt:**
1. Không dừng ở "chạy thử vài câu, chụp màn hình" (như cả hai mẫu): SecLearn có **bộ đánh giá riêng ~1.475 câu**, số chính chọn trước khi đo, có khoảng tin cậy và kiểm định.
2. Pipeline RAG nhiều tầng: lập kế hoạch truy vấn (viết lại, dịch sang tiếng Anh, HyDE), truy xuất lai vector + từ khóa, rerank cross-encoder, ngưỡng liên quan, từ chối không gọi LLM, hậu kiểm trích dẫn, LLM-as-judge.
3. Bài toán **xuyên ngôn ngữ**: hỏi tiếng Việt, tri thức là OWASP tiếng Anh.

**Cấu trúc chương (4 chương, theo khung của khoa).** Chương 3 gồm cả hai sản phẩm: ứng dụng SecLearn (3.1–3.6) và bộ dữ liệu đánh giá (3.7–3.8).

| Phần | Trang dự kiến | Ghi chú theo quy định |
|---|---|---|
| Mở đầu | 1–2 | Tên đề tài, mục đích, phương pháp, kết quả chính |
| Chương 1. Tổng quan đề tài | 6–8 | Khung 5–10 trang |
| Chương 2. Cơ sở lý thuyết | 12–15 | Khung 10–15 trang |
| Chương 3. Phân tích, thiết kế hệ thống và bộ dữ liệu đánh giá | 24–28 (ứng dụng 15–17, bộ đánh giá 9–11) | Khung 15–20 trang — vượt, xem lưu ý dưới bảng |
| Chương 4. Kết quả thực nghiệm và thảo luận | 10–14 | Khung 10–15 trang |
| Kết luận | 1–2 | |
| **Tổng phần chính** | **≈ 54–69** | **Tối thiểu 50 trang** (Mở đầu → Kết luận) |

Khung trang của khoa chỉ mang tính tham khảo, nhưng Chương 3 dài gấp rưỡi khung. Để giữ gọn: chỉ đặc tả 3–4 use case chính, đưa bảng thuộc tính đầy đủ của CSDL và đặc tả API sang Phụ lục, trong 3.7–3.8 chỉ giữ bảng cụm, bảng mức và bảng hạn mức. Nếu GVHD chấp nhận 5 chương thì tách 3.7–3.8 thành chương riêng.

---

## 1. Phần đầu (không tính vào 50 trang)

1. **Bìa chính, bìa phụ** — đúng mẫu khoa. Gáy: `2026-2027.1` · `CÔNG NGHỆ THÔNG TIN` · `HỌ TÊN SINH VIÊN` · mã SV (kiểm lại học kỳ với khoa).
2. **Mục lục** — tự động (Heading 1–4 của Word).
3. **Lời cam đoan** — có chữ ký. Nên thêm một câu: công cụ AI (Claude, Gemini, DeepSeek…) được dùng ở đâu (sinh câu hỏi ứng viên, LLM judge, hỗ trợ lập trình) và người viết chịu trách nhiệm kiểm duyệt.
4. **Lời cảm ơn**.
5. **Danh mục từ viết tắt** — dự kiến: AI, API, BM25, CSDL, CSRF, ERD, HyDE, IR, JWT, LLM, MRR, nDCG, NLP, OWASP, RAG, SSE, UI, UML, WSTG, XSS, ORM, SQLi…
6. **Danh mục bảng, danh mục hình, danh mục công thức** — tự động (công thức: recall@k, MRR, nDCG, cosine, sai số chuẩn theo cụm, khoảng Wilson).

---

## 2. MỞ ĐẦU (1–2 trang)

- Bối cảnh: thiếu nhân lực an toàn thông tin; người mới học tiếng Việt khó tiếp cận tài liệu chuẩn (OWASP) vốn bằng tiếng Anh; chatbot đa dụng dễ "bịa" (hallucination), không trích nguồn.
- Đề tài: SecLearn — ứng dụng web học an toàn thông tin cơ bản, lõi là trợ lý RAG trả lời tiếng Việt **chỉ dựa trên corpus OWASP**, có trích dẫn `[n]`, biết từ chối.
- Mục đích kép: (1) xây ứng dụng; (2) xây bộ đánh giá tiếng Việt để đo nó một cách tái lập.
- Phương pháp: nghiên cứu tài liệu, phân tích–thiết kế hướng đối tượng (UML), phát triển lặp, thực nghiệm định lượng trên bộ đánh giá.
- Kết quả chính (viết sau khi có số): sản phẩm chạy được (Docker Compose), corpus 134 tài liệu / 5.915 chunk, bộ đánh giá N câu, số chính recall@5 macro = …
- Bố cục báo cáo: một câu cho mỗi chương.

---

## 3. CHƯƠNG 1. TỔNG QUAN ĐỀ TÀI (6–8 trang)

### 1.1. Lý do chọn đề tài
- Nhu cầu học an toàn ứng dụng web; rào cản ngôn ngữ; hạn chế của ChatGPT đa dụng (không trích nguồn, không kiểm soát nguồn) — tham chiếu `docs/CHATBOT_VS_CHATGPT.md`.
- Khoảng trống: chưa có bộ đánh giá RAG tiếng Việt cho miền an toàn web (tham chiếu `docs/EVAL_DATASET_RESEARCH.md`).

### 1.2. Mục tiêu đề tài
#### 1.2.1. Mục tiêu về sản phẩm
- Trợ lý RAG song ngữ có trích dẫn, panel nguồn, từ chối khi ngoài corpus; bài học song ngữ; Ôn tập trắc nghiệm sinh bằng LLM; trang quản trị.
#### 1.2.2. Mục tiêu về nghiên cứu và đánh giá
- Bộ đánh giá ~1.475 câu, thang L1–L7, gold span, có gold set người duyệt; đo truy xuất và khả năng từ chối; so sánh các cấu hình `RAG_*`.

### 1.3. Đối tượng và phạm vi nghiên cứu
#### 1.3.1. Đối tượng nghiên cứu
- Kỹ thuật RAG (truy xuất lai, rerank, truy vấn xuyên ngôn ngữ); phương pháp xây bộ đánh giá IR/QA.
- Người dùng: sinh viên, người mới học ATTT; quản trị viên nội dung.
#### 1.3.2. Phạm vi nghiên cứu
- Corpus: chỉ OWASP Cheat Sheet Series + WSTG, 134 tài liệu, CC BY-SA 4.0 (ADR 0001 — giải thích vì sao bỏ NIST).
- Ngôn ngữ câu hỏi: tiếng Việt (giao diện VI/EN).
- Đánh giá: số chính đo phần truy xuất; phần trả lời đo từ chối (L6) và định nghĩa sẵn các độ đo khác.
- Ngoài phạm vi: tinh chỉnh (fine-tune) model, triển khai production quy mô lớn, nhiều người gán nhãn.

### 1.4. Phương pháp nghiên cứu
#### 1.4.1. Phương pháp nghiên cứu tài liệu
- RAG, IR evaluation (TREC, MS MARCO, BEIR), bộ QA (SQuAD 2.0, MuSiQue, MultiHop-RAG), Ragas, LLM-as-judge.
#### 1.4.2. Phương pháp phân tích, thiết kế và phát triển
- UML (use case, hoạt động, tuần tự), ERD; phát triển lặp theo ticket (`Dataset/.scratch/`), ADR ghi quyết định.
#### 1.4.3. Phương pháp thực nghiệm và đánh giá
- Sinh câu bằng LLM → lọc tự động → người duyệt; pooling; đăng ký trước số chính; sai số chuẩn theo nhóm, kiểm định ngẫu nhiên hoá.

### 1.5. Ý nghĩa khoa học và thực tiễn
- Khoa học: quy trình xây bộ đánh giá RAG tiếng Việt tái lập (snapshot, span, phiên bản); công bố được theo CC BY-SA.
- Thực tiễn: công cụ học ATTT tiếng Việt có kiểm chứng nguồn; dùng được trong giảng dạy.

### 1.6. Bố cục báo cáo
- Tóm tắt nội dung từng chương.

> **Hình/bảng gợi ý:** Bảng 1.1 so sánh SecLearn với ChatGPT và hai hệ thống mẫu (nguồn, trích dẫn, từ chối, đánh giá định lượng).

---

## 4. CHƯƠNG 2. CƠ SỞ LÝ THUYẾT (12–15 trang)

### 2.1. An toàn ứng dụng web và tài liệu OWASP
#### 2.1.1. Các lớp lỗ hổng ứng dụng web phổ biến
- Injection, XSS, CSRF, xác thực/phiên, phân quyền, cấu hình… — ngắn gọn, đủ để người đọc hiểu 10 cụm chủ đề.
#### 2.1.2. OWASP Cheat Sheet Series và WSTG
- Cấu trúc, mã test case `WSTG-XXXX-NN`, giấy phép CC BY-SA 4.0; vì sao chọn làm corpus.

### 2.2. Mô hình ngôn ngữ lớn và biểu diễn vector
#### 2.2.1. Mô hình ngôn ngữ lớn (LLM)
- Transformer (ngắn), prompting, giới hạn: hallucination, kiến thức cố định, ngữ cảnh hữu hạn.
#### 2.2.2. Embedding và độ tương đồng
- Bi-encoder, cosine (công thức 2.1); embedding đa ngôn ngữ / tiếng Việt (BKAI vietnamese-bi-encoder 768 chiều, OpenAI text-embedding-3-small 1536 chiều).
#### 2.2.3. Cross-encoder và rerank
- So sánh bi-encoder vs cross-encoder; BAAI/bge-reranker-v2-m3.

### 2.3. Sinh tăng cường truy xuất (RAG)
#### 2.3.1. Kiến trúc RAG cơ bản
- Indexing → retrieval → generation (Hình 2.1).
#### 2.3.2. Chia đoạn (chunking)
- Theo câu, kích thước/overlap; ảnh hưởng tới truy xuất.
#### 2.3.3. Truy xuất lai và kỹ thuật cải thiện truy vấn
- Tìm kiếm từ khóa (tsvector/BM25), vector, kết hợp; viết lại truy vấn, dịch truy vấn, HyDE.
#### 2.3.4. Kiểm soát chất lượng câu trả lời
- Trích dẫn, grounding / hậu kiểm trích dẫn, ngưỡng liên quan và từ chối, LLM-as-judge.

### 2.4. Đánh giá hệ thống RAG
#### 2.4.1. Độ đo truy xuất
- Hit@k, Recall@k, MRR@k, nDCG@k (công thức 2.2–2.5), qrels, mức liên quan; Judged@k.
#### 2.4.2. Độ đo phần trả lời
- EM/F1, answer correctness, faithfulness, tỉ lệ từ chối đúng/sai.
#### 2.4.3. Xây dựng bộ đánh giá
- Sinh tổng hợp bằng LLM (Ragas, InPars), câu không trả lời được (SQuAD 2.0), multi-hop, pooling (TREC), độ đồng ý / độ ổn định người gán.
#### 2.4.4. Thống kê trong đánh giá
- Khoảng tin cậy, sai số chuẩn theo cụm (Miller 2024), kiểm định ngẫu nhiên hoá ghép cặp, hiệu chỉnh Holm.

### 2.5. Các nghiên cứu và giải pháp liên quan
- Chatbot RAG giáo dục (gồm hai khóa luận mẫu ở NEU), trợ lý bảo mật, bộ đánh giá RAG tiếng Việt hiện có. Nêu hạn chế → khoảng trống đề tài lấp.

### 2.6. Công nghệ sử dụng
#### 2.6.1. Ứng dụng web
- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Radix/shadcn, next-intl, Auth.js v5.
#### 2.6.2. Dữ liệu và AI
- PostgreSQL 16 + pgvector, Prisma 6; DeepSeek/OpenAI qua SDK `openai`; máy chủ embedding/rerank Python (`scripts/embed_server.py`).
#### 2.6.3. Bộ đánh giá và triển khai
- Python + uv, ranx / ir-measures, Label Studio; Docker Compose; Git.

> **Hình/bảng gợi ý:** Hình 2.1 kiến trúc RAG cơ bản; Hình 2.2 bi-encoder vs cross-encoder; Bảng 2.1 tổng hợp độ đo và dạng dữ liệu cần; Bảng 2.2 so sánh nghiên cứu liên quan.

---

## 5. CHƯƠNG 3. PHÂN TÍCH, THIẾT KẾ HỆ THỐNG VÀ BỘ DỮ LIỆU ĐÁNH GIÁ (24–28 trang)

Nguồn chính của 3.1–3.6: `Detali-design.md` (đã có sơ đồ Mermaid dựng từ code — vẽ lại thành hình cho báo cáo).

### 3.1. Phân tích yêu cầu
#### 3.1.1. Tác nhân và phân quyền
- Khách (giới hạn 10 câu), người học, quản trị; bảng quyền từ `src/lib/permissions.ts` (Bảng 3.1).
#### 3.1.2. Yêu cầu chức năng
- Danh sách F01–F… (xác thực, chatbot, RAG, bài học, ôn tập, quản trị) — Bảng 3.2.
#### 3.1.3. Yêu cầu phi chức năng
- Song ngữ, streaming SSE, bảo mật (bcrypt, JWT kiểm lại 5 phút, mật khẩu mạnh, khóa tài khoản, không tự hạ quyền admin cuối), tái lập cấu hình qua biến `RAG_*`, chạy được bằng mock khi không có API key.

### 3.2. Mô hình hóa chức năng
#### 3.2.1. Biểu đồ use case
- Use case tổng quát (Hình 3.1); đặc tả use case chính: Hỏi trợ lý, Tạo bộ ôn tập, Tải & lập chỉ mục tài liệu, Quản lý người dùng (Bảng 3.3–3.6, theo mẫu bảng đặc tả của khóa luận mẫu).
#### 3.2.2. Biểu đồ hoạt động
- Hỏi đáp (gồm nhánh từ chối), nạp tài liệu PDF, sinh & làm quiz.
#### 3.2.3. Biểu đồ tuần tự
- Gửi câu hỏi → plan → retrieve → rerank → generate (stream) → verify → judge; chuyển hội thoại khách vào tài khoản.

### 3.3. Thiết kế cơ sở dữ liệu
#### 3.3.1. Mô hình thực thể – quan hệ
- 11 model Prisma: User, GuestQuota, Conversation, Message, Document, DocumentChunk, Lesson, LessonTranslation, Quiz, Question, QuizAttempt (Hình ERD).
#### 3.3.2. Đặc tả bảng
- Bảng thuộc tính cho các bảng chính; nhấn mạnh `DocumentChunk` (vector, tsvector, offset, mức hiển thị `public/authenticated`).

### 3.4. Thiết kế kiến trúc hệ thống
#### 3.4.1. Kiến trúc tổng thể
- Monolith Next.js (UI + API route), Postgres/pgvector, embed/rerank server, nhà cung cấp LLM; provider có thể thay (`*_PROVIDER`), không lặng lẽ fallback mock.
#### 3.4.2. Thiết kế API
- Nhóm endpoint `auth`, `chat`, `lessons`, `quizzes`, `admin`; định dạng sự kiện SSE.

### 3.5. Thiết kế pipeline RAG (trọng tâm phần ứng dụng)
#### 3.5.1. Nạp tài liệu và lập chỉ mục
- PDF → `pdf-parse` → làm sạch (`pdf-cleanup.ts`) → markdown → chunk theo câu (800 / overlap 80) → embedding → pgvector + tsvector; hàng đợi ingest; reindex khi đổi `EMBED_DIM`.
#### 3.5.2. Lập kế hoạch truy vấn
- Viết lại theo ngữ cảnh hội thoại, dịch sang tiếng Anh (`RAG_TRANSLATE_QUERY`), HyDE, câu so sánh, nhận diện câu hỏi về chính hội thoại (`query.ts`).
#### 3.5.3. Truy xuất lai và rerank
- `RAG_CANDIDATES` = 20 ứng viên → cross-encoder → `RAG_TOP_K` = 5; ngưỡng `RAG_MIN_RELEVANCE`, `RAG_RELATIVE_MIN`, `RAG_MIN_KEEP`; ngoài chủ đề → từ chối cố định, không gọi LLM.
#### 3.5.4. Sinh câu trả lời và kiểm soát chất lượng
- Prompt có ràng buộc trích dẫn `[n]`; hậu kiểm trích dẫn (`verify.ts`, `grounding.ts`); LLM-as-judge (`judge.ts`); panel nguồn hiển thị đoạn được/không được trích và điểm rerank.

### 3.6. Triển khai hệ thống
#### 3.6.1. Môi trường và cấu hình
- Biến môi trường, Docker Compose (app + Postgres, volume uploads), seed admin & bài học.
#### 3.6.2. Kiểm thử phần mềm
- Unit test các module lõi (chunking, grounding, judge, permissions, retrieval, snapshot, sources…); xuất snapshot corpus cho bộ đánh giá.

### 3.7. Thiết kế bộ dữ liệu đánh giá
Nguồn chính của 3.7–3.8: `Dataset/CARD.md`, `docs/EVAL_DATASET_CONSTRUCTION.md`, `docs/EVAL_DATASET_BALANCE_INFRA.md`, ADR 0002–0004, `xay-dung-dataset-danh-gia-tro-ly-ao.md`.
#### 3.7.1. Mục tiêu đo và nguyên tắc tái lập
- Đo truy xuất (chunk nào đến tay model) và khả năng từ chối; định nghĩa sẵn phần trả lời.
- Dự án riêng `Dataset/`, nối với app chỉ qua snapshot corpus (ADR 0004); gold lưu dạng span theo offset codepoint, qrels sinh lại cho mỗi cách chunk; ghi `snapshot_id`, sha256, commit app; canary chống rò rỉ.
#### 3.7.2. Snapshot corpus và cụm chủ đề
- `2026-10-18-owasp`: 134 tài liệu, 5.915 chunk, WSTG 24,8%; vùng loại trừ (mục lục, phụ lục payload, tài liệu tham khảo).
- 10 cụm (arch, supply, inj, auth, browser, framework, ai, transport, authz, api) — Bảng 3.x.
#### 3.7.3. Thang mức câu hỏi L1–L7
- L1 tra cứu một đoạn; L2 diễn đạt lại; L3 nhiều đoạn một chủ đề; L4 so sánh; L5 tình huống nhiều bước; L6 không trả lời được; L7 hội thoại nhiều lượt — bảng kèm ví dụ.
- L6 gồm ba loại a/b/c; cách chứng minh corpus không có (grep + pool + người).
#### 3.7.4. Phân bổ hạn mức
- Vấn đề corpus lệch (WSTG chiếm phần lớn chunk) và các phương án đã cân nhắc (ADR 0003).
- Phương án căn bậc hai hai tầng: √ số chunk theo cụm, rồi theo tài liệu; trần mỗi tài liệu; sàn 100 câu/cụm trên test; seed cố định. Bảng phân bổ test 1.300 / dev 175.

### 3.8. Quy trình xây dựng bộ đánh giá
#### 3.8.1. Sinh câu ứng viên bằng LLM
- Prompt có phiên bản (`gen-L1-v1`…); "khẳng định trước, câu hỏi sau"; xử lý slot model từ chối; lý do sinh dư.
#### 3.8.2. Lọc tự động và LLM judge
- `filter-answer-v1`, `filter-level-v1`; kiểm schema (`check`); thống kê tỉ lệ bị loại (`filter-report.json`).
#### 3.8.3. Gán nhãn bởi người và pilot
- Label Studio; hướng dẫn gán nhãn v0 → v1 sau pilot 50 câu; một người gán → đo độ ổn định (gán lại ~100 mẫu sau ≥ 1 tuần) (ADR 0002).
#### 3.8.4. Pooling và qrels
- Gộp top-k từ nhiều cấu hình; thang liên quan 0–3; quy tắc chunk liên quan (giao span ≥ 50%).
#### 3.8.5. Quy chuẩn báo cáo kết quả (đăng ký trước)
- Số chính: recall@5 macro trên 10 cụm, chỉ câu trả lời được của test; L6 báo riêng. Số phụ: hit@k, MRR@10, nDCG@10, recall@10, judged@10, micro, hậu phân tầng.
- SE theo nhóm sai số, khoảng Wilson cho tầng nhỏ, kiểm định ngẫu nhiên hoá theo nhóm khi so hai cấu hình; dev để chỉnh, test chỉ để báo.

> **Hình/bảng gợi ý:** use case, 3 hoạt động, 2 tuần tự, ERD, kiến trúc tổng thể, sơ đồ pipeline RAG chi tiết (hình quan trọng nhất của phần ứng dụng), bảng tham số `RAG_*` mặc định; sơ đồ quy trình xây bộ đánh giá (snapshot → kế hoạch → sinh → lọc → gán → pool → qrels → score → card), bảng cụm, bảng mức L1–L7, bảng hạn mức, bảng schema một mẫu JSONL. Chương này nhiều hình nhất — đánh số liên tục Hình 3.1, 3.2… theo thứ tự xuất hiện.

---

## 6. CHƯƠNG 4. KẾT QUẢ THỰC NGHIỆM VÀ THẢO LUẬN (10–14 trang)

> Phần số liệu chỉ viết sau khi chạy (ticket 10–13). Không điền số dự đoán.

### 4.1. Kết quả xây dựng ứng dụng
#### 4.1.1. Giao diện người dùng
- Trang chủ/chat khách, chat đăng nhập với trích dẫn và panel nguồn, câu bị từ chối, bài học VI/EN, Ôn tập (tạo – làm – chấm).
#### 4.1.2. Giao diện quản trị
- Quản lý người dùng, tải PDF & trạng thái ingest, reindex, quản lý bài học.

### 4.2. Kết quả xây dựng bộ đánh giá
#### 4.2.1. Thống kê bộ đánh giá
- Số câu theo split/mức/cụm thực tế; tỉ lệ ứng viên bị lọc ở từng bước; số câu gold vs silver.
#### 4.2.2. Chất lượng nhãn
- Kết quả pilot, độ ổn định người gán, tỉ lệ lỗi ước tính trên silver set.

### 4.3. Kết quả đánh giá hệ thống
#### 4.3.1. Thiết lập thực nghiệm
- Các cấu hình so sánh (ví dụ: chỉ vector / lai; có–không rerank; có–không dịch truy vấn; có–không HyDE; embedding BKAI vs OpenAI), commit, `config.json` mỗi run.
#### 4.3.2. Kết quả truy xuất
- Số chính recall@5 macro ± KTC 95%; bảng số phụ; kết quả theo mức và theo cụm (biểu đồ).
#### 4.3.3. Kết quả khả năng từ chối
- Từ chối đúng trên L6 (chung, a/b/c) và từ chối sai trên câu trả lời được.
#### 4.3.4. So sánh các cấu hình
- Hiệu ghép cặp, p-value kiểm định ngẫu nhiên hoá, kết luận cấu hình mặc định nên chọn.

### 4.4. Thảo luận
#### 4.4.1. Phân tích lỗi
- Nhóm lỗi điển hình (truy vấn tiếng Việt dịch lệch thuật ngữ, câu L4/L5 cần nhiều đoạn, ngưỡng từ chối quá chặt/lỏng) kèm ví dụ.
#### 4.4.2. Hạn chế và mối đe dọa tính hợp lệ
- Một người gán nhãn; câu sinh bởi LLM có thể thiên lệch; bộ đánh giá không đại diện phân bố câu hỏi thật (hạn mức √); qrels thiếu dù có pooling; số đo gắn với một snapshot và một cách chunk.

### 4.5. Tiến độ thực hiện
- Bảng kế hoạch vs thực tế theo tuần (khóa luận mẫu Phạm Thị Mai có mục này; khoa yêu cầu 12 tuần gặp GVHD).

> **Hình/bảng gợi ý:** ảnh chụp giao diện (đánh số Hình 4.x, mỗi hình phải được nhắc trong bài); Bảng 4.x kết quả; biểu đồ cột theo cụm có thanh sai số; biểu đồ theo mức.

---

## 7. KẾT LUẬN (1–2 trang)

- Kết quả đạt được: tóm tắt sản phẩm + bộ đánh giá + số chính (một đoạn mỗi ý).
- Đóng góp: quy trình đánh giá RAG tiếng Việt tái lập; bộ dữ liệu công bố được (CC BY-SA 4.0).
- Hướng phát triển: đo đầy đủ phần trả lời (correctness, faithfulness, trích dẫn); thêm người gán nhãn để đo κ; mở rộng corpus (NIST — cần snapshot mới, ADR 0001); thu log người dùng thật; tinh chỉnh embedding/reranker tiếng Việt; đánh giá với người học thật.

---

## 8. Phần cuối

1. **Tài liệu tham khảo** — chuẩn **IEEE**, chỉ gồm tài liệu có trích trong bài. Nhóm chính: OWASP CS & WSTG; bài gốc RAG (Lewis 2020), HyDE, SQuAD 2.0, MuSiQue, MultiHop-RAG, MS MARCO, BEIR, TREC pooling, Ragas, InPars/Promptagator, Miller 2024 (*Adding Error Bars to Evals*), ranx/ir-measures; tài liệu Next.js, Prisma, pgvector, Auth.js. Lấy từ mục Nguồn trong các file `docs/EVAL_*.md`.
2. **Phụ lục** (không dài hơn phần chính):
   - A. Hướng dẫn cài đặt, chạy (từ `README.md`) và bảng biến môi trường.
   - B. Prompt dùng trong app (plan, answer, judge) và trong bộ đánh giá (gen-L*, filter-*).
   - C. Hướng dẫn gán nhãn v1.
   - D. Dataset card (`Dataset/CARD.md`) và schema JSONL.
   - E. Đặc tả API chi tiết và bảng thuộc tính đầy đủ của CSDL (chuyển từ Chương 3).
   - F. Ví dụ câu hỏi mỗi mức L1–L7 và câu trả lời của hệ thống.
3. **Kết quả kiểm tra Turnitin**.

---

## 9. Lưu ý trình bày (theo quy định khoa)

- Word, Times New Roman 13, Unicode, căn đều, giãn dòng 1.3, đoạn 6pt trước / 0pt sau; lề trên/dưới 2,5 cm, trái 3,5 cm, phải 2,5 cm; in 2 mặt, gáy keo.
- Tên chương: cỡ 18, IN HOA, đậm, căn giữa. Mục/tiểu mục: cỡ 13, đậm, không thụt đầu dòng.
- Đánh số tối đa 4 cấp (vd. 3.5.3.1); **mỗi nhóm có ít nhất 2 tiểu mục** — dàn ý trên đã tuân thủ; khi viết, nếu bỏ một tiểu mục thì gộp nhóm đó lên cấp trên.
- Hình/bảng đánh số theo chương; **tên bảng trên bảng, tên hình dưới hình**; mọi hình/bảng phải được nhắc bằng số ("xem Hình 3.7"), có nguồn nếu lấy từ nơi khác. Sơ đồ Mermaid trong `Detali-design.md` nên xuất ảnh độ phân giải cao.
- Công thức đánh số `(2.1)` căn phải; ký hiệu giải thích ở lần đầu.
- Viết tắt: lần đầu viết đầy đủ kèm (viết tắt); hạn chế tối đa. Thuật ngữ tiếng Anh giữ nguyên khi không có từ Việt thông dụng, theo `GLOSSARY.md`.
- Nộp: 1 bản in có chữ ký GVHD; file `MãSV_Họ Tên_Tên đề tài.zip` gồm PDF, thư mục `Source`, `Readme.md`, gửi kcntt@neu.edu.vn (giới hạn dung lượng trang ghi lệch 20/25 MB — hỏi lại khoa).
