<!--
Chương 3, mục 3.7–3.8 (bộ dữ liệu đánh giá). Nối tiếp chuong-3-phan-ung-dung.md: hình bắt đầu từ Hình 3.9, bảng từ Bảng 3.9.
Số trong [n] theo tai-lieu-tham-khao.md; tài liệu mới bắt đầu từ [47].
Số liệu lấy từ Dataset/CARD.md (phiên bản 0.2.0), ADR 0001–0005, Dataset/.scratch/eval-set-v1/spec.md, annotation/guideline-v1.md.
-->

## 3.7. Thiết kế bộ dữ liệu đánh giá

Mục này trình bày bộ đánh giá như đã thiết kế: mục tiêu, cách đóng băng corpus, cách phân cụm chủ đề, thang mức câu hỏi và kế hoạch phân bổ số câu. Mục 3.8 trình bày quy trình xây dựng thực tế và những chỗ bộ đánh giá đóng băng khác với kế hoạch.

### 3.7.1. Mục tiêu đo và nguyên tắc tái lập

Bộ đánh giá đo hai phần của SecLearn. Phần thứ nhất là truy xuất: trong 5 đoạn được đưa cho LLM trả lời, có bao nhiêu đoạn chứa bằng chứng của đáp án. Đây là phần mà con số báo cáo chính đo. Phần thứ hai là khả năng từ chối: hệ thống có từ chối các câu không trả lời được từ tài liệu không, và có từ chối nhầm các câu trả lời được không. Các độ đo khác của phần trả lời (đúng đáp án, trung thành với nguồn, trích dẫn đúng) được định nghĩa sẵn trong định dạng dữ liệu để dùng về sau.

Để kết quả lặp lại được, bộ đánh giá được thiết kế theo bốn nguyên tắc.

Thứ nhất, bộ đánh giá là một dự án Python riêng trong thư mục `Dataset/` của cùng repo, tách khỏi mã nguồn của ứng dụng (ADR 0004). Dự án này không import mã ứng dụng và không kết nối cơ sở dữ liệu. Đầu vào duy nhất của nó là snapshot corpus do ứng dụng xuất ra (mục 3.6.2). Nhờ tách như vậy, bộ đánh giá có vòng đời, phiên bản và giấy phép riêng, và tái lập được trên máy không có PostgreSQL. Để trong cùng repo thay vì repo riêng giúp một commit gắn được cả phiên bản ứng dụng lẫn phiên bản bộ đánh giá.

Thứ hai, bằng chứng của mỗi câu hỏi được lưu dưới dạng gold span: một khoảng vị trí ký tự trên văn bản Markdown của tài liệu, kèm mã băm của văn bản và trích dẫn nguyên văn. Bằng chứng không được lưu dưới dạng mã đoạn, vì mã đoạn thay đổi mỗi khi đổi cách cắt đoạn. Danh sách đoạn liên quan (qrels) được sinh lại từ gold span cho từng phiên bản cách cắt.

Thứ ba, mọi thứ có phiên bản. Snapshot có định danh theo ngày và tên, mỗi tài liệu có mã sha256. Bộ đánh giá đánh số phiên bản theo dạng MAJOR.MINOR.PATCH: tăng MAJOR khi đổi snapshot hoặc đổi nghĩa của gold, tăng MINOR khi thêm câu, tăng PATCH khi sửa nhãn. Mỗi lượt đo ghi lại snapshot, phiên bản cách cắt đoạn, phiên bản bộ đánh giá và commit của ứng dụng. Mỗi câu sinh bằng LLM ghi lại mô hình, phiên bản prompt và seed.

Thứ tư, bộ đánh giá có một dataset card mô tả động cơ, thành phần, cách thu thập, cách gán nhãn, cách dùng, giới hạn và giấy phép, theo tinh thần của "datasheets for datasets" [47]. Card được sinh tự động từ các file dữ liệu bằng lệnh `seclearn-eval card`, không sửa tay, để card không lệch khỏi dữ liệu. Mỗi file câu hỏi và card có một chuỗi canary GUID, để phát hiện nếu bộ đánh giá bị đưa vào dữ liệu huấn luyện của một mô hình nào đó.

Toàn bộ quy trình là một chuỗi lệnh con của một công cụ dòng lệnh (`seclearn-eval`), mỗi lệnh đọc file và ghi file, theo thứ tự trong Hình 3.9. Định dạng của mọi bản ghi (tài liệu, đơn vị lấy mẫu, câu hỏi, gold span, nhãn, mục pool, cấu hình lượt chạy) được định nghĩa trong một module schema duy nhất bằng pydantic.

[HÌNH: hinh/3-09-quy-trinh-bo-danh-gia.png] Hình 3.9. Quy trình xây dựng bộ đánh giá: snapshot → đơn vị lấy mẫu và cụm chủ đề → kế hoạch hạn mức → sinh ứng viên → lọc tự động → người duyệt → pool và LLM chấm → qrels → kiểm tra → chấm điểm và báo cáo → dataset card.

### 3.7.2. Snapshot corpus và cụm chủ đề

Snapshot dùng cho bộ đánh giá có định danh `2026-10-18-owasp`, xuất từ commit `e854947` của ứng dụng sau lần lập chỉ mục lại ở mục 3.5.1. Snapshot gồm 134 tài liệu và 5.915 đoạn, cắt theo phiên bản `sentence-v2` (`CHUNK_SIZE` 800, `CHUNK_OVERLAP` 80). WSTG có 1.468 đoạn, chiếm 24,8% corpus. Vị trí ký tự tính theo code point. Corpus chỉ gồm tài liệu OWASP; tài liệu NIST CSWP 29 có trong corpus ban đầu đã bị bỏ ra để mọi tài liệu cùng giấy phép CC BY-SA 4.0 (ADR 0001).

Đơn vị lấy mẫu là phần tài liệu mà một câu hỏi được sinh ra từ đó. Với cheat sheet, đơn vị là một mục cấp `##`; với WSTG, đơn vị là một test case, cộng phần mở đầu và phần cuối của tài liệu. Snapshot có 2.999 đơn vị, trong đó 2.838 đơn vị lấy mẫu được. 161 đơn vị bị loại vì không có nội dung để hỏi: danh mục tham khảo (153), mục lục (2), test case chỉ ghi "nội dung đã bị gỡ" (2), phụ lục payload (2) và danh sách công cụ (1).

Các tài liệu được chia thành 10 cụm chủ đề (Bảng 3.9). Cụm chủ đề là tầng trên cùng khi phân bổ số câu và khi báo kết quả. File phân cụm khởi đầu được dựng tự động theo tên tài liệu, sau đó em duyệt lại bằng tay. WSTG không được xếp nguyên vào một cụm mà chia theo nhóm test case: ví dụ các nhóm ATHN, IDNT, SESS vào cụm xác thực, phiên; nhóm INPV vào cụm injection; phần mở đầu của WSTG vào cụm kiến trúc, quy trình.

Bảng 3.9. Mười cụm chủ đề của corpus

| Mã | Tên cụm | Số cheat sheet | Nhóm test case WSTG |
|---|---|---|---|
| arch | Kiến trúc, quy trình (gồm miền đặc thù) | 22 | BUSL, CONF, ERRH, INFO |
| supply | Chuỗi cung ứng, DevOps, hạ tầng | 17 | |
| inj | Injection, đầu vào | 17 | INPV |
| auth | Xác thực, phiên | 17 | ATHN, IDNT, SESS |
| browser | Trình duyệt (gồm CSRF) | 13 | CLNT |
| framework | Framework, ngôn ngữ | 13 | |
| ai | AI | 9 | |
| transport | Vận chuyển, header, mật mã | 8 | CRYP |
| authz | Phân quyền | 10 | ATHZ |
| api | API | 7 | APIT |

### 3.7.3. Thang mức câu hỏi L1–L7

Mỗi câu hỏi được gán một mức theo loại bằng chứng cần để trả lời, không theo độ dài câu. Thang gồm bảy mức (Bảng 3.10). Thang này được xây để đo đúng các loại lỗi đã gặp khi phát triển SecLearn: câu hỏi gõ không dấu bị từ chối (L2), câu cần nhiều đoạn chỉ lấy được một đoạn (L3), câu so sánh chỉ lấy được tài liệu của một vế (L4), câu nối tiếp hiểu sai chủ đề (L7).

Bảng 3.10. Thang mức câu hỏi

| Mức | Tên | Bằng chứng cần | Ví dụ |
|---|---|---|---|
| L1 | Tra cứu một đoạn | Một đoạn liền, câu hỏi dùng thuật ngữ trùng tài liệu | "Session ID cần tối thiểu bao nhiêu bit entropy để chống đoán mò?" |
| L2 | Diễn đạt lại, không dấu | Như câu L1 hoặc L3 gốc, nhưng không dùng thuật ngữ của tài liệu hoặc viết không dấu | "lam sao de trinh duyet khong cho JS doc cookie dang nhap" |
| L3 | Nhiều đoạn, một chủ đề | Gộp từ hai ý trở lên trong cùng chủ đề | "OWASP khuyến nghị cấu hình tối thiểu nào cho Argon2id, và nếu không có Argon2id thì dùng gì với tham số nào?" |
| L4 | So sánh | Hai thực thể trở lên theo một khía cạnh chung, mỗi ô có bằng chứng riêng | "Cookie HttpOnly và Web Storage khác nhau thế nào khi trang có lỗi XSS?" |
| L5 | Nhiều bước, tình huống | Nối hai bằng chứng trở lên hoặc áp dụng vào tình huống; không bằng chứng đơn lẻ nào đủ | "Ứng dụng lưu token phiên trong localStorage và có một lỗi XSS. Kẻ tấn công lấy được gì, và chuyển sang cookie HttpOnly giúp được phần nào?" |
| L6 | Không trả lời được | Corpus không có đáp án | "Viết luật Snort để phát hiện quét cổng SYN thế nào?" |
| L7 | Hội thoại | Bằng chứng cho lượt cuối, câu chỉ hiểu được khi đọc các lượt trước | Lượt trước hỏi HttpOnly, lượt cuối "Thế còn Secure thì sao?" |

Ví dụ trong Bảng 3.10 lấy từ hướng dẫn gán nhãn; mỗi ví dụ trong hướng dẫn kèm trích dẫn nguyên văn từ snapshot, và một test tự động kiểm rằng mọi trích dẫn đó có thật.

Mức L6 chia thành ba loại theo tỉ lệ kế hoạch 1 : 2 : 1:

- L6(a), ngoài lĩnh vực: câu không liên quan đến an toàn thông tin, ví dụ hỏi giá vàng. Không cần bằng chứng.
- L6(b), thuộc an ninh nhưng corpus không có: ví dụ luật Snort, phân tích bộ nhớ bằng Volatility. Đây là loại khó gán nhất, vì phải chứng minh corpus không có câu trả lời. Mỗi câu L6(b) đi kèm bằng chứng vắng mặt: các từ khóa tiếng Anh đã tìm trên toàn bộ snapshot và top-20 đoạn của hai hệ truy xuất, để người duyệt xác nhận không đoạn nào trả lời được, kể cả một phần.
- L6(c), tiền đề sai: đổi một chi tiết của một câu L1 đã duyệt, ví dụ "Vì sao OWASP khuyên băm mật khẩu bằng MD5 cho nhanh?". Câu L6(c) bắt buộc có span "bác bỏ tiền đề" chỉ ra chi tiết đúng trong tài liệu; hệ thống đạt khi bác bỏ được tiền đề.

Ba mức L2, L7 và L6(c) không được sinh độc lập mà dựng thành biến thể của một câu gốc đã duyệt, cùng `seed_id`. Nhờ vậy có thể so cùng một câu ở dạng có dấu và không dấu, hoặc ở dạng đơn và dạng hội thoại.

### 3.7.4. Phân bổ hạn mức

Corpus mất cân bằng: WSTG chiếm 24,8% số đoạn, và năm tài liệu lớn nhất chiếm khoảng 30%. Nếu sinh câu tỉ lệ thuận với số đoạn, bộ đánh giá thực chất sẽ là bộ đánh giá WSTG. Ngoài ra, LLM có xu hướng sinh câu tra cứu một đoạn, nên các mức khó sẽ thiếu nếu không đặt hạn mức theo mức.

Hạn mức là số câu phân cho mỗi cụm, mỗi tài liệu và mỗi mức trước khi sinh câu. Em đã cân nhắc bốn phương án (ADR 0003):

- Tỉ lệ thuận với số đoạn: WSTG vẫn khoảng 23%, nhiều tài liệu không có câu nào.
- Căn bậc hai số đoạn theo tài liệu, coi WSTG là một tài liệu: WSTG chỉ còn khoảng 5%, một nửa số test case không có câu.
- Căn bậc hai trên từng test case WSTG như tài liệu độc lập: WSTG lại tăng lên khoảng 30%, vì tổng các căn bậc hai lớn hơn căn bậc hai của tổng.
- Chia đều các cụm: cụm nhỏ bị khai thác quá mức, tới 39 câu một tài liệu.

Phương án được chọn là căn bậc hai hai tầng, gọi là phương án R. Hạn mức của mỗi cụm tỉ lệ với căn bậc hai số đoạn của cụm:

$$n_c = N \cdot \frac{\sqrt{m_c}}{\sum_{c'} \sqrt{m_{c'}}} \tag{3.1}$$

trong đó $N$ là tổng số câu cần phân, $m_c$ là số đoạn của cụm $c$ (chỉ tính các đơn vị lấy mẫu được) và $n_c$ là hạn mức của cụm. Trong mỗi cụm, hạn mức chia tiếp cho các tài liệu theo căn bậc hai số đoạn của tài liệu, với phần WSTG của cụm coi là một tài liệu rồi chia tiếp theo test case. Mỗi tài liệu có trần 20 câu, làm tròn bằng phương pháp phần dư lớn nhất, và mọi lựa chọn ngẫu nhiên dùng seed cố định 20261018.

Trên tập test, mỗi cụm có sàn 100 câu trả lời được: cụm có hạn mức dưới 100 được nâng lên 100, phần còn lại chia theo phương án R. Sàn này được đặt để khoảng tin cậy theo từng cụm đủ hẹp (khoảng ±10 đến ±12 điểm) mà so được cụm với cụm. Câu trả lời được của tập test chia đều cho sáu mức L1–L5 và L7, khoảng 183 câu mỗi mức. Tập test có thêm 200 câu L6 (50 câu L6(a), 100 câu L6(b), 50 câu L6(c)). Tập dev khoảng 175 câu, lấy theo cùng tỉ lệ nhưng không có sàn. Hai tập tách nhau theo `seed_id`, để một câu gốc và các biến thể của nó không nằm ở hai tập khác nhau.

Bảng 3.11 là kế hoạch của tập test theo cụm và mức. Tổng kế hoạch là 1.475 câu: 1.300 câu test và 175 câu dev.

Bảng 3.11. Kế hoạch hạn mức của tập test

| Cụm | L1 | L2 | L3 | L4 | L5 | L6 | L7 | Tổng |
|---|---|---|---|---|---|---|---|---|
| arch | 24 | 24 | 24 | 24 | 24 | 6 | 24 | 150 |
| supply | 19 | 18 | 18 | 18 | 18 | 5 | 18 | 114 |
| inj | 19 | 20 | 20 | 20 | 20 | 5 | 20 | 124 |
| auth | 20 | 20 | 20 | 20 | 20 | 5 | 21 | 126 |
| browser | 18 | 18 | 17 | 18 | 18 | 5 | 18 | 112 |
| framework | 17 | 17 | 16 | 17 | 17 | 5 | 16 | 105 |
| ai | 16 | 17 | 17 | 17 | 16 | 4 | 17 | 104 |
| transport | 17 | 16 | 17 | 17 | 17 | 5 | 16 | 105 |
| authz | 16 | 17 | 17 | 17 | 17 | 5 | 16 | 105 |
| api | 17 | 17 | 17 | 16 | 16 | 5 | 17 | 105 |
| L6(a), L6(b) ngoài cụm | | | | | | 150 | | 150 |
| Tổng | 183 | 184 | 183 | 184 | 183 | 200 | 183 | 1.300 |

Hệ quả của thiết kế này là bộ đánh giá không đại diện cho phân bố của corpus, cũng không đại diện cho câu hỏi thật của người dùng. Vì vậy con số báo cáo chính lấy trung bình đều trên các cụm (macro), và số theo tỉ lệ corpus (hậu phân tầng) chỉ báo kèm (mục 3.8.5).

## 3.8. Quy trình xây dựng bộ đánh giá

### 3.8.1. Sinh câu ứng viên bằng LLM

Câu ứng viên được sinh bằng Claude (`claude-opus-5-5`), với số lượng gấp khoảng 1,6 lần hạn mức để bù cho phần bị lọc và bị loại khi duyệt. Mỗi mức có prompt riêng, có số phiên bản (`gen-L1-v1`, `gen-L3-v1`, `gen-L4-v1`, `gen-L5-v1`, `gen-L6a-v1`). Mỗi ứng viên gồm câu hỏi tiếng Việt, bản tiếng Anh của câu hỏi, đáp án tham chiếu, đáp án tách thành các khẳng định ngắn, mức dự kiến và trích dẫn nguyên văn từ snapshot.

Cách sinh khác nhau theo mức:

- L1 và L3: LLM rút các câu khẳng định từ đơn vị trước, rồi mới đặt câu hỏi cho các khẳng định đó, để câu hỏi bám vào nội dung tài liệu.
- L4 và L5: LLM nhận hai đơn vị cùng cụm, để có câu so sánh và câu nhiều bước thật.
- L6(a): sinh trực tiếp các câu ngoài lĩnh vực.
- L2, L7, L6(c) và L6(b): theo thiết kế được dựng sau khi câu gốc đã được duyệt (mục 3.7.3).

Kết quả gọi API được lưu đệm theo khóa gồm prompt, mô hình và đầu vào, nên chạy lại một bước không tốn thêm chi phí cho phần đã có. Khi Claude từ chối sinh câu cho một ô, ô đó được sinh từ một đơn vị khác cùng cụm và được ghi vào báo cáo. DeepSeek, LLM mà SecLearn dùng để trả lời, không được dùng ở bất kỳ bước nào của bộ đánh giá, để tránh trường hợp hệ được đo được chấm bằng chính câu hỏi do nó sinh ra.

Lượt sinh đầu tiên tạo ra 1.446 ứng viên, thiếu 17 so với yêu cầu. Sau khi biết các ô còn thiếu, một lượt sinh bù (vòng 1) tạo thêm 200 ứng viên chỉ cho các ô đó.

### 3.8.2. Lọc tự động và LLM judge

Mỗi ứng viên đi qua sáu bước lọc theo thứ tự cố định. Hai bước dùng LLM chạy bằng Gemini (`gemini-3.8-flash`), một nhà cung cấp khác với mô hình sinh câu, để mô hình không tự chấm câu của chính nó.

1. Trích dẫn có thật: mọi trích dẫn phải tìm thấy nguyên văn trong snapshot. Bước này loại các bằng chứng bịa.
2. Trả lời được: Gemini thử trả lời câu hỏi chỉ từ các trích dẫn của nó; câu không trả lời được bị loại. Với câu L4 và L5, Gemini được ghép bằng chứng của cả hai vế.
3. Phân loại lại mức: Gemini phân loại mức của câu theo định nghĩa ở Bảng 3.10; câu lệch mức được đổi nhãn hoặc bị loại. Bước này cần vì mức do mô hình sinh tự khai không đáng tin: Teixeira de Lima và cộng sự [48] ghi nhận rằng khi yêu cầu LLM sinh câu hỏi dạng tóm tắt, 75% câu sinh ra vẫn bị phân loại là câu hỏi một sự kiện.
4. Tự tham chiếu: loại câu nhắc "tài liệu này", "bảng trên", "hình 2", vì người dùng thật không hỏi như vậy.
5. Trùng ý: hai câu trong cùng cụm có embedding (`gemini-embedding-001`) với cosine từ 0,9 trở lên được coi là trùng, chỉ giữ một câu.
6. Trùng từ vựng cho L2: câu L2 có tỉ lệ trùng từ với tài liệu trên 0,6 bị loại, vì nó không thực sự diễn đạt lại.

Mỗi bước ghi số câu vào, số câu bị loại và lý do. Bảng 3.12 là kết quả lọc của lượt sinh đầu tiên.

Bảng 3.12. Kết quả các bước lọc tự động của lượt sinh đầu tiên

| Bước | Vào | Loại | Tỉ lệ loại | Đổi mức |
|---|---|---|---|---|
| Trích dẫn có thật | 1.446 | 4 | 0,3% | 0 |
| Trả lời được | 1.442 | 363 | 25,2% | 0 |
| Phân loại lại mức | 1.079 | 46 | 4,3% | 37 |
| Tự tham chiếu | 1.033 | 1 | 0,1% | 0 |
| Trùng ý | 1.032 | 61 | 5,9% | 0 |
| Trùng từ vựng (L2) | 971 | 0 | 0,0% | 0 |

Lượt đầu giữ lại 971 câu. Bước "trả lời được" loại nhiều nhất, khoảng một phần tư số ứng viên: LLM sinh thường đặt câu hỏi mà trích dẫn đi kèm không đủ để trả lời. Ở lượt sinh bù, tỉ lệ này còn cao hơn: 108 trên 200 ứng viên bị loại ở bước này, và lượt sinh bù giữ lại 73 câu. Câu qua được bộ lọc có trạng thái "chờ duyệt", và gold span của nó đã được định vị trên snapshot.

### 3.8.3. Gán nhãn bởi người và pilot

Mọi câu được người duyệt trước khi vào gold set. Người duyệt là em, tác giả khóa luận; bộ đánh giá không có người gán thứ hai (ADR 0002). Việc duyệt làm trên Label Studio [46] chạy cục bộ bằng Docker. Công cụ dòng lệnh chuyển câu hỏi thành task của Label Studio và nhập nhãn ngược về, giữ lại người gán, thời gian gán và phiên bản hướng dẫn.

Giao diện duyệt được sắp theo đúng thứ tự làm, để người duyệt không bị câu trả lời của LLM dẫn dắt (Hình 3.10):

1. Đọc câu hỏi khi chưa thấy nguồn, đánh giá câu như một người dùng thật: tự đứng được, mơ hồ, cần ngữ cảnh tài liệu hay chỉ hỏi ý kiến.
2. Đọc nguồn và tự bôi gold span. Nguồn là toàn bộ đơn vị lấy mẫu, hiện dưới dạng Markdown liền mạch, không thấy ranh giới đoạn, để gold không phụ thuộc cách cắt đoạn hiện tại. Span là phần tối thiểu đủ trả lời, thường là một câu; thông tin rải rác thì bôi nhiều span. Với câu so sánh, mỗi ô có nhãn span riêng ("Ô 1", "Ô 2").
3. Chỉ sau khi đánh dấu đã bôi xong, giao diện mới hiện mức do LLM khai, đáp án và trích dẫn của LLM, để người duyệt đối chiếu.
4. Quyết định chấp nhận, sửa (đổi mức, sửa câu chữ, sửa đáp án, bôi lại span) hoặc loại.

[HÌNH: hinh/3-10-label-studio.png] Hình 3.10. Giao diện duyệt câu hỏi trên Label Studio.

Khi nhập nhãn về, vị trí ký tự của Label Studio (tính theo đơn vị UTF-16 của trình duyệt) được đổi sang code point của snapshot, và nhãn bị từ chối nếu chữ trong span không khớp văn bản Markdown.

Trước đợt duyệt chính, em chạy một pilot 50 câu, mỗi mức L1, L3, L4, L5, L6 lấy 10 câu, rải đều qua các cụm, theo hướng dẫn gán nhãn phiên bản v0. Cả 50 câu đều được chấp nhận, không câu nào phải sửa. Thời gian duyệt trung vị là 446 giây (khoảng 7,4 phút) mỗi câu: khoảng 6 phút với L1, 7,5 phút với L4, 10 phút với L3 và L5, và khoảng 10 giây với L6. Pilot cũng chỉ ra một số vấn đề của giao diện và hướng dẫn, ví dụ chỉ 10 trên 37 span của câu L4 được gắn nhãn ô. Sau pilot, hướng dẫn được sửa một lần thành v1 rồi đóng băng: thêm ô sửa câu hỏi, thêm các ô bắt buộc, quy ước bôi span theo ô cho L4, và cách giữ thời gian gán đúng. Mọi sửa đổi sau đó phải tăng phiên bản phụ kèm danh sách câu đã kiểm lại.

Đợt duyệt chính có 995 câu (L1 278, L3 237, L4 200, L5 229, L6(a) 51), gồm mọi câu qua bộ lọc của hai lượt sinh trừ 50 câu pilot. Ước tính theo thời gian trung vị của pilot, duyệt hết cần khoảng 120 giờ. Đến ngày 09/11/2026, em đã duyệt 200 câu theo hướng dẫn v1, chấp nhận 199 câu và loại 1 câu. Thời gian duyệt trung vị của đợt này là 88 giây mỗi câu.

Để kịp tiến độ bảo vệ, em quyết định dừng duyệt và đóng băng gold set ở các câu đã có nhãn người (ADR 0005): 199 câu của đợt duyệt chính và 50 câu pilot, tổng cộng 249 câu (217 câu test, 32 câu dev). 795 câu còn lại không vào gold set. Hai phương án khác đã được cân nhắc: duyệt thêm khoảng 300 câu để mỗi cụm có 40 đến 50 câu (khoảng 35 đến 40 giờ), và chỉ giữ 199 câu theo hướng dẫn v1 để bộ đồng nhất hơn (mỗi cụm mất khoảng 5 câu). Phương án gộp pilot được chọn, và việc 50 câu pilot gán theo hướng dẫn v0 được ghi rõ trong card. Theo quy tắc phiên bản, bản đóng băng này là 0.2.0; phiên bản 1.0.0 dành cho gold set đủ kế hoạch.

Bảng 3.13 so sánh gold set 0.2.0 với kế hoạch.

Bảng 3.13. Gold set phiên bản 0.2.0 so với kế hoạch

| Tiêu chí | Kế hoạch | Gold set 0.2.0 |
|---|---|---|
| Tổng số câu | 1.475 | 249 (16,9% kế hoạch) |
| Test / dev | 1.300 / 175 | 217 / 32 |
| Mức có câu | L1–L7 | L1 (69), L3 (57), L4 (47), L5 (56), L6(a) (20) |
| Câu trả lời được mỗi cụm trên test | Tối thiểu 100 | 13 đến 27 |
| Hướng dẫn gán nhãn | v1 | v1 (199 câu), v0 (50 câu) |
| Số gold span | | 723 |

Gold set không có câu L2, L7, L6(b) và L6(c), vì theo thiết kế các câu này chỉ được dựng sau khi duyệt xong câu gốc. Số gold span trung bình mỗi câu là 1,41 với L1, 3,91 với L3, 3,64 với L4 và 4,14 với L5. Phần lớn câu có bằng chứng trong cheat sheet (195 câu), 13 câu có bằng chứng trong WSTG và 21 câu có bằng chứng ở cả hai.

Theo thiết kế, em còn gán lại khoảng 100 mẫu sau ít nhất một tuần, không nhìn nhãn cũ, để đo độ ổn định của chính người gán. Bước này cũng bị bỏ vì cùng lý do tiến độ, nên gold set 0.2.0 là nhãn của một người, gán một lần, không có số đo độ ổn định.

### 3.8.4. Pooling và qrels

Gold span chỉ chứa bằng chứng mà người duyệt thấy trong đơn vị nguồn của câu. Cùng một thông tin có thể nằm ở tài liệu khác, ví dụ cả cheat sheet và WSTG cùng nói về thuộc tính cookie. Nếu một hệ thống tìm được đoạn đó, nó sẽ bị tính là sai. Để giảm vấn đề này, bộ đánh giá dùng pooling: chạy nhiều hệ truy xuất, gộp các đoạn chúng tìm được, rồi chấm mức liên quan của toàn bộ tập gộp.

Pool gồm 5 hệ truy xuất chạy bằng Python trực tiếp trên các đoạn của snapshot, không cần chạy ứng dụng:

1. BM25 trên bản tiếng Anh của câu hỏi.
2. Embedding tiếng Việt cùng mô hình với ứng dụng (`vietnamese-bi-encoder`, tách từ bằng pyvi) trên câu tiếng Việt.
3. Hệ thứ hai cộng cross-encoder `bge-reranker-v2-m3` xếp hạng lại 20 ứng viên.
4. Embedding đa ngôn ngữ bge-m3 [49] trên câu tiếng Việt.
5. bge-m3 trên bản tiếng Anh của câu hỏi.

Phiên bản của từng mô hình được ghim bằng mã revision trên Hugging Face. Pool của một câu là hợp của top-10 từ 5 hệ cộng các đoạn phủ gold span của câu đó. Với gold set 0.2.0, pool có 6.947 đoạn.

Gemini chấm toàn bộ pool trên thang 0 đến 3 (Bảng 3.14), dùng prompt theo kiểu UMBRELA [50], một cách dùng LLM để tái tạo người chấm mức liên quan của TREC; thang 0 đến 3 mượn từ TREC Deep Learning Track [51]. Theo thiết kế, em chấm lại các đoạn Gemini cho từ 1 điểm trở lên, cộng 10% mẫu ngẫu nhiên các đoạn Gemini cho 0 điểm, để ước được tỉ lệ Gemini bỏ sót. Đoạn em chấm 2 hoặc 3 mà chưa có gold span sẽ được mở rộng thành gold span mới. Nhãn của Gemini không bao giờ được tính là liên quan; nó chỉ dùng để chọn phần người cần chấm.

Bảng 3.14. Thang mức liên quan 0–3 của một đoạn

| Điểm | Nghĩa |
|---|---|
| 3 | Đoạn chứa đáp án trực tiếp, đủ để trả lời |
| 2 | Có đáp án nhưng không rõ, chỉ một phần, hoặc lẫn nhiều thông tin khác |
| 1 | Đúng chủ đề nhưng không trả lời câu hỏi |
| 0 | Không liên quan |

Phần người phải chấm theo thiết kế là 3.673 đoạn, ước tính 30 đến 40 giờ. Phần này cũng bị bỏ để kịp tiến độ (ADR 0005). Thiết kế qrels không đổi, nhưng vì không có nhãn người nào trên pool, qrels của gold set 0.2.0 chỉ gồm hai loại đoạn:

- 493 đoạn liên quan, sinh từ gold span. Một đoạn được coi là liên quan khi nó giao với gold span ít nhất 50% độ dài span hoặc chứa trọn span.
- 3.636 đoạn Gemini cho 0 điểm, ghi là đã chấm và không liên quan.

2.818 đoạn Gemini cho từ 1 điểm trở lên nhưng không chứa gold nằm ngoài qrels, tức là chưa được chấm. Trong đó 271 đoạn được Gemini cho 2 hoặc 3 điểm. Hệ quả là recall đo được là recall so với gold span, và có thể thấp hơn recall thật nếu một số trong 271 đoạn này thực sự trả lời được câu hỏi. Độ đồng ý giữa Gemini và người cũng không tính được.

Qrels được ghi theo định dạng TREC cho phiên bản cách cắt `sentence-v2`. Trước mỗi lượt đo, lệnh `check` chạy các kiểm tra tự động: định dạng file và trùng mã câu; mã băm Markdown khớp manifest; trích dẫn gold tìm thấy đúng một lần quanh vị trí đã lưu; mỗi span có ít nhất một đoạn phủ từ 50% trở lên; không gold nào nằm trong vùng bị loại; không `seed_id` nào ở cả hai tập; cấu hình lượt chạy đầy đủ và mã nguồn đã commit; có canary. Lệnh thoát với mã lỗi khi có bất kỳ lỗi nào. Hai nhãn gold không đoạn nào phủ được đã được phát hiện và sửa nhờ kiểm tra này trước khi đóng băng.

### 3.8.5. Quy chuẩn báo cáo kết quả

Cách báo cáo kết quả được chọn và ghi vào dataset card trước lượt đo đầu tiên, để kết quả không bị nghi là chọn con số đẹp sau khi đã thấy số. Đổi cách báo sau khi đã có số đo phải ghi lý do vào nhật ký thay đổi và báo cả cách cũ lẫn cách mới. Việc đóng băng gold set ở 249 câu (mục 3.8.3) được quyết định trước khi có lượt đo nào trên gold set, nên không phải là đổi cách báo sau khi thấy số; phần cách báo trong card giữ nguyên.

Con số báo cáo chính là recall@5 trung bình đều trên 10 cụm chủ đề (macro), chỉ tính trên các câu trả lời được của tập test. Recall@5 được chọn vì SecLearn đưa đúng `RAG_TOP_K` = 5 đoạn cho LLM, nên tỉ lệ đoạn liên quan lọt vào 5 đoạn đó là thứ phần trả lời phụ thuộc. Trung bình đều trên các cụm được chọn vì hạn mức đã cân lại theo căn bậc hai (mục 3.7.4), nên trung bình trên mọi câu (micro) không đại diện cho corpus hơn trung bình macro.

Câu L6 không vào bất kỳ số nào của phần truy xuất. Chúng được báo riêng bằng tỉ lệ từ chối đúng (chung và theo loại a, b, c), cùng với tỉ lệ từ chối sai trên câu trả lời được. Mỗi câu được trả lời K = 3 lần, vì bước lập kế hoạch truy vấn dùng LLM nên kết quả có thể khác nhau giữa các lần chạy.

Các số phụ, không dùng để kết luận chính, gồm hit@1, hit@5, hit@10, MRR@10, nDCG@10, recall@10 và Judged@10; số micro; số hậu phân tầng với trọng số là tỉ lệ đoạn của từng cụm trong corpus; số theo từng cụm và theo từng mức. Hit, MRR và recall coi đoạn là liên quan từ mức 2 trở lên; nDCG@10 dùng nguyên thang 0 đến 3 với độ lợi tuyến tính. Các độ đo được tính bằng ranx [44], riêng Judged@10 bằng ir-measures [45].

Sai số chuẩn được tính theo nhóm như mục 2.2.2 [30]. Nhóm sai số của một câu là tài liệu của đơn vị lấy mẫu đầu tiên của câu, riêng với WSTG là chính test case, vì các câu sinh từ cùng một tài liệu không độc lập với nhau. Biến thể lấy nhóm của câu gốc. Với số macro và số hậu phân tầng, sai số được ghép từ sai số của từng cụm:

$$\mathrm{SE}^2 = \sum_{c} w_c^2 \, \mathrm{SE}_c^2 \tag{3.2}$$

trong đó $w_c$ là trọng số của cụm $c$ ($1/10$ với macro, tỉ lệ đoạn của cụm với hậu phân tầng) và $\mathrm{SE}_c$ là sai số chuẩn theo nhóm của cụm. Khoảng tin cậy 95% là trung bình cộng trừ 1,96 lần sai số chuẩn, cắt về đoạn $[0, 1]$. Với tầng dưới 300 câu và độ đo 0/1 (hit@k), khoảng tin cậy dùng khoảng Wilson [52] trên cỡ mẫu hiệu dụng, tức số câu chia cho hệ số thiết kế (tỉ số giữa phương sai theo nhóm và phương sai khi coi các câu độc lập).

Khi so hai cấu hình của SecLearn, các câu được ghép cặp: hiệu được tính theo từng câu, và sai số của hiệu cũng điều chỉnh theo nhóm. P-value chính lấy từ kiểm định ngẫu nhiên hóa, đổi nhãn A/B cho cả một nhóm sai số cùng lúc thay vì cho từng câu: tính đủ $2^G$ cách đổi khi số nhóm $G \le 16$, ngược lại lấy mẫu 20.000 lần với seed cố định. Khi so cụm với cụm, có 45 cặp; p-value được hiệu chỉnh bằng phương pháp Holm [31], và chỉ kết luận hai cụm khác nhau khi p sau hiệu chỉnh nhỏ hơn 0,05.

Ngoài ra, bộ đánh giá báo thêm một phép kiểm độ nhạy của sai số: tính lại sai số khi gộp nhóm hai tài liệu của mỗi câu L4 và L5, và khi lấy cả cụm chủ đề làm một nhóm. Phép kiểm này không thay đổi số chính hay khoảng tin cậy chính; nó chỉ cho biết sai số thay đổi bao nhiêu nếu cách chia nhóm khác đi.

Toàn bộ phép tính được kiểm bằng các bộ dữ liệu nhỏ có đáp số tính tay. Lệnh `report` sinh bảng kết quả dạng Markdown và LaTeX từ cùng một danh sách bảng, nên hai bản không thể lệch nhau. Chương 4 trình bày kết quả đo theo đúng cách báo này.
