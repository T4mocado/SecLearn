# Nghiên cứu: xử lý mất cân bằng và xây hạ tầng cho bộ đánh giá SecLearn

> Ngày lập: 2026-10-18. Phạm vi: hai vấn đề còn lại sau khi [C] kết luận corpus "đủ về lượng, chưa đủ về chất và hạ tầng":
> (1) **mất cân bằng** (theo tài liệu, cụm chủ đề, mức L1-L7, trả lời được / không, biến thể ngôn ngữ); (2) **thiếu hạ tầng**
> (snapshot, offset, công cụ gán, pooling, chạy theo lô, độ đo + khoảng tin cậy, dataset card, phiên bản). Tìm cách các nhóm nghiên cứu
> thiết kế thành phần và hạ tầng của benchmark, rồi đề xuất cụ thể cho SecLearn. Chỉ nghiên cứu; **không sửa mã nguồn, không sửa dữ liệu**.
>
> Tài liệu này **nối tiếp** `docs/EVAL_DATASET_CONSTRUCTION.md` (**[C]**) và `docs/EVAL_DATASET_RESEARCH.md` (**[R]**). Những gì hai tài liệu đó
> đã nói (SQuAD, NQ, HotpotQA, MuSiQue, CRAG, FRAMES, MultiHop-RAG, CyberMetric, AttackQA, pooling TREC DL, độ tin cậy LLM judge, Label Studio,
> Argilla, Card và cộng sự 2020, Dror và cộng sự 2018, bảng ±CI theo n ở [R §6]) chỉ được dẫn lại bằng [C §x] / [R §x].
>
> Quy ước đánh dấu (giống [C]):
> - **[Nguồn n]**: tài liệu chính chủ đã mở và đọc (PDF trên arXiv / ACL Anthology, docs chính thức, mã nguồn trên GitHub), link ở mục 8. Số đánh
>   lại từ 1, **không trùng** với số nguồn của [C] và [R].
> - **[Code]**: mã nguồn SecLearn trên đĩa ngày lập.
> - **[Đo]**: số tự đo ngày lập. Khác [C]: lần này **đọc được database** (Postgres chạy), nên số "trong DB" là số thật của hệ đang chạy; số
>   "trên đĩa" lấy bằng cách chạy lại đúng pipeline `pdf-parse` → `removeHeadersFooters` → `removeSiteChrome` → `toMarkdown` → `chunkMarkdown(md, 800, 80)`
>   trên `data/uploads/*.pdf`. Script đặt ngoài repo (thư mục scratchpad), chỉ đọc.
> - **[Suy luận]**: đề xuất hoặc ước lượng của người viết, chưa kiểm chứng bằng chạy thật.
> - **[Chưa kiểm chứng]**: không mở được nguồn chính chủ, hoặc chỉ là hiểu biết sẵn có.

---

## 1. Trả lời ngắn

**Hiện trạng sau khi làm sạch** [Đo, mục 2]: DB và thư mục `data/uploads/` khớp nhau, **138 tài liệu, 5.804 chunk**, tất cả `ready`. Đã bỏ
**cả hai** bản NIST CSWP 29 (corpus giờ **không còn NIST**, không chỉ là bỏ bản trùng) và file `owasp_MFA` gắn nhầm nhãn. **Chưa xử lý**: 4 file stub vẫn
nằm trong chỉ mục; WSTG vẫn **0 tiêu đề `##`**; 10 tài liệu vẫn có tiêu đề rác `## Sheet`; `DocumentChunk.metadata` vẫn rỗng ở 5.804 / 5.804 chunk;
`data/eval/` **nằm trong `.gitignore`** (dòng `/data/`), nên bộ smoke hiện tại không được git quản lý phiên bản. Mất cân bằng **không đổi về bản chất**:
WSTG = **23,3%** chunk (1.353 / 5.804), 5 tài liệu lớn nhất = 30,4%, hệ số Gini của số chunk / tài liệu = 0,49.

**Bài học từ các nhóm khác, phần mất cân bằng:**

1. **Hầu hết benchmark không ép phân bố đều. Họ đặt trần theo nguồn, rồi báo kết quả theo từng tầng và lấy trung bình macro.** HELM giới hạn
   tối đa 1.000 mẫu mỗi scenario [Nguồn 9]. RAGChecker lấy đúng 500 câu mỗi miền [Nguồn 16]. LongBench phát hành hai bản: một bản giữ phân bố độ dài tự
   nhiên, một bản (LongBench-E) lấy số mẫu tương đương ở các khoảng 0-4k / 4k-8k / 8k+. Điểm "Overall" của LongBench là trung bình macro theo nhóm tác vụ
   [Nguồn 12]. BIG-bench tính điểm tổng là trung bình của điểm đã chuẩn hoá của từng task [Nguồn 11]. MMLU-Pro thì để 14 ngành chênh nhau
   (từ 3,17% đến 11,2%) và báo theo từng ngành [Nguồn 10].
2. **Câu hỏi cùng nguồn không độc lập.** Miller (Anthropic) đo trên DROP: sai số chuẩn có điều chỉnh theo cụm (clustered SE) lớn gấp **3,05 lần** SE
   thường; MGSM 1,88 lần; RACE-H 1,10 lần [Nguồn 1]. Với SecLearn, ~10-18 câu / cheat sheet và ~170 câu trên WSTG, nên **bắt buộc dùng clustered SE**.
3. **Tầng nhỏ thì không dùng CLT.** Bowyer và cộng sự cho thấy khoảng tin cậy dựa trên CLT hay bootstrap **thấp hơn hẳn độ phủ danh nghĩa** khi n nhỏ
   (thử với N = 3, 10, 30, 100). Chỉ khoảng Wilson và khoảng Bayes đạt đúng độ phủ [Nguồn 2]. Báo theo cụm / mức với n ~ 70-300 nên dùng Wilson.
4. **Gộp các hiện tượng khác nhau làm giảm độ tin cậy.** Danh sách kiểm của Perlitz và cộng sự (IBM) khuyên giữ điểm tách theo tầng khi có ý nghĩa,
   và phủ rộng mỗi nguồn biến thiên thay vì vét hết tổ hợp của vài nguồn [Nguồn 4].
5. **Chọn tập con nhỏ "thông minh"** (tinyBenchmarks, Anchor Points, IRT) cần dữ liệu đúng / sai của **hàng chục mô hình** đã chạy [Nguồn 5, 6, 7]. SecLearn
   chỉ có vài cấu hình, nên các phương pháp này chưa dùng được. Riêng **IRT để tìm câu lỗi** (độ phân biệt âm → câu sai nhãn [Nguồn 7]) có thể dùng
   sau, khi đã có ≥ 10 lần chạy.

**Bài học, phần hạ tầng:** các bộ công cụ trưởng thành đều tách bốn lớp **corpus → câu hỏi + qrels → run → độ đo / báo cáo**. Mỗi lớp có định danh,
hash và cấu hình đi kèm. ir_datasets dùng ID phân cấp `corpus/benchmark` và kiểm hash khi tải [Nguồn 21]. KILT neo mọi provenance vào **một snapshot cố
định**, bỏ 18% mẫu dev / test không neo lại được [Nguồn 13]. trec_eval / ir-measures / ranx dùng chung định dạng qrels và run của TREC [Nguồn 22, 23, 24].
BERGEN / FlashRAG chạy theo file cấu hình và lưu kết quả trung gian [Nguồn 17, 18]. lm-eval ghi điểm từng mẫu và báo stderr bootstrap mặc định
[Nguồn 19]. Inspect có sẵn `grouped()` (micro / macro), `stderr(cluster=...)`, `ci_wilson()`, `krippendorff_alpha()` [Nguồn 20]. Croissant khuyến nghị
phiên bản dạng MAJOR.MINOR.PATCH và **sha256 cho mọi file** của bộ có phiên bản [Nguồn 29].

**Khuyến nghị chính** [Suy luận, mục 6]:

- **Lấy mẫu hai tầng, quota ∝ √ ở cả hai tầng**: quota cụm ∝ √(số chunk của cụm), sàn 100 câu / cụm. Trong cụm, quota ∝ √(số chunk của tài liệu), với
  phần WSTG trong cụm coi là **một** tài liệu, rồi chia tiếp cho các test case `WSTG-XXXX-NN`. Với 1.600 câu trả lời được, WSTG còn **~10,5%** thay vì
  23%; không tài liệu nào quá ~18 câu; cụm nhỏ nhất ≥ 68 câu trước khi áp sàn. **Không** dùng √ trên từng test case WSTG như tài liệu độc lập: tách
  WSTG thành 95 đơn vị rồi lấy √ từng đơn vị lại **tăng** phần của WSTG lên 30,4% (vì √ là hàm dưới cộng tính).
- **Báo cáo ba con số**: micro (toàn bộ câu), **macro theo cụm** (số chính), và theo mức L1-L7 riêng. Mỗi số kèm **clustered SE** (cụm = `doc_key` hoặc
  test case WSTG; câu biến thể dấu / không dấu gom theo `seed_id`), Wilson CI cho các tầng n < ~300, và **so sánh ghép cặp** giữa cấu hình. L6 (không
  trả lời được) **không bao giờ** gộp chung với câu trả lời được.
- **Hạ tầng tối thiểu**: `data/eval/` có `corpus/` (markdown chuẩn + `manifest.json` có sha256, đơn vị lấy mẫu, cụm), `questions/vX.Y/`, `qrels/` (định
  dạng TREC, **sinh ra** từ span theo từng `chunker_version`), `runs/<run_id>/` (config + `run.trec` + `answers.jsonl` + `per_question.jsonl`), `cards/`.
  Khoảng 9 script TypeScript chạy bằng `tsx` như `scripts/reindex-all.ts`, gọi thẳng `retrieveForQuestion` / `answerQuestion` / `chunkMarkdown`. Một
  script Python nhỏ dùng **ranx** (độ đo + Fisher randomization test) và tự cài clustered SE / Wilson (khoảng 50 dòng). Gán nhãn bằng Label Studio
  ([C §4.2]). Bỏ `data/eval/` ra khỏi `.gitignore`. Ước **8-11 ngày công** cho một sinh viên, phần lớn trùng với bước 0, 3, 5, 10 của [C §6].

---

## 2. Hiện trạng sau khi làm sạch [Đo]

### 2.1 Đã thay đổi gì so với lúc viết [C]

| Hạng mục ở [C §5.2] | Trạng thái ngày lập | Bằng chứng |
|---|---|---|
| 2 bản trùng NIST CSWP 29 | **Đã bỏ cả hai**. Không còn file NIST nào trong `data/uploads/` hay trong bảng `Document` | `ls data/uploads \| grep -i nist` rỗng; DB 138 tài liệu, không có tiêu đề NIST |
| `owasp_MFA_cheatsheet` (thật ra là Authentication) | **Đã bỏ** | Không còn file; `Multifactor_Authentication_Cheat_Sheet` (77 chunk) vẫn còn |
| 4 file stub (Access_Control, Injection_Prevention_in_Java, TLS_Cipher_String, Transport_Layer_Protection) | **Chưa bỏ**: vẫn nạp, mỗi file 1 chunk, 161-195 ký tự sau làm sạch | Đếm trong DB và chạy lại pipeline |
| WSTG không có tiêu đề mục | **Chưa đổi**: 0 dòng `##` | `Document.markdown` trong DB |
| Tiêu đề rác `## Sheet` | **Chưa đổi**: 10 tài liệu | Regex `\n## Sheet\n` trên `Document.markdown` |
| Offset chunk (`DocumentChunk.metadata`) | **Chưa ghi**: 0 / 5.804 chunk có metadata | `count(metadata)` = 0 |
| Mã nguồn `src/lib/*` | **Không đổi** từ commit 893e3fa (2026-10-17). `git status` chỉ có 4 file `page.tsx` sửa và các tài liệu mới | `git log --stat`, `git status` |
| Phiên bản bộ smoke | `/data/` nằm trong `.gitignore` (dòng 38) → `git ls-files data` rỗng | `.gitignore` [Code] |

Việc dọn dẹp làm **ở mức file / DB**, không đổi mã: mọi `Document.updatedAt` đều là 2026-10-16 (lần reindex cuối), còn thư mục `data/uploads/` đổi lúc
2026-10-18 14:09. Hệ quả: (a) **NIST CSWP 29 đã ra khỏi corpus**. Nếu luận văn vẫn mô tả corpus gồm "OWASP Cheat Sheets + WSTG + NIST CSWP 29" thì phải
sửa mô tả hoặc nạp lại **một** bản (97 chunk, ~1,6% corpus). (b) Bốn stub vẫn có thể được truy xuất. BEIR ghi nhận model dense dùng cosine **ưu tiên văn bản
ngắn**: trên TREC-COVID, TAS-B lấy văn bản có độ dài trung vị 10 từ so với 160 từ của ANCE [Nguồn 14]. Các stub 1 câu là đúng loại văn bản dễ "trúng" kiểu này
[Suy luận].

### 2.2 Phân bố chunk hiện tại [Đo, DB]

| Đại lượng | Lúc viết [C] (141 PDF) | Ngày lập (138 tài liệu, DB) |
|---|---|---|
| Tổng chunk | 6.072 | **5.804** (khớp đúng số chạy lại pipeline trên đĩa) |
| Ký tự markdown / trang | 3.420.402 / 2.721 | 3.248.482 / 2.641 |
| Chunk / tài liệu: min, p25, trung vị, p75, p90, max | 1, 17, 29, 44, 69, 1.353 | 1, 16, 29, 41, 59, 1.353 |
| WSTG | 22,3% | **23,3%** |
| 5 tài liệu lớn nhất | 29,1% | 30,4% (WSTG 1.353, Kubernetes 116, Secrets Management 105, Session Management 94, XSS Filter Evasion 94) |
| Tài liệu ≤ 10 chunk / ≥ 50 chunk | 12 / 26 | 12 / 23 |
| Gini (số chunk / tài liệu) | — | 0,49 |

### 2.3 WSTG tách theo test case [Đo]

Mỗi test case trong markdown của WSTG bắt đầu bằng mẫu dòng `ID` rồi `WSTG-XXXX-NN` (regex `\nID\n(WSTG-[A-Z]{4}-\d{2})\n`), ngay sau tiêu đề test case.
Tìm thấy **98** lần xuất hiện. 3 trong số đó chỉ ghi "This content has been removed" (INFO-09, INPV-03, bản cũ của INPV-13), còn lại **95 test case có nội dung**.
Cắt markdown theo các mốc đó, rồi chạy `chunkMarkdown(…, 800, 80)` riêng cho từng đoạn:

| Phần | Chunk (xấp xỉ) | Ghi chú |
|---|---|---|
| Phần đầu (mục lục, chương 1-3: giới thiệu, framework, phương pháp) | 177 | Mục lục nên loại khỏi lấy mẫu; chương 2-3 hợp cho câu "quy trình" |
| 95 test case | 1.162 | min 1, p25 7, trung vị 9, p75 15, p90 19, max **161** (`WSTG-INPV-05` SQL Injection, có các mục con theo từng hệ CSDL) |
| Reporting (chương 5) | 10 | |
| Phụ lục A-F (công cụ, đọc thêm, fuzz vector, encoded injection, lịch sử, dev tools) | 43 | C, D là danh sách payload → loại ([C §5.2]) |

Theo nhóm (số test case / chunk): INPV 18 / 357, CONF 11 / 127, CLNT 13 / 123, INFO 9 / 123, SESS 9 / 107, ATHN 10 / 92, BUSL 9 / 72, ATHZ 4 / 51,
CRYP 4 / 49, APIT 1 / 26, IDNT 5 / 26, ERRH 2 / 9. Tổng các đoạn (1.392) lớn hơn 1.353 vì mỗi đoạn cắt riêng thì chunk cuối của mỗi đoạn không được ghép
với đoạn sau. Đây là số để lập quota, không phải số chunk trong DB.

Tách theo test case giải quyết hai việc cùng lúc: (1) có **đơn vị lấy mẫu** cho WSTG (thay cho 886 mục `##` của cheat sheet); (2) có **khoá cụm** cho
clustered SE. Việc này **không cần sửa `ingest.ts`**: chỉ cần ánh xạ offset chunk → test case trong manifest (mục 6.2).

---

## 3. Các nhóm xử lý mất cân bằng thế nào

### 3.1 Thành phần benchmark: quota, tầng, cách báo

| Benchmark | Mất cân bằng gặp phải | Cách kiểm soát khi lấy mẫu | Cách báo kết quả | Số liệu |
|---|---|---|---|---|
| **HELM** [Nguồn 9] | Scenario rất khác nhau về cỡ | Taxonomy từ trên xuống (task × domain × ngôn ngữ), chọn 16 scenario lõi để phủ không gian; **tối đa 1.000 mẫu / scenario**; 3 lần chạy | Từng scenario + "win rate" đối đầu giữa các model trên mọi scenario | Trước HELM, model trung bình chỉ được đánh giá trên 17,9% scenario lõi; HELM nâng lên 96,0%. Tác giả tự nhận 1.000 mẫu và 3 seed có thể làm một số kết luận không có ý nghĩa thống kê (§11) |
| **Perlitz và cộng sự** (HELM hiệu quả) [Nguồn 4] | Chi phí chạy | Lấy mẫu phân tầng theo subscenario; đo "Decision Impact on Reliability" (DIoR) | Danh sách kiểm: báo nơi độ tin cậy thấp; **hạn chế gộp** hiện tượng khác nhau thành một số; phủ rộng mỗi nguồn biến thiên | Giảm số mẫu ×10 / scenario mà thứ hạng gần như không đổi; tiết kiệm tính toán ×100 trở lên |
| **tinyBenchmarks** [Nguồn 5] | Bộ quá lớn (MMLU 14K) | So ba chiến lược: (1) **phân tầng ngẫu nhiên** theo subscenario, chênh lệch số mẫu giữa hai tầng ≤ 1, trọng số 1/cỡ tầng; (2) gom cụm theo mẫu đúng / sai của các model cũ (anchor points); (3) IRT | Ước lượng điểm cả bộ từ 100 mẫu | IRT++ sai < 2% trung bình với 100 mẫu MMLU. Phân tầng ngẫu nhiên đơn giản nhất nhưng sai số lớn hơn; anchor points không ổn định khi model mới chuyên một miền |
| **MMLU-Pro** [Nguồn 10] | 14 ngành không đều; phần MMLU gốc có nhiều câu dễ | **Lọc câu dễ** (bỏ 42,23% câu MMLU gốc, ngành Business / History / Other / Psychology bị lọc > 50%); bổ sung từ STEM web, TheoremQA, SciBench | Báo theo từng ngành | Ngành lớn nhất 11,2% (Math), nhỏ nhất 3,17%; tổng 12.032 câu. Không ép cân bằng |
| **BIG-bench** [Nguồn 11] | 204 task, cỡ task rất chênh (hình 3b) | Mỗi task có "preferred metric" với điểm thấp / cao; tạo BIG-bench Lite (24 task) làm tập con chuẩn | Điểm tổng = **trung bình điểm chuẩn hoá của từng task** (0 = kém, 100 = rất tốt) → mỗi task một phiếu, bất kể cỡ | Canary GUID trong mọi file task để lọc khỏi dữ liệu huấn luyện |
| **LongBench** [Nguồn 12] | Độ dài ngữ cảnh lệch | Hai bản: **lấy ngẫu nhiên** (giữ phân bố tự nhiên) và **lấy đều theo khoảng độ dài** 0-4k / 4k-8k / 8k+ (LongBench-E) | "Overall" = **trung bình macro** các nhóm tác vụ; tách EN / ZH | 21 bộ, 6 nhóm tác vụ |
| **RAGChecker** [Nguồn 16] | Miền nguồn khác cỡ; corpus Science / Biomedical > 1 triệu tài liệu | **500 câu mỗi miền** (6 miền từ FiQA / LoTTE); **thu nhỏ corpus** lớn bằng hợp top-400 của BM25 (và dense) + tài liệu gold | 10 miền, 4.162 câu; meta-evaluation 280 cặp = 10 miền × 28 cặp hệ (đều theo miền) | Quota cố định theo miền chứ không theo cỡ nguồn |
| **BEIR / MTEB** [Nguồn 14, 15] | 18 bộ với corpus 3,6K-15M tài liệu, độ dài tài liệu trung bình 11-635 từ | Không cân bằng trong bộ; chọn bộ để phủ miền / loại văn bản | Bảng theo từng bộ + trung bình các bộ (MTEB: trung bình theo task) | Thiên lệch độ dài: model cosine ưa tài liệu ngắn, dot-product ưa tài liệu dài (BEIR phụ lục H) |
| **KILT** [Nguồn 13] | 11 bộ dùng Wikipedia các thời điểm khác nhau | Neo mọi thứ vào **một snapshot** (2019/08/01, 5,9 triệu bài) | Từng task + provenance | Bỏ ~18% mẫu dev / test không neo lại được (BLEU < 0,5) |
| **Datasheet ví dụ** (Movie Review Polarity) [Nguồn 25] | Một tác giả viết quá nhiều review | **Trần 40 bài / tác giả** | — | Ví dụ kinh điển của "trần theo nguồn" |

**Ba mẫu hình lặp lại** [Suy luận từ bảng trên]:

1. **Trần theo nguồn + báo theo tầng**, không ép cân bằng tuyệt đối (HELM, MMLU-Pro, datasheet ví dụ).
2. **Quota bằng nhau theo tầng** khi tầng là trục phân tích chính (RAGChecker theo miền, LongBench-E theo độ dài, tinyBenchmarks theo subscenario).
3. **Tổng hợp macro** (một tầng một phiếu) cho số chính (BIG-bench, LongBench, HELM win rate, BEIR / MTEB trung bình theo bộ). Micro chỉ là số phụ.

### 3.2 Tập con nhỏ mà nhiều thông tin: IRT, anchor points, dedup ngữ nghĩa

| Phương pháp | Cần gì | Kết quả có nguồn | Áp được cho SecLearn? [Suy luận] |
|---|---|---|---|
| **IRT, DAD** (Rodriguez và cộng sự) [Nguồn 7] | Ma trận đúng / sai của nhiều "subject" (model) trên mọi item | Item có **độ phân biệt âm** dự báo câu lỗi; 3 tác giả gán nhãn 60 item SQuAD, Krippendorff's α = 0,344; IRT xếp hạng ổn định hơn accuracy trên tập nhỏ; hạn chế: cần phản hồi mức item của mọi subject | Sau khi có ≥ 10-20 lần chạy (các cấu hình × seed): dùng để **tìm câu gold sai** (giống bước soát baseline của CRAG [C §2.1]) |
| **Anchor Points** [Nguồn 6] | Dự đoán của nhiều model nguồn (N có thể nhỏ tới 10) | 1-30 điểm neo xếp hạng 87 cặp model-prompt tốt hơn lấy mẫu đều | Không: SecLearn có quá ít "model" |
| **tinyBenchmarks** [Nguồn 5] | Dữ liệu đúng / sai của nhiều LLM đã đánh giá | Xem 3.1 | Không cho bộ chính. Chỉ dùng ý "phân tầng, chênh lệch ≤ 1, trọng số 1/cỡ tầng" |
| **Biến thiên của benchmark** (Madaan và cộng sự) [Nguồn 3] | Nhiều seed huấn luyện | Phân tích item / IRT **khó giảm được phương sai** một cách đáng kể | Củng cố: với ít cấu hình, ưu tiên tăng n và ghép cặp hơn là chọn tập con "thông minh" |
| **SemDeDup** [Nguồn 8] | Embedding của mọi mẫu | k-means, rồi trong từng cụm bỏ cặp có cosine ≥ 1 − ε, giữ mẫu xa tâm cụm; bỏ 50% LAION mà hiệu năng gần như giữ nguyên | **Có**: dedup câu hỏi sinh ra (thay cho "cosine > ngưỡng" trên toàn bộ ở [R §5.5]): gom cụm theo embedding của câu, chỉ so trong cụm → rẻ và bắt được câu cùng ý khác chữ |

### 3.3 Văn bản dài lấn át corpus

- BEIR chủ yếu gồm văn bản vài trăm từ và coi truy xuất tài liệu dài là hướng mở. Thiên lệch độ dài đến từ **hàm tương đồng / loss**, và nhãn liên quan
  cũng không phân bố đều theo độ dài [Nguồn 14].
- RAGChecker **thu nhỏ** corpus lớn thay vì để nó lấn át [Nguồn 16]. KILT cắt mọi thứ về cùng một snapshot và cùng một cách chia đoạn [Nguồn 13].
- Với SecLearn, độ dài *chunk* đã được giới hạn (~800 ký tự), nên thiên lệch độ dài ở mức chunk nhỏ, trừ 4 stub. Điều còn lại là **thiên lệch tần suất**:
  23% ứng viên truy xuất là WSTG, nên nếu câu hỏi cũng lấy mẫu tỉ lệ thuận thì điểm tổng chủ yếu đo "WSTG truy xuất tốt đến đâu" [Suy luận].
  Cách xử lý: **không cắt corpus** (hệ thật phải chạy trên toàn bộ corpus), chỉ **cân lại phía câu hỏi** (mục 6.1) và **báo riêng** "câu có gold ở WSTG" với "câu có gold ở cheat sheet".

---

## 4. Thống kê khi các tầng không đều

Ký hiệu: câu i có điểm s_i (0/1 cho Hit@k, tỉ lệ từ chối đúng; số thực cho MRR, nDCG, điểm judge). Tầng h (cụm chủ đề hoặc mức L) có n_h câu, điểm trung bình p̄_h.
Cụm phụ thuộc c (tài liệu, test case WSTG, hoặc nhóm biến thể cùng `seed_id`).

### 4.1 Sai số chuẩn theo cụm (clustered SE)

Miller [Nguồn 1, §2.1-2.2]:

- SE thường (CLT): `SE_CLT = sqrt( Σ_i (s_i − s̄)² / (n−1) ) / sqrt(n)`. Khi s_i ∈ {0,1}: `SE = sqrt( s̄(1−s̄)/n )`.
- **SE theo cụm**: `SE_cl = sqrt( SE_CLT² + (1/n²) Σ_c Σ_i Σ_{j≠i} (s_{i,c} − s̄)(s_{j,c} − s̄) )`. Số hạng thứ hai là hiệp phương sai trong cụm. Nó bằng 0 khi
  các câu trong cụm độc lập, và lớn nhất khi cả cụm đúng / sai cùng nhau. Khi đó cả cụm chỉ tính như một quan sát.
- Báo kèm **số cụm** bên cạnh số câu (bảng 3 của [Nguồn 1]). Số thật trên các bộ đọc hiểu: clustered SE / SE thường = 3,05 (DROP), 1,10 (RACE-H), 1,88 (MGSM) [Nguồn 1].
  MGSM được coi là có cụm vì **cùng câu dịch sang nhiều ngôn ngữ**. Đúng tình huống câu SecLearn có biến thể có dấu / không dấu / trộn Việt-Anh.

Dạng xấp xỉ để lập kế hoạch [Suy luận, rút ra từ công thức trên khi các cụm cùng cỡ m và tương quan trong cụm ρ]: `SE_cl² ≈ SE_CLT² · [1 + (m − 1)ρ]`.

| m (câu / cụm) | ρ = 0,05 | ρ = 0,1 | ρ = 0,2 |
|---|---|---|---|
| 5 | ×1,2 phương sai | ×1,4 | ×1,8 |
| 12 (≈ quota trung bình / cheat sheet ở 6.1) | ×1,55 | ×2,1 | ×3,2 |
| 20 | ×1,95 | ×2,9 | ×4,8 |

Ví dụ [Suy luận]: 1.600 câu, Hit@5 = 0,70 → SE_CLT = 1,15 điểm % (±2,2 điểm). Với m = 12, ρ = 0,1: SE_cl ≈ 1,66 (±3,3 điểm). ρ thật đo được sau lượt chạy đầu.

**Chọn khoá cụm cho SecLearn** [Suy luận]:
- Mặc định: `cluster = doc_key` cho cheat sheet, `cluster = WSTG-XXXX-NN` cho câu ở WSTG. Kiểm độ nhạy bằng `cluster = doc_key` cho cả WSTG (một cụm ~170 câu).
  Nếu hai cách cho SE khác nhau nhiều thì báo cách bảo thủ hơn.
- Câu biến thể (L2 không dấu, trộn ngôn ngữ, L7 dựng từ câu L1 / L3) mang `seed_id` của câu gốc. Khi tính trên tập có cả câu gốc lẫn biến thể, cụm = `seed_id`
  lồng trong `doc_key`. Đơn giản nhất: lấy cụm thô nhất (doc_key), vì biến thể luôn cùng tài liệu với câu gốc.
- Câu L4 / L5 có gold ở nhiều tài liệu: gán cụm theo **tài liệu của ô / bằng chứng đầu tiên**, hoặc theo **cặp tài liệu** (đã sắp thứ tự). Ghi rõ trong card.

### 4.2 Micro, macro, hậu phân tầng

- **Micro**: `p_micro = Σ_h n_h p̄_h / N`. Phụ thuộc trực tiếp vào quota, nên đổi cách lấy mẫu là đổi con số.
- **Macro** (một tầng một phiếu): `p_macro = (1/H) Σ_h p̄_h`, với `SE(p_macro) = (1/H) sqrt( Σ_h SE_h² )`. SE_h là clustered SE trong tầng h. Đây là cách LongBench,
  BIG-bench, BEIR / MTEB tổng hợp [Nguồn 11, 12, 14, 15]. Inspect cài sẵn: `grouped(accuracy(), "cluster", all="groups")` cho macro, mặc định `all` là micro
  [Nguồn 20].
- **Hậu phân tầng về một phân bố mục tiêu W_h** (ví dụ "tỉ lệ theo số chunk của corpus", hoặc "tỉ lệ theo log chat thật" khi có): `p_W = Σ_h W_h p̄_h`,
  `SE = sqrt( Σ_h W_h² SE_h² )`. Cái giá là phương sai tăng. Hiệu ứng thiết kế của Kish `deff = n Σ w_i² / (Σ w_i)²`, w_i = W_h / (n_h / N) [Chưa kiểm chứng
  nguồn chính chủ: công thức sách giáo khoa, không mở sách lần này]. Với phương án R ở 6.1, quy về phân bố tỉ lệ theo chunk cho deff ≈ 1,59, tức 1.600 câu
  có "cỡ hiệu dụng" ~1.000 [Đo trên quota tính được].
- Báo **cả ba** khi có ý nghĩa, nhưng **chọn trước** (ghi trong card trước khi chạy) số nào là số chính, để không chọn sau khi xem kết quả [Suy luận].

### 4.3 Khoảng tin cậy cho tầng nhỏ

- Bowyer và cộng sự, ICML 2025 (position) [Nguồn 2]: với n nhỏ (thử N = 3, 10, 30, 100), khoảng CLT và bootstrap có **độ phủ thực tế thấp hơn hẳn** mức danh nghĩa.
  Khoảng **Wilson** và khoảng Bayes (Beta-Bernoulli) đạt gần đúng. Ở dạng có cụm, CLT có cụm cũng không đủ khi dữ liệu ít. Họ phát hành thư viện `bayes_evals`.
- Inspect có `ci_wilson()` [Nguồn 20]. Miller cũng lưu ý framework của OpenAI dùng bootstrap, nhưng CLT là đủ khi n lớn và bộ ước lượng đơn giản [Nguồn 1].
- Quy tắc cho SecLearn [Suy luận]: tầng có n ≥ 300 → CLT có cụm; 30 ≤ n < 300 → **Wilson** (đã hiệu chỉnh theo cụm bằng cách chia n cho deff ước lượng, tức n_eff
  = n / deff); n < 30 → chỉ báo số đếm, không báo tỉ lệ có CI.

### 4.4 So sánh hai cấu hình: ghép cặp và sức mạnh

- **Ghép cặp** [Nguồn 1, §4.2]: tính trên hiệu từng câu `d_i = s_{A,i} − s_{B,i}`, `SE_paired = sd(d)/sqrt(n)`. Có bản có cụm (phương trình 8 của [Nguồn 1]).
  Phương sai giảm thêm `2 Cov(x_A, x_B)/n`. Nên báo kèm tương quan giữa hai cấu hình (bảng 5 của [Nguồn 1]).
- Kiểm định ghép cặp sẵn có: **ranx** có paired Student's t-test (mặc định), **Fisher's randomization test** và Tukey HSD [Nguồn 23]. Điều này lấp chỗ [Chưa kiểm chứng]
  ở [R §6]. McNemar cho độ đo nhị phân: [R §6].
- **Cỡ mẫu** [Nguồn 1, §5]: `n = (z_{α/2} + z_β)² (ω² + σ_A²/K_A + σ_B²/K_B) / δ²`. ω² là phương sai của hiệu điểm, K là số lần chạy lại mỗi câu. Ví dụ của Miller
  (ω² = 1/9, δ = 3 điểm, α = 0,05, sức mạnh 80%) cho ~969 câu, nên ông khuyên bộ mới **≥ 1.000 câu**.
- Áp cho Hit@5 ghép cặp [Suy luận]: với tỉ lệ câu "bất đồng" (đúng một cấu hình trúng) d, `ω² ≈ d − δ²`, `(1,96 + 0,84)² = 7,85`:

| d | δ = 3 điểm | δ = 5 điểm | δ = 7 điểm |
|---|---|---|---|
| 0,10 | 864 câu | 306 | 152 |
| 0,15 | 1.300 | 463 | 233 |
| 0,25 | 2.173 | 777 | 393 |

  Nhân thêm deff do cụm (~1,5-2). Tức là: tổng ~1.600 câu phát hiện được chênh **~4-5 điểm** trên toàn bộ. Mỗi mức L (250-400 câu) chỉ phát hiện được chênh
  **~7-10 điểm**. Mỗi cụm (100-200 câu) chỉ đủ để **mô tả**, không đủ để kết luận "cấu hình A tốt hơn ở cụm X" trừ khi chênh rất lớn. Ghi rõ hạn chế này
  (Perlitz: "báo nơi độ tin cậy thiếu" [Nguồn 4]).
- **Chạy lại để giảm phương sai có điều kiện** [Nguồn 1, §3.1]: pipeline SecLearn có bước viết lại truy vấn bằng LLM, nên là ngẫu nhiên ([R §6]). Chạy K lần mỗi câu,
  lấy trung bình theo câu rồi mới tính SE. Không gộp K·n kết quả như n độc lập. Miller **khuyên không hạ temperature** chỉ để giảm phương sai: làm vậy có thể chuyển
  phương sai sang phần không giảm được, hoặc làm lệch ước lượng [Nguồn 1, §3.3]. K = 2-3 là hợp lý: trong ví dụ của Miller, K = 2 giảm 1/3 phương sai, K = 4
  giảm 1/2 [Nguồn 1].

### 4.5 Câu trả lời được và câu không trả lời được

[Suy luận] Không gộp L6 với câu trả lời được vào cùng một accuracy. Hai số riêng: **tỉ lệ từ chối đúng** trên L6 (theo loại a / b / c), và **tỉ lệ từ chối sai**
trên câu trả lời được (theo mức). Nếu cần một số, dùng trung bình của hai tỉ lệ đúng (balanced accuracy của quyết định "trả lời / từ chối"), để số không phụ thuộc
tỉ lệ L6 : trả lời được mà bộ chọn (1:4 theo [R §5.4]). Đây đúng là mẫu hình "báo theo tầng" ở 3.1.

---

## 5. Các nhóm xây hạ tầng thế nào

### 5.1 Bốn lớp hạ tầng và công cụ tương ứng

| Lớp | Công cụ / bài báo | Thành phần | Mẫu thiết kế đáng mượn |
|---|---|---|---|
| **Corpus** | **ir_datasets** (SIGIR 2021) [Nguồn 21] | ID phân cấp `corpus/benchmark` (ví dụ `cord19/trec-covid`: `cord19` cấp tài liệu, `cord19/trec-covid` cấp truy vấn + qrels); các loại thực thể `docs`, `queries`, `qrels`, `scoreddocs`, `docpairs`; tải về có **kiểm hash**; tra tài liệu theo ID | Tách corpus khỏi bộ câu; một corpus nhiều bộ câu; ID ổn định |
| | **KILT** [Nguồn 13] | Một snapshot Wikipedia; ánh xạ provenance cũ vào snapshot bằng BLEU, bỏ mẫu dưới ngưỡng 0,5 (~18% dev / test) | **Neo lại span khi văn bản đổi, có ngưỡng, báo tỉ lệ bỏ** — đúng thứ SecLearn cần khi markdown đổi ([C §4.6] mục 2) |
| | **Croissant** (NeurIPS D&B 2024) [Nguồn 28, 29] | 4 lớp: metadata, resources (`FileObject` / `FileSet` có `sha256`, `contentUrl`, `encodingFormat`), structure (`RecordSet`), semantics; mở rộng RAI. Bắt buộc: `name`, `description`, `license`, `url`, `creator`, `datePublished`; khuyến nghị `version` theo SemVer | `manifest.json` của SecLearn nên có đúng các trường này để sau này xuất Croissant dễ dàng |
| | **DVC** [Nguồn 32] | File `.dvc` (YAML) có `outs: [{path, md5, size, nfiles}]` để git quản lý con trỏ tới dữ liệu lớn | Chỉ cần nếu dữ liệu lớn. Corpus SecLearn ~3,2 MB markdown → **commit thẳng vào git** đơn giản hơn [Suy luận] |
| **Câu hỏi + nhãn** | **FlashRAG** [Nguồn 18] | 32 bộ chuẩn hoá về JSONL 4 trường: ID, question, golden answers, metadata (+ `choices` cho MCQ); hàm lọc theo metadata / lấy mẫu | Trường `metadata` chứa tầng (cụm, mức, nguồn) để lọc và báo theo tầng |
| | **trec_eval** [Nguồn 24] | qrels: `qid iter docno rel` (rel nguyên −127..127, `iter` bị bỏ qua); run: `qid Q0 docno rank sim run_id` | Định dạng chung mà ranx / ir-measures / pytrec_eval đọc được |
| **Run** | **BERGEN** (Naver) [Nguồn 17] | Cấu hình Hydra (YAML) cho retriever / reranker / generator / dataset; chạy retriever và **cache** kết quả, rồi chạy generation riêng; thư mục `experiments/`; `evaluate.py` + `print_results.py` gom thành bảng | Tách bước truy xuất (đắt nếu đổi index) khỏi bước sinh câu trả lời; mỗi thí nghiệm một thư mục |
| | **FlashRAG** [Nguồn 18] | Tự lưu kết quả trung gian từng bước để đánh giá từng thành phần | Lưu `retrieved`, `prompt`, `answer`, `sources` theo câu |
| | **lm-evaluation-harness** [Nguồn 19] | Task là YAML có `version`; `--limit` để chạy thử, `--log_samples` ghi điểm từng mẫu và output; báo **stderr bootstrap mặc định**; khuyến nghị công bố code, prompt, tham số sinh, cách trích đáp án | Ghi **phiên bản task** và **commit mã** cùng kết quả; luôn có chế độ chạy thử 20 câu |
| **Độ đo / báo cáo** | **ir-measures** (ECIR 2022) [Nguồn 22] | Cú pháp độ đo kiểu `nDCG@10`, `AP(rel=2)`, `P(rel=2)@5`, `Judged@10`; lớp trừu tượng trên 8 "provider" (trec_eval, gdeval…) | `Judged@10` để theo dõi lỗ hổng nhãn ([C §4.7]); `rel=2` cho thang 0-3 |
| | **ranx** (ECIR 2022) [Nguồn 23] | `Qrels`, `Run`, `evaluate`, `compare`; kiểm định paired t, Fisher randomization, Tukey HSD; xuất bảng LaTeX; đã kiểm chéo với trec_eval; nạp qrels từ ir_datasets; fusion | Dùng thẳng cho độ đo truy xuất + kiểm định + bảng luận văn |
| | **Inspect** (UK AISI) [Nguồn 20] | Task = Dataset + Solver + Scorer; metric `accuracy`, `mean`, `stderr(cluster=…)`, `bootstrap_stderr`, `ci_wilson`, `grouped(…, all="groups")`, `krippendorff_alpha` | Danh sách metric này là **đặc tả** cho script thống kê của SecLearn, kể cả khi không dùng Inspect |
| | **RAGChecker** [Nguồn 16] | Độ đo mức claim cho retriever / generator; meta-evaluation trên 280 cặp người gán | Kiểm judge bằng nhãn người theo cặp, chia đều theo miền |

### 5.2 Gán nhãn và độ đồng ý

| Nguồn | Nội dung | Dùng cho SecLearn [Suy luận] |
|---|---|---|
| **POTATO** (EMNLP 2022 demo) [Nguồn 33] | Công cụ mã nguồn mở, cấu hình bằng YAML; template cho tác vụ phổ biến (Likert, best-worst, span…); phím tắt, tô từ khoá, tooltip; **câu hỏi sàng lọc, bài kiểm tra chú ý (attention test), bài qualification**, **đồng hồ đo thời gian**; tăng tốc rõ nhất với tài liệu dài, tác vụ phức tạp | Phương án dự phòng nếu Label Studio khó dựng. Ý tưởng **attention test** = trộn câu neo đã có nhãn (giống "mẫu neo 5%" ở [C §4.5]) |
| **Artstein & Poesio 2008** (Computational Linguistics) [Nguồn 34] | Krippendorff's α dùng được cho **nhiều người gán, nhiều mức sai khác (hàm khoảng cách), thiếu nhãn**; α = 1 − D_o / D_e; với nhãn danh mục gần tương đương multi-π. Ngưỡng: Krippendorff coi **0,8 là mức tối thiểu** cho mục đích nghiêm túc, 0,667 chỉ cho "kết luận tạm" và mô tả mức này là "rất thận trọng"; thang Landis & Koch (Poor / Slight / Fair / Moderate / Substantial / Perfect, mốc 0,2 / 0,4 / 0,6 / 0,8) được nêu, nhưng theo bài, giới ngôn ngữ học tính toán phần lớn theo ngưỡng chặt hơn của Krippendorff; hệ số có trọng số làm việc chọn ngưỡng càng khó | Lấp chỗ [Chưa kiểm chứng] ở [C §4.4] và [R §5.5] (dẫn qua bài tổng quan, chưa mở bản gốc của Krippendorff). Dùng **α có trọng số khoảng (interval / ordinal)** cho grade 0-3; α danh mục cho `level`, `answerable`. Báo ngưỡng 0,8 / 0,667 kèm trích dẫn này |
| **Rodriguez và cộng sự** [Nguồn 7] | Chính các tác giả gán lại 60 item SQuAD, chỉ đạt α = 0,344 → độ đồng ý về "câu đúng / có lỗi / sai" vốn thấp | Dự liệu α thấp hơn κ của nhãn L1-L7; đừng đặt kỳ vọng 0,8 cho trường "câu có lỗi không" |
| **Data Cards** [Nguồn 27] | Template chuẩn 31 khía cạnh; câu hỏi ba tầng "kính viễn vọng / kính tiềm vọng / kính hiển vi" (tổng quan → chi tiết kỹ thuật → chi tiết khó quan sát); nguyên tắc module hoá | Cấu trúc card của SecLearn (6.2.6) |

### 5.3 Tài liệu hoá bộ dữ liệu

| Khung | Phần / trường | Ghi chú |
|---|---|---|
| **Datasheets for Datasets** [Nguồn 25] | 7 nhóm câu hỏi theo vòng đời: Motivation, Composition, Collection Process, Preprocessing / cleaning / labeling, Uses, Distribution, Maintenance | Composition hỏi thẳng: bộ là mẫu của tập lớn hơn không, có đại diện không, kiểm chứng thế nào → chỗ ghi quota và phân bố |
| **Data Statements** (TACL 2018) [Nguồn 26] | A. Curation rationale, B. Language variety (mã BCP-47 kiểu `en-US`), C. Speaker demographic, D. Annotator demographic, E. Speech situation, F. Text characteristics, G. Recording quality, H. Other, I. Provenance appendix; có bản dài và bản ngắn | SecLearn: B = câu `vi-VN` (có dấu / không dấu / trộn), corpus `en`; D = trình độ người gán; I = OWASP, ngày lấy, phiên bản |
| **Hugging Face dataset card** [Nguồn 30] | `README.md` với YAML đầu file: `language`, `license`, `pretty_name`, `tags`, `task_categories`, cấu hình file dữ liệu | Viết card ở dạng này ngay từ đầu, kể cả khi chưa công bố |
| **NeurIPS Datasets & Benchmarks** [Nguồn 31] | Dữ liệu trên nơi lưu trữ chuyên cho ML (Dataverse, Kaggle, HF, OpenML), không cần xin PI; **bắt buộc file Croissant**; code có tài liệu và chạy được | Chuẩn tham chiếu nếu muốn công bố bộ dữ liệu |
| **BIG-bench canary** [Nguồn 11] | GUID canary trong mọi file task, để lọc khỏi dữ liệu huấn luyện và chẩn đoán rò rỉ | Đặt một GUID riêng của SecLearn vào mọi file câu hỏi nếu công bố |

---

## 6. Đề xuất cho SecLearn [Suy luận]

### 6.1 Mất cân bằng: lấy mẫu, chia đơn vị, báo cáo

**(a) Đơn vị và cụm.** Đơn vị lấy mẫu = mục `##` với cheat sheet ([C §5.1]: 886 mục ≥ 2 chunk), và **test case** với WSTG (2.3). Phần đầu của WSTG
(chương 1-3, bỏ mục lục) là một đơn vị. Loại: 4 stub, mục lục, phụ lục C-D của WSTG, danh sách tham khảo. Mỗi tài liệu và mỗi test case WSTG được gán **một
cụm** trong 11 cụm (10 cụm của [C §5.4] + "miền đặc thù": Mobile, Automotive, Drone, Payment Gateway, Bot Management). Nhóm WSTG ánh xạ: ATHN / SESS / IDNT → xác
thực-phiên; ATHZ → phân quyền; INPV → injection; CLNT → trình duyệt; CRYP → vận chuyển-mật mã; APIT → API; INFO / CONF / ERRH / BUSL / phần đầu → kiến trúc-quy
trình. CSRF xếp vào "trình duyệt". Phân loại này theo tên file, **cần người kiểm lại** và ghi vào `clusters.json`.

Cỡ cụm sau phân loại [Đo, theo phân loại trên; tổng 5.786 chunk sau khi bỏ stub, WSTG tính theo các đoạn ở 2.3 trừ Reporting và phụ lục]:

| Cụm | Đơn vị | Chunk | % |
|---|---|---|---|
| Kiến trúc, quy trình (+ WSTG INFO / CONF / ERRH / BUSL / phần đầu) | 47 | 1.022 | 17,7 |
| Chuỗi cung ứng, DevOps, hạ tầng | 20 | 826 | 14,3 |
| Injection, đầu vào (+ WSTG INPV) | 36 | 813 | 14,1 |
| Xác thực, phiên (+ WSTG ATHN / SESS / IDNT) | 39 | 805 | 13,9 |
| Trình duyệt (+ WSTG CLNT) | 27 | 672 | 11,6 |
| Framework | 12 | 425 | 7,3 |
| AI | 9 | 352 | 6,1 |
| Vận chuyển, header, mật mã (+ WSTG CRYP) | 12 | 274 | 4,7 |
| Phân quyền (+ WSTG ATHZ) | 14 | 271 | 4,7 |
| API (+ WSTG APIT) | 8 | 220 | 3,8 |
| Miền đặc thù | 5 | 106 | 1,8 |

**(b) So sánh các phương án quota** cho N = 1.600 câu **trả lời được** (L1-L5, L7; L6 lấy riêng ~400). Tính trên số ở bảng trên [Đo, script ngoài repo]:

| Phương án | WSTG | Câu / đơn vị nhiều nhất (ngoài WSTG) | Ít nhất | Cụm nhỏ nhất → lớn nhất | deff nếu quy về tỉ lệ chunk | Nhận xét |
|---|---|---|---|---|---|---|
| P. Tỉ lệ thuận số chunk | 370 (23,1%) | 32 (Kubernetes) | 1,9 (HSTS, Prototype Pollution) | 29 → 283 | 1,00 | Giống corpus; WSTG lấn át, nhiều tài liệu không có câu |
| S1. √ theo tài liệu (WSTG là 1 tài liệu) — đề xuất của [C §5.3] | 76 (4,7%) | 22 (Kubernetes) | 5,5 | 46 → 252 | 1,80 | WSTG bị **thiếu**: 95 test case chỉ có 76 câu, một nửa test case không có câu nào |
| S2. √ theo đơn vị (WSTG tách 95 + phần đầu) | 486 (30,4%) | 16 | 4,0 | 34 → 297 | 1,18 | **Phản tác dụng**: tách nhỏ rồi lấy √ lại làm WSTG nặng hơn cả P |
| E. Chia đều 11 cụm, √ trong cụm | 345 (21,6%) | **39** (cụm "miền đặc thù" có 5 tài liệu nhận 145 câu) | 2,5 | 145 → 145 | 1,57 | Cụm nhỏ bị khai thác quá mức (sinh câu trùng ý) |
| H. Cụm ∝ √(chunk cụm), √ theo đơn vị trong cụm | 406 (25,4%) | 18 | 3,2 | 68 → 212 | 1,26 | Cụm cân hơn, nhưng WSTG vẫn ~25% vì vẫn lấy √ trên từng test case |
| **R. Cụm ∝ √(chunk cụm); trong cụm √ theo tài liệu, phần WSTG trong cụm = 1 "tài liệu"; trong phần WSTG đó √ theo test case** | **168 (10,5%)** | 18 | 4,4 | 68 → 212 | 1,59 | **Đề xuất.** Cheat sheet trung vị ~10 câu; mỗi test case WSTG 0,4-12 câu (lấy mẫu có hệ thống để test case nhỏ vẫn có cơ hội) |

Điều chỉnh của R: (1) **sàn 100 câu / cụm** để Wilson CI theo cụm ≤ ±10 điểm (cụm "miền đặc thù" 68 → 100; hoặc gộp nó vào "kiến trúc, quy trình"); (2) **trần 20 câu / tài liệu**;
(3) làm tròn bằng phương pháp phần dư lớn nhất với seed cố định, ghi seed vào `sample-plan.json`.

**(c) Phân bổ theo mức trong từng đơn vị.** Lấy mục tiêu theo mức của [R §5.4] làm biên (L1 400, L2 400, L3 350, L4 350, L5 300, L7 200). Giao mức cho đơn vị theo **khả năng**:
L3 chỉ cho đơn vị ≥ 2 chunk; L4 / L5 lấy cặp đơn vị **trong cùng cụm** ([C §5.4]); L2 / L7 là **biến thể** của câu L1 / L3 đã duyệt (cùng `seed_id`). Lặp kiểu "iterative
proportional fitting" giữa biên mức và biên cụm cho đến khi khớp ±5%. Sinh dư 1,5-1,8 lần theo [C §5.3], và **phân loại lại mức sau khi sinh** ([C §7] mục 1). Quota
áp lên **số câu giữ lại**, không lên số câu sinh ra: cụm hoặc mức nào thiếu sau lọc thì sinh bù cho đúng ô đó.

**(d) Câu không trả lời được (L6)** lấy theo phân bố riêng a : b : c ≈ 1 : 2 : 1 ([R §5.4]). L6(c) (tiền đề sai) sinh từ câu L1 đã duyệt nên đi theo quota cụm; L6(b) có cụm
"ngoài corpus" riêng.

**(e) Biến thể ngôn ngữ.** Mỗi câu L1 / L3 gold có tối đa 1 biến thể không dấu và 1 biến thể trộn Việt-Anh, mang cùng `seed_id`. So sánh "có dấu và không dấu" là **ghép cặp
trên cùng seed**, mạnh hơn hẳn so sánh hai nhóm câu khác nhau [Nguồn 1, §4.2].

**(f) Báo cáo** (cố định trước, ghi trong card):

| Bảng | Nội dung | Thống kê |
|---|---|---|
| 1. Số chính | Macro theo 11 cụm, cho câu trả lời được; từ chối đúng trên L6; từ chối sai trên câu trả lời được | Clustered SE (cụm = doc_key / test case), 95% CI |
| 2. Theo mức | L1-L7, mỗi mức một dòng | Clustered SE; Wilson nếu n < 300 |
| 3. Theo cụm | 11 dòng, kèm n và số đơn vị | Wilson với n_eff = n / deff; **chỉ mô tả** |
| 4. Theo nguồn gold | WSTG / cheat sheet / cả hai | Như bảng 3 |
| 5. So sánh cấu hình | Hiệu ghép cặp, SE ghép cặp có cụm, tương quan, p của Fisher randomization (ranx) | Theo [Nguồn 1] bảng 5 |
| Phụ lục | Micro, hậu phân tầng về tỉ lệ chunk (kèm deff), gold-only và silver | |

### 6.2 Hạ tầng: kiến trúc tối thiểu cho một sinh viên

#### 6.2.1 Thư mục

```
data/eval/                          # bỏ ra khỏi .gitignore: đổi "/data/" thành "/data/*" + "!/data/eval/"
  README.md                         # dataset card (6.2.6), YAML đầu file kiểu Hugging Face
  CHANGELOG.md                      # SemVer: MAJOR = đổi snapshot / nghĩa gold; MINOR = thêm câu; PATCH = sửa nhãn
  clusters.json                     # doc_key / WSTG nhóm → cụm (người duyệt)
  corpus/<snapshot_id>/             # ví dụ 2026-10-18-owasp
    manifest.json
    md/<doc_key>.md                 # đúng chuỗi Document.markdown
    units.jsonl                     # đơn vị lấy mẫu: mục ## / test case WSTG, có offset
    chunks.<chunker_version>.jsonl  # ánh xạ chunk DB → offset, sinh lại sau mỗi reindex
  questions/v1.0/
    dev.jsonl  test.jsonl  silver.jsonl   # schema [R §5.3] + trường tầng (6.2.2)
    sample-plan.json                # quota đã tính + seed
  judgments/v1.0/
    pool.jsonl                      # (qid, chunk_key, system list) sau pooling
    labels.jsonl                    # một dòng một nhãn: annotator, guideline_version, lead_time, grade
  qrels/v1.0/<chunker_version>.qrels        # SINH RA từ span + labels; định dạng trec_eval
  annotation/guideline-v1.md  labelstudio/*.xml  exports/
  runs/<run_id>/
    config.json  run.trec  answers.jsonl  per_question.jsonl  metrics.json  log.txt
  reports/<date>-<name>.md          # bảng 6.1(f) sinh tự động
```

Lý do **qrels là sản phẩm sinh ra**: `DocumentChunk.id` là `randomUUID()` và mọi chunk bị xoá / tạo lại mỗi lần nạp (`deleteMany` rồi `insertChunks`) [Code].
Nguồn sự thật là **span trên markdown** ([C §4.6]); qrels cho từng `chunker_version` được tính lại. Đây chính là cách KILT neo lại provenance vào snapshot
[Nguồn 13].

#### 6.2.2 Định dạng

`manifest.json` (theo trường của Croissant [Nguồn 29], để sau này xuất được):

```json
{
  "name": "seclearn-owasp-corpus", "snapshot_id": "2026-10-18-owasp", "version": "1.0.0",
  "datePublished": "2026-10-18", "license": ["CC-BY-SA-4.0"], "creator": ["..."],
  "source_git_commit": "893e3fa", "chunker": {"version": "sentence-v2", "CHUNK_SIZE": 800, "CHUNK_OVERLAP": 80},
  "documents": [
    {"doc_key": "Session_Management_Cheat_Sheet", "title": "...", "source_file": "data/uploads/...pdf",
     "source_sha256": "...", "md_path": "md/Session_Management_Cheat_Sheet.md", "md_sha256": "...", "chars": 0,
     "chunks": 94, "status": "active", "cluster": "auth", "source_url": "https://cheatsheetseries.owasp.org/...", "retrieved": "2026-10-10"},
    {"doc_key": "Access_Control_Cheat_Sheet", "status": "stub", "reason": "deprecated, 1 chunk"}
  ],
  "canary": "<GUID riêng của SecLearn>"
}
```

`units.jsonl`: `{"unit_id": "wstg-v4.2#WSTG-INPV-05", "doc_key": "wstg-v4.2", "cluster": "inj", "char_start": 0, "char_end": 0, "chunks": 161, "sampleable": true}`.

`chunks.<chunker_version>.jsonl`: `{"chunk_key": "Session_Management_Cheat_Sheet#12", "db_id": "<uuid>", "char_start": 0, "char_end": 0, "unit_id": "...", "content_sha1": "..."}`.
`chunk_key = doc_key#chunkIndex` ổn định giữa các lần reindex **cùng** chunker. `db_id` chỉ để tra ngược.

Câu hỏi: schema [R §5.3] cộng thêm `cluster`, `unit_ids[]`, `seed_id`, `question_en`, `strata: {level, answerable, question_style, gold_source}`, `review.guideline_version`.
Trên tinh thần FlashRAG, mọi trường dùng để lọc / báo theo tầng nằm ở chỗ cố định [Nguồn 18].

qrels (trec_eval [Nguồn 24]): `seclearn-v1-000123 0 Session_Management_Cheat_Sheet#12 3`. Run: `seclearn-v1-000123 Q0 Session_Management_Cheat_Sheet#12 1 0.913 r2026-10-20-hyde-on`.

`runs/<run_id>/config.json`: mọi biến `RAG_*`, `LLM_PROVIDER` / `LLM_MODEL`, `EMBED_MODEL`, `EMBED_DIM`, `RERANK_URL` (và tên model reranker), `git rev-parse HEAD`,
`git diff --stat` (cờ "dirty"), `snapshot_id`, `chunker_version`, phiên bản bộ câu, K (số lần chạy lại), thời điểm, máy. `config_hash = sha256` của JSON chuẩn hoá. Mẫu này
học từ lm-eval (task version + commit) và BERGEN (một thư mục một thí nghiệm) [Nguồn 17, 19].

#### 6.2.3 Script (đặt ở `scripts/eval/`, chạy bằng `tsx --env-file=.env` như `db:reindex`)

| # | Script | Việc | Gắn vào `src/lib` | Ước lượng |
|---|---|---|---|---|
| 1 | `snapshot-corpus.ts` | Đọc `Document.markdown` từ DB (Prisma) → `md/`, sha256; đánh dấu stub (< 300 ký tự + "deprecated / moved"); tách WSTG theo regex test case; ghi `manifest.json`, `units.jsonl` | `prisma` | 0,5-1 ngày |
| 2 | `map-chunks.ts` | Với mỗi chunk trong DB: bỏ dòng tiêu đề do chunker chèn, tìm offset trong markdown (sau chuẩn hoá khoảng trắng), gán `unit_id`; báo tỉ lệ tìm thấy ([C §4.6]: trung bình 95%) | `prisma`; kiểm bằng cách chạy lại `chunkMarkdown` trên `md/` | 0,5 ngày |
| 3 | `sample-plan.ts` | Tính quota phương án R (6.1) + biên mức, seed cố định → `sample-plan.json`; in bảng phân bố | — | 0,5 ngày |
| 4 | `generate.ts` / `filter.ts` | Như bước 4-5 của [C §6], đọc `sample-plan.json`; dedup kiểu SemDeDup (k-means trên embedding câu, so trong cụm) [Nguồn 8] | `embedTexts` (`src/lib/embed.ts`) | (đã tính ở [C §6]) |
| 5 | `ls-io.ts` | JSONL ↔ task Label Studio (kiểm câu; chấm pool); nhập về `labels.jsonl` có `completed_by`, `lead_time` ([C §4.2]) | — | 1 ngày |
| 6 | `run-eval.ts` | Chạy một cấu hình trên một split: với mỗi câu gọi `retrieveForQuestion` (chỉ truy xuất) hoặc `answerQuestion` (đầy đủ); ghi `run.trec`, `answers.jsonl`; **cache** theo `sha256(qid + config_hash + snapshot_id + k)`; `--limit 20` để chạy thử; K lần chạy lại | `retrieveForQuestion`, `answerQuestion` (`chat-answer.ts`), `getEnv`. **Lưu ý** `getEnv()` cache biến môi trường trong process → mỗi cấu hình **một process** (hoặc gọi `resetEnvCache()`) [Code] | 1,5-2 ngày |
| 7 | `pool.ts` | Hợp top-10 của các run trong pool ([C §4.7]) → `pool.jsonl`; gọi LLM judge chấm silver | đọc `runs/*/run.trec` | 0,5 ngày |
| 8 | `spans-to-qrels.ts` | Span gold + `labels.jsonl` → `qrels/<chunker_version>.qrels` (chunk giao ≥ 50% span → grade của span; nhãn pool ghi đè); báo "gold coverage" | đọc `chunks.*.jsonl` | 0,5 ngày |
| 9 | `score.py` | ranx: Hit@k, MRR, nDCG@10, Recall@k; ir-measures: `Judged@10`; tự cài clustered SE (phương trình 4 và 8 của [Nguồn 1]), Wilson, macro / micro / hậu phân tầng, α (gói `krippendorff` hoặc Inspect [Nguồn 20]); `ranx.compare` để kiểm định ghép cặp; sinh `reports/*.md` và bảng LaTeX | — | 1,5-2 ngày |
| 10 | `check.ts` | Kiểm tra tự động (6.2.5); chạy trước mọi lượt đo và trong `npm test` | zod (đã có trong dự án) | 0,5-1 ngày |

**Tổng ~8-11 ngày công**. Trong đó #1, #2, #5, #7 trùng với bước 0, 3, 10 của [C §6]. Phần mới thật sự là #3, #6, #8, #9, #10 (~5-6 ngày) [Suy luận].

#### 6.2.4 Dùng lại hay tự viết

| Việc | Dùng lại | Tự viết | Lý do |
|---|---|---|---|
| Độ đo truy xuất + kiểm định | **ranx** [Nguồn 23] (đã kiểm chéo với trec_eval) | — | Tránh lỗi tự cài nDCG; có Fisher randomization |
| Judged@k, đối chiếu trec_eval | **ir-measures** [Nguồn 22] | — | Một dòng lệnh |
| Clustered SE, Wilson, macro / hậu phân tầng | — | ~50 dòng Python theo [Nguồn 1] | ranx không có SE theo cụm; Inspect có nhưng bắt viết lại pipeline dưới dạng Python Solver |
| Chạy pipeline RAG | — | `run-eval.ts` gọi hàm có sẵn | Pipeline là TypeScript (rewrite, HyDE, rerank, grounding); BERGEN / FlashRAG không chạy được mã này. Chỉ **mượn mẫu thiết kế** (config + cache + thư mục thí nghiệm) |
| Gán nhãn | **Label Studio** ([C §4.2]); dự phòng POTATO [Nguồn 33] | Script I/O | |
| Phiên bản dữ liệu | **git** + sha256 trong manifest | — | Dữ liệu nhỏ; DVC [Nguồn 32] chỉ cần khi thêm PDF / embedding cache lớn |
| Định dạng metadata | Trường của Croissant [Nguồn 29] trong `manifest.json` | Xuất `croissant.json` bằng `mlcroissant` khi công bố [Chưa kiểm chứng: chưa thử công cụ] | |

#### 6.2.5 Danh sách kiểm tra tự động (`check.ts`)

1. Mọi file JSONL hợp lệ theo schema zod; `id` duy nhất toàn bộ; `version` khớp thư mục.
2. `sha256(Document.markdown)` trong DB khớp `manifest.json` cho mọi tài liệu `active`; không có tài liệu trong DB mà thiếu trong manifest (bắt trường hợp NIST bị xoá
   lặng lẽ như lần này).
3. Mọi `gold_evidence` có `doc_sha256` khớp manifest; `quote` tìm thấy **đúng một lần** quanh `[char_start, char_end)` (sau chuẩn hoá khoảng trắng). Nếu lệch thì tìm lại
   quote, kiểu ngưỡng neo lại của KILT [Nguồn 13], và báo tỉ lệ phải neo lại / bỏ.
4. Gold coverage: mọi span có ≥ 1 chunk phủ ≥ 50% theo `chunks.<chunker_version>.jsonl` ([C §4.6]).
5. Không tài liệu `stub` / vùng loại (mục lục, phụ lục C-D) nào xuất hiện trong gold.
6. Phân bố theo cụm / mức / L6 trong từng split khớp `sample-plan.json` ±5%; không câu nào có `seed_id` nằm ở hai split khác nhau; không cặp câu khác split có
   cosine > ngưỡng.
7. Mỗi run có `config.json` đầy đủ; cờ `dirty` = true thì báo cáo đánh dấu "không tái lập được".
8. `Judged@10` của mọi cấu hình được báo ≥ ngưỡng (ví dụ 0,9) trên tập gold, nếu không thì phải chấm bổ sung trước khi so ([C §4.7]).
9. Canary GUID có trong README và đầu mỗi file câu hỏi (nếu định công bố) [Nguồn 11].

#### 6.2.6 Dataset card: trường tối thiểu

Gộp Datasheets [Nguồn 25], Data Statements [Nguồn 26], Data Cards [Nguồn 27], Croissant [Nguồn 28, 29], HF card [Nguồn 30]:

```yaml
---
pretty_name: SecLearn Vietnamese RAG Eval (OWASP)
language: [vi, en]          # câu hỏi vi, corpus en
license: cc-by-sa-4.0       # theo OWASP ([C §5.7])
task_categories: [question-answering, text-retrieval]
size_categories: [1K<n<10K]
version: 1.0.0
---
```

Phần thân: (1) **Motivation** (đánh giá trợ lý RAG Việt → Anh về an toàn web). (2) **Composition**: snapshot corpus + sha256, 138 → 134 tài liệu dùng được, đơn vị lấy mẫu;
**bảng quota** (phương án R, sàn, trần, seed) và phân bố thực tế theo cụm × mức × L6; split; "bộ có đại diện cho gì": cân theo √, **không** tỉ lệ với corpus hay câu hỏi thật.
(3) **Collection**: generator, prompt version, tỉ lệ loại ở từng bước lọc ([C §7] mục 11). (4) **Labeling**: guideline version, số người gán, trình độ (Data Statements D), κ / α
từng trường kèm ngưỡng ([Nguồn 34]), lead time trung vị. (5) **Language variety** (Data Statements B): `vi-VN` có dấu / không dấu / trộn Việt-Anh, tỉ lệ. (6) **Uses / không
nên dùng**: không dùng để huấn luyện; số theo cụm chỉ mang tính mô tả (6.1 f). (7) **Báo cáo chuẩn**: số chính đã chọn trước, phương pháp SE / CI. (8) **Distribution**: giấy
phép, ghi công OWASP, canary. (9) **Maintenance**: SemVer, CHANGELOG, errata, khi nào kiểm lại (FRAMES kiểm lại sau 3 tháng [C §2.1]). (10) **Hạn chế đã biết**: không còn NIST;
pool chỉ gồm các hệ đã liệt kê; gán đôi chỉ trên 15-20%.

---

## 7. Rủi ro và lưu ý

1. **Corpus đã đổi mà không có snapshot.** Việc bỏ NIST và MFA làm mọi số đo trước đó trên 141 tài liệu không so được với số sau. Đây chính là lý do cần `manifest.json` +
   kiểm tra số 2 ở 6.2.5. Từ giờ, mỗi lần thêm / xoá tài liệu phải tăng phiên bản snapshot.
2. **Thiếu NIST là thay đổi phạm vi, không chỉ là làm sạch.** Cần quyết định có nạp lại một bản NIST CSWP 29 không, và sửa mô tả corpus trong luận văn cho khớp.
3. **√ không bất biến khi đổi cách chia đơn vị** (phương án S2 ở 6.1): kết quả phụ thuộc chia đơn vị ở tầng nào. Phải ghi rõ "√ ở cấp tài liệu, WSTG theo cụm" trong card;
   nếu sau này tách cheat sheet theo mục rồi lấy √ thì phân bố lại đổi.
4. **Phân cụm theo tên file là thủ công và tranh cãi được** (CSRF thuộc "trình duyệt" hay "phiên"?). Sai cụm không làm sai điểm micro, nhưng làm đổi điểm macro. Chốt
   `clusters.json` **trước** khi chạy, và báo độ nhạy (macro với một cách phân cụm khác).
5. **Clustered SE với ít cụm cũng không đáng tin** [Nguồn 2]. Cụm "API" chỉ có 8 tài liệu: CI theo cụm ở đây rất rộng; không kết luận theo cụm nhỏ.
6. **Macro làm cụm nhỏ có trọng lượng lớn.** Cụm "miền đặc thù" (106 chunk) nặng bằng "kiến trúc, quy trình" (1.022 chunk) trong số macro. Nếu hội đồng phản biện, báo kèm
   hậu phân tầng về tỉ lệ chunk (deff ~1,6) như một phép kiểm độ bền.
7. **Không chọn số chính sau khi xem kết quả** (micro hay macro, cụm hay mức). Ghi vào card và commit trước lượt đo đầu tiên.
8. **IRT / tập con nhỏ đến sau.** Đừng dùng tinyBenchmarks / anchor points cho bộ chính: chúng cần nhiều model đã chạy [Nguồn 5, 6], và IRT không giảm đáng kể phương
   sai trong nghiên cứu của Madaan và cộng sự [Nguồn 3].
9. **Cache có thể che lỗi.** Cache của `run-eval.ts` phải gồm `config_hash` và commit mã; cờ `dirty` buộc chạy lại; xoá cache khi đổi prompt trong `query.ts` / `chat-answer.ts`.
10. **`data/eval/` đang bị git bỏ qua.** Bộ smoke 40 câu hiện chỉ có một bản trên đĩa. Sửa `.gitignore` là thay đổi cấu hình nhỏ, nên làm sớm (cần chủ repo đồng ý; tài liệu này không sửa).
11. **4 stub nằm trong chỉ mục** có thể chiếm chỗ trong top-k (văn bản ngắn được cosine ưa thích [Nguồn 14]). Ít nhất hãy đánh dấu `status: stub` trong manifest và báo số lần
    stub xuất hiện trong top-5 ở mỗi run.

---

## 8. Nguồn

### Thống kê đánh giá
1. Miller, 2024. *Adding Error Bars to Evals: A Statistical Approach to Language Model Evaluations*. Anthropic. https://arxiv.org/abs/2411.00640 (đọc PDF §1-5: phương trình 1-9, bảng 3-5)
2. Bowyer, Aitchison, Ivanova, 2025. *Position: Don't Use the CLT in LLM Evals With Fewer Than a Few Hundred Datapoints*. ICML 2025. https://arxiv.org/abs/2503.01747 (tóm tắt, §2-3, hình 2-3)
3. Madaan, Singh, Schaeffer, Poulton, Koyejo, Stenetorp, Narang, Hupkes, 2024. *Quantifying Variance in Evaluation Benchmarks*. https://arxiv.org/abs/2406.10229 (tóm tắt, §2)
4. Perlitz, Bandel, Gera, Arviv, Ein-Dor, Shnarch, Shmueli-Scheuer, Choshen, 2023. *Efficient Benchmarking (of Language Models)*. https://arxiv.org/abs/2308.11696 (tóm tắt, danh sách kiểm "Efficient Benchmark Building Checklist", §2)

### Chọn tập con, IRT, dedup
5. Maia Polo, Weber, Choshen, Sun, Xu, Yurochkin, 2024. *tinyBenchmarks: evaluating LLMs with fewer examples*. ICML 2024. https://arxiv.org/abs/2402.14992 (§1, §3.1-3.2)
6. Vivek, Ethayarajh, Yang, Kiela, 2023. *Anchor Points: Benchmarking Models with Much Fewer Examples*. https://arxiv.org/abs/2309.08638 (tóm tắt, hình 1)
7. Rodriguez, Barrow, Hoyle, Lalor, Jia, Boyd-Graber, 2021. *Evaluation Examples Are Not Equally Informative: How Should That Change NLP Leaderboards?* ACL 2021. https://aclanthology.org/2021.acl-long.346/ (§4.3, §5.1-5.2, §7, §7.1)
8. Abbas, Tirumala, Simig, Ganguli, Morcos, 2023. *SemDeDup: Data-efficient learning at web-scale through semantic deduplication*. https://arxiv.org/abs/2303.09540 (tóm tắt, §3, hình 1)

### Thành phần benchmark
9. Liang, Bommasani, Lee và cộng sự, 2023. *Holistic Evaluation of Language Models* (HELM). TMLR. https://arxiv.org/abs/2211.09110 (tóm tắt, §1.1, §3, bảng 7, hình 26, §11)
10. Wang, Ma, Zhang và cộng sự, 2024. *MMLU-Pro: A More Robust and Challenging Multi-Task Language Understanding Benchmark*. https://arxiv.org/abs/2406.01574 (§3.1, hình 3, phụ lục A.1 bảng 4-5)
11. Srivastava và cộng sự, 2022. *Beyond the Imitation Game* (BIG-bench). https://arxiv.org/abs/2206.04615 (§2.1-2.4: preferred metric, chuẩn hoá, BIG-bench Lite, canary)
12. Bai, Lv, Zhang và cộng sự, 2023. *LongBench: A Bilingual, Multitask Benchmark for Long Context Understanding*. https://arxiv.org/abs/2308.14508 (tóm tắt, §3 lấy mẫu, bảng 3)
13. Petroni, Piktus, Fan và cộng sự, 2021. *KILT: a Benchmark for Knowledge Intensive Language Tasks*. NAACL 2021. https://arxiv.org/abs/2009.02252 (§2 Knowledge Source, mapping)
14. Thakur, Reimers, Rücklé, Srivastava, Gurevych, 2021. *BEIR*. https://arxiv.org/abs/2104.08663 (§3 thống kê bộ, §5 ý 6, phụ lục H thiên lệch độ dài; phần pooling đã ở [C])
15. Muennighoff, Tazi, Magne, Reimers, 2023. *MTEB: Massive Text Embedding Benchmark*. EACL 2023. https://arxiv.org/abs/2210.07316 (tóm tắt, bảng 1)
16. Ru, Qiu, Hu và cộng sự, 2024. *RAGChecker: A Fine-grained Framework for Diagnosing Retrieval-Augmented Generation*. Amazon. https://arxiv.org/abs/2408.08067 (§4.1-4.2, phụ lục A.1, A.3)

### Hạ tầng chạy đánh giá
17. Rau, Déjean, Chirkova, Formal, Wang, Nikoulina, Clinchant, 2024. *BERGEN: A Benchmarking Library for Retrieval-Augmented Generation*. Naver Labs Europe. https://arxiv.org/abs/2407.01102 (§3-5) và README https://github.com/naver/bergen (mục Usage, Evaluation)
18. Jin, Zhu, Dong và cộng sự, 2024. *FlashRAG: A Modular Toolkit for Efficient Retrieval-Augmented Generation Research*. https://arxiv.org/abs/2405.13576 (§3.3-3.4, phụ lục B)
19. Biderman, Schoelkopf, Sutawika và cộng sự, 2024. *Lessons from the Trenches on Reproducible Evaluation of Language Models* (lm-evaluation-harness). https://arxiv.org/abs/2405.14782 (§3.2-3.3, §4.2-4.3, phụ lục cấu hình YAML)
20. UK AI Security Institute, *Inspect: Scoring Metrics* (`stderr(cluster=…)`, `grouped(…, all="groups")`, `ci_wilson`, `krippendorff_alpha`). https://inspect.aisi.org.uk/metrics.html ; tổng quan https://inspect.aisi.org.uk/
21. MacAvaney, Yates, Feldman, Downey, Cohan, Goharian, 2021. *Simplified Data Wrangling with ir_datasets*. SIGIR 2021. https://arxiv.org/abs/2103.02280 (§2.1-2.4, bảng 2)
22. MacAvaney, Macdonald, Ounis, 2022. *Streamlining Evaluation with ir-measures*. ECIR 2022. https://arxiv.org/abs/2111.13466 (§1-3, bảng 1)
23. Bassani, 2022. *ranx* (ECIR 2022). README: https://github.com/AmenRa/ranx (mục Statistical Tests, Qrels and Run, Fusion); thư mục `ranx/statistical_tests/` (fisher_randomization_test, paired_student_t_test, tukey_hsd_test)
24. NIST, *trec_eval*. https://github.com/usnistgov/trec_eval (README; `get_qrels.c`: dạng `qid iter docno rel`; `get_trec_results.c`: dạng `qid Q0 docno rank sim run_id`)

### Tài liệu hoá, metadata, phiên bản
25. Gebru, Morgenstern, Vecchione và cộng sự, 2021. *Datasheets for Datasets*. CACM. https://arxiv.org/abs/1803.09010 (§3, phụ lục datasheet mẫu Movie Review Polarity)
26. Bender, Friedman, 2018. *Data Statements for Natural Language Processing*. TACL. https://aclanthology.org/Q18-1041/ (§4 các mục A-I, §5 bản dài / ngắn)
27. Pushkarna, Zaldivar, Kjartansson, 2022. *Data Cards: Purposeful and Transparent Dataset Documentation for Responsible AI*. FAccT 2022. https://arxiv.org/abs/2204.01075 (§3-4: 31 khía cạnh, telescope / periscope / microscope)
28. Akhtar, Benjelloun, Conforti và cộng sự, 2024. *Croissant: A Metadata Format for ML-Ready Datasets*. NeurIPS 2024 Datasets & Benchmarks. https://arxiv.org/abs/2403.19546 (§3: bốn lớp, FileObject / FileSet / RecordSet, RAI)
29. MLCommons, *Croissant Format Specification* (FileObject `sha256`; trường bắt buộc; `version` theo SemVer; khuyến nghị checksum cho bộ có phiên bản). https://docs.mlcommons.org/croissant/docs/croissant-spec.html
30. Hugging Face, *Dataset Cards*. https://huggingface.co/docs/hub/datasets-cards
31. NeurIPS 2025, *Call for Datasets & Benchmarks* (lưu trữ, Croissant bắt buộc, code chạy được). https://neurips.cc/Conferences/2025/CallForDatasetsBenchmarks
32. DVC, *.dvc files* (`outs`, `path`, `md5`, `size`, `nfiles`). https://doc.dvc.org/user-guide/project-structure/dvc-files

### Gán nhãn và độ đồng ý
33. Pei, Ananthasubramaniam, Wang, Zhou, Dedeloudis, Sargent, Jurgens, 2022. *POTATO: The Portable Text Annotation Tool*. EMNLP 2022 Demo. https://arxiv.org/abs/2212.08620 (tóm tắt, §2-3)
34. Artstein, Poesio, 2008. *Inter-Coder Agreement for Computational Linguistics*. Computational Linguistics 34(4). https://aclanthology.org/J08-4004/ (§2.6 α và κ_w; §4.1 ngưỡng, hình 1 thang Landis & Koch; §4.3 unitizing)

> Ghi chú: Krippendorff (2011) *Computing Krippendorff's Alpha-Reliability* (bản của UPenn) trả về 403 khi mở; ngưỡng 0,8 / 0,667 ở trên dẫn **qua** Artstein & Poesio [Nguồn 34],
> có trích nguyên văn Krippendorff 2004. Hiệu ứng thiết kế Kish và lấy mẫu phân bổ Neyman là kiến thức sách giáo khoa, chưa mở nguồn gốc lần này. Không mở: RULER, InfiniteBench,
> GPQA (đã tải nhưng không dùng), Dynabench, Paullada và cộng sự, ExpertQA, LiveBench, RAGTruth, OpenAI simple-evals, PyTerrier, Pyserini, INCEpTION.

### File trong repo và số đo
- `src/lib/ingest.ts` (`insertChunks` dùng `randomUUID()`; `deleteMany` chunk trước khi nạp lại; `Document.markdown` lưu khi xong), `src/lib/chunking.ts`, `src/lib/pdf-cleanup.ts`,
  `src/lib/env.ts` (`getEnv` cache trong process, `resetEnvCache`; `CHUNK_SIZE` 800, `CHUNK_OVERLAP` 80, các biến `RAG_*`), `src/lib/chat-answer.ts` (`retrieveForQuestion`,
  `answerQuestion`), `src/lib/rag.ts` (`retrieveChunks`), `prisma/schema.prisma`, `.gitignore` (dòng `/data/`), `package.json` (`db:reindex`, zod).
- DB (đọc): bảng `Document` (138 dòng, `status`, `markdown`, `updatedAt`), `DocumentChunk` (5.804 dòng, `metadata` rỗng).
- `data/uploads/*.pdf` (138 file), `data/eval/` (README, set-a, set-b).
- Script đo đặt ngoài repo (scratchpad của phiên): chạy lại pipeline, tách WSTG theo test case, phân cụm theo tên file, tính 6 phương án quota; không ghi gì vào repo hay DB.
