<!--
Chương 1. Số trong [n] là số thứ tự tài liệu tham khảo theo IEEE, xem tai-lieu-tham-khao.md.
Chỗ [ngoặc vuông có chữ] là phần phải điền hoặc chốt sau.
-->

# CHƯƠNG 1. TỔNG QUAN ĐỀ TÀI

## 1.1. Lý do chọn đề tài

Người học an toàn ứng dụng web thường bắt đầu từ các tài liệu của OWASP. Hai bộ được dùng nhiều nhất là OWASP Cheat Sheet Series [1], gồm các bản hướng dẫn ngắn theo từng chủ đề như lưu mật khẩu, quản lý phiên hay chống CSRF, và OWASP Web Security Testing Guide (WSTG) [2], hướng dẫn kiểm thử theo từng test case. Các tài liệu này viết bằng tiếng Anh, dùng nhiều thuật ngữ chuyên ngành và có tổng dung lượng rất lớn: riêng phần đã nạp vào SecLearn gồm 134 tài liệu, cắt ra được 5.915 đoạn văn bản. Với sinh viên quen đọc tiếng Việt, việc tìm đúng đoạn trả lời cho một câu hỏi cụ thể trong khối tài liệu đó mất nhiều thời gian.

Các chatbot đa dụng dựa trên mô hình ngôn ngữ lớn (Large Language Model, LLM) trả lời được câu hỏi tiếng Việt về bảo mật, nhưng có hai hạn chế với mục đích học tập. Thứ nhất, người hỏi không biết câu trả lời dựa vào tài liệu nào, nên không tự kiểm lại được. Thứ hai, LLM có thể sinh ra nội dung nghe hợp lý nhưng sai, hiện tượng thường gọi là ảo giác (hallucination) [3]. Trong an toàn thông tin, một lời khuyên sai, ví dụ một tham số băm mật khẩu không đúng, có thể dẫn tới lỗ hổng thật trong sản phẩm của người học.

Kỹ thuật sinh tăng cường truy xuất (Retrieval-Augmented Generation, RAG) [4] giải quyết một phần vấn đề này: trước khi sinh câu trả lời, hệ thống tìm các đoạn tài liệu liên quan và đưa chúng cho LLM làm căn cứ. Khi mỗi ý trong câu trả lời được gắn với đoạn nguồn, người học có thể mở đoạn đó ra đối chiếu. Tuy vậy, áp dụng RAG cho SecLearn gặp một khó khăn riêng: câu hỏi bằng tiếng Việt còn tài liệu bằng tiếng Anh, nên bước tìm kiếm phải làm việc xuyên ngôn ngữ.

Vấn đề thứ hai là đánh giá. Một hệ thống RAG có nhiều tham số (cách cắt đoạn, mô hình embedding, có rerank hay không, ngưỡng loại đoạn kém liên quan, có dịch câu hỏi hay không), và mỗi thay đổi có thể làm tốt lên ở loại câu hỏi này nhưng kém đi ở loại khác. Chạy thử vài câu hỏi rồi xem kết quả không đủ để biết thay đổi nào thực sự có lợi. Các bộ dữ liệu đánh giá phổ biến như SQuAD 2.0 [5] hay BEIR [6] đều bằng tiếng Anh và không thuộc miền an toàn ứng dụng web. Khi thực hiện khóa luận, em không tìm thấy bộ đánh giá RAG tiếng Việt nào cho miền này, nên phải tự xây dựng.

Từ hai vấn đề trên, em chọn đề tài "Xây dựng trợ lý ảo hỏi đáp an toàn ứng dụng web dựa trên RAG và bộ dữ liệu đánh giá tiếng Việt", với sản phẩm là ứng dụng SecLearn và bộ đánh giá đi kèm.

## 1.2. Mục tiêu đề tài

### 1.2.1. Mục tiêu về sản phẩm

Khóa luận xây dựng SecLearn, một ứng dụng web giúp người mới học an toàn thông tin, với các mục tiêu sau:

- Trợ lý ảo nhận câu hỏi tiếng Việt (hoặc tiếng Anh) và chỉ trả lời dựa trên các tài liệu OWASP đã nạp. Mỗi ý trong câu trả lời có số trích dẫn dạng `[n]` trỏ về đoạn nguồn. Người dùng xem được các đoạn đã dùng trong một panel nguồn, kèm điểm liên quan và kết quả kiểm tra trích dẫn.
- Khi không có đoạn tài liệu nào đủ liên quan, trợ lý trả lời rằng tài liệu không đề cập, thay vì dùng kiến thức riêng của LLM.
- Khách chưa đăng nhập được hỏi thử 10 câu; người đã đăng nhập được lưu lịch sử hội thoại.
- Bài học song ngữ Việt – Anh và chức năng Ôn tập sinh câu hỏi trắc nghiệm bằng LLM, cho phép làm bài, chấm điểm và xem lại lịch sử.
- Trang quản trị cho phép quản lý người dùng, tải tài liệu PDF lên để hệ thống tự cắt đoạn và lập chỉ mục, và quản lý bài học.

### 1.2.2. Mục tiêu về nghiên cứu và đánh giá

Mục tiêu thứ hai là đo được chất lượng của trợ lý một cách lặp lại được. Cụ thể:

- Xây dựng bộ đánh giá tiếng Việt khoảng 1.475 câu hỏi, chia theo bảy mức từ tra cứu một đoạn (L1) đến hội thoại nhiều lượt (L7), trong đó có các câu không trả lời được từ tài liệu (L6). Mỗi câu có đáp án tham chiếu và bằng chứng được đánh dấu bằng vị trí ký tự trên tài liệu gốc (gold span).
- Chọn trước con số báo cáo chính, cách tính sai số và cách so sánh hai cấu hình, trước khi đo lần đầu.
- Dùng bộ đánh giá để đo phần truy xuất và khả năng từ chối của SecLearn, và so sánh một số cấu hình của pipeline RAG.

## 1.3. Đối tượng và phạm vi nghiên cứu

### 1.3.1. Đối tượng nghiên cứu

Đối tượng nghiên cứu của khóa luận gồm:

- Kỹ thuật RAG cho bài toán hỏi đáp xuyên ngôn ngữ Việt – Anh: tìm kiếm kết hợp vector và từ khóa, xếp hạng lại bằng cross-encoder, viết lại và dịch câu hỏi, ngưỡng liên quan để từ chối, kiểm tra trích dẫn sau khi trả lời.
- Phương pháp xây dựng và sử dụng bộ dữ liệu đánh giá cho hệ thống truy xuất và hỏi đáp: sinh câu hỏi bằng LLM, lọc tự động, người duyệt, pooling, độ đo truy xuất và thống kê khi báo cáo kết quả.
- Người dùng của hệ thống: sinh viên và người mới học an toàn thông tin, và quản trị viên phụ trách nội dung.

### 1.3.2. Phạm vi nghiên cứu

- Tài liệu nguồn (corpus) chỉ gồm OWASP Cheat Sheet Series và WSTG, tổng cộng 134 tài liệu (133 cheat sheet và WSTG), cùng giấy phép CC BY-SA 4.0. Ban đầu corpus có thêm tài liệu NIST CSWP 29, nhưng đã được bỏ ra để toàn bộ corpus dùng chung một giấy phép, giúp việc công bố bộ đánh giá đơn giản hơn.
- Câu hỏi của bộ đánh giá viết bằng tiếng Việt. Giao diện ứng dụng hỗ trợ tiếng Việt và tiếng Anh.
- Con số báo cáo chính đo phần truy xuất (đoạn nào đến được LLM). Phần trả lời được đo ở khả năng từ chối; các độ đo khác của phần trả lời (đúng đáp án, trung thành với nguồn, trích dẫn đúng) được định nghĩa sẵn trong bộ đánh giá.
- Khóa luận không huấn luyện hay tinh chỉnh mô hình nào; các LLM được gọi qua API, mô hình embedding và rerank dùng bản công bố sẵn.
- Ứng dụng được triển khai bằng Docker Compose ở quy mô thử nghiệm, không nhằm vận hành cho số lượng lớn người dùng.
- Bộ đánh giá do một người gán nhãn (tác giả khóa luận). Vì vậy khóa luận báo độ ổn định của người gán thay cho độ đồng ý giữa nhiều người.

## 1.4. Phương pháp nghiên cứu

### 1.4.1. Phương pháp nghiên cứu tài liệu

Em tìm đọc các công trình về RAG [4], về đánh giá hệ thống truy xuất thông tin (bộ MS MARCO, BEIR [6], cách xây qrels bằng pooling) và về các bộ dữ liệu hỏi đáp có câu không trả lời được (SQuAD 2.0 [5]) hoặc cần nhiều đoạn bằng chứng. Em cũng đọc tài liệu của các công cụ đánh giá RAG như Ragas [7] và tài liệu của OWASP để hiểu cấu trúc corpus. Kết quả được dùng để chọn kiến trúc pipeline RAG và để thiết kế bộ đánh giá.

### 1.4.2. Phương pháp phân tích, thiết kế và phát triển

Hệ thống được phân tích theo hướng đối tượng, mô hình hóa bằng UML (biểu đồ use case, biểu đồ hoạt động, biểu đồ tuần tự) và sơ đồ thực thể – quan hệ cho cơ sở dữ liệu. Ứng dụng được phát triển theo vòng lặp: mỗi lỗi phát hiện khi dùng thử được ghi lại kèm nguyên nhân và cách sửa (36 mục trong nhật ký lỗi của dự án), rồi sửa và kiểm tra lại. Phần bộ đánh giá được chia thành 13 ticket có tiêu chí hoàn thành rõ ràng, và các quyết định thiết kế quan trọng được ghi thành ADR (Architecture Decision Record).

### 1.4.3. Phương pháp thực nghiệm và đánh giá

Bộ đánh giá được xây dựng theo quy trình: sinh câu hỏi ứng viên bằng LLM, lọc tự động bằng các bước kiểm tra và một LLM chấm, người duyệt từng câu, rồi gộp kết quả của nhiều hệ truy xuất (pooling) để tìm thêm đoạn liên quan. Con số báo cáo chính, cách tính sai số chuẩn theo nhóm và phép kiểm định khi so hai cấu hình được chọn và ghi lại trước lần đo đầu tiên. Tham số chỉ được chỉnh trên tập dev; tập test chỉ dùng để báo cáo.

## 1.5. Ý nghĩa khoa học và thực tiễn

Về khoa học, khóa luận đưa ra một quy trình xây dựng bộ đánh giá RAG tiếng Việt có thể lặp lại: bộ đánh giá gắn với một bản đóng băng của corpus có mã băm cho từng tài liệu, bằng chứng lưu theo vị trí ký tự nên vẫn dùng được khi đổi cách cắt đoạn, và mỗi lượt đo ghi lại phiên bản bộ đánh giá, commit của ứng dụng và toàn bộ tham số. Vì corpus dùng giấy phép CC BY-SA 4.0, bộ đánh giá có thể công bố để người khác dùng.

Về thực tiễn, SecLearn là một công cụ học an toàn ứng dụng web bằng tiếng Việt, trong đó người học thấy được câu trả lời dựa vào đoạn tài liệu nào. Ứng dụng có thể dùng làm công cụ hỗ trợ trong các học phần về an toàn thông tin, và quản trị viên có thể nạp thêm tài liệu khác dưới dạng PDF.

## 1.6. Bố cục báo cáo

Ngoài phần Mở đầu và Kết luận, báo cáo gồm bốn chương:

- Chương 1 trình bày lý do chọn đề tài, mục tiêu, đối tượng, phạm vi và phương pháp nghiên cứu.
- Chương 2 trình bày cơ sở lý thuyết: an toàn ứng dụng web và tài liệu OWASP, mô hình ngôn ngữ lớn và biểu diễn vector, kỹ thuật RAG, cách đánh giá hệ thống RAG, các nghiên cứu liên quan và công nghệ sử dụng.
- Chương 3 phân tích, thiết kế và triển khai ứng dụng SecLearn, sau đó thiết kế bộ dữ liệu đánh giá và quy trình xây dựng nó.
- Chương 4 trình bày kết quả xây dựng ứng dụng và bộ đánh giá, kết quả đo, và thảo luận về lỗi và hạn chế.

Bảng 1.1 so sánh SecLearn với một chatbot đa dụng và hai khóa luận về chatbot tại Khoa Công nghệ thông tin, Đại học Kinh tế Quốc dân [8], [9] theo các tiêu chí liên quan đến đề tài.

Bảng 1.1. So sánh SecLearn với một số giải pháp liên quan

| Tiêu chí | Chatbot đa dụng (ChatGPT) | Chatbot RAG tra cứu môn học [8] | Hệ thống điều hướng tương tác AI [9] | SecLearn |
|---|---|---|---|---|
| Nguồn tri thức | Dữ liệu huấn luyện, tìm kiếm web | Đề cương môn học (DOCX) | Nhiều agent, dữ liệu của trường | 134 tài liệu OWASP (PDF) |
| Trích dẫn nguồn trong câu trả lời | Tùy chế độ | Có | [cần kiểm lại] | Có, `[n]` trỏ về đoạn, có kiểm tra sau khi trả lời |
| Từ chối khi tài liệu không có | Không áp dụng | [cần kiểm lại] | [cần kiểm lại] | Có, không gọi LLM |
| Hỏi tiếng Việt trên tài liệu tiếng Anh | Có | Song ngữ trên tài liệu tiếng Việt | [cần kiểm lại] | Có, dịch câu hỏi khi truy xuất |
| Đánh giá định lượng | Không áp dụng | Chạy thử một số câu hỏi | Chạy thử các chức năng | Bộ đánh giá khoảng 1.475 câu, có khoảng tin cậy |
