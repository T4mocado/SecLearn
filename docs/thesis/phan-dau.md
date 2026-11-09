<!--
Phần đầu khóa luận (bìa phụ → Mở đầu). Viết để dán sang Word.
Chỗ trong [ngoặc vuông] là thông tin cá nhân hoặc số liệu chưa có, phải điền tay.
Mục lục, danh mục bảng, danh mục hình trong Word phải tạo tự động (References → Table of Contents / Insert Table of Figures);
mục lục dưới đây chỉ để chốt tên mục, không gõ tay số trang.
-->

# BÌA PHỤ

ĐẠI HỌC KINH TẾ QUỐC DÂN
TRƯỜNG CÔNG NGHỆ
----------------

KHÓA LUẬN TỐT NGHIỆP

Xây dựng trợ lý ảo hỏi đáp an toàn ứng dụng web dựa trên RAG và bộ dữ liệu đánh giá tiếng Việt

Tên sinh viên: [Họ và tên]
Mã sinh viên: [Mã SV]
Lớp: [Lớp]
Ngành: Công nghệ thông tin
Khoa: Công nghệ thông tin
Giảng viên hướng dẫn: [Học hàm, học vị, họ tên GVHD]
(Chữ ký GVHD)

Hà Nội, [tháng]/[năm]

---

# MỤC LỤC

LỜI CAM ĐOAN
LỜI CẢM ƠN
DANH MỤC CÁC TỪ VIẾT TẮT
DANH MỤC BẢNG
DANH MỤC HÌNH
DANH MỤC CÔNG THỨC
MỞ ĐẦU
CHƯƠNG 1. TỔNG QUAN ĐỀ TÀI
  1.1. Lý do chọn đề tài
  1.2. Mục tiêu đề tài
    1.2.1. Mục tiêu về sản phẩm
    1.2.2. Mục tiêu về nghiên cứu và đánh giá
  1.3. Đối tượng và phạm vi nghiên cứu
    1.3.1. Đối tượng nghiên cứu
    1.3.2. Phạm vi nghiên cứu
  1.4. Phương pháp nghiên cứu
    1.4.1. Phương pháp nghiên cứu tài liệu
    1.4.2. Phương pháp phân tích, thiết kế và phát triển
    1.4.3. Phương pháp thực nghiệm và đánh giá
  1.5. Ý nghĩa khoa học và thực tiễn
  1.6. Bố cục báo cáo
CHƯƠNG 2. CƠ SỞ LÝ THUYẾT
  2.1. An toàn ứng dụng web và tài liệu OWASP
    2.1.1. Các lớp lỗ hổng ứng dụng web phổ biến
    2.1.2. OWASP Cheat Sheet Series và WSTG
  2.2. Mô hình ngôn ngữ lớn và biểu diễn vector
    2.2.1. Mô hình ngôn ngữ lớn
    2.2.2. Embedding và độ tương đồng
    2.2.3. Cross-encoder và rerank
  2.3. Sinh tăng cường truy xuất (RAG)
    2.3.1. Kiến trúc RAG cơ bản
    2.3.2. Chia đoạn
    2.3.3. Truy xuất lai và kỹ thuật cải thiện truy vấn
    2.3.4. Kiểm soát chất lượng câu trả lời
  2.4. Đánh giá hệ thống RAG
    2.4.1. Độ đo truy xuất
    2.4.2. Độ đo phần trả lời
    2.4.3. Xây dựng bộ đánh giá
    2.4.4. Thống kê trong đánh giá
  2.5. Các nghiên cứu và giải pháp liên quan
  2.6. Công nghệ sử dụng
    2.6.1. Ứng dụng web
    2.6.2. Dữ liệu và AI
    2.6.3. Bộ đánh giá và triển khai
CHƯƠNG 3. PHÂN TÍCH, THIẾT KẾ HỆ THỐNG VÀ BỘ DỮ LIỆU ĐÁNH GIÁ
  3.1. Phân tích yêu cầu
    3.1.1. Tác nhân và phân quyền
    3.1.2. Yêu cầu chức năng
    3.1.3. Yêu cầu phi chức năng
  3.2. Mô hình hóa chức năng
    3.2.1. Biểu đồ use case
    3.2.2. Biểu đồ hoạt động
    3.2.3. Biểu đồ tuần tự
  3.3. Thiết kế cơ sở dữ liệu
    3.3.1. Mô hình thực thể – quan hệ
    3.3.2. Đặc tả bảng
  3.4. Thiết kế kiến trúc hệ thống
    3.4.1. Kiến trúc tổng thể
    3.4.2. Thiết kế API
  3.5. Thiết kế pipeline RAG
    3.5.1. Nạp tài liệu và lập chỉ mục
    3.5.2. Lập kế hoạch truy vấn
    3.5.3. Truy xuất lai và rerank
    3.5.4. Sinh câu trả lời và kiểm soát chất lượng
  3.6. Triển khai hệ thống
    3.6.1. Môi trường và cấu hình
    3.6.2. Kiểm thử phần mềm
  3.7. Thiết kế bộ dữ liệu đánh giá
    3.7.1. Mục tiêu đo và nguyên tắc tái lập
    3.7.2. Snapshot corpus và cụm chủ đề
    3.7.3. Thang mức câu hỏi L1–L7
    3.7.4. Phân bổ hạn mức
  3.8. Quy trình xây dựng bộ đánh giá
    3.8.1. Sinh câu ứng viên bằng LLM
    3.8.2. Lọc tự động và LLM judge
    3.8.3. Gán nhãn bởi người và pilot
    3.8.4. Pooling và qrels
    3.8.5. Quy chuẩn báo cáo kết quả
CHƯƠNG 4. KẾT QUẢ THỰC NGHIỆM VÀ THẢO LUẬN
  4.1. Kết quả xây dựng ứng dụng
    4.1.1. Giao diện người dùng
    4.1.2. Giao diện quản trị
  4.2. Kết quả xây dựng bộ đánh giá
    4.2.1. Thống kê bộ đánh giá
    4.2.2. Chất lượng nhãn
  4.3. Kết quả đánh giá hệ thống
    4.3.1. Thiết lập thực nghiệm
    4.3.2. Kết quả truy xuất
    4.3.3. Kết quả khả năng từ chối
    4.3.4. So sánh các cấu hình
  4.4. Thảo luận
    4.4.1. Phân tích lỗi
    4.4.2. Hạn chế của nghiên cứu
  4.5. Tiến độ thực hiện
KẾT LUẬN
TÀI LIỆU THAM KHẢO
PHỤ LỤC

---

# LỜI CAM ĐOAN

Em xin cam đoan khóa luận "Xây dựng trợ lý ảo hỏi đáp an toàn ứng dụng web dựa trên RAG và bộ dữ liệu đánh giá tiếng Việt" là kết quả nghiên cứu và thực hiện của cá nhân em, dưới sự hướng dẫn của [học vị, họ tên GVHD].

Các nội dung, ý tưởng, hình và bảng lấy từ tài liệu khác đều được trích dẫn theo đúng quy định và có trong danh mục tài liệu tham khảo. Số liệu và kết quả thực nghiệm trong khóa luận do em tự chạy, được báo cáo trung thực và chưa từng được dùng để nộp cho tổ chức hay chương trình đào tạo nào khác.

Trong quá trình thực hiện, em có dùng các mô hình ngôn ngữ lớn vào ba việc: làm thành phần trả lời của hệ thống, sinh câu hỏi ứng viên và chấm lọc tự động khi xây bộ đánh giá, và hỗ trợ lập trình. Mọi câu hỏi trong gold set đều do em duyệt lại, và em chịu trách nhiệm về toàn bộ nội dung của khóa luận.

Em xin hoàn toàn chịu trách nhiệm về lời cam đoan này.

Hà Nội, ngày [..] tháng [..] năm [....]
Sinh viên
(Ký, ghi rõ họ tên)

[Họ và tên]

---

# LỜI CẢM ƠN

Em xin cảm ơn các thầy cô Khoa Công nghệ thông tin, Trường Công nghệ, Đại học Kinh tế Quốc dân đã giảng dạy em trong những năm học vừa qua. Kiến thức từ các học phần là nền để em thực hiện khóa luận này.

Em xin gửi lời cảm ơn riêng tới [học vị, họ tên GVHD], người trực tiếp hướng dẫn em. Trong suốt thời gian làm khóa luận, thầy/cô đã [điều GVHD thực sự đã giúp, ví dụ: góp ý về hướng đánh giá, sửa bản thảo].

Em cũng cảm ơn gia đình và bạn bè đã động viên em trong thời gian này.

Do thời gian và kinh nghiệm còn hạn chế, khóa luận chắc chắn còn thiếu sót. Em mong nhận được góp ý của thầy cô để hoàn thiện thêm.

Em xin chân thành cảm ơn.

---

# DANH MỤC CÁC TỪ VIẾT TẮT

| Từ viết tắt | Tiếng Anh | Nghĩa tiếng Việt |
|---|---|---|
| AI | Artificial Intelligence | Trí tuệ nhân tạo |
| API | Application Programming Interface | Giao diện lập trình ứng dụng |
| CSDL | – | Cơ sở dữ liệu |
| CSRF | Cross-Site Request Forgery | Giả mạo yêu cầu liên trang |
| ERD | Entity Relationship Diagram | Sơ đồ thực thể – quan hệ |
| HyDE | Hypothetical Document Embeddings | Embedding tài liệu giả định |
| IR | Information Retrieval | Truy xuất thông tin |
| JWT | JSON Web Token | Chuỗi mã thông báo theo định dạng JSON |
| KTC | – | Khoảng tin cậy |
| LLM | Large Language Model | Mô hình ngôn ngữ lớn |
| MRR | Mean Reciprocal Rank | Trung bình nghịch đảo thứ hạng |
| nDCG | Normalized Discounted Cumulative Gain | Độ lợi tích lũy có chiết khấu, chuẩn hóa |
| NLP | Natural Language Processing | Xử lý ngôn ngữ tự nhiên |
| ORM | Object-Relational Mapping | Ánh xạ đối tượng – quan hệ |
| OWASP | Open Worldwide Application Security Project | Dự án mở về an toàn ứng dụng |
| PDF | Portable Document Format | Định dạng tài liệu di động |
| RAG | Retrieval-Augmented Generation | Sinh tăng cường truy xuất |
| SE | Standard Error | Sai số chuẩn |
| SQL | Structured Query Language | Ngôn ngữ truy vấn có cấu trúc |
| SSE | Server-Sent Events | Sự kiện do máy chủ gửi |
| UI | User Interface | Giao diện người dùng |
| UML | Unified Modeling Language | Ngôn ngữ mô hình hóa thống nhất |
| WSTG | Web Security Testing Guide | Hướng dẫn kiểm thử an toàn web (của OWASP) |
| XSS | Cross-Site Scripting | Tấn công chèn mã kịch bản liên trang |

---

# MỞ ĐẦU

Các tài liệu chuẩn về an toàn ứng dụng web, như OWASP Cheat Sheet Series và OWASP Web Security Testing Guide (WSTG), đều viết bằng tiếng Anh và có hàng trăm trang. Người mới học, nhất là sinh viên quen đọc tiếng Việt, khó tìm đúng đoạn cần đọc khi có một câu hỏi cụ thể. Các chatbot đa dụng có thể trả lời nhanh bằng tiếng Việt, nhưng không cho biết câu trả lời dựa vào tài liệu nào và đôi khi đưa ra thông tin sai.

Khóa luận xây dựng SecLearn, một ứng dụng web giúp người mới học an toàn thông tin. Thành phần chính của SecLearn là một trợ lý ảo dùng kỹ thuật sinh tăng cường truy xuất (Retrieval-Augmented Generation, RAG). Trợ lý nhận câu hỏi tiếng Việt và chỉ trả lời dựa trên corpus gồm 134 tài liệu OWASP. Mỗi ý trong câu trả lời có số trích dẫn trỏ về đoạn nguồn. Khi không tìm được đoạn nào đủ liên quan, trợ lý từ chối trả lời và không gọi mô hình ngôn ngữ. Ngoài trợ lý, SecLearn có bài học song ngữ Việt – Anh, chức năng Ôn tập sinh câu hỏi trắc nghiệm và trang quản trị để nạp tài liệu PDF vào chỉ mục.

Mục đích thứ hai của khóa luận là đo được chất lượng của trợ lý. Thử bằng vài câu hỏi mẫu không cho biết hệ thống đúng ở loại câu nào và sai ở loại câu nào, cũng không đủ để so hai cấu hình với nhau. Vì vậy khóa luận xây dựng một bộ đánh giá tiếng Việt khoảng 1.475 câu, chia thành bảy mức từ tra cứu một đoạn (L1) đến hội thoại nhiều lượt (L7), trong đó mức L6 gồm các câu không trả lời được từ corpus. Mỗi câu có đáp án tham chiếu và gold span, tức đoạn văn bản làm bằng chứng được đánh dấu bằng vị trí ký tự trên tài liệu gốc. Con số báo cáo chính là recall@5 trung bình đều trên 10 cụm chủ đề, được chọn trước lần đo đầu tiên.

Về phương pháp, khóa luận dùng nghiên cứu tài liệu để chọn kiến trúc RAG và cách xây bộ đánh giá, dùng UML để phân tích và thiết kế hệ thống, phát triển ứng dụng theo từng vòng lặp, và đánh giá bằng thực nghiệm định lượng có khoảng tin cậy và kiểm định thống kê.

Kết quả đạt được gồm: ứng dụng SecLearn chạy được bằng Docker Compose; corpus 134 tài liệu, 5.915 chunk; bộ đánh giá [N] câu, trong đó gold set [N] câu đã được người duyệt; recall@5 macro của cấu hình mặc định đạt [giá trị] (khoảng tin cậy 95%: [khoảng]); tỉ lệ từ chối đúng trên câu L6 là [giá trị].

Ngoài Mở đầu và Kết luận, khóa luận gồm bốn chương. Chương 1 trình bày lý do chọn đề tài, mục tiêu, phạm vi và phương pháp nghiên cứu. Chương 2 trình bày cơ sở lý thuyết về an toàn ứng dụng web, mô hình ngôn ngữ lớn, RAG và cách đánh giá hệ thống RAG. Chương 3 phân tích, thiết kế ứng dụng SecLearn và bộ dữ liệu đánh giá. Chương 4 trình bày kết quả xây dựng, kết quả đo và thảo luận.
