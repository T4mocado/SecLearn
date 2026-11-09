<!--
Chương 2. Số trong [n] theo tai-lieu-tham-khao.md. Hình đánh dấu [HÌNH] cần vẽ khi chuyển sang Word.
-->

# CHƯƠNG 2. CƠ SỞ LÝ THUYẾT

## 2.1. An toàn ứng dụng web và tài liệu OWASP

### 2.1.1. Các lớp lỗ hổng ứng dụng web phổ biến

Ứng dụng web nhận dữ liệu từ người dùng qua mạng, xử lý ở máy chủ, lưu vào cơ sở dữ liệu và trả kết quả về trình duyệt. Mỗi bước đều có thể bị lợi dụng. Danh sách OWASP Top 10 năm 2021 [10] xếp các nhóm rủi ro phổ biến nhất, trong đó có kiểm soát truy cập bị phá vỡ, lỗi mật mã, injection, thiết kế không an toàn, cấu hình sai, thành phần có lỗ hổng, lỗi định danh và xác thực, lỗi toàn vẹn phần mềm và dữ liệu, thiếu ghi log và giám sát, và giả mạo yêu cầu phía máy chủ (SSRF). Một số lớp lỗ hổng xuất hiện nhiều trong câu hỏi của người mới học:

- Injection, điển hình là SQL injection: dữ liệu người dùng được ghép thẳng vào câu lệnh SQL, nên kẻ tấn công thay đổi được ý nghĩa của câu lệnh. Cách phòng chính là dùng truy vấn có tham số.
- Cross-Site Scripting (XSS): ứng dụng đưa dữ liệu người dùng ra trang HTML mà không mã hóa đúng ngữ cảnh, nên trình duyệt của nạn nhân chạy mã JavaScript của kẻ tấn công, ví dụ để đọc cookie phiên.
- Cross-Site Request Forgery (CSRF): trang của kẻ tấn công khiến trình duyệt của nạn nhân gửi một yêu cầu kèm cookie phiên hợp lệ tới ứng dụng đích. Các cách phòng gồm token đồng bộ, double-submit cookie có ký và thuộc tính `SameSite` của cookie.
- Lỗi xác thực và quản lý phiên: mật khẩu lưu bằng hàm băm nhanh như MD5, mã phiên dễ đoán, phiên không hết hạn.
- Lỗi phân quyền: người dùng truy cập được dữ liệu của người khác chỉ bằng cách đổi mã định danh trong URL (IDOR).

### 2.1.2. OWASP Cheat Sheet Series và WSTG

OWASP (Open Worldwide Application Security Project) là một tổ chức phi lợi nhuận phát hành tài liệu mở về an toàn phần mềm. OWASP Cheat Sheet Series [1] là tập các bản hướng dẫn ngắn, mỗi bản tập trung vào một chủ đề, ví dụ Password Storage Cheat Sheet nêu thuật toán băm mật khẩu nên dùng và tham số tối thiểu của từng thuật toán. OWASP Web Security Testing Guide (WSTG) [2] là hướng dẫn kiểm thử, chia thành các nhóm (thu thập thông tin, cấu hình, định danh, xác thực, phân quyền, quản lý phiên, kiểm tra dữ liệu đầu vào…), mỗi nhóm gồm các test case có mã dạng `WSTG-XXXX-NN`, ví dụ `WSTG-INFO-01`.

Cả hai bộ tài liệu dùng giấy phép Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0), cho phép sao chép và tạo tác phẩm phái sinh nếu ghi nguồn và chia sẻ cùng giấy phép. Đây là lý do khóa luận chọn chúng làm corpus: nội dung có chất lượng, cập nhật, được dùng rộng rãi, và bộ đánh giá xây trên đó có thể công bố lại.

## 2.2. Mô hình ngôn ngữ lớn và biểu diễn vector

### 2.2.1. Mô hình ngôn ngữ lớn

Mô hình ngôn ngữ lớn là mạng nơ-ron được huấn luyện trên lượng văn bản rất lớn để dự đoán token tiếp theo của một chuỗi. Các LLM hiện nay dựa trên kiến trúc Transformer [11], trong đó cơ chế attention cho phép mỗi vị trí trong chuỗi lấy thông tin từ mọi vị trí khác. Khi đủ lớn, LLM làm được nhiều tác vụ chỉ bằng cách mô tả tác vụ và đưa vài ví dụ trong lời nhắc (prompt), không cần huấn luyện lại [12].

Khi dùng LLM cho hỏi đáp chuyên ngành, có ba giới hạn cần tính đến:

- Ảo giác: mô hình có thể sinh nội dung sai nhưng diễn đạt trôi chảy [3].
- Tri thức cố định tại thời điểm huấn luyện, nên không biết các tài liệu mới hơn.
- Cửa sổ ngữ cảnh hữu hạn: không thể đưa toàn bộ 134 tài liệu vào một lời nhắc.

Các tham số khi gọi LLM cũng ảnh hưởng tới kết quả. Nhiệt độ (temperature) càng thấp thì đầu ra càng ít ngẫu nhiên. Trong SecLearn, lời gọi sinh câu trả lời dùng nhiệt độ 0,2, còn các lời gọi cần đầu ra ổn định như viết lại câu hỏi dùng nhiệt độ 0.

### 2.2.2. Embedding và độ tương đồng

Embedding là cách biểu diễn một đoạn văn bản thành một vector số thực sao cho các đoạn có nghĩa gần nhau có vector gần nhau. Mô hình bi-encoder như Sentence-BERT [13] mã hóa câu hỏi và đoạn văn độc lập với nhau, nên các đoạn văn có thể được mã hóa trước và lưu lại; khi có câu hỏi, chỉ cần mã hóa câu hỏi rồi so với các vector đã lưu.

Độ tương đồng giữa vector câu hỏi $\mathbf{q}$ và vector đoạn văn $\mathbf{d}$ thường đo bằng cosine:

$$\cos(\mathbf{q}, \mathbf{d}) = \frac{\mathbf{q} \cdot \mathbf{d}}{\lVert \mathbf{q} \rVert \, \lVert \mathbf{d} \rVert} \tag{2.1}$$

trong đó $\mathbf{q} \cdot \mathbf{d}$ là tích vô hướng và $\lVert \cdot \rVert$ là chuẩn Euclid. Khi các vector đã được chuẩn hóa về độ dài 1, cosine bằng tích vô hướng. Giá trị nằm trong khoảng $[-1, 1]$, càng lớn thì hai đoạn càng gần nghĩa.

SecLearn dùng mô hình `bkai-foundation-models/vietnamese-bi-encoder` [14], một bi-encoder cho tiếng Việt, sinh vector 768 chiều. Mô hình này yêu cầu văn bản tiếng Việt được tách từ trước, nên máy chủ embedding dùng thư viện pyvi [15] để tách từ. Mã nguồn của ứng dụng cũng hỗ trợ các nhà cung cấp embedding khác (OpenAI `text-embedding-3-small` 1536 chiều, MiniLM 384 chiều chạy cục bộ), chọn bằng biến môi trường.

### 2.2.3. Cross-encoder và rerank

Bi-encoder nhanh nhưng không cho câu hỏi và đoạn văn "nhìn thấy" nhau khi mã hóa, nên độ chính xác bị giới hạn. Cross-encoder đưa cả cặp (câu hỏi, đoạn văn) vào một mô hình Transformer và trả về một điểm liên quan [16]. Cách này chính xác hơn nhưng phải chạy mô hình cho từng cặp, nên chỉ dùng được trên một số ít ứng viên. Vì vậy các hệ thống truy xuất thường làm hai bước: bi-encoder (và tìm kiếm từ khóa) lấy vài chục ứng viên, rồi cross-encoder xếp hạng lại (rerank) để chọn ra vài đoạn tốt nhất (Hình 2.1).

[HÌNH] Hình 2.1. Bi-encoder và cross-encoder: bi-encoder mã hóa câu hỏi và đoạn văn riêng rồi so vector; cross-encoder đọc cả cặp và trả một điểm.

SecLearn dùng cross-encoder `BAAI/bge-reranker-v2-m3` [17], một mô hình đa ngôn ngữ. Điểm thô của mô hình được đưa qua hàm sigmoid để nằm trong khoảng $[0, 1]$, và ứng dụng đặt ngưỡng liên quan trên thang điểm này.

## 2.3. Sinh tăng cường truy xuất (RAG)

### 2.3.1. Kiến trúc RAG cơ bản

RAG được Lewis và cộng sự đề xuất năm 2020 [4]: thay vì để mô hình sinh câu trả lời chỉ từ tham số đã học, hệ thống truy xuất các đoạn văn liên quan từ một kho tài liệu ngoài và đưa chúng vào đầu vào của mô hình sinh. Một hệ thống RAG gồm ba giai đoạn (Hình 2.2) [18]:

1. Lập chỉ mục (indexing): tài liệu được trích văn bản, cắt thành đoạn (chunk), mã hóa thành vector và lưu vào cơ sở dữ liệu vector.
2. Truy xuất (retrieval): với mỗi câu hỏi, hệ thống tìm các đoạn liên quan nhất.
3. Sinh (generation): các đoạn tìm được được ghép vào lời nhắc cùng câu hỏi, và LLM sinh câu trả lời dựa trên chúng.

[HÌNH] Hình 2.2. Kiến trúc RAG cơ bản: lập chỉ mục, truy xuất, sinh.

Ưu điểm của RAG so với dùng LLM trực tiếp là câu trả lời có căn cứ kiểm tra được, và muốn cập nhật tri thức chỉ cần nạp thêm tài liệu, không phải huấn luyện lại mô hình. Đổi lại, chất lượng câu trả lời phụ thuộc vào việc truy xuất có lấy đúng đoạn hay không: nếu đoạn đúng không đến được LLM, mô hình hoặc trả lời thiếu, hoặc dùng kiến thức riêng.

### 2.3.2. Chia đoạn

Tài liệu dài phải được cắt thành đoạn trước khi mã hóa, vì mô hình embedding có giới hạn độ dài đầu vào và một vector cho cả tài liệu không thể đại diện cho từng ý cụ thể. Cách cắt đơn giản nhất là cắt theo số ký tự cố định. Cách này dễ cắt ngang câu, làm đoạn mất nghĩa ở đầu hoặc cuối. Cách tốt hơn là cắt tại ranh giới câu, bắt đầu đoạn mới tại tiêu đề mục, và cho hai đoạn liên tiếp chồng lấp một phần (overlap) để ý nằm ở ranh giới không bị mất. Kích thước đoạn là một sự đánh đổi: đoạn nhỏ cho vector sát nghĩa hơn nhưng thiếu ngữ cảnh, đoạn lớn thì ngược lại.

### 2.3.3. Truy xuất lai và kỹ thuật cải thiện truy vấn

Tìm kiếm vector tốt với câu hỏi diễn đạt khác từ ngữ trong tài liệu, nhưng có thể bỏ sót các từ khóa hiếm như tên chuẩn, mã CVE hay tên tham số. Tìm kiếm từ khóa, ví dụ theo mô hình BM25 [19] hoặc tìm kiếm toàn văn của PostgreSQL [20], bắt tốt các từ khóa đó. Truy xuất lai (hybrid retrieval) gộp ứng viên của cả hai cách rồi xếp hạng lại.

Câu hỏi của người dùng cũng có thể được biến đổi trước khi tìm:

- Viết lại câu hỏi (query rewriting): trong hội thoại, câu hỏi nối tiếp như "còn cách thứ hai thì sao?" không tự đứng được; LLM viết lại thành một câu hỏi đầy đủ dựa trên lịch sử hội thoại.
- Dịch câu hỏi: khi câu hỏi và tài liệu khác ngôn ngữ, tìm thêm bằng bản dịch của câu hỏi sang ngôn ngữ của tài liệu.
- HyDE (Hypothetical Document Embeddings) [21]: LLM viết một đoạn văn giả định trả lời câu hỏi, rồi dùng đoạn đó để tìm. Đoạn giả định thường giống văn phong tài liệu hơn câu hỏi ngắn, nên tìm được đoạn liên quan mà câu hỏi gốc bỏ sót.

### 2.3.4. Kiểm soát chất lượng câu trả lời

RAG không tự đảm bảo câu trả lời trung thành với tài liệu: LLM vẫn có thể thêm ý không có trong đoạn được đưa vào. Một số kỹ thuật thường dùng để hạn chế việc này:

- Yêu cầu trích dẫn: lời nhắc đánh số các đoạn và yêu cầu mô hình gắn số đoạn vào từng ý. Người đọc nhờ đó đối chiếu được.
- Ngưỡng liên quan và từ chối: nếu không có đoạn nào vượt ngưỡng, hệ thống từ chối trả lời. Khả năng biết từ chối là một phần của chất lượng, như SQuAD 2.0 [5] đã chỉ ra khi thêm câu hỏi không trả lời được vào bộ đánh giá.
- Kiểm tra trích dẫn sau khi trả lời: so từng mệnh đề có trích dẫn với đoạn được trích để xem đoạn đó có thực sự hỗ trợ mệnh đề không.
- Dùng LLM làm người chấm (LLM-as-a-judge) [22]: một LLM được hỏi để chấm mức liên quan hoặc mức đóng góp của từng đoạn. Cách này rẻ hơn người chấm nhưng có sai lệch riêng, nên kết quả cần được đối chiếu với người.

## 2.4. Đánh giá hệ thống RAG

### 2.4.1. Độ đo truy xuất

Độ đo truy xuất cần một tập câu hỏi kèm danh sách đoạn liên quan của mỗi câu, gọi là qrels (query relevance judgments) theo cách gọi của TREC. Với một câu hỏi $q$, hệ thống trả về danh sách đoạn đã xếp hạng; gọi $\mathrm{rel}_i$ là mức liên quan của đoạn ở vị trí $i$ và $R$ là tổng số đoạn liên quan trong qrels. Các độ đo dùng trong khóa luận:

Hit@k bằng 1 nếu trong $k$ đoạn đầu có ít nhất một đoạn liên quan, ngược lại bằng 0.

Recall@k là tỉ lệ đoạn liên quan nằm trong $k$ đoạn đầu:

$$\mathrm{Recall@}k = \frac{\left|\{\text{đoạn liên quan trong top-}k\}\right|}{R} \tag{2.2}$$

MRR@k (Mean Reciprocal Rank) lấy nghịch đảo thứ hạng của đoạn liên quan đầu tiên, bằng 0 nếu không có đoạn nào trong top-$k$, rồi lấy trung bình trên $|Q|$ câu hỏi [23]:

$$\mathrm{MRR@}k = \frac{1}{|Q|} \sum_{q \in Q} \frac{1}{\mathrm{rank}_q} \tag{2.3}$$

nDCG@k (normalized Discounted Cumulative Gain) [24] dùng được nhãn nhiều mức và phạt đoạn liên quan nằm ở vị trí thấp:

$$\mathrm{DCG@}k = \sum_{i=1}^{k} \frac{\mathrm{rel}_i}{\log_2(i+1)}, \qquad \mathrm{nDCG@}k = \frac{\mathrm{DCG@}k}{\mathrm{IDCG@}k} \tag{2.4}$$

trong đó IDCG@k là DCG@k của thứ tự lý tưởng. Công thức (2.4) dùng độ lợi tuyến tính $\mathrm{rel}_i$; một biến thể khác dùng $2^{\mathrm{rel}_i} - 1$, nên khi báo cáo cần ghi rõ biến thể nào.

Qrels thường không đầy đủ: người chấm không thể xem hết mọi đoạn trong corpus cho mỗi câu hỏi. Đoạn liên quan nhưng chưa được chấm bị tính là không liên quan, làm điểm của hệ thống tìm ra nó bị thấp đi. Buckley và Voorhees [25] đã phân tích ảnh hưởng của qrels thiếu; độ đo Judged@k (tỉ lệ đoạn trong top-$k$ đã được chấm) được báo kèm để biết mức độ thiếu.

### 2.4.2. Độ đo phần trả lời

Với đáp án ngắn, có thể so khớp trực tiếp bằng Exact Match và F1 theo token như bộ đánh giá của SQuAD [5]. Câu trả lời của trợ lý RAG thường dài và diễn đạt tự do, nên các độ đo này không phù hợp. Các công cụ như Ragas [7] dùng LLM để chấm:

- Độ đúng (answer correctness): so câu trả lời với đáp án tham chiếu.
- Độ trung thành (faithfulness): tỉ lệ khẳng định trong câu trả lời được các đoạn ngữ cảnh hỗ trợ; không cần đáp án tham chiếu.
- Độ liên quan của câu trả lời với câu hỏi.

Với câu hỏi không trả lời được, độ đo là tỉ lệ từ chối đúng; với câu trả lời được, cần đo cả tỉ lệ từ chối sai, vì một hệ thống từ chối mọi câu sẽ đạt điểm tuyệt đối ở độ đo thứ nhất.

### 2.4.3. Xây dựng bộ đánh giá

Có ba nguồn câu hỏi cho bộ đánh giá: câu hỏi thật của người dùng, câu hỏi do người viết, và câu hỏi do LLM sinh từ tài liệu. Sinh bằng LLM rẻ và nhanh; InPars [26] và Promptagator [27] đã dùng LLM sinh câu hỏi từ đoạn văn để tạo dữ liệu cho bài toán truy xuất. Nhược điểm là câu hỏi sinh ra có thể sai, mơ hồ, quá giống từ ngữ của đoạn nguồn, hoặc tự khai sai mức độ khó, nên cần lọc và người duyệt.

Bộ đánh giá nên có nhiều loại câu hỏi. MultiHop-RAG [28] gồm các câu cần ghép bằng chứng từ nhiều tài liệu; SQuAD 2.0 [5] thêm câu không trả lời được được viết sao cho trông giống câu trả lời được. Để giảm qrels thiếu, TREC dùng kỹ thuật pooling: gộp top-$k$ kết quả của nhiều hệ thống khác nhau rồi cho người chấm toàn bộ tập gộp.

Chất lượng nhãn thường được đo bằng độ đồng ý giữa hai người gán, ví dụ hệ số kappa của Cohen [29]:

$$\kappa = \frac{p_o - p_e}{1 - p_e} \tag{2.5}$$

trong đó $p_o$ là tỉ lệ hai người gán giống nhau và $p_e$ là tỉ lệ giống nhau kỳ vọng nếu gán ngẫu nhiên theo phân bố nhãn của từng người. Khi chỉ có một người gán, có thể đo độ ổn định của người đó bằng cách gán lại một mẫu sau một khoảng thời gian rồi tính cùng hệ số trên hai lần gán.

### 2.4.4. Thống kê trong đánh giá

Điểm trung bình trên một bộ câu hỏi chỉ là ước lượng; cần kèm khoảng tin cậy để biết sai khác giữa hai hệ thống có đáng kể không. Với một độ đo có giá trị $s_i$ trên $n$ câu hỏi độc lập, sai số chuẩn của trung bình là:

$$\mathrm{SE} = \sqrt{\frac{1}{n} \cdot \frac{1}{n}\sum_{i=1}^{n} (s_i - \bar{s})^2} \tag{2.6}$$

và khoảng tin cậy 95% xấp xỉ $\bar{s} \pm 1{,}96\,\mathrm{SE}$. Miller [30] chỉ ra rằng khi các câu hỏi không độc lập, ví dụ nhiều câu cùng sinh từ một tài liệu, công thức (2.6) đánh giá thấp sai số; cần tính sai số chuẩn theo nhóm (clustered standard error), trong đó các câu cùng nhóm được cộng phần dư lại trước khi bình phương. Khi so hai hệ thống trên cùng bộ câu hỏi, nên ghép cặp theo câu và tính sai số trên hiệu, vì cách này giảm phương sai đáng kể so với so hai trung bình độc lập [30].

Với tỉ lệ (độ đo 0/1) trên mẫu nhỏ hoặc tỉ lệ gần 0 hay 1, khoảng Wilson cho kết quả tốt hơn công thức xấp xỉ chuẩn. Để kiểm định hai hệ thống có khác nhau không, có thể dùng kiểm định ngẫu nhiên hóa (randomization test): lặp lại nhiều lần việc đổi ngẫu nhiên nhãn A/B của từng câu (hoặc từng nhóm) và xem hiệu quan sát được lớn tới mức nào so với phân bố thu được. Khi so nhiều cặp cùng lúc, ví dụ so từng cặp cụm chủ đề, p-value cần được hiệu chỉnh, chẳng hạn bằng phương pháp Holm [31].

## 2.5. Các nghiên cứu và giải pháp liên quan

Về chatbot RAG trong giáo dục, tại Khoa Công nghệ thông tin, Đại học Kinh tế Quốc dân, khóa luận của Phạm Thị Mai [8] xây dựng chatbot song ngữ tra cứu thông tin môn học trên đề cương học phần dạng DOCX, dùng TEI để sinh embedding, FAISS để lưu chỉ mục và LocalAI để chạy LLM cục bộ, có trích dẫn nguồn. Khóa luận của Nguyễn Minh Quang [9] xây dựng hệ thống điều hướng câu hỏi tới các AI agent khác nhau, dùng MongoDB, Express, React, Node.js và OpenAI. Cả hai khóa luận đánh giá bằng cách chạy thử các chức năng và một số câu hỏi, không có bộ đánh giá định lượng.

Về bộ đánh giá RAG, các bộ phổ biến như MS MARCO [23], BEIR [6], MultiHop-RAG [28], CRAG [32] và RGB [33] đều bằng tiếng Anh. Với tiếng Việt, UIT-ViQuAD [34] là bộ đọc hiểu trên Wikipedia tiếng Việt, không phải bộ đánh giá truy xuất trên một corpus chuyên ngành. Trong miền an toàn thông tin, các bộ như CyberMetric [35] và SecQA [36] là câu hỏi trắc nghiệm kiểm tra kiến thức của LLM, không gắn với một corpus để đo phần truy xuất.

Khoảng trống mà khóa luận hướng tới là kết hợp ba điều chưa có cùng lúc trong các giải pháp trên: câu hỏi tiếng Việt trên corpus tiếng Anh, miền an toàn ứng dụng web, và bộ đánh giá có bằng chứng ở mức đoạn cùng phương pháp thống kê khi báo cáo.

## 2.6. Công nghệ sử dụng

### 2.6.1. Ứng dụng web

- Next.js 16 [37] với App Router: framework React chạy cả giao diện và API trong một ứng dụng (monolith). Mỗi API là một route handler trong thư mục `src/app/api`.
- React 19 và TypeScript: thư viện giao diện và ngôn ngữ có kiểu tĩnh.
- Tailwind CSS 4 và các component theo phong cách shadcn dựa trên Radix UI: xây giao diện.
- next-intl [38]: đa ngôn ngữ, đường dẫn có tiền tố `/vi` hoặc `/en`.
- Auth.js (next-auth v5) [39]: đăng nhập bằng email và mật khẩu, phiên lưu bằng JWT; mật khẩu băm bằng bcrypt.
- Server-Sent Events (SSE): máy chủ gửi từng phần câu trả lời về trình duyệt ngay khi LLM sinh ra.

### 2.6.2. Dữ liệu và AI

- PostgreSQL 16 với extension pgvector [40]: lưu dữ liệu ứng dụng và vector embedding trong cùng một cơ sở dữ liệu; tìm kiếm vector bằng toán tử khoảng cách cosine, tìm kiếm từ khóa bằng kiểu `tsvector` của PostgreSQL [20].
- Prisma 6 [41]: ORM (Object-Relational Mapping) định nghĩa lược đồ và truy cập cơ sở dữ liệu từ TypeScript; các truy vấn vector viết bằng SQL thuần.
- LLM gọi qua SDK `openai`; mặc định là DeepSeek [42] với mô hình `deepseek-flash`, có thể đổi sang OpenAI `gpt-4o-mini` bằng biến môi trường.
- Máy chủ embedding và rerank viết bằng Python (`scripts/embed_server.py`), dùng thư viện sentence-transformers [43] để chạy hai mô hình ở mục 2.2.
- pdf-parse: trích văn bản từ file PDF.

### 2.6.3. Bộ đánh giá và triển khai

- Python 3.12, quản lý môi trường bằng uv: dự án bộ đánh giá riêng trong thư mục `Dataset/`.
- ranx [44] và ir-measures [45]: tính các độ đo truy xuất.
- Label Studio [46]: công cụ gán nhãn chạy trong Docker, dùng để duyệt câu hỏi và chấm đoạn.
- Claude (Anthropic) và Gemini (Google): LLM dùng để sinh câu hỏi ứng viên và chấm lọc tự động.
- Docker Compose: chạy ứng dụng và PostgreSQL bằng một lệnh.
- Git: quản lý mã nguồn; mỗi phiên bản bộ đánh giá ghi lại commit của ứng dụng mà nó dựa vào.

Bảng 2.1 tóm tắt các độ đo trình bày trong chương và loại dữ liệu mỗi độ đo cần.

Bảng 2.1. Các độ đo và dữ liệu cần thiết

| Độ đo | Đo phần | Cần dữ liệu |
|---|---|---|
| Hit@k, Recall@k, MRR@k | Truy xuất | Câu hỏi và qrels (nhãn nhị phân) |
| nDCG@k | Truy xuất | Câu hỏi và qrels nhiều mức |
| Judged@k | Mức đầy đủ của qrels | Qrels |
| Độ đúng | Trả lời | Đáp án tham chiếu |
| Độ trung thành | Trả lời | Các đoạn ngữ cảnh đã đưa cho LLM |
| Tỉ lệ từ chối đúng / sai | Trả lời | Nhãn câu trả lời được / không trả lời được |
| Kappa của Cohen | Chất lượng nhãn | Hai lần gán trên cùng mẫu |
