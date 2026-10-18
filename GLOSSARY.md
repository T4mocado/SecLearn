# SecLearn

Trợ lý RAG trả lời câu hỏi tiếng Việt về an toàn ứng dụng web, dựa trên tài liệu OWASP tiếng Anh; kèm bộ đánh giá để đo nó.

## Corpus

**Corpus**:
Tập tài liệu OWASP (Cheat Sheet Series và WSTG) đã nạp vào chỉ mục, là nguồn duy nhất trợ lý được phép dựa vào để trả lời.
_Avoid_: kho tài liệu, knowledge base, dữ liệu nguồn

**Snapshot corpus**:
Bản đóng băng của corpus tại một thời điểm, gồm markdown của từng tài liệu và mã băm của nó; mọi gold span và mọi lần chạy đánh giá đều neo vào một snapshot cụ thể.
_Avoid_: bản chụp, phiên bản corpus, dump

**Test case WSTG**:
Một mục kiểm thử của WSTG mang mã `WSTG-XXXX-NN`; là đơn vị con của WSTG khi lấy mẫu câu hỏi.
_Avoid_: mục WSTG, chương WSTG

**Cụm chủ đề**:
Nhóm tài liệu (và test case WSTG) cùng một mảng an toàn web, ví dụ "xác thực, phiên" hay "injection"; là tầng trên cùng khi chia hạn mức câu hỏi và khi báo kết quả.
_Avoid_: cluster (trong văn bản tiếng Việt), nhóm, chủ đề

## Bộ đánh giá

**Bộ đánh giá**:
Tập câu hỏi tiếng Việt kèm đáp án tham chiếu, gold span và nhãn mức, dùng để đo SecLearn; gồm gold set và silver set, tách khỏi app.
_Avoid_: bộ dữ liệu, dataset (dễ lẫn với corpus), benchmark

**Gold span**:
Một đoạn văn bản trên markdown của snapshot corpus, đánh dấu bằng vị trí ký tự và trích dẫn nguyên văn, chứa bằng chứng cho đáp án.
_Avoid_: gold chunk, evidence chunk

**Hệ được đo**:
SecLearn ở một cấu hình cụ thể (biến `RAG_*`, model, commit) khi được chạy trên bộ đánh giá.
_Avoid_: hệ thống, pipeline, model (khi muốn nói cả hệ)

**Mức (L1-L7)**:
Loại khó của một câu hỏi theo thang của SecLearn, từ tra cứu một đoạn (L1) đến hội thoại nhiều lượt (L7); L6 là câu không trả lời được từ corpus.
_Avoid_: level, độ khó, loại câu

**Hạn mức**:
Số câu hỏi được phân cho một cụm chủ đề, một tài liệu hoặc một test case WSTG trước khi sinh câu.
_Avoid_: quota, chỉ tiêu

**Số chính**:
Con số báo cáo hàng đầu của luận văn, chọn trước khi đo: trung bình đều trên các cụm chủ đề (macro), chỉ trên câu trả lời được.
_Avoid_: headline metric, điểm tổng

**Gold set**:
Phần bộ đánh giá mà mọi câu, đáp án và bằng chứng đều được người duyệt; là cơ sở cho số liệu chính của luận văn.
_Avoid_: tập chuẩn, test set (khi muốn nói riêng phần người duyệt)

**Silver set**:
Phần bộ đánh giá chỉ qua lọc tự động và LLM judge, người chỉ kiểm một mẫu để ước tỉ lệ lỗi; không dùng cho số liệu chính.
_Avoid_: tập phụ, tập máy

**Độ ổn định của người gán (intra-annotator agreement)**:
Mức trùng khớp giữa hai lần gán nhãn của cùng một người trên cùng mẫu, cách nhau một khoảng thời gian; không phải độ đồng ý giữa nhiều người.
_Avoid_: độ đồng ý (khi chỉ có một người), inter-annotator agreement
