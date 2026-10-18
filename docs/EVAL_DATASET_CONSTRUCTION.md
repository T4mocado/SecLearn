# Nghiên cứu: các nhóm nghiên cứu xây bộ đánh giá ~2.000+ câu như thế nào, và SecLearn đã đủ dữ liệu chưa

> Ngày lập: 2026-10-18. Phạm vi: (1) quy trình thật mà các bài báo dùng để tạo bộ đánh giá QA / RAG / truy xuất cỡ vài nghìn mẫu —
> người viết tay, LLM sinh rồi người kiểm, hay lai; (2) quy trình gán nhãn thủ công chi tiết (cách đưa tài liệu cho người gán, công cụ,
> hướng dẫn, độ đồng ý, phân xử, pooling); (3) đánh giá corpus hiện tại của SecLearn có đủ để làm bộ ~2.000+ câu theo thang L1-L7 không,
> thiếu gì, và kế hoạch từng bước. Chỉ nghiên cứu và đo trên bản sao; **không sửa mã nguồn, không sửa dữ liệu**.
>
> Tài liệu này **nối tiếp** `docs/EVAL_DATASET_RESEARCH.md` (gọi tắt là **[R]**): độ đo (R §2), các bộ dữ liệu có sẵn (R §3), tiêu chí bộ
> chuẩn (R §4), schema JSONL (R §5.3), thang L1-L7 (R §5.4), cỡ mẫu (R §6), các lỗi hay gặp (R §7). Những phần đó không nhắc lại ở đây.
>
> Quy ước đánh dấu:
> - **[Nguồn n]**: tài liệu chính chủ đã mở và đọc (PDF bài báo trên arXiv / ACL Anthology, docs chính thức, file LICENSE trên GitHub), link ở mục 8.
>   Số đánh lại từ 1, **không trùng** với số nguồn của [R].
> - **[Code]**: mã nguồn SecLearn trên đĩa ngày lập (`src/lib/ingest.ts`, `src/lib/chunking.ts`, `src/lib/pdf-cleanup.ts`, `prisma/schema.prisma`).
> - **[Đo]**: số tự đo trong repo ngày lập — chạy lại đúng pipeline `pdf-parse` → `removeHeadersFooters` → `removeSiteChrome` → `toMarkdown`
>   → `chunkMarkdown(md, 800, 80)` (giá trị mặc định trong `src/lib/env.ts`) trên `data/uploads/*.pdf`, bằng script đặt ngoài repo. Không đọc
>   database (Postgres không chạy), nên tiêu đề tài liệu lấy từ tên file, có thể khác `Document.title` trong DB; nếu `.env` đặt `CHUNK_SIZE`
>   khác 800 thì số chunk khác.
> - **[Suy luận]**: đề xuất hoặc ước lượng của người viết, chưa kiểm chứng bằng chạy thật.
> - **[Chưa kiểm chứng]**: không mở được nguồn chính chủ, hoặc chỉ là hiểu biết sẵn có.

---

## 1. Trả lời ngắn

**Câu hỏi: các nhóm dùng LLM sinh rồi gán nhãn tay, hay viết tay hoàn toàn?** Cả ba kiểu đều có, và xu hướng từ 2023 là **lai**:

| Kiểu | Ví dụ (có số liệu ở mục 2) | Ai viết câu hỏi | Ai bảo đảm đáp án / bằng chứng |
|---|---|---|---|
| **A. Người viết hoàn toàn** | SQuAD, UIT-ViQuAD 2.0, HotpotQA, MS MARCO (câu hỏi thật, người viết đáp án), Natural Questions (câu hỏi thật, người gán đáp án), CRAG (phần web), FRAMES | Crowd worker / chuyên gia, hoặc người dùng thật (log tìm kiếm) | Người, thường 1 lượt cho train, 2-5 lượt cho dev/test |
| **B. Máy sinh có cấu trúc + người kiểm** | 2WikiMultiHopQA, CRAG (phần KG: 600+ template), MuSiQue (máy ghép câu đơn bước, người viết lại câu) | Template / thuật toán | Dữ liệu cấu trúc + người kiểm tra |
| **C. LLM sinh + lọc tự động + người kiểm (toàn bộ hoặc mẫu)** | MultiHop-RAG, CyberMetric, CTIBench, SecQA, AttackQA, RAGEval, DataMorgana, TREC DL 2023 (truy vấn tổng hợp) | LLM, từ đoạn / tài liệu nguồn | LLM lọc, rồi người duyệt — mức độ duyệt khác nhau rất nhiều |

**Ba bằng chứng định lượng quan trọng nhất cho quyết định của SecLearn:**

1. **Câu do LLM sinh có tỉ lệ hỏng cao, khoảng 30%.** FRAMES thử sinh bằng LLM và thấy **hơn 30%** câu hỏi / đáp án bị bịa, nên chuyển sang người viết
   [Nguồn 12]. AttackQA gán nhãn tay 400 cặp do Llama 3 8B sinh: **31-32,5%** là cặp kém; GPT-4o dùng làm bộ lọc chỉ bắt được **2/26** cặp kém
   [Nguồn 17]. Ở TREC DL 2023, chuyên gia chỉ giữ **13/48** truy vấn do T5 sinh và **18/49** do GPT-4 sinh [Nguồn 24].
2. **LLM không giữ được "loại câu" được yêu cầu.** Sinh bằng prompt đơn giản thì **95%** câu rơi vào loại "một sự kiện, một đoạn" (fact_single). Kể cả khi
   yêu cầu câu "summary", **75%** câu sinh ra vẫn bị gán nhãn fact_single [Nguồn 20]. Nhãn L1-L7 do generator tự khai là không đáng tin; phải gán lại.
3. **Chỉ coi đoạn sinh ra câu hỏi là đúng ("sparse gold") làm sai thứ hạng hệ thống.** Với truy vấn tổng hợp, nếu chỉ coi đoạn gốc là liên quan thì
   tương quan thứ hạng hệ thống với đánh giá thật là Kendall τ = **0,157**; khi có đánh giá đầy đủ trên pool thì τ = **0,8151** [Nguồn 24]. Bộ tổng
   hợp cũng **dễ hơn** câu thật: mọi loại hệ thống đều điểm cao hơn trên bộ tổng hợp [Nguồn 24].

**Khuyến nghị cho SecLearn** [Suy luận, dựa trên các số trên]: dùng kiểu **C có kiểm soát**. LLM sinh ứng viên theo từng mức từ corpus đã đóng băng,
sinh dư 1,5-2 lần. Lọc tự động. Người duyệt **toàn bộ** phần test "gold" (~600-800 câu), gán đôi 15-20% để tính κ, rồi **hoàn thiện gold bằng pooling**
nhiều retriever thay vì chỉ lấy đoạn sinh ra câu hỏi. Phần còn lại (~1.400+) là "silver": LLM kiểm tra, người kiểm mẫu 10% để ước lượng tỉ lệ lỗi.
Không nên viết tay hoàn toàn 2.000 câu: SQuAD ước 4 phút cho tối đa 5 câu của một đoạn [Nguồn 1], tức khoảng 50 giây/câu cho câu một đoạn đơn giản.
Câu khó của ViQuAD 2.0 cần ≥ 3 phút/câu [Nguồn 2]. Câu tiếng Việt về tài liệu tiếng Anh, nhiều mức khó, còn chậm hơn.

**Corpus SecLearn có đủ không?** **Đủ về lượng, chưa đủ về chất và hạ tầng** [Đo + Suy luận, mục 5]: 141 PDF, ~3,4 triệu ký tự markdown, **6.072 chunk**.
Cần khoảng 0,35 câu / chunk cho 2.100 câu, nên lượng không phải vấn đề. Vấn đề nằm ở:

- **Mất cân bằng**: WSTG chiếm **22,3%** số chunk (1.353 chunk); 5 tài liệu lớn nhất chiếm 29%.
- **Dữ liệu bẩn**: 4 file chỉ là trang "deprecated / moved" (1 chunk, ~200 ký tự); 2 bản trùng của NIST CSWP 29; 1 file `owasp_MFA_cheatsheet` thật ra là Authentication Cheat Sheet.
- **WSTG và NIST không có tiêu đề mục nào** sau khi trích (0 heading `##`).
- **Thiếu hạ tầng**: chưa có snapshot markdown có hash dùng làm chuẩn, chưa lưu offset của chunk, chưa có công cụ gán nhãn, hướng dẫn gán nhãn,
  người gán thứ hai, script pooling, script chạy đánh giá theo lô.

Kế hoạch ở mục 6: khoảng **80-100 giờ người** cho người gán chính và **10-20 giờ** cho 1-2 người phụ [Suy luận].

---

## 2. Các nhóm thật sự đã làm thế nào

### 2.1 Kiểu A: người viết câu hỏi hoặc gán đáp án

| Bộ | Nguồn câu hỏi | Tài liệu đưa cho người gán | Thao tác gán | Kiểm soát chất lượng, độ đồng ý | Thời gian, chi phí |
|---|---|---|---|---|---|
| **SQuAD 1.1** [Nguồn 1] | Crowd worker tự đặt | **Từng đoạn** Wikipedia (lấy 536 bài trong top 10.000 bài theo PageRank, bỏ ảnh / bảng, bỏ đoạn < 500 ký tự → 23.215 đoạn); chia train / dev / test **theo bài** (80/10/10) | Tối đa 5 câu / đoạn; gõ câu hỏi, **bôi đen span** đáp án trong đoạn. Giao diện **tắt copy-paste** và nhắc "dùng từ của mình" để giảm chép từ ngữ | Worker cần ≥ 97% HIT được chấp nhận, ≥ 1.000 HIT, ở Mỹ / Canada; có ví dụ câu tốt và câu xấu. Dev/test có **≥ 2 đáp án bổ sung** từ worker khác (chỉ thấy câu hỏi + đoạn); 2,6% câu bị ít nhất 1 người đánh dấu không trả lời được | 4 phút / đoạn, 9 USD/giờ; lượt đáp án bổ sung gợi ý 5 câu / 2 phút |
| **UIT-ViQuAD 2.0** [Nguồn 2] | Lấy câu trả lời được của bản 1.0; người **biến đổi** một nửa số câu thành câu không trả lời được (đáp án cũ thành `plausible_answers`) | Đoạn Wikipedia tiếng Việt | Biến đổi theo các kiểu: trái nghĩa, nói quá, nói giảm, hoán đổi thực thể, đổi từ, đổi mệnh đề trạng ngữ, đổi bổ ngữ | **13 người gán**, huấn luyện **6 đợt trong 10 ngày, 30 câu mỗi đợt**. Đợt đầu làm quen; các đợt sau cả 13 người biến đổi cùng một bộ câu, câu nào > 2 người biến đổi giống nhau thì phải làm lại (ép đa dạng). Cứ 3.000 câu thì người gán **tự kiểm** và viết ghi chú lỗi; sau 12.000 câu có đợt **kiểm chéo** bởi 10 người, **thưởng theo số lỗi tìm được**; nhóm tác giả xác nhận từng lỗi | Câu khó bổ sung: 5 người có nền NLP, ≥ 3 phút / câu. Tổng 35.990 bộ ba (9.217 câu không trả lời được) theo bài báo — khác số trên HF card ghi ở [R §3.2] |
| **Natural Questions** [Nguồn 3] | **Truy vấn thật** trên Google (≥ 8 từ, lọc bằng heuristic), giữ câu có trang Wikipedia trong **top 5** kết quả | **Cả trang Wikipedia** (HTML) | 3 bước liên tiếp: (1) câu hỏi tốt / xấu, chưa thấy trang; (2) chọn **long answer** = khối HTML sớm nhất đủ thông tin (đoạn 73%, bảng 19%), hoặc "không có"; (3) chọn **short answer** (thực thể) hoặc yes / no | ~50 người gán, giao diện riêng, hướng dẫn chi tiết, giám sát liên tục. Train **1 người / mẫu**; dev 7.830 và test 7.842 mẫu **5 người / mẫu**; thêm nghiên cứu **25 người / mẫu** về độ biến thiên. Độ chính xác của nhãn: long 90%, short 84% | Trung bình **80 giây / mẫu**. Chỉ 49% mẫu có long answer — bộ giữ cả 51% mẫu "không có" |
| **HotpotQA** [Nguồn 4] | Crowd worker viết câu **đa bước** | **Cặp đoạn đầu** của 2 bài Wikipedia: hoặc nối bằng siêu liên kết (bridge entity thuộc danh sách trang chọn tay), hoặc 2 thực thể cùng một trong **42 danh sách** chọn tay (so sánh) | Viết câu + chọn **câu bằng chứng (supporting facts)**. Thuật toán chọn loại: 75% bridge, 25% so sánh (một nửa yes / no) | Pilot cho thấy đưa một tập đoạn tùy ý thì worker không đặt được câu đa bước có nghĩa. Tách "train-easy" bằng cách lấy 3-10 câu của mỗi worker nhiều câu nhất rồi phân loại. Human performance: ≥ 3 người thêm trên 1.000 mẫu dev/test | Thưởng theo năng suất (câu / giờ) và thưởng top worker mỗi 200 câu |
| **MuSiQue** [Nguồn 5] | **Từ dưới lên**: ghép các câu đơn bước có sẵn (SQuAD, NQ...) thành DAG 2-4 bước, có bộ lọc bảo đảm không bước nào trả lời được nếu thiếu bước trước | Danh sách câu đơn bước + đoạn của từng câu + cầu nối | Worker xác nhận các lần nhắc thực thể cầu nối là cùng một thực thể (trả lời "có" 92%), rồi **viết lại** thành một câu tự nhiên | **Vòng qualification**: 100 worker × 20 mẫu, chấm tay, giữ **17 người**. 9 đợt, sau mỗi đợt đọc 10-20 mẫu / worker và gửi phản hồi qua email | 25 / 40 / 60 cent cho câu 2 / 3 / 4 bước, ~15 USD/giờ, **tổng ~11.000 USD** cho 24.814 câu; bộ lọc chỉ giữ 26,5% câu "đuôi" |
| **2WikiMultiHopQA** [Nguồn 6] | **Template** + Wikidata + luật suy diễn (AMIE, kiểm tay từng luật) | — | Máy sinh, kèm "evidence" dạng bộ ba | Bỏ template tạo ra câu một bước | — |
| **MS MARCO** [Nguồn 7] | **Truy vấn Bing thật** đã ẩn danh | **~10 đoạn** do retriever của Bing chọn | "Editor" đánh dấu đoạn đã dùng (`is_selected`), viết đáp án câu hoàn chỉnh, hoặc đánh dấu không trả lời được | Kiểm toán liên tục; một editor khác viết lại đáp án nếu có dấu hiệu chép nguyên đoạn | — |
| **CRAG** (phần web) [Nguồn 11] | Người gán viết câu "người dùng có thể hỏi" theo hướng dẫn | Kết quả tìm kiếm web | Ghi đáp án + URL chứa đáp án, nhãn miền, độ biến động, loại câu | Hai pha với đội ngôn ngữ học nội bộ: (1) kiểm câu và nhãn, **2 người / mẫu**, đồng ý ≥ 90%, người thứ 3 có kinh nghiệm hơn phân xử; (2) kiểm đáp án, 2 người / mẫu, đồng ý ≥ 90%, người thứ 3 phân xử → **sửa 5%** đáp án. Thêm: soát lại các mẫu mà baseline trả lời khác gold → **sửa thêm 2%** | 2.425 câu web + 1.984 câu KG; kích thước mỗi lát cắt chọn để biên sai số < 5% |
| **FRAMES** [Nguồn 12] | **Chuyên gia viết** sau khi thử LLM thất bại | Wikipedia, 2-15 bài / câu | Viết câu + đáp án + danh sách bài cần dùng + nhãn 5 loại suy luận | Người kiểm lại **3 tháng sau**, loại 5,5% câu có đáp án đã hết đúng; thêm ngữ cảnh để khử mơ hồ về thời gian. Judge tự động: accuracy 0,96, Cohen's κ 0,889 so với người | 824 câu |

Rút ra cho SecLearn [Suy luận]:
- **Đơn vị hiển thị nhỏ** khi viết câu một bước (SQuAD: một đoạn), **cặp đoạn có chủ đích** khi viết câu đa bước / so sánh (HotpotQA: cặp đoạn
  chọn bằng đồ thị liên kết hoặc danh sách thực thể cùng loại). Đưa một tập đoạn ngẫu nhiên thì không viết được câu tốt [Nguồn 4].
- **Đáp án đa người trên tập test** (SQuAD ≥ 3 người, NQ 5 người) là chuẩn của bộ có uy tín. Với một sinh viên, tương đương thực tế là gán đôi một tập con.
- **Qualification + phản hồi theo đợt** (MuSiQue, ViQuAD) rẻ hơn nhiều so với sửa dữ liệu hỏng về sau.
- **Soát lại các mẫu baseline trả lời khác gold** (CRAG) là cách rẻ để tìm gold sai: chạy SecLearn, xem các câu "sai", một phần là gold sai.

### 2.2 Đánh giá liên quan kiểu TREC: pooling và thang nhiều mức

| Bộ | Cách chọn tài liệu để đánh giá | Thang | Người đánh giá | Số liệu |
|---|---|---|---|---|
| **TREC DL 2019** [Nguồn 8] | (1) Pool **top-10 của mọi run** + đoạn đã có nhãn MS MARCO; (2) thêm 100 đoạn do **HiCAL** chọn (học chủ động: chọn đoạn chưa đánh giá có khả năng liên quan cao nhất); (3) dừng khi đã đánh giá 2R + 100 (R = số đoạn liên quan đã biết) | 0 Irrelevant / 1 Related (đúng chủ đề nhưng không trả lời) / 2 Highly relevant / 3 Perfectly relevant (chứa đáp án chính xác). Độ đo nhị phân chỉ tính 2-3; nDCG cho gain 1 với mức 1 | Assessor của NIST, một người cho cả tài liệu và đoạn của cùng topic; được sửa nhãn cũ bất cứ lúc nào | Từ 200 câu, NIST chọn 52 câu để đánh giá (43 câu mỗi task vào tập tính điểm) vì ngân sách; ứng viên là câu có MRR trung vị của các run (theo nhãn thưa MS MARCO) trong (0; 0,5], tức không quá dễ / quá khó. Top-10 pool cho assessor cơ hội "học" topic trước |
| **TREC-COVID** [Nguồn 9] | Pool theo vòng; vòng 0,5 dùng pool **depth-40** từ 3 run Anserini của ban tổ chức | Relevant / Partially relevant / Not relevant | Sinh viên y (10 người) + nhân viên đánh chỉ mục của NLM; giao diện web hiện topic và danh sách tài liệu, có tab cho các dạng (abstract, PDF...) | ~150-200 nhãn / topic / tuần, tối đa 2 người / topic; ~300 tài liệu / topic / vòng vẫn **chưa đủ**, nên báo Bpref, nDCG@10, P@5. Mỗi nhãn ghi **vòng** (phiên bản tài liệu) |
| **BEIR** [Nguồn 10] | — | — | Tác giả tự đánh giá **980 cặp** "lỗ hổng" (đoạn trong top-10 chưa có nhãn) trên TREC-COVID | nDCG@10 của nhiều model tăng sau khi lấp lỗ, ví dụ cột tăng từ 0,332 lên 0,445. Nhiều bộ BEIR có **thiên lệch từ vựng** vì ứng viên để gán nhãn được lấy bằng BM25 / TF-IDF |

Rút ra [Suy luận]: gold chunk của SecLearn phải được **lấp lỗ bằng pooling nhiều cấu hình** (mục 4.7). Đây là lý do BEIR và TREC đều phải bổ sung
nhãn. Corpus SecLearn còn có rất nhiều **thông tin lặp giữa tài liệu** (WSTG và cheat sheet cùng nói về SQLi, XSS, phiên, CSRF..., mục 5.4), nên
"một câu, một gold" gần như chắc chắn thiếu.

### 2.3 Kiểu C: LLM sinh, rồi lọc và kiểm

| Bộ | Sinh | Lọc tự động | Người kiểm | Tỉ lệ loại / số liệu |
|---|---|---|---|---|
| **MultiHop-RAG** [Nguồn 13] | 609 bài tin (sau mốc kiến thức của LLM, ≥ 1.024 token) → model nhỏ tách câu sự kiện làm evidence → GPT-4 viết lại evidence thành **claim** + xác định bridge entity / topic → gom 2-4 claim cùng cầu nối → GPT-4 sinh câu theo loại (inference, comparison, temporal, null) | UniEval kiểm claim khớp evidence; GPT-4 chấm từng mẫu theo 4 tiêu chí (dùng hết evidence, trả lời được chỉ từ evidence, đáp án 1 từ / 1 thực thể, đúng loại) | "Một tập con mẫu", **không ghi cỡ và tỉ lệ lỗi** | 2.556 câu |
| **CyberMetric** [Nguồn 14] | GPT-3.5-turbo sinh **10 câu MCQ / 8.000 token** (để mỗi tài liệu có tỉ lệ cân bằng) từ > 100.000 trang (NIST, RFC, sách...), bỏ mục lục, lời nói đầu, tham khảo, phụ lục | Falcon-180B loại câu sai ngữ pháp / ngữ nghĩa / ngoài chủ đề (**1,7%**); T5 sửa ngữ pháp (230 câu); Falcon loại câu tham chiếu "Hình 1", "Bảng 6"; **3 LLM** (GPT-4, GPT-4o, Mixtral) kiểm đáp án, câu nào bị gắn cờ thì đưa người | Chuyên gia **> 30 giờ** loại thêm 2,3%; **> 200 giờ** xem các câu bị gắn cờ. Lỗi tìm thấy: nhiều đáp án đúng, câu lỗi thời, **tài liệu nguồn sai**, còn sót tham chiếu ("chương 4", "theo tác giả") | 11.000 → 10.000 câu. Chỉ bản 80 và 500 câu được người kiểm **toàn bộ**; bản 10.000 có thể còn đáp án sai |
| **CTIBench (cti-mcq)** [Nguồn 15] | GPT-4o sinh MCQ từ trang MITRE / CWE, số câu tăng theo độ dài trang | — | Người gán **có link nguồn**, kiểm **~3.000** câu lấy mẫu; lỗi chính: nhiều đáp án đúng, đáp án LLM sai | Còn 2.500 câu |
| **SecQA** [Nguồn 16] | GPT-4 sinh từ một giáo trình, tránh chép nguyên văn | — | Bài báo nói "sinh và tinh chỉnh", không định lượng | GPT-4 đạt 98-100% → bộ quá dễ khi model sinh cũng là model được đo |
| **AttackQA** [Nguồn 17] | 20% câu do **heuristic viết bằng code** (truy vấn bảng quan hệ MITRE); còn lại Llama 3 8B sinh 1-3 bộ {câu, lập luận, đáp án} / tài liệu | Llama 3 70B **fine-tune làm bộ lọc QC** (G-Eval 0-1, ngưỡng 0,7) | **400 cặp gán tay** có điểm + lý do (80 để validation): **31% (train) và 32,5% (val) là cặp kém**. GPT-4o zero-shot chỉ bắt 2/26 cặp kém; model fine-tune: precision 84,2%, recall 89% | 28.686 → 25.335 (loại 11,7%) |
| **RAGEval / DRAGONBall** [Nguồn 18] | Sinh cả **tài liệu tổng hợp** từ schema (văn bản tài chính, luật, y tế giả lập), rồi câu, đáp án, reference, key point | Lặp lại để đáp án khớp reference | 8 người gán chấm **420 mẫu** (10 mẫu / loại câu / ngôn ngữ / kịch bản), ~95% đạt điểm 4-5 / 5; Fleiss' κ giữa 3 người 0,7686 cho phần kiểm chấm tự động | 6.711 câu. Không áp dụng trực tiếp cho SecLearn vì tài liệu là thật, không sinh |
| **DataMorgana** [Nguồn 19] | Cấu hình JSON các **phân loại câu hỏi** và **phân loại người dùng** kèm xác suất (ví dụ factoid / non-factoid; chuyên gia / người mới); mỗi lần sinh k = 3 ứng viên | Lọc: đúng ràng buộc (context-free), đúng loại, đáp án trung thành với tài liệu; nếu nhiều ứng viên đạt thì chọn ngẫu nhiên một | Chỉ "phân tích sơ bộ" chất lượng đáp án | Đo độ đa dạng, không đo tỉ lệ lỗi |
| **Know Your RAG** [Nguồn 20] | So sánh: prompt đơn giản (kiểu LlamaIndex / HF cookbook), RAGAS (evol), và **"statement extraction"**: tóm chủ đề → rút câu khẳng định → gộp thành câu tóm tắt / kết luận → sinh câu hỏi trả lời đúng bởi khẳng định đó; fine-tune Flan-T5-large | Phân loại bằng Llama-3-70B | 4 người gán cùng 100 cặp / bộ dữ liệu × 6 bộ; κ (một người so với đa số còn lại) 0,62-0,69; Llama-3-70B thấp hơn người 9-16% | Prompt đơn giản → **95% fact_single**; xin "summary" vẫn ra 75% fact_single |
| **ARES** [Nguồn 21] | Sinh câu từ đoạn | **Lọc khứ hồi**: giữ câu mà retriever lấy lại được đoạn gốc ở top-1 | ~**150 mẫu người gán** làm tập hiệu chỉnh PPI | Lọc khứ hồi giữ câu mà *retriever đó* làm tốt, nên thiên lệch về retriever đó [Suy luận] |
| **RAGBench** [Nguồn 22] | Không sinh câu: lấy 12 bộ có sẵn | GPT-4 gán nhãn span relevance / utilization / adherence | Kiểm judge trên DelucionQA có nhãn người: đồng ý 93% (mẫu) và 95% (span) | ~100 nghìn mẫu |
| **TREC DL 2023, truy vấn tổng hợp** [Nguồn 24] | Lấy 1.000 đoạn MS MARCO v2; GPT-4 chấm "độ đứng độc lập" của đoạn, loại 8,9% lỗi định dạng + 14,6% đoạn kém (ví dụ "cô ấy...", "giải pháp thứ hai"); sinh 1 truy vấn / đoạn bằng T5 và GPT-4 | — | Assessor chuyên nghiệp loại truy vấn vô lý hoặc có quá ít / quá nhiều đoạn liên quan: giữ **13/48** (T5) và **18/49** (GPT-4) | Truy vấn GPT-4 dài hơn hẳn truy vấn thật; bộ tổng hợp dễ hơn |

### 2.4 Độ tin cậy của câu hỏi do LLM sinh và nhãn liên quan do LLM gán

| Phát hiện | Số liệu | Nguồn |
|---|---|---|
| Câu hỏi / đáp án sinh tự do bị bịa | > 30% | FRAMES [Nguồn 12] |
| Cặp hỏi-đáp kém trong dữ liệu sinh bằng model nhỏ | 31-32,5% (gán tay 400 cặp) | AttackQA [Nguồn 17] |
| LLM mạnh zero-shot làm bộ lọc chất lượng | Bắt 2/26 mẫu kém (GPT-4o); 0/26 (Llama 3 70B) | AttackQA [Nguồn 17] |
| Truy vấn tổng hợp được chuyên gia giữ | 27% (T5), 37% (GPT-4) | [Nguồn 24] |
| Loại câu thực tế so với loại yêu cầu | 95% fact_single với prompt đơn giản | [Nguồn 20] |
| Bộ tổng hợp dễ hơn bộ thật | Mọi loại hệ thống điểm cao hơn trên bộ tổng hợp | [Nguồn 24] |
| Thiên lệch "model sinh = model được đo" | Không thấy thiên lệch rõ cho hệ GPT / T5 trên TREC DL 2023 | [Nguồn 24] — nhưng SecQA: GPT-4 sinh câu, GPT-4 đạt 98-100% [Nguồn 16] |
| Sparse gold (chỉ đoạn nguồn) | τ thứ hạng hệ thống 0,157, so với 0,8151 khi có nhãn người đầy đủ | [Nguồn 24] |
| LLM gán nhãn liên quan, đồng ý với assessor TREC (4 mức) | GPT-4: κ 0,24 (truy vấn thật), 0,26 (tổng hợp); với đoạn người cho "Perfectly relevant", GPT-4 chỉ cho cùng mức 28% | [Nguồn 24] |
| UMBRELA (GPT-4o, prompt DNA của Thomas và cộng sự) trên DL 2019-2023 | κ 4 mức 0,31-0,37; κ nhị phân 0,42-0,50; Kendall τ thứ hạng hệ thống 0,87-0,94 | [Nguồn 27] |
| Ở đầu bảng xếp hạng (hệ mạnh nhất) | τ toàn bộ 0,89, nhưng top-20 chỉ 0,51 (24% cặp đảo thứ tự), top-15 0,56 | Clarke & Dietz [Nguồn 28] |
| "Vòng tròn" (hệ dùng chính LLM judge để rerank) | Có thể đẩy hệ lên đầu bảng theo judge, trong khi thứ hạng theo người không lên; τ tụt còn 0,63 trong mô phỏng | [Nguồn 28]; Soboroff lập luận judge đặt *trần* cho phép đo [Nguồn 29] |
| Độ nhạy của prompt judge | 42 cách diễn đạt lại một prompt cho κ 0,50-0,71 trên cùng dữ liệu | Thomas và cộng sự [Nguồn 25] |
| LLM judge ở Bing | Chính xác hơn mọi nhóm người gán bên thứ ba, nhanh và rẻ hơn — nhưng phải chọn prompt bằng **nhãn gold do người dùng thật / chuyên gia** | [Nguồn 25] |
| Phổ hợp tác người-máy | Từ người làm hết → AI hỗ trợ → người kiểm tra nhãn máy → máy làm hết; khuyến nghị giữ người trong vòng lặp | Faggioli và cộng sự [Nguồn 26] |

**Hệ quả cho SecLearn** [Suy luận]:
- **LLM judge đủ tốt để lọc thô và gán nhãn pool** cho bộ silver; **không đủ** để làm gold cho bộ test khi so các cấu hình gần nhau (đúng tình huống
  của luận văn: có / không HyDE, có / không dịch, đổi reranker), vì sai lệch lớn nhất nằm ở các hệ mạnh [Nguồn 28].
- Nếu reranker hoặc `judge.ts` của SecLearn dùng **cùng LLM** với judge đánh giá thì gặp đúng vấn đề "vòng tròn" [Nguồn 28, 29]; judge đánh giá
  phải khác model (đã nêu ở [R §7.5]) và được hiệu chỉnh bằng nhãn người.
- Bộ lọc LLM zero-shot **bỏ sót gần hết mẫu kém** [Nguồn 17]; muốn dùng bộ lọc tự động thì phải có vài trăm nhãn người để đo precision / recall của
  nó, giống AttackQA.

---

## 3. Quy trình điển hình cho bộ 1.000-5.000 mẫu

Tổng hợp từ mục 2. Số trong ngoặc là số có nguồn; còn lại là đề xuất.

```
(1) Chọn nguồn + đóng băng corpus
      bỏ mục lục / tham khảo / phụ lục (CyberMetric), bỏ đoạn quá ngắn (SQuAD: < 500 ký tự), lọc đoạn không đứng độc lập
      (TREC DL 2023: loại 14,6%), ghi phiên bản (TREC-COVID ghi vòng của tài liệu)
(2) Lấy mẫu đoạn phân tầng
      giới hạn số câu theo độ dài tài liệu (CyberMetric: 10 câu / 8.000 token; CTIBench: theo độ dài), chọn cặp đoạn có chủ đích cho câu
      đa bước / so sánh (HotpotQA: đồ thị liên kết, 42 danh sách thực thể; MultiHop-RAG: gom claim theo bridge entity)
(3) Sinh theo loại
      prompt riêng mỗi loại (MultiHop-RAG, DataMorgana), sinh k ứng viên (DataMorgana k = 3), hoặc "khẳng định trước, câu hỏi sau"
      (Know Your RAG) để giữ grounding
(4) Lọc tự động
      • trích dẫn có thật trong nguồn          • trả lời được chỉ từ bằng chứng (MultiHop-RAG tiêu chí 2)
      • không tham chiếu "Hình / Bảng / chương" (CyberMetric)   • đúng loại (phân loại lại; [Nguồn 20])
      • bỏ trùng                              • (thận trọng) lọc khứ hồi bằng retriever (ARES) — thiên lệch, xem 4.7
      • nhiều LLM kiểm đáp án, bất đồng thì đưa người (CyberMetric: 3 LLM)
(5) Người kiểm
      pilot → hướng dẫn → qualification (MuSiQue: 100 người × 20 mẫu → giữ 17) → gán theo đợt, phản hồi mỗi đợt
      → gán đôi (CRAG: 2 người / mẫu, đồng ý ≥ 90%; NQ dev/test 5 người)
(6) Hoàn thiện gold evidence bằng pooling (TREC DL: top-10 mọi run + học chủ động; BEIR: lấp lỗ 980 cặp)
(7) Phân xử (CRAG: người thứ 3 có kinh nghiệm hơn) + soát mẫu mà baseline trả lời khác gold (CRAG: thêm 2% sửa)
(8) Chia split theo đơn vị nguồn (SQuAD: theo bài) và đóng băng; kiểm lại sau một thời gian nếu nội dung có thể thay đổi (FRAMES: 3 tháng, loại 5,5%)
```

Số định lượng để lập ngân sách:

| Đại lượng | Giá trị có nguồn |
|---|---|
| Người / mẫu trên test | SQuAD ≥ 3 (1 + 2 đáp án thêm) [Nguồn 1]; NQ 5 [Nguồn 3]; CRAG 2 + 1 phân xử [Nguồn 11] |
| Thời gian | NQ 80 giây / mẫu (chọn long + short answer trên trang cho sẵn) [Nguồn 3]; SQuAD 4 phút / đoạn ≤ 5 câu [Nguồn 1]; ViQuAD câu khó ≥ 3 phút [Nguồn 2]; CyberMetric > 230 giờ chuyên gia cho 11.000 câu MCQ (soát lướt + xem câu bị cờ) [Nguồn 14] |
| Chi phí | MuSiQue ~11.000 USD cho 24.814 câu, ~15 USD/giờ [Nguồn 5]; SQuAD 9 USD/giờ [Nguồn 1] |
| Độ đồng ý | CRAG ≥ 90% (tỉ lệ đồng ý) [Nguồn 11]; Know Your RAG κ 0,62-0,69 [Nguồn 20]; RAGEval Fleiss' κ 0,77 [Nguồn 18]; NQ precision 90% / 84% [Nguồn 3] |
| Tỉ lệ loại mẫu tổng hợp | 1,7% + 2,3% (lọc ngữ pháp / chủ đề, CyberMetric) [Nguồn 14]; 11,7% (AttackQA sau QC) [Nguồn 17]; 31% kém theo nhãn người [Nguồn 17]; > 30% bịa [Nguồn 12]; 63-73% truy vấn bị chuyên gia loại [Nguồn 24] |
| Sửa gold sau kiểm | CRAG 5% + 2% [Nguồn 11]; FRAMES 5,5% hết hạn [Nguồn 12] |

---

## 4. Gán nhãn thủ công: làm thế nào cho đúng

### 4.1 Đưa tài liệu cho người gán theo cách nào

| Cách hiển thị | Ai dùng | Ưu | Nhược | Dùng cho SecLearn khi nào [Suy luận] |
|---|---|---|---|---|
| **Một đoạn** | SQuAD [Nguồn 1], ViQuAD [Nguồn 2] | Nhanh, span rõ | Không thấy thông tin ở đoạn khác → gold thiếu | Kiểm câu L1 / L2 sinh từ một đoạn |
| **Cặp / nhóm đoạn chọn có chủ đích** | HotpotQA [Nguồn 4], MuSiQue [Nguồn 5] | Viết được câu đa bước, so sánh | Cần thuật toán chọn cặp | L4 (so sánh), L5 (nhiều bước) |
| **Cả tài liệu** | NQ (cả trang Wikipedia) [Nguồn 3], FRAMES [Nguồn 12] | Tìm được long answer thật, thấy ngữ cảnh | Chậm (NQ 80 giây kể cả có cấu trúc HTML) | L3 (liệt kê trong một tài liệu), kiểm L6(c) tiền đề sai |
| **Top-k pool từ nhiều hệ** | TREC [Nguồn 8, 9], MS MARCO (top-10 Bing) [Nguồn 7] | Hoàn thiện gold, đánh giá từng đoạn nhanh | Thiên lệch theo các hệ trong pool; mất ngữ cảnh | **Bước hoàn thiện gold** cho mọi mức; kiểm L6(b) "corpus không có" |
| PDF gốc hay văn bản trích | TREC-COVID có tab nhiều dạng (abstract, PDF...) [Nguồn 9]; CyberMetric dùng pdfminer [Nguồn 14] | PDF gốc giúp hiểu bảng, hình | Span phải neo vào **văn bản máy dùng**, không vào PDF | Hiển thị **markdown chuẩn** để bôi span, kèm link **HTML gốc** trong `data/uploads/bundle/cheatsheets/*.html` (137 trang, [Đo]) hoặc PDF để tham khảo |

**Có nên cho người gán thấy ranh giới chunk?** [Suy luận] **Không**, khi gán bằng chứng. Người gán bôi **span tối thiểu đủ trả lời** (giống "khối
nhỏ nhất chứa đủ thông tin" của NQ [Nguồn 3], hoặc "supporting facts" mức câu của HotpotQA [Nguồn 4]) trên markdown liên tục. Việc ánh xạ span → chunk
làm bằng máy lúc chấm (4.6). Cho thấy ranh giới chunk sẽ khiến người gán chọn "chunk nào đúng" theo cách cắt hiện tại, và gold chết khi đổi
`CHUNK_SIZE`. **Có**, khi đánh giá pool (4.7), vì lúc đó đơn vị được hỏi chính là chunk / đoạn mà hệ trả về.

### 4.2 Công cụ

| Công cụ | Hỗ trợ có tài liệu | Phù hợp SecLearn |
|---|---|---|
| **Label Studio** [Nguồn 30, 31] | Template *Question Answering*: hiển thị đoạn + câu hỏi, bôi một span "Answer" (`Labels`, `maxUsage=1`, `granularity="word"`). *Evaluate RAG with Human Feedback*: hiển thị câu hỏi, danh sách tài liệu truy xuất kéo-thả vào hai nhóm "Relevant / Non Relevant", và hai lựa chọn thích / không thích cho answer relevancy và faithfulness. Ngoài ra có *Search Page Ranking*, *Document Retrieval*, *LLM Response Grading*, *Multi-Turn Chat Evaluation*. Bản export ghi `completed_by` (ID người gán) và `lead_time` (giây) | **Tốt nhất cho span + relevance**, chạy cục bộ. Định dạng `value.start / end` của span text: [Chưa kiểm chứng] — trang tài liệu đã đọc không có ví dụ, cần thử export một mẫu |
| **Argilla** [Nguồn 32] | `TaskDistribution(min_submitted=n)`: một bản ghi chỉ "completed" khi đủ n câu trả lời đã submit, sau đó rời hàng chờ của mọi người; chỉ đổi được trước khi có câu trả lời đầu tiên; `dataset.progress(with_users_distribution=True)` cho tiến độ từng người. Có gợi ý từ model (suggestions), metadata, import / export | **Tốt cho gán đôi** có quản lý chồng lấn; span trên văn bản dài: [Chưa kiểm chứng] |
| doccano, Prodigy | [Chưa kiểm chứng]: không mở docs trong lần này | — |
| **Trang admin tự viết trong SecLearn** | — | Đã có Next.js + Prisma + quyền admin [Code]. Ưu: hiển thị đúng markdown đã nạp (`Document.markdown`), chạy `retrieveChunks` ngay trên trang để pooling. Nhược: phải tự viết bôi span (dùng `Selection` → offset), lưu người gán, thời gian, phiên bản hướng dẫn, gán đôi. Ước 2-4 ngày công [Suy luận] |

Khuyến nghị [Suy luận]: **Label Studio cục bộ** (Docker) với hai project. (1) *Kiểm câu*: hiện câu tiếng Việt, đáp án tham chiếu, các đoạn markdown nguồn;
cho các lựa chọn chấp nhận / sửa / loại, chọn mức L, bôi span bằng chứng, ô ghi chú. (2) *Đánh giá pool*: câu + từng chunk, thang 0-3. Viết script
nhập / xuất giữa JSONL của [R §5.3] và JSON của Label Studio. Chỉ tự viết trang admin nếu Label Studio không chạy được trên máy.

### 4.3 Hướng dẫn gán nhãn, pilot, huấn luyện, qualification

Nội dung tối thiểu của hướng dẫn (2-4 trang, có phiên bản `guideline_version`) [Suy luận, gom từ các nguồn]:

1. **Câu hỏi tốt / xấu** trước khi xem tài liệu (bước 1 của NQ [Nguồn 3]): câu tự đứng được, không mơ hồ, không phụ thuộc "tài liệu này", "Hình 2"
   (lỗi CyberMetric [Nguồn 14]), không hỏi ý kiến.
2. **Định nghĩa từng mức L1-L7** (xem [R §5.4]), mỗi mức 2 ví dụ tốt và 2 ví dụ xấu kèm lý do (SQuAD và MuSiQue đều dùng ví dụ tốt / xấu [Nguồn 1, 5]).
   Nêu rõ ca dễ nhầm: "liệt kê nằm liền trong một câu" vẫn là L3 chứ không phải L1 (đúng lỗi mà Llama-3 mắc [Nguồn 20]).
3. **Span bằng chứng**: span tối thiểu đủ trả lời; nhiều span nếu thông tin rải rác; mỗi ô của câu so sánh có span riêng (`cell`).
4. **Thang liên quan cho chunk** (dùng ở 4.7), mượn TREC DL [Nguồn 8]: 3 = chứa đáp án trực tiếp; 2 = có đáp án nhưng không rõ hoặc lẫn thông tin
   khác; 1 = đúng chủ đề nhưng không trả lời; 0 = không liên quan. Độ đo nhị phân tính 2-3. Thang này khớp `grade` 2 / 1 của [R §5.3] nếu gộp 3 và 2.
5. **Đáp án tham chiếu tiếng Việt**: giữ nguyên thuật ngữ, tên header, tên hàm bằng tiếng Anh; không thêm kiến thức ngoài tài liệu; nếu tài liệu sai
   hoặc lỗi thời thì ghi chú, không sửa (CyberMetric thấy chính nguồn uy tín cũng có chỗ sai [Nguồn 14]).
6. **L6**: (b) phải ghi lệnh grep / truy vấn đã dùng để kết luận "corpus không có"; (c) tiền đề sai phải có span bác bỏ.
7. **Khi nào bỏ qua**: không chắc thì gắn cờ, không đoán.

**Pilot và qualification** [Suy luận, theo mô hình MuSiQue và ViQuAD 2.0 [Nguồn 2, 5]]: pilot 40-60 mẫu trải đều các mức, 2 người gán độc lập, tính κ
cho từng trường, họp ghi lại các ca bất đồng thành ví dụ trong hướng dẫn, rồi lặp lại với 30 mẫu mới. Người phụ chỉ vào gán chính thức sau khi đạt mức
đồng ý chấp nhận được trên 20-30 mẫu đã có đáp án của người gán chính (qualification).

### 4.4 Gán đôi, độ đồng ý, phân xử

- **Đo trên trường nào**: (a) quyết định chấp nhận / loại; (b) mức L; (c) `answerable`; (d) grade 0-3 của chunk; (e) độ trùng span (F1 token hoặc IoU ký
  tự). Với (a)-(c) dùng Cohen's κ (2 người) hoặc Fleiss' κ (≥ 3 người, như Know Your RAG và RAGEval [Nguồn 18, 20]); với (d) dùng **weighted κ** vì
  thang có thứ tự (`cohen_kappa_score(weights="quadratic")`, xem [R §5.5]). Krippendorff's α xử lý được thiếu nhãn và nhiều kiểu thang [Chưa kiểm chứng: không mở nguồn lần này].
- **Báo thêm tỉ lệ đồng ý thô**, như CRAG báo "≥ 90%" [Nguồn 11]. κ có thể thấp dù đồng ý cao khi một nhãn chiếm đa số (ví dụ 90% "chấp nhận") [Suy luận].
- **Cỡ tập gán đôi**: 15-20% bộ gold, tối thiểu ~100 mẫu, trải đều các mức [Suy luận; [R §1.2] đề xuất ~100].
- **Phân xử**: người thứ ba (hoặc người gán chính sau ≥ 1 ngày, không nhìn tên người gán) xử các ca bất đồng, giống CRAG [Nguồn 11]. Ghi lý do phân xử vào
  `review.notes`. Ca bất đồng lặp lại theo một mẫu → sửa hướng dẫn, tăng phiên bản.
- **Ngưỡng tham khảo**: Know Your RAG coi κ 0,62-0,69 là "vừa đến mạnh" [Nguồn 20]. Ngưỡng Landis & Koch: [Chưa kiểm chứng], như đã ghi ở [R §5.5].

### 4.5 Mệt mỏi, trôi nhãn, ngân sách thời gian, ghi vết

- **Chia đợt** 1-1,5 giờ, tối đa ~3 đợt / ngày [Suy luận]. MuSiQue chia 9 đợt và đọc lại mẫu của từng người sau mỗi đợt [Nguồn 5]; ViQuAD bắt tự kiểm
  sau mỗi 3.000 câu [Nguồn 2].
- **Trôi nhãn (label drift)**: trộn 5% **mẫu neo** (đã có nhãn chốt) vào mỗi đợt, theo dõi độ đồng ý với neo theo thời gian [Suy luận]. TREC cho
  assessor sửa nhãn cũ và dùng top-10 pool để assessor "học topic" trước khi ra nhãn khó sửa [Nguồn 8].
- **Trình tự trong mỗi mẫu**: đánh giá câu hỏi trước khi xem tài liệu (NQ [Nguồn 3]); chưa cho xem đáp án của LLM khi người gán tự tìm span, để tránh
  "neo" vào đáp án máy [Suy luận].
- **Ghi vết bắt buộc** cho mỗi nhãn: `annotator_id`, `timestamp`, `lead_time` (Label Studio ghi sẵn `completed_by`, `lead_time` [Nguồn 31]),
  `guideline_version`, `corpus_snapshot`, `tool_version`; với mẫu sinh: `generator`, `prompt_version`, `seed`. TREC-COVID ghi cả vòng / phiên bản
  tài liệu vào từng nhãn [Nguồn 9].
- **Ngân sách**: xem mục 6. Lập ngân sách theo số đo thật ở pilot (`lead_time` trung vị × số mẫu × 1,3), không theo ước lượng trên giấy [Suy luận].

### 4.6 Gold bền khi cách cắt chunk thay đổi

[R §5.2] đã nêu lý do (chunk id là `cuid()` và bị xoá / tạo lại mỗi lần nạp; chunk có tiền tố tiêu đề và chồng lấn; không lưu offset) [Code]. Phần bổ sung ở đây:

1. **Văn bản chuẩn (canonical)**: lấy đúng chuỗi `Document.markdown` mà `ingest.ts` lưu sau khi nạp xong (`updateMany({ data: { markdown, status: "ready" } })`
   [Code]). Không lấy `pdftotext` như bộ smoke hiện tại. Xuất ra `data/eval/corpus/<doc_key>.md` + `manifest.json` gồm `{doc_key, filename, sha256(markdown),
   bytes, pages, license, source_url, version}`. `doc_key` lấy từ tên file **bỏ tiền tố timestamp** (ví dụ `Session_Management_Cheat_Sheet`) để không phụ
   thuộc lần tải lên.
2. **Gold = span trên văn bản chuẩn**: `{doc_key, doc_sha256, char_start, char_end, quote}`. Lưu cả `quote` để tự sửa khi offset lệch (tìm lại quote trong
   bản mới, chấp nhận nếu tìm thấy đúng 1 lần).
3. **Ánh xạ span → chunk lúc chấm** [Suy luận]: chuẩn hoá khoảng trắng; với mỗi chunk, bỏ dòng tiêu đề ở đầu (do `chunkMarkdown` chèn), tìm phần thân trong
   markdown để lấy `[start, end)`; chunk liên quan nếu giao với span ≥ 50% độ dài span, hoặc chứa trọn span. Đo khả thi [Đo]: với 6.072 chunk, **trung
   bình 95%** chunk của một tài liệu có 200 ký tự đầu phần thân tìm thấy nguyên văn trong markdown. Ngoại lệ: `Email_Validation_and_Verification` chỉ 14%,
   `PHP_Configuration` 78%, `Vulnerable_Dependency_Management` 79% — cần so khớp sau chuẩn hoá khoảng trắng hoặc lưu offset thật.
4. **Cách bền nhất** [Suy luận, cần sửa mã nên chỉ đề xuất]: khi cắt chunk, ghi `{char_start, char_end, md_sha256, chunker_version}` vào cột
   `DocumentChunk.metadata` (kiểu `Json?`, hiện **chưa được ghi** ở đâu trong `src/` [Code]). Khi đó ánh xạ là phép giao khoảng, không cần tìm chuỗi.
5. **Kiểm tra trước mỗi lượt đo**: (a) `sha256(Document.markdown)` khớp manifest, nếu không thì dừng; (b) "gold coverage": mọi span có ít nhất một chunk
   phủ ≥ 50% ([R §5.2]); (c) báo số chunk bị bỏ khi nhúng lỗi (`skipped` trong `ingest.ts` [Code]).
6. **Kiểm thử bộ smoke hiện tại** [Đo]: 82 trích dẫn `gold_evidence.quote` của `set-a` / `set-b` → **81/82** tìm thấy trong markdown chuẩn sau chuẩn hoá
   khoảng trắng; **80/82** nằm trọn trong ít nhất một chunk; 7 trích dẫn nằm trong ≥ 2 chunk (vùng chồng lấn). Chuyển bộ smoke sang offset trên markdown
   là việc nhỏ.

### 4.7 Hoàn thiện gold bằng pooling nhiều retriever

Mục tiêu: gold không thiên lệch về retriever hiện tại (BEIR: lỗ hổng làm sai nDCG [Nguồn 10]; sparse gold: τ 0,157 [Nguồn 24]).

**Các hệ trong pool** [Suy luận] — càng khác nhau càng tốt:

| Hệ | Cách chạy | Lý do |
|---|---|---|
| BM25 thuần trên chunk | Thư viện BM25 ngoài DB, hoặc `ts_rank` trên cột `searchText` (`to_tsvector('english', …)`) [Code] | Bắt từ khoá hiếm; truy vấn tiếng Việt cần bản dịch tiếng Anh |
| Dense, embedding hiện tại | `retrieveChunks` với rerank tắt | Hệ "nhà" |
| Dense, model khác họ (ví dụ bge-m3, multilingual-e5) | Chỉ mục tạm ngoài DB | Giảm thiên lệch theo embedding hiện tại |
| Hybrid + reranker | Cấu hình SecLearn đầy đủ (`RAG_CANDIDATES` 20 → rerank) [Code] | Hệ sẽ được báo cáo |
| Biến thể truy vấn | Có / không dịch Việt → Anh, có / không HyDE, câu không dấu | Đúng các trục mà luận văn so sánh |
| (Tuỳ chọn) chunking khác | Cắt cố định 512 token không tiêu đề | Pool không chỉ gồm chunk theo cách cắt hiện tại → gán ở mức span |

**Quy trình** [Suy luận, theo TREC DL [Nguồn 8]]:
1. Lấy hợp **top-10** của mọi hệ cho mỗi câu (depth-10 như TREC DL), cộng các chunk phủ gold span ban đầu. Ước lượng: 6-8 hệ, mức chồng lấn cao, nên ~15-30 chunk
   duy nhất / câu.
2. **LLM judge** (khác họ với LLM chat, prompt kiểu DNA / UMBRELA [Nguồn 25, 27], thang 0-3) chấm **toàn bộ** pool → nhãn silver cho mọi câu.
3. **Người** chấm pool cho **tập gold** (~600-800 câu). Chỉ cần chấm các chunk mà LLM cho ≥ 1, cộng một mẫu ngẫu nhiên 10% các chunk LLM cho 0 để ước tỉ lệ bỏ sót
   [Suy luận]. Với chunk người cho 2-3 mà chưa nằm trong gold span → **mở rộng gold** bằng cách bôi span mới trên markdown.
4. **Tính độ đồng ý LLM judge – người** trên tập gold (κ có trọng số, tỉ lệ đồng ý theo mức). Đây là số cần báo trong luận văn để biện minh cho nhãn silver [Nguồn 25, 26].
5. **Báo kèm Judged@10** (tỉ lệ chunk trong top-10 đã có nhãn) cho mỗi cấu hình được đánh giá; nếu một cấu hình mới có Judged@10 thấp thì phải chấm bổ sung trước
   khi so (vấn đề "lỗ hổng" của BEIR [Nguồn 10]).

**Không dùng lọc khứ hồi kiểu ARES** ("giữ câu mà retriever lấy được đoạn gốc ở top-1" [Nguồn 21]) với retriever của SecLearn: nó loại đúng những câu khó mà luận văn
cần đo (L2, xuyên ngôn ngữ) [Suy luận]. Nếu cần lọc câu vô nghĩa, dùng BM25 trên bản tiếng Anh của câu hỏi với ngưỡng top-50 rất lỏng, hoặc để người quyết định.

---

## 5. Dữ liệu SecLearn: đủ chưa, thiếu gì

### 5.1 Số đo corpus [Đo]

| Đại lượng | Giá trị |
|---|---|
| File PDF trong `data/uploads/` | **141** (thư mục còn có `bundle/`, nên `ls` đếm 142 mục) |
| Tổng trang / dung lượng | 2.721 trang; 80,3 MB |
| Ký tự văn bản thô → sau làm sạch | 4.102.325 → 3.420.402 (làm sạch bỏ ~17%, chủ yếu là site chrome của trang cheat sheet) |
| Chunk (`chunkMarkdown(md, 800, 80)`) | **6.072**; độ dài trung bình ~532 ký tự |
| Chunk / tài liệu | min 1, p25 17, trung vị 29, p75 44, p90 69, max 1.353 |
| Trang / tài liệu | min 9, trung vị 15, max 465. Cheat sheet ngắn nhất vẫn 9-11 trang vì phần điều hướng của site được in kèm |
| Tài liệu lớn nhất | `wstg-v4.2.pdf` 1.353 chunk (**22,3%**), 465 trang, ~925 nghìn ký tự; tiếp theo Kubernetes 116, Secrets Management 105, NIST CSWP 29 97 (×2 bản), Session Management 94, XSS Filter Evasion 94, CSRF 92 |
| 5 tài liệu lớn nhất | 29,1% số chunk |
| Tài liệu ≤ 10 chunk | 12 (trong đó 4 chỉ có 1 chunk) |
| Tài liệu ≥ 50 chunk | 26 |
| Tiêu đề mục `##` trong chunk | 2.825 mục; **886 mục có ≥ 2 chunk** (ứng viên tự nhiên cho câu L3 trong một mục) |
| Tài liệu **không có tiêu đề mục nào** | 7: WSTG, 2 bản NIST, và 4 file stub |
| Trang HTML gốc của cheat sheet | 137 file trong `data/uploads/bundle/cheatsheets/` (bản site OWASP offline) |

### 5.2 Vấn đề dữ liệu cần xử lý trước khi sinh câu [Đo]

1. **4 file stub** (1 chunk, 184-218 ký tự): `Access_Control`, `Injection_Prevention_in_Java`, `TLS_Cipher_String`, `Transport_Layer_Protection`. Chỉ ghi
   "deprecated / moved, xem trang khác". Bỏ khỏi việc lấy mẫu; giữ trong chỉ mục cũng được nhưng chúng là nhiễu khi truy xuất.
2. **Trùng lặp**: `NIST.CSWP.29.pdf` và `1791604713918-NIST.CSWP.29.pdf` cùng 1.518.858 byte (cùng file), cả hai đều được đếm chunk. Nếu cả hai đã nạp vào DB, mỗi đoạn
   NIST có **2 chunk giống hệt** → Recall / nDCG bị méo, và gold phải liệt kê cả hai. `1791567511670-owasp_MFA_cheatsheet.pdf` (36.251 ký tự) có nội dung mở đầu
   giống **Authentication Cheat Sheet** (36.092 ký tự), không phải MFA → gần trùng. Cần dedupe ở mức tài liệu và ghi vào manifest.
3. **WSTG và NIST không có cấu trúc mục** sau khi trích: chunk không có tiền tố tiêu đề, nên không lấy mẫu theo mục được, và người gán không biết đoạn thuộc test
   case nào. WSTG có **97 mã test case** `WSTG-XXXX-NN` (INPV 20, CLNT 13, CONF 12, INFO 11, SESS 10, ATHN 10, BUSL 9, IDNT 5, CRYP 5, ATHZ 4, ERRH 2, APIT 1);
   có thể dùng mã này làm đơn vị "mục" để lấy mẫu [Đo + Suy luận].
4. **Vùng không nên sinh câu**: mục lục WSTG (~5 trang đầu), Appendix C "Fuzz Vectors" và D "Encoded Injection" (danh sách payload), các danh sách tham khảo.
   CyberMetric cũng bỏ mục lục / tham khảo / phụ lục [Nguồn 14].
5. **Tiêu đề rác**: 11 tài liệu có chunk đầu mang tiêu đề `## Sheet` (phần đuôi của "Cheat Sheet" bị nhận nhầm là tiêu đề); `## Systems Cheat Sheet` ở Email Validation.
   Không chặn việc gán nhãn nhưng làm tiền tố chunk vô nghĩa.

### 5.3 Năng lực tạo câu theo mức [Suy luận dựa trên số đo]

Giả định: sau khi bỏ stub, bản trùng, mục lục, payload → ~135 tài liệu, ~5.700 chunk; khoảng 80% chunk "dùng được" để hỏi (≈ 4.500) [Suy luận]. Mục tiêu silver lấy từ [R §5.4].

| Mức | Mục tiêu silver | Nguồn ứng viên trong corpus | Năng lực | Nút thắt |
|---|---|---|---|---|
| L1 tra cứu | 400 | 1 chunk có sự kiện cụ thể | Rất dư (≈ 4.500 chunk; mỗi chunk ≥ 1 câu) | Giới hạn mỗi tài liệu để WSTG không chiếm 22% |
| L2 diễn đạt lại / không dấu | 400 | Như L1, viết lại tránh thuật ngữ | Dư | Chống chồng lấn từ vựng; cần người đọc tiếng Việt kiểm độ tự nhiên |
| L3 nhiều đoạn, một chủ đề | 350 | 886 mục có ≥ 2 chunk + các test case WSTG | Đủ (≈ 2,5 lần mục tiêu) | Gold nhiều span, kiểm lâu hơn |
| L4 so sánh | 350 | Cặp thực thể trong cùng tài liệu (ví dụ Signed / Naive double-submit) hoặc cặp tài liệu cùng cụm (5.4) | Đủ: các cụm 6-15 tài liệu cho hàng chục cặp / cụm | Mỗi ô cần gold riêng; dễ "so sánh giả" (một tài liệu đã so sẵn → thực chất L1) |
| L5 tình huống / nhiều bước | 300 | Cặp chunk nối bằng khái niệm chung (XSS → cookie HttpOnly → session) | Đủ | LLM hay sinh câu chỉ cần 1 đoạn; phải phân loại lại [Nguồn 20] |
| L6 không trả lời được | 400 (a:b:c ≈ 1:2:1) | (a) vô hạn; (b) chủ đề an ninh ngoài corpus; (c) từ câu L1 | (a), (c) dư; (b) **giới hạn** | (b) phải chứng minh corpus không có: grep + pool + người; corpus phủ rộng web / app / cloud / AI nên chủ đề "ngoài corpus" chủ yếu là mạng, forensic, mã độc, ICS, wireless [Suy luận; bộ smoke đã grep Snort, Volatility, Modbus, WannaCry: 0 kết quả theo `data/eval/README.md`] |
| L7 hội thoại | 200 | Dựng từ câu L1 / L3 / L4 đã duyệt | Đủ | Cần lượt trước có đáp án ổn định |

Tổng ~2.400 silver → **đủ** về nguồn. Để có ~2.000 mẫu sau lọc, nên sinh **~3.200-3.600 ứng viên** (sinh dư 1,5-1,8 lần, vì ~30% hỏng [Nguồn 12, 17]) [Suy luận].

**Phân bố theo tài liệu** [Suy luận]: hạn mức mỗi tài liệu ∝ √(số chunk), có sàn 3 và trần ~120 câu cho WSTG (~5-6% bộ thay vì 22%). Với 135 tài liệu, √ trung vị ≈ 5,4
→ ~7-12 câu / cheat sheet trung bình, khớp lượng cần. Ghi `doc_key` và cụm chủ đề vào từng mẫu để báo kết quả theo cụm.

### 5.4 Cụm chủ đề và chồng lấn [Suy luận, phân loại theo tên file]

| Cụm | Tài liệu tiêu biểu | Ý nghĩa |
|---|---|---|
| Xác thực, phiên | Authentication, owasp_MFA (trùng), Multifactor, Passkey, Password Storage, Forgot Password, Credential Stuffing, Session Management, Choosing Security Questions, Cookie Theft, JWT, OAuth2, SAML + WSTG-ATHN / SESS / IDNT | Cụm lớn nhất cho L4 / L5; thông tin lặp nhiều nhất → cần pooling |
| Phân quyền | Authorization (+ Patterns, Decisions, Policy, Regression Testing, Testing Automation), IDOR, Mass Assignment, Transaction Authorization, Multi-Tenant + WSTG-ATHZ | Nhiều tài liệu mới, ngắn (11-34 chunk) |
| Injection | SQL Injection, Query Parameterization, Injection Prevention, OS Command, LDAP, XPath, NoSQL, SSTI, XXE, XML Security, Deserialization, Prototype Pollution + WSTG-INPV (20 test case) | Trùng mạnh giữa WSTG và cheat sheet |
| Phía trình duyệt | XSS Prevention, DOM XSS, XSS Filter Evasion, DOM Clobbering, CSP, Clickjacking, HTML5, XS-Leaks, Third-Party JS, Browser Extension, Web Frontend, Micro Frontend + WSTG-CLNT | |
| Vận chuyển, header | TLS, HSTS, Pinning, HTTP Headers, Web Cache | HSTS chỉ 7 chunk |
| Chuỗi cung ứng, DevOps, hạ tầng | CI/CD, GitHub Actions, NPM, SBOM, Vulnerable Dependency, Software Supply Chain, IaC, Docker, NodeJS Docker, Kubernetes, Secrets Management, Serverless, Secure Cloud Architecture, Network Segmentation, Zero Trust | |
| Framework | Django, DRF, FastAPI, Laravel, Symfony, Rails, Java, .NET, Node.js, PHP Config, Next.js, JAAS, Bean Validation, JS/TS | Hợp với L4 "so sánh cách framework A và B xử lý X" |
| AI | AI Agent, LLM Prompt Injection, RAG Security, MCP, Secure AI Model Ops, Secure Coding with AI, AI Advertising, AML AI Payments, Third-Party Agent Evidence | Chủ đề mới; LLM sinh câu dễ dùng kiến thức riêng thay vì tài liệu |
| API | REST, REST Assessment, GraphQL, gRPC, WebSocket, Webhook, Web Service + WSTG-APIT | |
| Kiến trúc, quy trình | Threat Modeling, Attack Surface, Secure Product Design, Abuse Case, Secure Code Review, Vulnerability Disclosure, Legacy App, Logging, Logging Vocabulary, Error Handling, NIST CSF 2.0 | Nhiều câu "abstract" (RAGAS) |

Hệ quả [Suy luận]: (1) L4 / L5 nên lấy cặp **trong cùng cụm**, giống danh sách thực thể cùng loại của HotpotQA [Nguồn 4]; (2) một sự kiện thường có ở **cả WSTG lẫn
cheat sheet**, nên gold một tài liệu sẽ phạt oan hệ trả về tài liệu kia → bắt buộc pooling (4.7) hoặc ít nhất tìm span tương đương trong tài liệu cùng cụm.

### 5.5 Ngôn ngữ

Toàn bộ corpus là tiếng Anh; câu hỏi tiếng Việt. Không có bộ công khai Việt → Anh nào ([R §3.2]). Do đó [Suy luận]:
- Người gán phải **đọc tốt tiếng Anh kỹ thuật và viết tiếng Việt tự nhiên**. Đây là yêu cầu khi tuyển người phụ, và là nội dung của qualification.
- LLM sinh **thẳng câu tiếng Việt** ([R §5.5]); người kiểm độ tự nhiên trên tập gold. Lưu thêm `question_en` (bản tiếng Anh) để chạy BM25 khi pooling và để phân tích
  lỗi xuyên ngôn ngữ.
- Câu L2 không dấu / trộn Việt-Anh nên được **người viết lại** từ câu L1 đã duyệt (rẻ, ~30 giây / câu [Suy luận]) thay vì để LLM sinh, vì LLM khó mô phỏng cách viết
  thật của sinh viên.

### 5.6 Còn thiếu gì

| # | Thiếu | Hiện trạng | Mức cần |
|---|---|---|---|
| 1 | Snapshot markdown chuẩn + sha256 + manifest | `Document.markdown` có trong DB [Code] nhưng chưa xuất; bộ smoke dùng `pdftotext` | Bắt buộc |
| 2 | Offset chunk trong markdown | Không lưu; `DocumentChunk.metadata` bỏ trống [Code] | Rất nên (cần sửa `ingest.ts` sau này) |
| 3 | Dedupe và loại stub | 2 bản NIST, 1 bản gần trùng, 4 stub [Đo] | Bắt buộc |
| 4 | Phiên bản tài liệu | Tên file chỉ có timestamp tải lên; không ghi phiên bản OWASP / ngày lấy | Nên (ghi `source_url`, ngày tải, commit của repo OWASP nếu có) |
| 5 | Hướng dẫn gán nhãn | Không có | Bắt buộc |
| 6 | Công cụ gán nhãn | Không có | Bắt buộc (Label Studio / Argilla / trang admin) |
| 7 | Người gán thứ hai | Bộ smoke chỉ 1 người, `review.status = draft` | Bắt buộc cho κ |
| 8 | Script sinh + lọc | Không có | Bắt buộc |
| 9 | Script pooling + LLM judge relevance | Không có | Bắt buộc |
| 10 | Script chạy đánh giá theo lô + độ đo + khoảng tin cậy | Không có ([R §1.2] bước 0) | Bắt buộc |
| 11 | Kiểm chứng chủ đề L6(b) | Bộ smoke grep 4 chủ đề | Bắt buộc cho ~200 câu L6(b) |
| 12 | Dataset card + giấy phép | Không có | Bắt buộc nếu công bố |

### 5.7 Giấy phép khi công bố bộ dữ liệu

- OWASP Cheat Sheet Series và OWASP WSTG đều là **CC BY-SA 4.0** (file `LICENSE.md` của repo CheatSheetSeries; GitHub API báo `CC-BY-SA-4.0` cho cả `OWASP/CheatSheetSeries`
  và `OWASP/wstg`) [Nguồn 34, 35].
- Bộ đánh giá chứa **trích dẫn nguyên văn** (`quote`) và **markdown chuẩn** của tài liệu là tác phẩm phái sinh / tái phân phối → nếu công bố, phải ghi công OWASP, ghi
  thay đổi, và phát hành **cùng giấy phép CC BY-SA 4.0** (hoặc giấy phép tương thích) [Suy luận từ điều khoản ShareAlike; không phải tư vấn pháp lý]. Câu hỏi và đáp án
  tiếng Việt tự viết dựa trên nội dung OWASP cũng nên phát hành CC BY-SA cho an toàn [Suy luận].
- NIST CSWP 29: tài liệu của chính phủ Mỹ thường không chịu bản quyền ở Mỹ [Chưa kiểm chứng: chưa mở trang chính sách của NIST lần này].
- Nếu dùng câu seed từ SecEval / SecQA / CTIBench (CC BY-NC-SA, xem [R §3.1]), phần đó phải **phi thương mại**, không trộn được vào bản CC BY-SA thuần → tách thành file riêng
  hoặc không dùng.

---

## 6. Đề xuất từng bước

Giả định: một sinh viên làm chính + 1-2 người phụ đọc được tiếng Anh. Giờ là giờ người, ước theo tốc độ có nguồn ở mục 3 cộng hệ số an toàn [Suy luận].

| Bước | Việc | Ai làm | Ước lượng |
|---|---|---|---|
| **0. Đóng băng corpus** | Xuất `Document.markdown` từ DB (hoặc chạy lại đúng pipeline) → `data/eval/corpus/*.md` + `manifest.json` (sha256, license, source_url, ngày); dedupe NIST, đánh dấu `owasp_MFA`; loại 4 stub; đánh dấu vùng cấm sinh (mục lục WSTG, Appendix C-D); tách WSTG theo mã test case | Máy + người kiểm | 1 ngày |
| **1. Chuyển bộ smoke** | Đổi 82 quote sang `{doc_key, sha256, char_start, char_end}` (81/82 tìm thấy ngay [Đo]); sửa 1 quote còn lại | Máy + người | 2 giờ |
| **2. Hướng dẫn v0 + schema** | Hướng dẫn 2-4 trang (4.3), thêm trường `annotator_id`, `guideline_version`, `lead_time`, `question_en`, `cluster`, `pool_judgments[]` vào schema [R §5.3] | Người | 4-6 giờ |
| **3. Công cụ** | Label Studio cục bộ: project "kiểm câu" + "đánh giá pool"; script JSONL ↔ Label Studio; thử export xem dạng offset span | Người | 1-2 ngày |
| **4. Sinh ứng viên** | ~3.400 ứng viên theo mức (5.3), hạn mức √chunk / tài liệu; L1 / L3: "khẳng định trước, câu hỏi sau" [Nguồn 20]; L4 / L5: cặp đoạn trong cùng cụm; L6(b): danh sách chủ đề ngoài corpus; L6(c): đổi chi tiết của câu L1; mỗi mẫu có `question_en`, quote nguyên văn | LLM A | Vài giờ máy; chi phí API theo [R §5.6] |
| **5. Lọc tự động** | (a) quote có trong markdown chuẩn; (b) LLM B khác họ trả lời **chỉ từ bằng chứng** → bỏ câu không đủ; (c) LLM C **phân loại lại mức** (bỏ hoặc đổi nhãn câu bị lệch mức); (d) bỏ câu tham chiếu "tài liệu này / hình / bảng"; (e) bỏ trùng (cosine); (f) chồng lấn từ vựng cho L2; (g) L6(b): grep từ khoá tiếng Anh trên toàn corpus + top-20 của 2 retriever không thấy gì liên quan | Máy | 1 ngày viết script |
| **6. Pilot** | 50 mẫu trải đều L1-L7, 2 người độc lập, tính κ / tỉ lệ đồng ý từng trường, sửa hướng dẫn → v1; lặp lại 30 mẫu nếu κ thấp | 2 người | 2 × 3-4 giờ + 2 giờ họp |
| **7. Qualification người phụ** | 20-30 mẫu đã chốt nhãn | Người phụ | 1-2 giờ mỗi người |
| **8. Duyệt tập gold** | ~700 mẫu (≥ 80 / mức, gồm ~100 L6), split `test`: chấp nhận / sửa / loại, chỉnh mức, bôi span, sửa đáp án tiếng Việt. Ở ~2-3 phút / mẫu (chậm hơn NQ 80 giây vì có đáp án tiếng Việt và nhiều span) | Người chính | **25-35 giờ** |
| **9. Gán đôi** | 15-20% tập gold (~120 mẫu) | Người phụ | 5-7 giờ |
| **10. Pooling** | Chạy 6-8 hệ (4.7), top-10, hợp lại; LLM judge 0-3 cho toàn bộ ~2.000 câu × ~20 chunk | Máy | 1-2 ngày viết script + vài giờ chạy |
| **11. Người chấm pool cho tập gold** | Chunk LLM cho ≥ 1 + 10% mẫu chunk LLM cho 0; ~8-12 chunk / câu × 700 câu × ~15 giây [Suy luận] | Người chính (+ phụ) | **20-30 giờ** |
| **12. Phân xử + soát baseline** | Xử bất đồng; chạy SecLearn, xem các câu gold mà hệ "sai" để tìm gold sai (CRAG [Nguồn 11]) | Người chính | 5-8 giờ |
| **13. Silver** | ~1.400 mẫu còn lại, split `dev` + `test-silver`: chỉ lọc tự động + LLM judge; người kiểm mẫu **10%** (~140 mẫu) để ước tỉ lệ lỗi silver kèm khoảng tin cậy | Máy + người | 5-7 giờ |
| **14. Đóng băng + card** | `dataset v1.0` + manifest corpus + commit + cấu hình `RAG_*`; dataset card: cách tạo, model, prompt version, phân bố, κ, tỉ lệ loại ở từng bước, giấy phép CC BY-SA 4.0 | Người | 4-6 giờ |

**Tổng**: người chính ~**80-100 giờ** (khoảng 3-4 tuần bán thời gian), người phụ ~**10-20 giờ**, cộng ~5-7 ngày công viết script [Suy luận].

**LLM làm được / người phải làm** [Suy luận, dựa trên mục 2.4]:

| LLM làm được (có kiểm mẫu) | Người phải làm |
|---|---|
| Sinh ứng viên câu, đáp án nháp, `question_en`, quote | Viết hướng dẫn; chọn ví dụ tốt / xấu |
| Lọc định dạng, tham chiếu "hình / bảng", trùng lặp | Quyết định chấp nhận / loại trên tập gold |
| Kiểm "trả lời được từ bằng chứng" (thô) | Gán lại **mức** khi LLM phân loại bất định |
| Gán nhãn liên quan 0-3 cho pool silver | Chấm pool trên tập gold; mở rộng gold span |
| Phân loại mức lần đầu | Kiểm L6(b) "corpus không có" và L6(c) tiền đề sai |
| Phát hiện mẫu nghi ngờ (bất đồng giữa nhiều LLM) | Viết câu L2 không dấu / trộn ngôn ngữ; kiểm độ tự nhiên tiếng Việt |
| | Phân xử, gán đôi, đo κ; soát các ca baseline lệch gold |

**Nếu chỉ có một người** (không có người phụ) [Suy luận]: vẫn gán đôi được bằng cách **gán lại chính mình sau ≥ 1 tuần, không nhìn nhãn cũ** (intra-annotator agreement) trên ~100 mẫu,
và báo rõ đây là độ ổn định của một người, không phải độ đồng ý giữa người. Đây là hạn chế cần ghi trong luận văn.

**Thứ tự ưu tiên khi thiếu thời gian** [Suy luận]: bước 0-3 → 6 → 8 (giảm còn ~400 mẫu, ≥ 50 / mức) → 10-11 → 14. Bỏ 13 (silver) trước, vì số báo cáo chính dựa vào tập gold.

---

## 7. Những lưu ý bổ sung (không trùng [R §7])

1. **Đừng tin nhãn mức do generator tự khai.** 95% câu ra fact_single với prompt đơn giản [Nguồn 20]. Phân loại lại bằng model khác + người trên tập gold; báo phân bố
   mức *sau* phân loại lại.
2. **Bộ lọc LLM zero-shot không thay được nhãn người.** GPT-4o bắt 2/26 mẫu kém [Nguồn 17]. Muốn tin bộ lọc, đo precision / recall của nó trên ~200-400 mẫu có nhãn người.
3. **Sinh dư.** Lên kế hoạch mất ~30% [Nguồn 12, 17]; với câu "khó" (L4-L5) tỉ lệ mất có thể cao hơn [Suy luận; FRAMES: LLM khó sinh câu cần > 4 bài [Nguồn 12]].
4. **Bộ tổng hợp dễ hơn thật** [Nguồn 24]. Bổ sung ~100-200 **câu thật** từ log chat của SecLearn (nếu có, ẩn danh, có đồng ý của người dùng) hoặc câu do sinh viên khác viết
   tự do không nhìn tài liệu (giống truy vấn thật của NQ / MS MARCO [Nguồn 3, 7]); báo riêng kết quả trên nhóm này.
5. **Lọc khứ hồi bằng chính retriever cần đo là thiên lệch** (4.7).
6. **Thông tin lặp giữa WSTG và cheat sheet** làm gold một tài liệu luôn thiếu (5.4). Pooling là bắt buộc, không phải tuỳ chọn.
7. **Tài liệu có thể sai hoặc lỗi thời** — CyberMetric gặp cả hai [Nguồn 14]; FRAMES loại 5,5% câu sau 3 tháng [Nguồn 12]. Gold là "theo tài liệu", không phải "theo sự thật";
   ghi rõ trong hướng dẫn, và ghi phiên bản tài liệu trong manifest.
8. **Đừng cho người gán xem đáp án LLM trước khi tự tìm span** (4.5): tránh neo.
9. **Chia split theo tài liệu hoặc cụm khi có thể.** SQuAD chia theo bài [Nguồn 1]; MuSiQue thiết kế chia để giảm rò rỉ [Nguồn 5]. Với SecLearn, test và dev nên khác
   *câu* nhưng cùng corpus (vì hệ phải chạy trên toàn corpus); tránh cặp câu gần trùng nằm ở hai split [Suy luận].
10. **Judge đánh giá ≠ LLM trong pipeline** (vấn đề vòng tròn [Nguồn 28, 29]). Nếu reranker hay `judge.ts` dùng LLM X thì judge đánh giá dùng họ khác, và kết luận chính dựa
    trên tập gold người.
11. **Ghi lại tỉ lệ loại ở từng bước** (như CyberMetric 1,7% / 2,3% [Nguồn 14], AttackQA 11,7% [Nguồn 17]); hội đồng luận văn sẽ hỏi "câu sinh có chất lượng thế nào".
12. **Chọn câu "phân biệt được" hệ.** TREC DL chọn câu có MRR trung vị trong (0; 0,5] để đánh giá kỹ [Nguồn 8]. Với ngân sách người hạn chế, ưu tiên duyệt kỹ các câu
    mà các cấu hình SecLearn trả lời *khác nhau* [Suy luận].

---

## 8. Nguồn

### Bộ do người viết / gán
1. Rajpurkar, Zhang, Lopyrev, Liang, 2016. *SQuAD: 100,000+ Questions for Machine Comprehension of Text*. https://arxiv.org/abs/1606.05250 (đọc PDF: mục 3 "Dataset Collection")
2. Nguyen, Tran, Nguyen, Huynh, Luu, Nguyen, 2022. *VLSP 2021 - ViMRC Challenge: Vietnamese Machine Reading Comprehension* (UIT-ViQuAD 2.0). https://arxiv.org/abs/2203.11400 (mục 4)
3. Kwiatkowski và cộng sự, 2019. *Natural Questions: A Benchmark for Question Answering Research*. TACL. https://aclanthology.org/Q19-1026/ (mục 3-4)
4. Yang, Qi, Zhang, Bengio, Cohen, Salakhutdinov, Manning, 2018. *HotpotQA: A Dataset for Diverse, Explainable Multi-hop Question Answering*. https://arxiv.org/abs/1809.09600 (mục 2, 5.3, phụ lục A)
5. Trivedi, Balasubramanian, Khot, Sabharwal, 2022. *MuSiQue: Multihop Questions via Single-hop Question Composition*. https://arxiv.org/abs/2108.00573 (bước S1-S8)
6. Ho, Duong Nguyen, Sugawara, Aizawa, 2020. *Constructing A Multi-hop QA Dataset for Comprehensive Evaluation of Reasoning Steps* (2WikiMultiHopQA). https://arxiv.org/abs/2011.01060
7. Bajaj và cộng sự, 2016. *MS MARCO: A Human Generated MAchine Reading COmprehension Dataset*. https://arxiv.org/abs/1611.09268
8. Craswell, Mitra, Yilmaz, Campos, Voorhees, 2020. *Overview of the TREC 2019 Deep Learning Track*. https://arxiv.org/abs/2003.07820 (mục 5)
9. Voorhees và cộng sự, 2020. *TREC-COVID: Constructing a Pandemic Information Retrieval Test Collection*. https://arxiv.org/abs/2005.04474 (mục 2.3)
10. Thakur, Reimers, Rücklé, Srivastava, Gurevych, 2021. *BEIR*. https://arxiv.org/abs/2104.08663 (mục 6, bảng 4: phân tích Hole@10 trên TREC-COVID)
11. Yang, Sun, Xin và cộng sự, 2024. *CRAG – Comprehensive RAG Benchmark*. https://arxiv.org/abs/2406.04744 (mục 3.1, phụ lục A.1.3-A.1.4)
12. Krishna và cộng sự, 2024. *Fact, Fetch, and Reason: A Unified Evaluation of Retrieval-Augmented Generation* (FRAMES). https://arxiv.org/abs/2409.12941 (mục 3)

### Bộ do LLM sinh và kiểm
13. Tang, Yang, 2024. *MultiHop-RAG: Benchmarking Retrieval-Augmented Generation for Multi-Hop Queries*. https://arxiv.org/abs/2401.15391 (mục 3, bước 1-5)
14. Tihanyi, Ferrag, Jain và cộng sự, 2024. *CyberMetric: A Benchmark Dataset based on Retrieval-Augmented Generation for Evaluating LLMs in Cybersecurity Knowledge*. https://arxiv.org/abs/2402.07688 (mục III)
15. Alam, Bhusal và cộng sự, 2024. *CTIBench: A Benchmark for Evaluating LLMs in Cyber Threat Intelligence*. https://arxiv.org/abs/2406.07599 (mục cti-mcq)
16. Liu, 2023. *SecQA: A Concise Question-Answering Dataset for Evaluating Large Language Models in Computer Security*. https://arxiv.org/abs/2312.15838
17. Badrinath Krishna, 2024. *AttackQA: Development and Adoption of a Dataset for Assisting Cybersecurity Operations using Fine-tuned and Open-Source LLMs*. https://arxiv.org/abs/2411.01073 (mục 3.5)
18. Zhu, Luo, Xu và cộng sự, 2024. *RAGEval: Scenario Specific RAG Evaluation Dataset Generation Framework*. https://arxiv.org/abs/2408.01262 (phụ lục đánh giá người)
19. Filice, Horowitz và cộng sự, 2025. *Generating Diverse Q&A Benchmarks for RAG Evaluation with DataMorgana*. https://arxiv.org/abs/2501.12789
20. Teixeira de Lima, Gupta, Berrospi, Mishra, Dolfi, Staar và cộng sự, 2024. *Know Your RAG: Dataset Taxonomy and Generation Strategies for Evaluating RAG Systems*. https://arxiv.org/abs/2411.19710 (mục 4-6)
21. Saad-Falcon, Khattab, Potts, Zaharia, 2023. *ARES*. https://arxiv.org/abs/2311.09476 (mục 3)
22. Friel, Belyi, Sanyal, 2024. *RAGBench: Explainable Benchmark for Retrieval-Augmented Generation Systems*. https://arxiv.org/abs/2407.11005 (mục 3.4)
23. Fadnis và cộng sự, 2024. *InspectorRAGet: An Introspection Platform for RAG Evaluation*. https://arxiv.org/abs/2404.17347 (công cụ phân tích kết quả, có xem độ đồng ý giữa người gán; không dùng để tạo dữ liệu)

### LLM làm nhãn liên quan / test collection tổng hợp
24. Rahmani, Craswell, Yilmaz, Mitra, Campos, 2024. *Synthetic Test Collections for Retrieval Evaluation* (SIGIR). https://arxiv.org/abs/2405.07767
25. Thomas, Spielman, Craswell, Mitra, 2023. *Large Language Models can Accurately Predict Searcher Preferences*. https://arxiv.org/abs/2309.10621
26. Faggioli, Dietz, Clarke và cộng sự, 2023. *Perspectives on Large Language Models for Relevance Judgment*. https://arxiv.org/abs/2304.09161
27. Upadhyay, Pradeep và cộng sự, 2024. *UMBRELA: UMbrela is the (Open-Source Reproduction of the) Bing RELevance Assessor*. https://arxiv.org/abs/2406.06519 (bảng 2)
28. Clarke, Dietz, 2024. *LLM-based Relevance Assessment Still Can't Replace Human Relevance Assessment*. https://arxiv.org/abs/2412.17156
29. Soboroff, 2025. *Don't Use LLMs to Make Relevance Judgments*. Information Retrieval Research 1. https://arxiv.org/abs/2409.15133

### Công cụ và hướng dẫn
30. Label Studio, Templates (Question Answering; Evaluate RAG with Human Feedback; Search Page Ranking; Document Retrieval...): https://labelstud.io/templates/ ,
    https://labelstud.io/templates/question_answering , https://labelstud.io/templates/llm_rag_human_feedback
31. Label Studio, Export annotations (`completed_by`, `lead_time`): https://labelstud.io/guide/export
32. Argilla, Distribute the annotation task (`TaskDistribution`, `min_submitted`): https://docs.argilla.io/latest/how_to_guides/distribution/
33. Anthropic, *Create strong empirical evaluations* (mô phỏng phân bố thật, edge case, ưu tiên số lượng có chấm tự động, judge khác model sinh): https://platform.claude.com/docs/en/docs/test-and-evaluate/develop-tests

### Giấy phép
34. OWASP Cheat Sheet Series, `LICENSE.md` (CC BY-SA 4.0): https://github.com/OWASP/CheatSheetSeries/blob/master/LICENSE.md
35. OWASP WSTG, giấy phép repo theo GitHub API (`CC-BY-SA-4.0`): https://github.com/OWASP/wstg (https://api.github.com/repos/OWASP/wstg/license)

> Ghi chú: tên tác giả ghi theo trang đầu của PDF đã tải; "và cộng sự" khi danh sách dài. SQuAD 2.0 (Rajpurkar và cộng sự, 2018), Krippendorff's α, doccano, Prodigy,
> Databricks / LlamaIndex / OpenAI eval guidance **không** được mở trong lần này. Số của UIT-ViQuAD 2.0 trong bài báo (35.990 mẫu, 9.217 không trả lời được) khác số
> trên HF card ghi ở [R §3.2] (39,6 nghìn dòng, hơn 12 nghìn câu không trả lời được); có thể do khác split công bố. Khi trích trong luận văn, ghi rõ lấy từ nguồn nào.

### File trong repo và số đo
- `src/lib/ingest.ts` (`extractPdfText`, `toMarkdown`, lưu `Document.markdown` khi xong, `deleteMany` chunk, `skipped`), `src/lib/chunking.ts` (`chunkMarkdown`),
  `src/lib/pdf-cleanup.ts` (`removeHeadersFooters`, `removeSiteChrome`), `src/lib/env.ts` (`CHUNK_SIZE` 800, `CHUNK_OVERLAP` 80), `prisma/schema.prisma`
  (`DocumentChunk.metadata Json?` chưa dùng).
- `data/uploads/*.pdf` (141 file), `data/uploads/bundle/cheatsheets/*.html` (137 file), `data/eval/set-a.jsonl`, `set-b.jsonl`, `data/eval/README.md`.
- Script đo đặt ngoài repo (thư mục scratchpad của phiên): chạy đúng các hàm trên; không ghi gì vào repo hay DB.
