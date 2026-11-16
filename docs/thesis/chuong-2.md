<!--
Chương 2. Số trong [n] theo danh mục TÀI LIỆU THAM KHẢO trong khoa-luan-seclearn.docx (đã bỏ hai khóa luận NEU
và đánh lại [1]–[16]), không còn khớp tai-lieu-tham-khao.md. Hình đánh dấu [HÌNH] cần vẽ khi chuyển sang Word.
Bố cục chia theo khóa luận mẫu: 2.1 khái niệm và lý thuyết, 2.2 phương pháp và công cụ phân tích,
2.3 cơ sở dữ liệu và công cụ thiết kế, 2.4 ngôn ngữ, thư viện và môi trường cài đặt.
-->

# CHƯƠNG 2. CƠ SỞ LÝ THUYẾT

## 2.1. Tổng quan các khái niệm và lý thuyết liên quan

### 2.1.1. An toàn ứng dụng web và tài liệu OWASP

a, Các lớp lỗ hổng ứng dụng web phổ biến

Ứng dụng web nhận dữ liệu từ người dùng qua mạng, xử lý ở máy chủ, lưu vào cơ sở dữ liệu rồi trả kết quả về trình duyệt, và bước nào cũng có thể bị lợi dụng. Danh sách OWASP Top 10 năm 2021 [8] xếp các nhóm rủi ro phổ biến nhất, trong đó có kiểm soát truy cập bị phá vỡ, lỗi mật mã, injection, thiết kế không an toàn, cấu hình sai, thành phần có lỗ hổng, lỗi định danh và xác thực, lỗi toàn vẹn phần mềm và dữ liệu, thiếu ghi log và giám sát, và giả mạo yêu cầu phía máy chủ (SSRF). Câu hỏi của người mới học hay xoay quanh một số lớp lỗ hổng dưới đây, và đây cũng là những chủ đề mà trợ lý của SecLearn cần trả lời được:

- SQL injection là dạng injection điển hình: dữ liệu người dùng được ghép thẳng vào câu lệnh SQL nên kẻ tấn công đổi được ý nghĩa của câu lệnh. Cách phòng chính là dùng truy vấn có tham số thay cho việc nối chuỗi.
- Với Cross-Site Scripting (XSS), ứng dụng đưa dữ liệu người dùng ra trang HTML mà không mã hóa đúng ngữ cảnh, nên trình duyệt của nạn nhân chạy mã JavaScript của kẻ tấn công, chẳng hạn để đọc cookie phiên.
- Trong Cross-Site Request Forgery (CSRF), trang của kẻ tấn công khiến trình duyệt của nạn nhân gửi tới ứng dụng đích một yêu cầu kèm cookie phiên hợp lệ. Có thể phòng bằng token đồng bộ, double-submit cookie có ký hoặc thuộc tính `SameSite` của cookie.
- Lỗi xác thực và quản lý phiên gồm những trường hợp như mật khẩu lưu bằng hàm băm nhanh kiểu MD5, mã phiên dễ đoán hay phiên không bao giờ hết hạn.
- Lỗi phân quyền xảy ra khi người dùng truy cập được dữ liệu của người khác chỉ bằng cách đổi mã định danh trong URL, dạng lỗi thường gọi là IDOR.

b, OWASP Cheat Sheet Series và WSTG

OWASP (Open Worldwide Application Security Project) là một tổ chức phi lợi nhuận phát hành tài liệu mở về an toàn phần mềm, và em lấy hai bộ tài liệu của tổ chức này làm corpus cho SecLearn. OWASP Cheat Sheet Series [1] là tập các bản hướng dẫn ngắn, mỗi bản viết về một chủ đề; ví dụ Password Storage Cheat Sheet nêu nên dùng thuật toán băm mật khẩu nào và tham số tối thiểu của từng thuật toán. OWASP Web Security Testing Guide (WSTG) [2] là hướng dẫn kiểm thử, chia thành các nhóm như thu thập thông tin, cấu hình, định danh, xác thực, phân quyền, quản lý phiên và kiểm tra dữ liệu đầu vào; mỗi nhóm gồm các test case có mã dạng `WSTG-XXXX-NN`, ví dụ `WSTG-INFO-01`.

Cả hai bộ dùng giấy phép Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0), tức là được sao chép và tạo tác phẩm phái sinh nếu ghi nguồn và chia sẻ lại theo cùng giấy phép. Em chọn hai bộ này vì nội dung được cập nhật và dùng rộng rãi, và vì bộ đánh giá xây trên chúng có thể công bố lại.

### 2.1.2. Mô hình ngôn ngữ lớn (Large Language Model – LLM)

Mô hình ngôn ngữ lớn là mạng nơ-ron được huấn luyện trên lượng văn bản rất lớn để dự đoán token tiếp theo của một chuỗi. Các LLM hiện nay dựa trên kiến trúc Transformer [9], trong đó cơ chế attention cho mỗi vị trí trong chuỗi lấy thông tin từ mọi vị trí khác. Khi đủ lớn, LLM làm được nhiều tác vụ chỉ cần mô tả tác vụ và đưa vài ví dụ vào lời nhắc (prompt), không phải huấn luyện lại [10], nên trong SecLearn em dùng LLM cho cả việc trả lời, viết lại và dịch câu hỏi chỉ bằng các lời nhắc khác nhau.

Dùng LLM cho hỏi đáp chuyên ngành thì phải tính đến ba giới hạn:

- Mô hình có thể sinh nội dung sai nhưng diễn đạt trôi chảy, hiện tượng gọi là ảo giác (hallucination) [3], và người mới học khó tự nhận ra chỗ sai.
- Tri thức của mô hình dừng ở thời điểm huấn luyện, nên mô hình không biết các tài liệu mới hơn.
- Cửa sổ ngữ cảnh có hạn, nên không thể đưa cả 134 tài liệu vào một lời nhắc.

Tham số khi gọi LLM cũng ảnh hưởng tới kết quả, ví dụ nhiệt độ (temperature) càng thấp thì đầu ra càng ít ngẫu nhiên. Trong SecLearn, lời gọi sinh câu trả lời dùng nhiệt độ 0,2, còn những lời gọi cần đầu ra ổn định như viết lại câu hỏi thì dùng nhiệt độ 0.

### 2.1.3. Biểu diễn vector và xếp hạng lại (Embedding và Rerank)

a, Embedding và độ tương đồng

Embedding là cách biểu diễn một đoạn văn bản thành một vector số thực, sao cho các đoạn gần nghĩa nhau thì có vector gần nhau. Mô hình bi-encoder như Sentence-BERT [11] mã hóa câu hỏi và đoạn văn độc lập với nhau, nên các đoạn văn trong corpus có thể được mã hóa trước và lưu lại; khi có câu hỏi thì chỉ cần mã hóa câu hỏi rồi so với các vector đã lưu.

Độ tương đồng giữa vector câu hỏi $\mathbf{q}$ và vector đoạn văn $\mathbf{d}$ thường đo bằng cosine:

$$\cos(\mathbf{q}, \mathbf{d}) = \frac{\mathbf{q} \cdot \mathbf{d}}{\lVert \mathbf{q} \rVert \, \lVert \mathbf{d} \rVert} \tag{2.1}$$

trong đó $\mathbf{q} \cdot \mathbf{d}$ là tích vô hướng và $\lVert \cdot \rVert$ là chuẩn Euclid. Khi các vector đã được chuẩn hóa về độ dài 1 thì cosine bằng tích vô hướng. Giá trị nằm trong khoảng $[-1, 1]$, càng lớn thì hai đoạn càng gần nghĩa.

SecLearn dùng mô hình `bkai-foundation-models/vietnamese-bi-encoder` [12], một bi-encoder cho tiếng Việt sinh vector 768 chiều. Mô hình này yêu cầu văn bản tiếng Việt phải được tách từ trước, nên máy chủ embedding dùng thư viện pyvi [13] để tách từ. Mã nguồn của ứng dụng cũng hỗ trợ các nhà cung cấp embedding khác (OpenAI `text-embedding-3-small` 1536 chiều, MiniLM 384 chiều chạy cục bộ), chọn bằng biến môi trường.

b, Cross-encoder và rerank

Bi-encoder nhanh, nhưng vì câu hỏi và đoạn văn không "nhìn thấy" nhau khi mã hóa nên độ chính xác bị giới hạn. Cross-encoder đưa cả cặp (câu hỏi, đoạn văn) vào một mô hình Transformer và trả về một điểm liên quan [14]. Cách này chính xác hơn nhưng phải chạy mô hình cho từng cặp, nên chỉ dùng được trên một số ít ứng viên. Vì vậy các hệ thống truy xuất thường làm hai bước: bi-encoder (cùng với tìm kiếm từ khóa) lấy ra vài chục ứng viên, rồi cross-encoder xếp hạng lại (rerank) để chọn vài đoạn tốt nhất (Hình 2.1).

[HÌNH: hinh/2-01-bi-cross-encoder.png] Hình 2.1. Bi-encoder và cross-encoder: bi-encoder mã hóa câu hỏi và đoạn văn riêng rồi so vector; cross-encoder đọc cả cặp và trả một điểm.

SecLearn dùng cross-encoder `BAAI/bge-reranker-v2-m3` [15], một mô hình đa ngôn ngữ, hợp với trường hợp câu hỏi bằng tiếng Việt còn tài liệu bằng tiếng Anh. Điểm thô của mô hình được đưa qua hàm sigmoid cho nằm trong khoảng $[0, 1]$, và ứng dụng đặt ngưỡng liên quan trên thang điểm này.

### 2.1.4. Sinh tăng cường truy xuất (Retrieval-Augmented Generation – RAG)

a, Kiến trúc RAG cơ bản

RAG được Lewis và cộng sự đề xuất năm 2020 [4]. Thay vì để mô hình sinh câu trả lời chỉ từ tham số đã học, hệ thống truy xuất các đoạn văn liên quan từ một kho tài liệu ngoài rồi đưa vào đầu vào của mô hình sinh. Một hệ thống RAG gồm ba giai đoạn (Hình 2.2) [16]:

1. Lập chỉ mục (indexing): tài liệu được trích văn bản, cắt thành đoạn (chunk), mã hóa thành vector và lưu vào cơ sở dữ liệu vector.
2. Truy xuất (retrieval): với mỗi câu hỏi, hệ thống tìm các đoạn liên quan nhất.
3. Sinh (generation): các đoạn tìm được được ghép vào lời nhắc cùng câu hỏi, và LLM sinh câu trả lời dựa trên chúng.

[HÌNH: hinh/2-02-kien-truc-rag.png] Hình 2.2. Kiến trúc RAG cơ bản: lập chỉ mục, truy xuất, sinh.

So với dùng LLM trực tiếp, RAG có ưu điểm là câu trả lời có căn cứ để kiểm tra, và muốn cập nhật tri thức thì chỉ cần nạp thêm tài liệu, không phải huấn luyện lại mô hình. Đổi lại, chất lượng câu trả lời phụ thuộc vào việc truy xuất có lấy đúng đoạn hay không: nếu đoạn đúng không đến được LLM thì mô hình hoặc trả lời thiếu, hoặc dùng kiến thức riêng.

b, Chia đoạn (Chunking)

Tài liệu dài phải được cắt thành đoạn trước khi mã hóa, vì mô hình embedding có giới hạn độ dài đầu vào, và một vector cho cả tài liệu thì không đại diện được cho từng ý cụ thể. Cách cắt đơn giản nhất là cắt theo số ký tự cố định, nhưng cách này dễ cắt ngang câu, làm đoạn mất nghĩa ở đầu hoặc cuối. Cách tốt hơn là cắt tại ranh giới câu, bắt đầu đoạn mới tại tiêu đề mục, và cho hai đoạn liên tiếp chồng lấp một phần (overlap) để ý nằm ở ranh giới không bị mất. Kích thước đoạn là một sự đánh đổi: đoạn nhỏ thì vector sát nghĩa hơn nhưng thiếu ngữ cảnh, đoạn lớn thì ngược lại.

c, Truy xuất lai và kỹ thuật cải thiện truy vấn

Tìm kiếm vector làm tốt khi câu hỏi diễn đạt khác từ ngữ trong tài liệu, nhưng có thể bỏ sót các từ khóa hiếm như tên chuẩn, mã CVE hay tên tham số. Tìm kiếm từ khóa, ví dụ theo mô hình BM25 [19] hoặc tìm kiếm toàn văn của PostgreSQL [20], lại bắt tốt các từ khóa đó. Truy xuất lai (hybrid retrieval) gộp ứng viên của cả hai cách rồi xếp hạng lại.

Câu hỏi của người dùng cũng có thể được biến đổi trước khi đem đi tìm:

- Viết lại câu hỏi (query rewriting): trong hội thoại, câu hỏi nối tiếp như "còn cách thứ hai thì sao?" không tự đứng được, nên LLM viết lại thành một câu hỏi đầy đủ dựa trên lịch sử hội thoại.
- Dịch câu hỏi: khi câu hỏi và tài liệu khác ngôn ngữ, hệ thống tìm thêm bằng bản dịch của câu hỏi sang ngôn ngữ của tài liệu. SecLearn cần kỹ thuật này vì người học hỏi bằng tiếng Việt còn tài liệu OWASP viết bằng tiếng Anh.
- HyDE (Hypothetical Document Embeddings) [21]: LLM viết một đoạn văn giả định trả lời câu hỏi, rồi dùng đoạn đó để tìm. Đoạn giả định thường giống văn phong của tài liệu hơn là câu hỏi ngắn, nên tìm được những đoạn liên quan mà câu hỏi gốc bỏ sót.

d, Kiểm soát chất lượng câu trả lời

RAG không tự đảm bảo câu trả lời trung thành với tài liệu, vì LLM vẫn có thể thêm ý không có trong các đoạn được đưa vào. Một số kỹ thuật thường dùng để hạn chế việc này:

- Yêu cầu trích dẫn: lời nhắc đánh số các đoạn và yêu cầu mô hình gắn số đoạn vào từng ý, nhờ vậy người đọc đối chiếu được.
- Ngưỡng liên quan và từ chối: nếu không có đoạn nào vượt ngưỡng thì hệ thống từ chối trả lời. Biết từ chối cũng là một phần của chất lượng, như SQuAD 2.0 [5] đã chỉ ra khi thêm câu hỏi không trả lời được vào bộ đánh giá.
- Kiểm tra trích dẫn sau khi trả lời: so từng mệnh đề có trích dẫn với đoạn được trích để xem đoạn đó có thực sự hỗ trợ mệnh đề không.
- Dùng LLM làm người chấm (LLM-as-a-judge) [22]: hỏi một LLM để chấm mức liên quan hoặc mức đóng góp của từng đoạn. Cách này rẻ hơn thuê người chấm nhưng có sai lệch riêng, nên kết quả cần được đối chiếu với người.

### 2.1.5. Các nghiên cứu và giải pháp liên quan

Về bộ đánh giá RAG, các bộ phổ biến như MS MARCO [23], BEIR [6], MultiHop-RAG [28], CRAG [32] và RGB [33] đều bằng tiếng Anh. Với tiếng Việt có UIT-ViQuAD [34], nhưng đó là bộ đọc hiểu trên Wikipedia tiếng Việt, không phải bộ đánh giá truy xuất trên một corpus chuyên ngành. Trong miền an toàn thông tin, các bộ như CyberMetric [35] và SecQA [36] là câu hỏi trắc nghiệm kiểm tra kiến thức của LLM, không gắn với một corpus nào để đo phần truy xuất.

Như vậy, khóa luận nhắm vào chỗ mà các giải pháp trên chưa có cùng lúc ba điều: câu hỏi tiếng Việt trên corpus tiếng Anh, miền an toàn ứng dụng web, và bộ đánh giá có bằng chứng ở mức đoạn kèm phương pháp thống kê khi báo cáo.

## 2.2. Giới thiệu về phương pháp và công cụ phân tích hệ thống

### 2.2.1. Phương pháp phát triển hệ thống

SecLearn được xây dựng theo kiến trúc RAG ở mục 2.1.4, với một pipeline gồm hai luồng. Luồng nạp tài liệu bắt đầu từ file PDF mà quản trị viên tải lên: hệ thống trích văn bản, chia đoạn, tạo embedding cho từng đoạn rồi lưu đoạn cùng vector và chỉ mục từ khóa vào cơ sở dữ liệu. Luồng trả lời bắt đầu từ câu hỏi của người học: hệ thống lập kế hoạch truy vấn (viết lại và dịch câu hỏi), truy xuất lai, xếp hạng lại và lọc theo ngưỡng, sau đó LLM sinh câu trả lời có trích dẫn và hệ thống kiểm tra lại các trích dẫn đó. Với cách tổ chức này, muốn cập nhật tri thức cho trợ lý thì chỉ cần nạp thêm tài liệu, còn từng thành phần của pipeline có thể thay đổi rồi đo riêng. Thiết kế chi tiết của từng bước nằm ở mục 3.5.

Em phát triển ứng dụng theo vòng lặp. Mỗi lỗi phát hiện khi dùng thử được ghi vào nhật ký lỗi của dự án cùng nguyên nhân và cách sửa, rồi được sửa và kiểm tra lại. Phần bộ đánh giá được chia thành các ticket có tiêu chí hoàn thành rõ ràng, còn các quyết định thiết kế quan trọng được ghi thành ADR (Architecture Decision Record) để sau này còn biết vì sao chọn như vậy. Tham số của pipeline chỉ được chỉnh trên tập dev, còn tập test chỉ dùng để báo cáo, để hệ thống không bị chỉnh theo chính bộ dữ liệu dùng để đánh giá nó.

### 2.2.2. Phương pháp đánh giá hệ thống RAG

a, Độ đo truy xuất

Độ đo truy xuất cần một tập câu hỏi kèm danh sách đoạn liên quan của mỗi câu, gọi là qrels (query relevance judgments) theo cách gọi của TREC. Với một câu hỏi $q$, hệ thống trả về danh sách đoạn đã xếp hạng; gọi $\mathrm{rel}_i$ là mức liên quan của đoạn ở vị trí $i$ và $R$ là tổng số đoạn liên quan trong qrels. Các độ đo dùng trong khóa luận như sau.

Hit@k bằng 1 nếu trong $k$ đoạn đầu có ít nhất một đoạn liên quan, ngược lại bằng 0.

Recall@k là tỉ lệ đoạn liên quan nằm trong $k$ đoạn đầu:

$$\mathrm{Recall@}k = \frac{\left|\{\text{đoạn liên quan trong top-}k\}\right|}{R} \tag{2.2}$$

MRR@k (Mean Reciprocal Rank) lấy nghịch đảo thứ hạng của đoạn liên quan đầu tiên, bằng 0 nếu không có đoạn nào trong top-$k$, rồi lấy trung bình trên $|Q|$ câu hỏi [23]:

$$\mathrm{MRR@}k = \frac{1}{|Q|} \sum_{q \in Q} \frac{1}{\mathrm{rank}_q} \tag{2.3}$$

nDCG@k (normalized Discounted Cumulative Gain) [24] dùng được nhãn nhiều mức và phạt đoạn liên quan nằm ở vị trí thấp:

$$\mathrm{DCG@}k = \sum_{i=1}^{k} \frac{\mathrm{rel}_i}{\log_2(i+1)}, \qquad \mathrm{nDCG@}k = \frac{\mathrm{DCG@}k}{\mathrm{IDCG@}k} \tag{2.4}$$

trong đó IDCG@k là DCG@k của thứ tự lý tưởng. Công thức (2.4) dùng độ lợi tuyến tính $\mathrm{rel}_i$; một biến thể khác dùng $2^{\mathrm{rel}_i} - 1$, nên khi báo cáo cần ghi rõ biến thể nào.

Qrels thường không đầy đủ, vì người chấm không thể xem hết mọi đoạn trong corpus cho mỗi câu hỏi. Đoạn liên quan mà chưa được chấm sẽ bị tính là không liên quan, làm điểm của hệ thống tìm ra nó bị thấp đi. Buckley và Voorhees [25] đã phân tích ảnh hưởng của qrels thiếu; độ đo Judged@k (tỉ lệ đoạn trong top-$k$ đã được chấm) được báo kèm để biết qrels thiếu tới mức nào.

b, Độ đo phần trả lời

Với đáp án ngắn thì có thể so khớp trực tiếp bằng Exact Match và F1 theo token như bộ đánh giá của SQuAD [5]. Câu trả lời của trợ lý RAG thường dài và diễn đạt tự do, nên các độ đo này không phù hợp. Các công cụ như Ragas [7] dùng LLM để chấm:

- Độ đúng (answer correctness): so câu trả lời với đáp án tham chiếu.
- Độ trung thành (faithfulness): tỉ lệ khẳng định trong câu trả lời được các đoạn ngữ cảnh hỗ trợ; độ đo này không cần đáp án tham chiếu.
- Độ liên quan của câu trả lời với câu hỏi.

Với câu hỏi không trả lời được, độ đo là tỉ lệ từ chối đúng. Với câu trả lời được thì cần đo cả tỉ lệ từ chối sai, vì một hệ thống từ chối mọi câu sẽ đạt điểm tuyệt đối ở độ đo thứ nhất.

c, Xây dựng bộ đánh giá

Câu hỏi cho bộ đánh giá có thể lấy từ ba nguồn: câu hỏi thật của người dùng, câu hỏi do người viết, và câu hỏi do LLM sinh từ tài liệu. Sinh bằng LLM thì rẻ và nhanh; InPars [26] và Promptagator [27] đã dùng LLM sinh câu hỏi từ đoạn văn để tạo dữ liệu cho bài toán truy xuất. Nhược điểm là câu hỏi sinh ra có thể sai, mơ hồ, quá giống từ ngữ của đoạn nguồn, hoặc tự khai sai mức độ khó, nên cần lọc và có người duyệt.

Bộ đánh giá nên có nhiều loại câu hỏi. MultiHop-RAG [28] gồm các câu phải ghép bằng chứng từ nhiều tài liệu; SQuAD 2.0 [5] thêm các câu không trả lời được, viết sao cho trông giống câu trả lời được. Để giảm qrels thiếu, TREC dùng kỹ thuật pooling: gộp top-$k$ kết quả của nhiều hệ thống khác nhau rồi cho người chấm toàn bộ tập gộp.

Chất lượng nhãn thường được đo bằng độ đồng ý giữa hai người gán, ví dụ hệ số kappa của Cohen [29]:

$$\kappa = \frac{p_o - p_e}{1 - p_e} \tag{2.5}$$

trong đó $p_o$ là tỉ lệ hai người gán giống nhau và $p_e$ là tỉ lệ giống nhau kỳ vọng nếu gán ngẫu nhiên theo phân bố nhãn của từng người. Khi chỉ có một người gán, có thể đo độ ổn định của người đó bằng cách gán lại một mẫu sau một khoảng thời gian rồi tính cùng hệ số trên hai lần gán.

d, Thống kê trong đánh giá

Điểm trung bình trên một bộ câu hỏi chỉ là ước lượng, nên cần kèm khoảng tin cậy để biết sai khác giữa hai hệ thống có đáng kể không. Với một độ đo có giá trị $s_i$ trên $n$ câu hỏi độc lập, sai số chuẩn của trung bình là:

$$\mathrm{SE} = \sqrt{\frac{1}{n} \cdot \frac{1}{n}\sum_{i=1}^{n} (s_i - \bar{s})^2} \tag{2.6}$$

và khoảng tin cậy 95% xấp xỉ $\bar{s} \pm 1{,}96\,\mathrm{SE}$. Miller [30] chỉ ra rằng khi các câu hỏi không độc lập, ví dụ nhiều câu cùng sinh từ một tài liệu, công thức (2.6) đánh giá thấp sai số; lúc đó cần tính sai số chuẩn theo nhóm (clustered standard error), trong đó các câu cùng nhóm được cộng phần dư lại trước khi bình phương. Khi so hai hệ thống trên cùng bộ câu hỏi, nên ghép cặp theo câu và tính sai số trên hiệu, vì cách này giảm phương sai đáng kể so với so hai trung bình độc lập [30].

Với tỉ lệ (độ đo 0/1) trên mẫu nhỏ, hoặc tỉ lệ gần 0 hay 1, khoảng Wilson cho kết quả tốt hơn công thức xấp xỉ chuẩn. Muốn kiểm định hai hệ thống có khác nhau không thì có thể dùng kiểm định ngẫu nhiên hóa (randomization test): đổi ngẫu nhiên nhãn A/B của từng câu (hoặc từng nhóm) nhiều lần, rồi xem hiệu quan sát được lớn tới mức nào so với phân bố thu được. Khi so nhiều cặp cùng lúc, ví dụ so từng cặp cụm chủ đề, p-value cần được hiệu chỉnh, chẳng hạn bằng phương pháp Holm [31].

Bảng 2.1 tóm tắt các độ đo trình bày trong mục này và loại dữ liệu mỗi độ đo cần.

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

### 2.2.3. Giới thiệu về UML

UML (Unified Modeling Language – Ngôn ngữ mô hình hóa thống nhất) là ngôn ngữ mô hình hóa chuẩn trong phát triển phần mềm, dùng các biểu đồ để mô tả hệ thống trước khi lập trình. UML mô tả được cả cấu trúc tĩnh lẫn hành vi động của hệ thống, nên dùng được từ lúc phân tích yêu cầu, thiết kế chức năng cho tới lúc mô tả cách các thành phần phần mềm phối hợp với nhau. Với những yêu cầu phức tạp, nhìn biểu đồ dễ theo dõi hơn đọc một đoạn mô tả bằng lời.

Ở Chương 3, em dùng ba loại biểu đồ UML để mô hình hóa SecLearn:

- Biểu đồ use case (Use Case Diagram) mô tả các chức năng của hệ thống và những tác nhân dùng chúng, gồm khách, người học và quản trị viên, với các chức năng như hỏi trợ lý, xem bài học, tải tài liệu PDF và quản lý người dùng.
- Biểu đồ hoạt động (Activity Diagram) mô tả từng bước xử lý của một chức năng, kể cả các nhánh rẽ. Em dùng loại biểu đồ này cho hai luồng chính là hỏi trợ lý và nạp tài liệu, vì hai luồng này có nhiều bước nối tiếp nhau và có nhánh rẽ, ví dụ từ chối khi không có đoạn đủ liên quan, hoặc đánh dấu tài liệu nạp thất bại.
- Biểu đồ tuần tự (Sequence Diagram) mô tả thứ tự các thông điệp trao đổi giữa các thành phần theo thời gian, qua đó cho thấy giao diện, các route API, pipeline RAG, cơ sở dữ liệu và LLM phối hợp với nhau ra sao khi người dùng gửi một câu hỏi.

Riêng thiết kế cơ sở dữ liệu thì được vẽ bằng sơ đồ thực thể – quan hệ, giới thiệu ở mục 2.3.5.

## 2.3. Lý thuyết về cơ sở dữ liệu và công cụ thiết kế

### 2.3.1. Cơ sở dữ liệu quan hệ và PostgreSQL

Cơ sở dữ liệu quan hệ lưu dữ liệu thành các bảng gồm hàng và cột, các bảng nối với nhau qua khóa chính và khóa ngoại, và dữ liệu được truy vấn bằng SQL. Nhờ các ràng buộc và giao dịch, mô hình này giữ được tính toàn vẹn của dữ liệu, nên hợp với phần dữ liệu nghiệp vụ của SecLearn như người dùng, hội thoại, tin nhắn, tài liệu và bài học, vốn liên quan chặt với nhau. Ví dụ, khi xóa một tài liệu thì mọi đoạn văn của tài liệu đó cũng phải bị xóa theo.

PostgreSQL là hệ quản trị cơ sở dữ liệu quan hệ mã nguồn mở. Ngoài các tính năng quan hệ, PostgreSQL hỗ trợ kiểu JSON và cơ chế extension để bổ sung kiểu dữ liệu và toán tử mới. Nhờ extension, em lưu được cả dữ liệu nghiệp vụ, vector embedding và chỉ mục từ khóa trong một cơ sở dữ liệu, không phải chạy thêm một hệ lưu trữ vector riêng.

### 2.3.2. Cơ sở dữ liệu vector và pgvector

Cơ sở dữ liệu vector là loại cơ sở dữ liệu dùng để lưu và truy vấn vector embedding. Chức năng chính của nó là tìm kiếm tương đồng (similarity search): nhận vào vector của câu hỏi và trả về các vector gần nhất theo một hàm khoảng cách, chẳng hạn khoảng cách cosine. Trong hệ thống RAG, đây là bước tìm ra những đoạn văn gần nghĩa với câu hỏi nhất trong corpus đã lập chỉ mục.

pgvector [40] là extension của PostgreSQL thêm kiểu dữ liệu `vector` và các toán tử khoảng cách, trong đó toán tử `<=>` trả về khoảng cách cosine giữa hai vector. pgvector hỗ trợ tìm kiếm chính xác, tức so câu hỏi với mọi vector, và tìm kiếm gần đúng qua chỉ mục HNSW hoặc IVFFlat. Chỉ mục gần đúng chạy nhanh hơn trên tập dữ liệu rất lớn nhưng có thể bỏ sót một phần kết quả. Corpus hiện có 5.915 đoạn nên SecLearn dùng tìm kiếm chính xác; kết quả truy xuất vì thế không chịu sai số của chỉ mục gần đúng, và bộ đánh giá đo đúng chất lượng của mô hình embedding.

### 2.3.3. Tìm kiếm toàn văn trong PostgreSQL

Phần tìm kiếm từ khóa trong truy xuất lai dùng tính năng tìm kiếm toàn văn có sẵn của PostgreSQL [20]. Hàm `to_tsvector` chuyển một đoạn văn thành giá trị kiểu `tsvector`, là danh sách các từ đã được đưa về dạng gốc (ví dụ "passwords" và "password" về cùng một dạng) và đã bỏ từ dừng. Câu hỏi cũng được chuyển thành truy vấn kiểu `tsquery` theo cách tương tự, rồi PostgreSQL so khớp hai bên và xếp hạng kết quả theo mức trùng khớp. Cột `tsvector` của mỗi đoạn được tính một lần khi đoạn được tạo và được đánh chỉ mục GIN (Generalized Inverted Index), một loại chỉ mục đảo cho phép tìm nhanh các đoạn chứa một từ khóa mà không phải duyệt cả bảng.

### 2.3.4. Cấu trúc dữ liệu lưu trữ của hệ thống

Dữ liệu tri thức của SecLearn được lưu ở hai mức. Ở mức tài liệu, mỗi file PDF tải lên ứng với một bản ghi gồm tiêu đề, tên file, đường dẫn lưu trữ, nội dung đã chuyển sang Markdown, chế độ hiển thị và trạng thái xử lý (đang chờ, sẵn sàng hoặc thất bại). Ở mức đoạn, mỗi tài liệu được chia thành nhiều đoạn, và mỗi đoạn lưu nội dung, số thứ tự trong tài liệu, vector embedding 768 chiều, cột `tsvector` cho tìm kiếm từ khóa, số token và một trường metadata dạng JSON. Trường metadata ghi vị trí ký tự bắt đầu và kết thúc của đoạn trên văn bản Markdown gốc, mã băm sha256 của văn bản đó và phiên bản của bộ chia đoạn. Tiêu đề mục thì không nằm trong metadata mà được gắn thẳng vào đầu nội dung đoạn, để đoạn không bị tách khỏi ngữ cảnh của mục chứa nó.

Vì đoạn luôn gắn với tài liệu nguồn và vị trí của nó, mỗi trích dẫn `[n]` trong câu trả lời truy ngược được về đúng đoạn và đúng tài liệu, còn bộ đánh giá so khớp được bằng chứng theo vị trí ký tự mà không phụ thuộc vào cách chia đoạn.

### 2.3.5. Công cụ thiết kế dữ liệu

Lược đồ cơ sở dữ liệu của SecLearn được định nghĩa bằng Prisma [41] trong file `prisma/schema.prisma`, trong đó mỗi model ứng với một bảng và quan hệ giữa các model được khai báo tường minh. Mỗi lần đổi lược đồ được ghi thành một migration SQL trong thư mục `prisma/migrations`, nên trên máy khác cũng dựng lại được đúng cấu trúc cơ sở dữ liệu đó. Những phần Prisma chưa hỗ trợ trực tiếp, như cột `vector`, cột `tsvector` và chỉ mục GIN, cũng được khai báo trong các migration này.

Sơ đồ thực thể – quan hệ và các biểu đồ UML trong báo cáo được em vẽ bằng Mermaid, công cụ mô tả sơ đồ bằng văn bản rồi sinh ra hình. Mã nguồn các sơ đồ nằm trong thư mục `docs/thesis/hinh/mermaid` cùng với mã nguồn dự án, nên khi thiết kế thay đổi thì chỉ cần sửa phần văn bản rồi sinh lại hình.

## 2.4. Ngôn ngữ lập trình, thư viện và môi trường cài đặt chương trình

### 2.4.1. Ngôn ngữ lập trình

Ứng dụng SecLearn được viết bằng TypeScript, tức JavaScript có thêm kiểu tĩnh. Khai báo kiểu giúp bắt được nhiều lỗi ngay lúc biên dịch, và điều này có ích vì dữ liệu trong ứng dụng đi qua nhiều tầng: giao diện, API, pipeline RAG rồi tới cơ sở dữ liệu. Giao diện và máy chủ cùng dùng một ngôn ngữ nên các kiểu dữ liệu dùng chung được cho cả hai phía, không phải định nghĩa lại.

Em dùng Python cho hai phần việc. Phần đầu là máy chủ embedding và rerank, vì các mô hình embedding và cross-encoder được hỗ trợ đầy đủ nhất qua thư viện Python. Phần thứ hai là dự án bộ đánh giá trong thư mục `Dataset/`, chạy Python 3.12 và quản lý môi trường bằng uv, vì các thư viện tính độ đo truy xuất và xử lý dữ liệu đều có sẵn trên Python.

### 2.4.2. Thư viện và framework

Phần ứng dụng web dùng các thư viện và framework sau:

- Next.js 16 [37] với App Router, một framework React chạy cả giao diện và API trong cùng một ứng dụng (monolith); mỗi API là một route handler trong thư mục `src/app/api`.
- React 19 để xây giao diện, cùng với Tailwind CSS 4 và các component theo phong cách shadcn dựa trên Radix UI.
- next-intl [38] cho phần đa ngôn ngữ, với đường dẫn có tiền tố `/vi` hoặc `/en`.
- Auth.js (next-auth v5) [39] cho đăng nhập bằng email và mật khẩu; phiên lưu bằng JWT và mật khẩu băm bằng bcrypt.
- Server-Sent Events (SSE) để máy chủ gửi từng phần câu trả lời về trình duyệt ngay khi LLM sinh ra, người dùng không phải đợi cả câu trả lời xong mới thấy.

Phần dữ liệu và AI dùng:

- Prisma 6 [41], một ORM (Object-Relational Mapping) để định nghĩa lược đồ và truy cập cơ sở dữ liệu từ TypeScript; các truy vấn vector và tìm kiếm toàn văn thì viết bằng SQL thuần.
- SDK `openai` để gọi LLM, mặc định là DeepSeek [42] với mô hình `deepseek-flash`; có thể đổi sang OpenAI `gpt-4o-mini` bằng biến môi trường.
- Thư viện sentence-transformers [43], được máy chủ embedding và rerank (`scripts/embed_server.py`) dùng để chạy hai mô hình ở mục 2.1.3.
- pdf-parse để trích văn bản từ các file PDF mà quản trị viên tải lên.

Bộ đánh giá dùng thêm ranx [44] và ir-measures [45] để tính các độ đo truy xuất, và hai LLM là Claude (Anthropic) và Gemini (Google) để sinh câu hỏi ứng viên và chấm lọc tự động.

### 2.4.3. Môi trường triển khai

Hệ thống được đóng gói bằng Docker Compose: ứng dụng Next.js và PostgreSQL 16 có sẵn pgvector chạy trong hai container riêng và được khởi động bằng một lệnh. Nhờ vậy môi trường chạy giống nhau trên các máy, và cơ sở dữ liệu được tách khỏi hệ điều hành của máy chủ. Máy chủ embedding và rerank chạy riêng bằng Python để dùng được GPU khi máy có. Cấu hình của hệ thống, kể cả các khóa API, đặt trong file `.env` và được kiểm tra bằng lược đồ zod khi ứng dụng khởi động; nếu có giá trị sai, ứng dụng dừng ngay kèm thông báo rõ ràng thay vì gây ra lỗi khó hiểu về sau.

### 2.4.4. Công cụ hỗ trợ phát triển

Trong quá trình phát triển, em dùng các công cụ sau:

- Git để quản lý mã nguồn và theo dõi thay đổi. Mỗi phiên bản bộ đánh giá ghi lại commit của ứng dụng mà nó dựa vào, nên kết quả đo luôn tái lập được.
- Label Studio [46], công cụ gán nhãn chạy trong Docker, để duyệt từng câu hỏi và chấm mức liên quan của các đoạn khi xây dựng bộ đánh giá.
- ESLint, trình biên dịch TypeScript và trình chạy test có sẵn của Node.js để kiểm tra mã, kiểm tra kiểu và chạy kiểm thử đơn vị; ba bước này được gộp trong lệnh `npm run check`.
