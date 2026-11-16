<!--
Chương 4. Số liệu lấy từ Dataset/runs/*/scores.json, config.json, answers.jsonl (bộ đánh giá 0.2.0, commit d5e04f5) và Dataset/CARD.md.
Ảnh giao diện chụp ngày 11/11/2026 (sau khi bỏ chức năng Ôn tập) từ bản chạy `npm run dev`, nằm trong docs/thesis/hinh/.
[HÌNH: đường dẫn] = hình đã có file; [HÌNH] không kèm đường dẫn = hình chưa có.
Mục 4.4.1 dùng phân tích bổ sung trên run.trec và candidates.trec, không thuộc cách báo đã đăng ký ở mục 3.8.5.
-->

# CHƯƠNG 4. KẾT QUẢ THỰC NGHIỆM VÀ THẢO LUẬN

## 4.1. Kết quả xây dựng ứng dụng

### 4.1.1. Giao diện người dùng

Hình 4.1 là trang chủ khi chưa đăng nhập. Thanh bên trái có hai mục Chat và Bài học, nút đổi ngôn ngữ và nút đổi giao diện sáng – tối. Góc trên hiện số câu hỏi khách còn lại ("Còn 10/10"). Ba câu hỏi gợi ý giúp người mới biết nên hỏi gì.

[HÌNH: hinh/4-01-trang-chu-khach.png] Hình 4.1. Trang chủ của SecLearn khi chưa đăng nhập.

Hình 4.2 là một câu trả lời cho người đã đăng nhập. Câu hỏi là "làm sao để áp dụng hashing trong bảo mật web?". Mỗi ý trong câu trả lời có số trích dẫn, và cột giữa liệt kê lịch sử hội thoại. Panel "Nguồn tham khảo" bên phải mở ra khi bấm vào dòng "5 đoạn tài liệu" dưới câu trả lời. Đầu panel có ba dòng tóm tắt: mô hình trích dẫn 5 trên 5 đoạn được cung cấp, bước kiểm tra trích dẫn thấy 15 trên 15 câu có trích dẫn được nguồn hỗ trợ, và LLM chấm 4 trên 5 đoạn là sát câu hỏi. Với mỗi đoạn, panel hiện tên tài liệu, số thứ tự đoạn, nhãn của LLM chấm (ví dụ "Sát câu hỏi"), điểm rerank ("Độ liên quan"), độ tương đồng vector, các mệnh đề của câu trả lời đã dùng đoạn đó và nguyên văn đoạn tiếng Anh. Khi di chuột lên một số trích dẫn, một khung nhỏ hiện đoạn được trích và tô vàng câu khớp nhất với mệnh đề; trong hình là số 4, trỏ tới đoạn #13 của DotNet_Security_Cheat_Sheet.

[HÌNH: hinh/4-04-panel-nguon.png] Hình 4.2. Câu trả lời có trích dẫn và panel nguồn tham khảo.

Hình 4.3 là trường hợp từ chối. Với câu "Giá vàng hôm nay là bao nhiêu?", không đoạn nào vượt ngưỡng liên quan, nên trợ lý trả câu từ chối cố định và gợi ý một số chủ đề tài liệu có. Panel nguồn ghi rõ câu trả lời này không dùng đoạn tài liệu nào.

[HÌNH: hinh/4-05-tu-choi.png] Hình 4.3. Câu trả lời từ chối khi tài liệu không có nội dung liên quan.

Hình 4.4 là danh sách bài học. Dữ liệu mẫu hiện có hai bài.

[HÌNH: hinh/4-06-danh-sach-bai-hoc.png] Hình 4.4. Danh sách bài học.

### 4.1.2. Giao diện quản trị

Khi đăng nhập bằng tài khoản quản trị, thanh bên trái có thêm mục Admin với ba trang: Người dùng, Tài liệu PDF và Bài học.

Hình 4.5 là trang Tài liệu PDF. Phần trên là biểu mẫu tải lên, gồm tiêu đề, mức hiển thị (công khai hoặc chỉ người đã đăng nhập) và ô chọn một hay nhiều file PDF. Phần dưới là danh sách tài liệu. Mỗi dòng hiện tên tài liệu, trạng thái nạp, tên file và số đoạn, kèm ô đổi mức hiển thị, nút Reindex để lập chỉ mục lại và nút Xóa. Ví dụ, WSTG ở trạng thái "Sẵn sàng" với 1.468 đoạn. Tại thời điểm chụp ảnh, cơ sở dữ liệu có 134 tài liệu ở trạng thái `ready` với 5.915 đoạn.

[HÌNH: hinh/4-11-quan-tri-tai-lieu.png] Hình 4.5. Trang quản lý tài liệu PDF.

Hình 4.6 là trang Người dùng. Mỗi dòng hiện email và vai trò của một tài khoản, kèm nút đổi vai trò và nút khóa hoặc mở khóa. Các tài khoản trong hình là tài khoản thử nghiệm tạo ra khi kiểm tra chức năng hội thoại.

[HÌNH: hinh/4-12-quan-tri-nguoi-dung.png] Hình 4.6. Trang quản lý người dùng.

Hình 4.7 là trang Bài học. Biểu mẫu tạo bài có đường dẫn (slug), thứ tự, ô đánh dấu xuất bản và hai cột nội dung cho tiếng Việt và tiếng Anh, mỗi cột gồm tiêu đề, tóm tắt và nội dung. Danh sách bên dưới cho sửa và xóa các bài đã có.

[HÌNH: hinh/4-13-quan-tri-bai-hoc.png] Hình 4.7. Trang quản lý bài học.

## 4.2. Kết quả xây dựng bộ đánh giá

### 4.2.1. Thống kê bộ đánh giá

Bộ đánh giá phiên bản 0.2.0 gắn với snapshot `2026-10-18-owasp` (134 tài liệu, 5.915 đoạn). Gold set có 249 câu đã được người duyệt, chia thành 217 câu test và 32 câu dev. Bảng 4.1 là số câu theo mức.

Bảng 4.1. Số câu của gold set 0.2.0 theo mức và theo tập

| Mức | Test | Dev | Tổng |
|---|---|---|---|
| L1 | 62 | 7 | 69 |
| L3 | 50 | 7 | 57 |
| L4 | 42 | 5 | 47 |
| L5 | 47 | 9 | 56 |
| L6(a) | 16 | 4 | 20 |
| Tổng | 217 | 32 | 249 |

Tập test có 201 câu trả lời được và 16 câu ngoài lĩnh vực. Bảng 4.2 là số câu trả lời được của tập test theo cụm chủ đề. Mỗi cụm có từ 13 đến 27 câu, thấp hơn nhiều so với sàn 100 câu của kế hoạch. Vì vậy khoảng tin cậy theo từng cụm ở mục 4.3.2 rộng.

Bảng 4.2. Số câu trả lời được của tập test theo cụm và mức

| Cụm | L1 | L3 | L4 | L5 | Tổng |
|---|---|---|---|---|---|
| arch | 8 | 6 | 5 | 8 | 27 |
| auth | 6 | 12 | 7 | 2 | 27 |
| browser | 9 | 4 | 4 | 4 | 21 |
| supply | 4 | 7 | 3 | 7 | 21 |
| ai | 3 | 4 | 5 | 7 | 19 |
| transport | 8 | 4 | 3 | 4 | 19 |
| api | 7 | 4 | 3 | 4 | 18 |
| framework | 6 | 5 | 4 | 3 | 18 |
| inj | 7 | 1 | 5 | 5 | 18 |
| authz | 4 | 3 | 3 | 3 | 13 |
| Tổng | 62 | 50 | 42 | 47 | 201 |

Về quá trình tạo câu, lượt sinh đầu tiên có 1.446 ứng viên và 971 câu qua được bộ lọc tự động (67,2%). Lượt sinh bù có 200 ứng viên và 73 câu qua lọc (36,5%). Ở cả hai lượt, bước loại nhiều nhất là bước kiểm tra câu hỏi có trả lời được từ chính trích dẫn của nó hay không (Bảng 3.12). Trong các câu qua lọc, 250 câu đã được người duyệt và 249 câu được chấp nhận.

Gold set có 723 gold span. Số span trung bình mỗi câu là 1,41 với L1, 3,91 với L3, 3,64 với L4 và 4,14 với L5. Sau khi đổi sang đoạn theo cách cắt `sentence-v2`, qrels có 493 đoạn liên quan. Riêng 201 câu trả lời được của tập test có 424 đoạn liên quan, trung bình 1,15 đoạn mỗi câu L1, 2,06 với L3, 2,60 với L4 và 3,00 với L5.

### 4.2.2. Chất lượng nhãn

Pilot 50 câu theo hướng dẫn v0 chấp nhận cả 50 câu, thời gian duyệt trung vị 446 giây mỗi câu. Đợt duyệt chính theo hướng dẫn v1 duyệt 200 câu, chấp nhận 199 câu và loại 1 câu, thời gian trung vị 88 giây mỗi câu. Tỉ lệ chấp nhận cao cho thấy bộ lọc tự động đã loại phần lớn câu hỏng trước khi đến người duyệt. Đổi lại, thời gian duyệt giảm mạnh giữa hai đợt, và em không có số đo nào để biết việc duyệt nhanh hơn có làm sót lỗi hay không.

Bộ đánh giá không có hai số đo chất lượng nhãn mà thiết kế ban đầu dự định. Thứ nhất là độ ổn định của người gán: bước gán lại 100 mẫu sau một tuần đã bị bỏ. Thứ hai là độ đồng ý giữa Gemini và người trên pool: phần người chấm pool cũng bị bỏ (ADR 0005). Các kiểm tra tự động trước khi đóng băng đều đạt: mọi trích dẫn gold tìm thấy nguyên văn trong snapshot, mỗi span có ít nhất một đoạn phủ từ 50% trở lên, và không câu gốc nào nằm ở cả hai tập.

## 4.3. Kết quả đánh giá hệ thống

### 4.3.1. Thiết lập thực nghiệm

Mọi lượt đo chạy trên tập test của bộ đánh giá 0.2.0, tại commit `d5e04f5` của ứng dụng, với cây mã nguồn sạch. Script `run-eval.ts` gọi đúng hàm truy xuất của ứng dụng cho từng câu hỏi và ghi lại ba thứ: các đoạn sẽ được đưa cho LLM trả lời, các ứng viên trước bước rerank, và kế hoạch truy vấn. Script từ chối chạy nếu cơ sở dữ liệu không khớp snapshot mà qrels được xây trên đó. Lệnh `seclearn-eval score` của bộ đánh giá đọc các file này và tính điểm theo cách báo ở mục 3.8.5.

Bảng 4.3 liệt kê năm lượt chạy. Cấu hình mặc định dùng LLM DeepSeek `deepseek-flash`, embedding `vietnamese-bi-encoder` 768 chiều, rerank `bge-reranker-v2-m3` và các tham số ở Bảng 3.8. Mỗi lượt còn lại chỉ đổi một yếu tố so với mặc định. Hai lượt "50 ứng viên" và "không rerank" dùng lại kế hoạch truy vấn của lượt mặc định, để khác biệt đo được chỉ đến từ yếu tố bị đổi. Lượt "không dịch câu hỏi" phải lập kế hoạch lại vì bước dịch nằm trong kế hoạch.

Bảng 4.3. Các lượt chạy

| Lượt chạy | Khác với mặc định | Chế độ |
|---|---|---|
| `seclearn-baseline` | Không (cấu hình mặc định) | Truy xuất |
| `seclearn-baseline-answer` | Không; sinh câu trả lời 3 lần mỗi câu | Trả lời |
| `seclearn-cand50` | `RAG_CANDIDATES` = 50 thay vì 20 | Truy xuất |
| `seclearn-no-rerank` | Tắt cross-encoder | Truy xuất |
| `seclearn-no-translate` | `RAG_TRANSLATE_QUERY` = `off` | Truy xuất |

Khóa luận không chạy lượt nào trên tập dev. Ba lượt thay đổi cấu hình ở đây là phép thử loại bỏ từng thành phần để biết thành phần đó đóng góp bao nhiêu, không phải để chọn tham số.

### 4.3.2. Kết quả truy xuất

Con số báo cáo chính, recall@5 trung bình đều trên 10 cụm chủ đề, của cấu hình mặc định là 0,604, khoảng tin cậy 95% từ 0,555 đến 0,654. Nói cách khác, trung bình khoảng 60% số đoạn chứa bằng chứng của một câu hỏi có mặt trong các đoạn đưa cho LLM. Bảng 4.4 là các số còn lại.

Bảng 4.4. Kết quả truy xuất của cấu hình mặc định trên 201 câu trả lời được

| Độ đo | Macro (số chính) | Micro | Hậu phân tầng |
|---|---|---|---|
| recall@5 | 0,604 [0,555; 0,654] | 0,600 [0,545; 0,655] | 0,577 [0,519; 0,636] |
| hit@1 | 0,534 [0,468; 0,600] | 0,537 [0,467; 0,606] | 0,514 [0,439; 0,589] |
| hit@5 | 0,820 [0,769; 0,871] | 0,816 [0,752; 0,866] | 0,798 [0,732; 0,863] |
| MRR@10 | 0,653 [0,599; 0,706] | 0,653 [0,595; 0,711] | 0,632 [0,568; 0,696] |
| nDCG@10 | 0,570 [0,521; 0,619] | 0,568 [0,514; 0,621] | 0,546 [0,488; 0,604] |
| recall@10 | 0,608 [0,559; 0,657] | 0,604 [0,549; 0,659] | 0,581 [0,522; 0,639] |
| Judged@10 | 0,328 [0,293; 0,363] | 0,330 [0,290; 0,369] | 0,326 [0,280; 0,372] |

Có ba điều cần lưu ý khi đọc bảng này. Hit@5 là 0,820, tức với 82% câu hỏi, LLM nhận được ít nhất một đoạn chứa bằng chứng. Recall@10 gần bằng recall@5 vì ứng dụng chỉ giữ tối đa 5 đoạn, riêng câu so sánh tối đa 8 đoạn, nên danh sách không có vị trí thứ 6 trở đi cho hầu hết các câu. Judged@10 chỉ 0,328 vì qrels của phiên bản 0.2.0 chỉ gồm đoạn phủ gold span và đoạn Gemini cho 0 điểm; khoảng hai phần ba số đoạn hệ thống trả về chưa được chấm và bị tính là không liên quan. Số hậu phân tầng thấp hơn số macro khoảng 0,03 vì các cụm lớn của corpus như `arch` và `inj` có điểm thấp hơn trung bình.

Hình 4.8 và Bảng 4.5 là kết quả theo mức. Recall@5 giảm dần theo số bằng chứng câu hỏi cần: 0,823 với câu tra cứu một đoạn (L1), 0,745 với câu nhiều đoạn một chủ đề (L3), 0,456 với câu so sánh (L4) và 0,281 với câu nhiều bước (L5). Hit@5 của L4 vẫn là 0,833, nghĩa là với câu so sánh hệ thống thường tìm được ít nhất một đoạn đúng nhưng thiếu các đoạn còn lại. Riêng L5 thì cả hit@5 cũng thấp, 0,617.

[HÌNH: hinh/4-14-recall-theo-muc.png] Hình 4.8. Recall@5 của cấu hình mặc định theo mức câu hỏi, kèm khoảng tin cậy 95%.

Bảng 4.5. Kết quả của cấu hình mặc định theo mức

| Mức | Số câu | recall@5 | hit@1 | hit@5 | MRR@10 |
|---|---|---|---|---|---|
| L1 | 62 | 0,823 [0,740; 0,905] | 0,726 | 0,871 | 0,793 |
| L3 | 50 | 0,745 [0,653; 0,837] | 0,640 | 0,920 | 0,764 |
| L4 | 42 | 0,456 [0,369; 0,543] | 0,381 | 0,833 | 0,562 |
| L5 | 47 | 0,281 [0,209; 0,353] | 0,319 | 0,617 | 0,431 |

Hình 4.9 là recall@5 theo cụm chủ đề. Điểm cao nhất là cụm `transport` (0,776) và thấp nhất là cụm `browser` (0,492). Tuy vậy, khi so 45 cặp cụm và hiệu chỉnh p-value bằng phương pháp Holm, không cặp nào khác nhau có ý nghĩa thống kê ở bất kỳ độ đo nào. Với 13 đến 27 câu mỗi cụm, bộ đánh giá hiện tại chưa đủ để kết luận hệ thống tốt hơn ở chủ đề nào.

[HÌNH: hinh/4-15-recall-theo-cum.png] Hình 4.9. Recall@5 của cấu hình mặc định theo cụm chủ đề, kèm khoảng tin cậy 95%.

Phép kiểm độ nhạy của sai số cho kết quả ổn định. Khi gộp nhóm hai tài liệu của mỗi câu L4 và L5, sai số chuẩn của recall@5 macro đổi từ 0,025 thành 0,021. Khi lấy cả cụm chủ đề làm một nhóm, sai số của recall@5 micro bằng 1,09 lần sai số chính. Cách chia nhóm khác đi không làm thay đổi kết luận.

### 4.3.3. Kết quả khả năng từ chối

Lượt `seclearn-baseline-answer` sinh 3 câu trả lời cho mỗi câu trong 217 câu test, tổng cộng 651 câu trả lời. Bảng 4.6 là kết quả.

Bảng 4.6. Tỉ lệ từ chối của cấu hình mặc định

| Loại câu | Số câu | Tỉ lệ từ chối | Khoảng tin cậy 95% |
|---|---|---|---|
| L6(a), ngoài lĩnh vực (từ chối đúng) | 16 | 1,000 | [0,806; 1,000] |
| Trả lời được (từ chối sai) | 201 | 0,013 | [0,000; 0,028] |

Cả 16 câu ngoài lĩnh vực đều bị từ chối trong cả 3 lần chạy. Với các câu này, bước truy xuất không giữ lại đoạn nào, nên ứng dụng trả câu từ chối cố định mà không gọi LLM. Vì chỉ có 16 câu, cận dưới của khoảng tin cậy là 0,806.

Tỉ lệ từ chối sai là 1,3%, tương ứng 8 trên 603 câu trả lời, thuộc 3 câu hỏi. Một câu L5 không có đoạn nào vượt ngưỡng nên bị từ chối cả 3 lần. Một câu L1 chỉ còn 2 đoạn sau ngưỡng và cả hai đều không chứa bằng chứng, nên LLM trả lời rằng tài liệu không đề cập. Một câu L3 bị từ chối 2 trên 3 lần dù có đủ 5 đoạn; đây là câu duy nhất có kết quả khác nhau giữa các lần chạy.

Kết quả này chỉ đo loại câu ngoài lĩnh vực, là loại dễ từ chối nhất. Gold set 0.2.0 không có câu L6(b) (thuộc an ninh nhưng corpus không có) và L6(c) (tiền đề sai), nên khóa luận chưa đo được khả năng từ chối ở hai loại khó hơn này.

### 4.3.4. So sánh các cấu hình

Hình 4.10 và Bảng 4.7 so ba cấu hình thay đổi với cấu hình mặc định. Hiệu được tính ghép cặp theo từng câu; p-value lấy từ kiểm định ngẫu nhiên hóa theo nhóm.

[HÌNH: hinh/4-16-so-sanh-cau-hinh.png] Hình 4.10. Recall@5 macro của bốn cấu hình, kèm khoảng tin cậy 95%.

Bảng 4.7. So sánh ghép cặp với cấu hình mặc định (số macro)

| Cấu hình | recall@5 | Hiệu recall@5 [khoảng tin cậy 95%] | p | Hiệu hit@5 | Hiệu nDCG@10 |
|---|---|---|---|---|---|
| Mặc định | 0,604 | | | | |
| 50 ứng viên | 0,643 | +0,039 [0,020; 0,057] | < 0,001 | +0,038 | +0,024 |
| Không rerank | 0,375 | −0,229 [−0,280; −0,179] | < 0,001 | −0,293 | −0,243 |
| Không dịch câu hỏi | 0,369 | −0,236 [−0,281; −0,190] | < 0,001 | −0,307 | −0,191 |

Tắt cross-encoder làm recall@5 giảm 0,229, và tắt dịch câu hỏi làm giảm 0,236. Hai thành phần này đóng góp gần bằng nhau và đều có ý nghĩa thống kê. Khi tắt dịch, 24 trên 201 câu không còn đoạn nào vượt ngưỡng, so với 1 câu ở cấu hình mặc định, và recall@5 của L5 giảm từ 0,281 xuống 0,114. Kết quả này khớp với quan sát lúc phát triển ở mục 3.5.2: cross-encoder chấm cặp câu hỏi tiếng Việt và đoạn tiếng Anh rất thấp, nên đoạn đúng bị loại ở bước ngưỡng.

Tăng số ứng viên vector từ 20 lên 50 làm recall@5 tăng 0,039, cũng có ý nghĩa thống kê. Mức tăng rõ nhất ở câu so sánh: recall@5 của L4 tăng từ 0,456 lên 0,536. Tuy vậy, kết quả này đo trên tập test, còn quy ước của khóa luận là chỉ chỉnh tham số trên tập dev. Vì thế khóa luận chỉ ghi nhận đây là một kết quả của phép thử và giữ nguyên giá trị mặc định 20. Việc đổi mặc định cần một lượt đo trên tập dev và cần tính thêm chi phí, vì số cặp phải rerank tăng theo số ứng viên.

## 4.4. Thảo luận

### 4.4.1. Phân tích lỗi

Để biết đoạn liên quan bị mất ở bước nào, em đối chiếu 424 đoạn liên quan của 201 câu trả lời được với danh sách ứng viên trước rerank và danh sách đoạn cuối cùng của lượt mặc định. Phân tích này là phần bổ sung, không thuộc cách báo đã đăng ký trước. Bảng 4.8 là kết quả.

Bảng 4.8. Đoạn liên quan bị mất ở bước nào (cấu hình mặc định)

| Mức | Số đoạn liên quan | Có trong 5 đoạn cuối | Có trong ứng viên nhưng bị loại | Không vào danh sách ứng viên |
|---|---|---|---|---|
| L1 | 71 | 57 (80%) | 0 (0%) | 14 (20%) |
| L3 | 103 | 72 (70%) | 5 (5%) | 26 (25%) |
| L4 | 109 | 47 (43%) | 17 (16%) | 45 (41%) |
| L5 | 141 | 37 (26%) | 15 (11%) | 89 (63%) |
| Tổng | 424 | 213 (50%) | 37 (9%) | 174 (41%) |

Phần lớn đoạn bị mất ngay từ bước tìm ứng viên: 174 đoạn, tức 41% tổng số, không nằm trong danh sách ứng viên của câu hỏi. Bước rerank và chọn theo ngưỡng chỉ loại 37 đoạn (9%). Ngưỡng liên quan vì thế không phải nguyên nhân chính của recall thấp. Với cấu hình 50 ứng viên, số đoạn không vào danh sách ứng viên giảm từ 174 xuống 139, nhưng số đoạn có trong ứng viên mà bị loại tăng từ 37 lên 55. Một phần lý do có thể là 5 chỗ không đủ cho các câu cần nhiều đoạn.

Từ các câu sai, em thấy bốn nhóm lỗi.

Nhóm thứ nhất là trả về đoạn liền kề đoạn có bằng chứng. Trong 211 đoạn liên quan bị thiếu, có 66 đoạn (31%) mà hệ thống đã trả về đoạn đứng ngay trước hoặc ngay sau nó trong cùng tài liệu. Ví dụ, với câu "Vì sao dùng hash trong CSP cho inline script lại bị coi là rủi ro, chẳng hạn khi format lại code?", bằng chứng nằm ở đoạn 17 của Content Security Policy Cheat Sheet, còn hệ thống trả về đoạn 16. Hai đoạn liên tiếp trong cùng mục chia sẻ một số câu do chồng lấp, nên đoạn liền kề có thể vẫn chứa một phần đáp án. Qrels 0.2.0 tính các trường hợp này là sai hoàn toàn. Trong 37 câu có recall@5 bằng 0, có 10 câu thuộc trường hợp này.

Nhóm thứ hai là câu cần bằng chứng từ hai tài liệu nhưng hệ thống chỉ tìm được một. Trong 47 câu L5 có 43 câu có bằng chứng ở từ hai tài liệu trở lên, và hệ thống lấy được đoạn của mọi tài liệu đó ở 17 câu. Với L4, con số là 16 trên 28 câu. Tính theo tài liệu thay vì theo đoạn, tỉ lệ tài liệu chứa bằng chứng có mặt trong 5 đoạn cuối là 0,935 với L1, 0,960 với L3, 0,798 với L4 và 0,670 với L5. Như vậy với L1 và L3, hệ thống gần như luôn tìm đúng tài liệu, và phần recall bị mất chủ yếu do chọn sai đoạn trong tài liệu. Với L4 và L5, hệ thống còn bỏ sót cả tài liệu.

Nhóm thứ ba là kế hoạch truy vấn làm mất một phần của câu hỏi tình huống. Câu L5 thường dài, mô tả một tình huống rồi hỏi hai ý. Bước lập kế hoạch rút câu hỏi thành một đến ba truy vấn tiếng Anh ngắn, và có khi truy vấn chỉ giữ chủ đề nổi nhất. Ví dụ, một câu hỏi về cách trình bày các mật khẩu đã lấy được trong báo cáo kiểm thử được rút thành truy vấn về lưu mật khẩu an toàn. Hệ thống trả về các đoạn của Password Storage Cheat Sheet, trong khi bằng chứng nằm ở phần viết báo cáo của WSTG.

Nhóm thứ tư là ngưỡng liên quan loại hết đoạn. Nhóm này hiếm ở cấu hình mặc định: 1 câu không còn đoạn nào và 59 câu còn ít hơn 5 đoạn. Nhưng khi tắt dịch câu hỏi, nhóm này tăng lên 24 câu không còn đoạn nào.

Bốn nhóm lỗi gợi ý các hướng cải thiện sau, xếp theo mức ảnh hưởng ước tính từ Bảng 4.8: tăng độ phủ của bước tìm ứng viên; giữ lại các ý của câu hỏi tình huống khi lập kế hoạch truy vấn; và cân nhắc đưa thêm đoạn liền kề của đoạn được chọn vào ngữ cảnh. Khóa luận chưa thử các hướng này.

### 4.4.2. Hạn chế của nghiên cứu

Về nhãn, gold set do một người gán, gán một lần. Khóa luận không có độ đồng ý giữa nhiều người và cũng không có độ ổn định của chính người gán. 50 câu pilot được gán theo hướng dẫn v0, 199 câu còn lại theo v1.

Về qrels, vì phần người chấm pool bị bỏ, qrels chỉ gồm đoạn phủ gold span. 271 đoạn được Gemini cho 2 hoặc 3 điểm chưa có người kiểm, và Judged@10 chỉ khoảng 0,33. Recall đo được là recall so với gold span, và có thể thấp hơn recall thật. Nhóm lỗi thứ nhất ở mục 4.4.1 là một dấu hiệu của việc này. Vì cùng một bộ qrels áp cho mọi cấu hình, phần so sánh giữa các cấu hình ít bị ảnh hưởng hơn giá trị tuyệt đối, nhưng em không có số đo để khẳng định điều đó.

Về cỡ mẫu, gold set chỉ bằng 16,9% kế hoạch. Mỗi cụm có 13 đến 27 câu nên không so được cụm với cụm. Gold set không có câu L2, L7, L6(b) và L6(c). Vì vậy bốn loại câu sau chưa được đo: câu gõ không dấu, câu hội thoại nhiều lượt, câu thuộc an ninh mà corpus không có, và câu có tiền đề sai. Đây đều là các loại lỗi đã gặp khi phát triển và là lý do thang mức được thiết kế bảy mức.

Về câu hỏi, mọi câu đều do LLM sinh rồi người duyệt, không có câu của người dùng thật. Hạn mức theo căn bậc hai làm bộ đánh giá không đại diện cho phân bố của corpus, và cũng không đại diện cho câu hỏi thật. Số macro vì thế nên được hiểu là điểm trung bình trên các chủ đề, không phải điểm kỳ vọng với một người dùng ngẫu nhiên.

Về phần trả lời, khóa luận chỉ đo khả năng từ chối. Độ đúng của câu trả lời, độ trung thành với nguồn và độ đúng của trích dẫn đã có định nghĩa trong bộ đánh giá nhưng chưa được chấm. Recall@5 chỉ cho biết bằng chứng có đến được LLM hay không, không cho biết LLM dùng bằng chứng đó đúng hay sai.

Cuối cùng, mọi số đo gắn với một snapshot, một cách cắt đoạn và một bộ mô hình. Lượt truy xuất của mỗi cấu hình chạy một lần; riêng lượt trả lời chạy 3 lần mỗi câu. Ba phép thử loại bỏ thành phần chạy trên tập test, nên chúng mô tả đóng góp của từng thành phần chứ không phải kết quả chọn tham số.

## 4.5. Tiến độ thực hiện

[Chưa viết: bảng kế hoạch và thực tế theo tuần, các buổi làm việc với giảng viên hướng dẫn.]
