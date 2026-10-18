# Spec: Bộ đánh giá SecLearn v1.0 (gold set khoảng 1.475 câu) và hạ tầng đi kèm

Status: ready-for-agent

Nguồn: phiên grill ngày 2026-10-18, dựa trên `docs/EVAL_DATASET_CONSTRUCTION.md` [C] và `docs/EVAL_DATASET_BALANCE_INFRA.md` [B]. Thuật ngữ theo `GLOSSARY.md`; quyết định nền ở ADR 0001-0004.

## Problem Statement

Tôi (tác giả luận văn, làm một mình) cần một bộ đánh giá đáng tin để đo SecLearn, nhưng hiện có ba vấn đề:

1. **Corpus còn bẩn và không đóng băng được.** Dữ liệu đã dọn một phần (NIST, MFA, 4 stub đã bỏ), nhưng WSTG vẫn không có tiêu đề mục nào, 10 tài liệu có tiêu đề rác `## Sheet`, và chunk không ghi vị trí của nó trong markdown. Corpus đã đổi mà không có snapshot nào, nên mọi số đo cũ không so được với số mới, và không có gì báo khi corpus thay đổi lặng lẽ.
2. **Corpus mất cân bằng.** WSTG chiếm 23% số chunk, 5 tài liệu lớn nhất chiếm 30%. Sinh câu theo tỉ lệ corpus thì bộ đánh giá thực chất là bộ đánh giá WSTG; LLM lại có xu hướng sinh toàn câu tra cứu một đoạn, nên các mức khó bị thiếu.
3. **Không có hạ tầng.** Không có snapshot có mã băm, không có offset chunk, không có công cụ hay hướng dẫn gán nhãn, không có pooling, không có định dạng qrels, không có phép tính sai số phù hợp khi nhiều câu cùng một tài liệu, không có dataset card hay quản lý phiên bản. Bộ smoke 40 câu hiện còn không nằm trong git.

## Solution

Tách công việc thành hai phía, nối với nhau chỉ bằng **snapshot corpus**:

- **Phía app SecLearn**: sửa bước trích văn bản (chèn tiêu đề cho từng test case WSTG, bỏ `## Sheet`), ghi offset của phần thân mỗi chunk vào metadata khi cắt, reindex một lần, và thêm **lệnh xuất snapshot corpus** (markdown từng tài liệu, manifest có sha256, danh sách chunk kèm offset).
- **Phía dự án bộ đánh giá** (Python, thư mục riêng `Dataset/`): chỉ đọc snapshot, không đụng DB hay mã app. Các bước, mỗi bước là một lệnh đọc file ghi file:
  1. lập hạn mức theo phương án R;
  2. Claude sinh khoảng 2.350 ứng viên;
  3. lọc tự động 6 bước;
  4. tôi duyệt trong Label Studio để giữ khoảng 1.475 câu gold (test 1.300, dev 175);
  5. pool 5 hệ truy xuất Python, Gemini chấm, tôi chấm lại phần cần chấm;
  6. sinh qrels từ gold span;
  7. kiểm tra tự động;
  8. dataset card và đóng băng **bộ đánh giá v1.0**.

Kết quả là một bộ đánh giá có phiên bản, tái lập được, cân theo cụm chủ đề và theo mức, cùng với cách báo kết quả (số chính macro theo cụm, sai số theo cụm) đã chọn trước khi đo.

## User Stories

### Corpus và snapshot (phía app)

1. Là người làm luận văn, tôi muốn mỗi test case WSTG có tiêu đề mục mang mã `WSTG-XXXX-NN` và tên của nó, để chunk WSTG cho biết nó thuộc test case nào khi tôi đọc và khi retriever so khớp.
2. Là người làm luận văn, tôi muốn các tiêu đề rác `## Sheet` biến mất khỏi markdown, để tiền tố chunk không vô nghĩa.
3. Là người làm luận văn, tôi muốn các test case WSTG chỉ ghi "This content has been removed" không thành một mục có nội dung, để chúng không được lấy mẫu.
4. Là người làm luận văn, tôi muốn mỗi chunk ghi vị trí bắt đầu và kết thúc của phần thân nó trong markdown của tài liệu, cùng mã băm markdown và phiên bản cách cắt chunk, để gold span chuyển sang chunk bằng phép giao khoảng, không phải tìm chuỗi.
5. Là người làm luận văn, tôi muốn offset tính đúng cả khi chunk được chèn lại tiêu đề mục ở đầu và mang câu chồng lấn từ chunk trước, để không chunk nào có offset sai.
6. Là người làm luận văn, tôi muốn reindex toàn bộ corpus một lần sau các sửa đổi trên, để snapshot đầu tiên phản ánh markdown đã sạch.
7. Là người làm luận văn, tôi muốn chạy bộ smoke trước và sau lần reindex đó, để ghi nhận việc sửa trích xuất làm số liệu truy xuất thay đổi bao nhiêu.
8. Là người làm luận văn, tôi muốn một lệnh xuất snapshot corpus từ DB ra thư mục, để dự án bộ đánh giá có đầu vào mà không cần DB.
9. Là người làm luận văn, tôi muốn snapshot chứa đúng chuỗi markdown mà app đã lưu cho từng tài liệu, để gold span neo vào đúng văn bản mà hệ được đo dùng.
10. Là người làm luận văn, tôi muốn manifest ghi cho từng tài liệu: khoá tài liệu ổn định (tên file bỏ tiền tố thời gian), tiêu đề, sha256 của file nguồn và của markdown, số ký tự, số chunk, trạng thái, giấy phép và URL nguồn, để biết chính xác snapshot gồm gì.
11. Là người làm luận văn, tôi muốn manifest ghi cấu hình cắt chunk (phiên bản cách cắt, cỡ chunk, chồng lấn) và commit của app, để biết snapshot sinh ra từ phiên bản mã nào.
12. Là người làm luận văn, tôi muốn danh sách chunk trong snapshot có khoá chunk ổn định theo tài liệu và số thứ tự, kèm id trong DB chỉ để tra ngược, để qrels không phụ thuộc vào id ngẫu nhiên của DB.
13. Là người làm luận văn, tôi muốn snapshot có định danh theo ngày và tên, để mỗi phiên bản bộ đánh giá trỏ được vào đúng một snapshot.
14. Là người làm luận văn, tôi muốn lệnh xuất từ chối chạy khi còn tài liệu chưa ở trạng thái sẵn sàng hoặc có chunk bị bỏ khi nhúng, để snapshot không chứa corpus dở dang.

### Lấy mẫu và cân bằng

15. Là người làm luận văn, tôi muốn mỗi tài liệu và mỗi nhóm test case WSTG được gán vào một trong 10 cụm chủ đề qua một file phân cụm tôi duyệt được, để hạn mức và báo cáo dựa trên phân loại tôi đã chấp nhận.
16. Là người làm luận văn, tôi muốn file phân cụm khởi đầu được dựng tự động theo tên tài liệu (miền đặc thù gộp vào kiến trúc, quy trình; CSRF vào trình duyệt), để tôi chỉ phải sửa chứ không phải viết từ đầu.
17. Là người làm luận văn, tôi muốn đơn vị lấy mẫu là mục `##` với cheat sheet và test case với WSTG, có offset trên markdown, để câu được sinh từ một phần có nghĩa của tài liệu.
18. Là người làm luận văn, tôi muốn mục lục WSTG, phụ lục payload (fuzz vector, encoded injection) và danh sách tham khảo bị đánh dấu không lấy mẫu, để không sinh câu từ vùng vô nghĩa.
19. Là người làm luận văn, tôi muốn hạn mức tính theo phương án R (cụm theo √ số chunk của cụm; trong cụm theo √ số chunk của tài liệu, phần WSTG của cụm là một tài liệu rồi chia tiếp theo test case), có trần mỗi tài liệu và seed cố định, để WSTG còn khoảng 10% bộ đánh giá thay vì 23%.
20. Là người làm luận văn, tôi muốn split test có ít nhất 100 câu trả lời được ở **mỗi** cụm chủ đề (tổng khoảng 1.100 câu trả lời được), phần trên sàn chia theo phương án R, để khoảng tin cậy theo cụm đủ hẹp (khoảng ±10-12 điểm) mà so được cụm với cụm.
20a. Là người làm luận văn, tôi muốn câu trả lời được của split test chia đều 6 mức L1-L5 và L7 (khoảng 183 câu mỗi mức), phân cho đơn vị theo khả năng (L3 chỉ cho đơn vị ≥ 2 chunk, L4 / L5 lấy cặp đơn vị cùng cụm), để mọi mức đủ câu.
21. Là người làm luận văn, tôi muốn split test có 200 câu L6 chia 50 ngoài lĩnh vực, 100 thuộc an ninh nhưng corpus không có, 50 tiền đề sai, để đo được việc trợ lý biết từ chối.
22. Là người làm luận văn, tôi muốn kế hoạch lấy mẫu được lưu cùng seed và in ra bảng phân bố theo cụm × mức, để tôi kiểm tra trước khi tốn tiền sinh câu.
23. Là người làm luận văn, tôi muốn hạn mức áp lên số câu giữ lại sau khi tôi duyệt, và ô nào thiếu thì chỉ sinh bù cho đúng ô đó, để phân bố cuối cùng khớp kế hoạch.
24. Là người làm luận văn, tôi muốn ô nào thừa thì bỏ bớt theo seed cố định chứ không chọn tay, để không thiên lệch theo sở thích.
25. Là người làm luận văn, tôi muốn một split dev riêng khoảng 175 câu (khoảng 150 câu trả lời được chia theo cùng tỉ lệ, không áp sàn, và khoảng 25 câu L6 theo tỉ lệ 1 : 2 : 1), tách theo `seed_id` khỏi test, để chỉnh tham số (kể cả ngưỡng từ chối) trên dev mà không làm lạc quan số báo cáo.

### Sinh và lọc câu

26. Là người làm luận văn, tôi muốn Claude sinh khoảng 2.350 ứng viên theo đúng kế hoạch lấy mẫu, mỗi ứng viên có câu hỏi tiếng Việt, bản tiếng Anh, đáp án tham chiếu, mức dự kiến và trích dẫn nguyên văn từ snapshot, để có đủ đầu vào cho bước duyệt.
27. Là người làm luận văn, tôi muốn câu L1 / L3 được sinh theo kiểu rút câu khẳng định trước rồi mới đặt câu hỏi, để câu hỏi bám vào nội dung tài liệu.
28. Là người làm luận văn, tôi muốn câu L4 / L5 được sinh từ cặp đơn vị cùng cụm, để có câu so sánh và nhiều bước thật.
29. Là người làm luận văn, tôi muốn câu L2 và L7 được dựng thành biến thể của câu L1 / L3 đã duyệt, cùng `seed_id`, để so được có dấu / không dấu và hội thoại trên cùng câu gốc.
30. Là người làm luận văn, tôi muốn câu L6(c) được dựng bằng cách đổi chi tiết của câu L1 đã duyệt, kèm span bác bỏ tiền đề, để câu tiền đề sai có bằng chứng.
31. Là người làm luận văn, tôi muốn câu L6(b) kèm bằng chứng corpus không có câu trả lời (từ khoá tiếng Anh đã grep trên snapshot, top-20 của 2 retriever) để tôi xác nhận, để không gán nhầm câu có đáp án thành không trả lời được.
32. Là người làm luận văn, tôi muốn ứng viên bị loại nếu trích dẫn không có thật trong snapshot, để không có bằng chứng bịa.
33. Là người làm luận văn, tôi muốn Gemini thử trả lời mỗi ứng viên chỉ từ bằng chứng của nó, và loại câu không trả lời được, để câu trả lời được thật sự trả lời được.
34. Là người làm luận văn, tôi muốn Gemini phân loại lại mức của mỗi ứng viên, và câu lệch mức bị đổi nhãn hoặc loại, vì nhãn do generator tự khai không đáng tin.
35. Là người làm luận văn, tôi muốn câu tham chiếu "tài liệu này", "hình", "bảng", "chương" bị loại, để câu tự đứng được.
36. Là người làm luận văn, tôi muốn câu trùng ý (cùng nghĩa, trong cùng cụm) bị loại, để bộ đánh giá không lặp.
37. Là người làm luận văn, tôi muốn câu L2 bị kiểm mức trùng từ vựng với tài liệu, để câu diễn đạt lại thật sự khác cách viết của tài liệu.
38. Là người làm luận văn, tôi muốn mỗi bước lọc ghi số câu vào, số câu loại và lý do, để báo được tỉ lệ loại ở từng bước trong luận văn.
39. Là người làm luận văn, tôi muốn mọi ứng viên ghi model sinh, phiên bản prompt và seed, để tái lập và truy được câu nào sinh ra thế nào.
40. Là người làm luận văn, tôi muốn sinh và lọc chạy lại được mà không gọi lại API cho phần đã có kết quả, để không tốn tiền khi sửa một bước phía sau.

### Gán nhãn

41. Là người gán nhãn duy nhất, tôi muốn Label Studio chạy cục bộ với một project "kiểm câu": hiện câu tiếng Việt, đáp án, các đoạn markdown nguồn; cho tôi chấp nhận / sửa / loại, chỉnh mức, bôi span bằng chứng, sửa đáp án và ghi chú, để tự quyết định từng câu.
42. Là người gán nhãn, tôi muốn đánh giá câu hỏi trước khi thấy đáp án của LLM khi tự tìm span, để không bị neo vào đáp án máy.
43. Là người gán nhãn, tôi muốn bôi span trên markdown liên tục, không thấy ranh giới chunk, để gold không gắn với cách cắt chunk hiện tại.
44. Là người gán nhãn, tôi muốn một project "chấm pool": hiện câu và từng chunk, chấm 0-3, để hoàn thiện gold.
45. Là người gán nhãn, tôi muốn công cụ chuyển dữ liệu từ định dạng câu hỏi sang task Label Studio và ngược lại, giữ được người gán, thời gian gán và phiên bản hướng dẫn, để nhãn quay về bộ đánh giá mà không mất thông tin.
46. Là người gán nhãn, tôi muốn thử export một span ngay từ đầu để xác nhận Label Studio trả offset ký tự đúng trên markdown, vì đây là rủi ro chưa kiểm chứng.
47. Là người gán nhãn, tôi muốn một hướng dẫn gán nhãn v0 có định nghĩa từng mức, ví dụ tốt và xấu lấy từ chính corpus, quy tắc span, thang 0-3 và quy tắc L6, để bắt đầu pilot.
48. Là người gán nhãn, tôi muốn sửa tự do hướng dẫn trước pilot, sửa một lần sau pilot thành v1, rồi giữ cố định (sau đó chỉ errata có tăng phiên bản), để nhãn trên toàn bộ gold set cùng một quy tắc.
49. Là người gán nhãn, tôi muốn pilot 50 câu trải đều các mức để đo thời gian gán thật, và chỉnh cỡ gold nếu trung vị trên 3 phút mỗi câu, để ngân sách giờ dựa trên số đo của chính tôi.
50. Là người gán nhãn duy nhất, tôi muốn gán lại khoảng 100 mẫu sau ít nhất một tuần, không nhìn nhãn cũ, cùng phiên bản hướng dẫn, và tính độ ổn định của người gán, để có số liệu độ tin cậy cho luận văn.
51. Là người gán nhãn, tôi muốn mỗi nhãn ghi người gán, thời điểm, thời gian gán, phiên bản hướng dẫn và snapshot, để mọi nhãn truy được nguồn gốc.

### Pooling và qrels

52. Là người làm luận văn, tôi muốn 5 hệ truy xuất chạy trên chunk của snapshot (BM25 trên câu tiếng Anh; cùng embedding tiếng Việt của app; embedding đó cộng reranker; bge-m3 tiếng Việt; bge-m3 tiếng Anh), để pool đa dạng mà không cần chạy app.
53. Là người làm luận văn, tôi muốn pool là hợp top-10 của 5 hệ cộng các chunk phủ gold span, để gold không chỉ gồm đoạn sinh ra câu hỏi.
54. Là người làm luận văn, tôi muốn Gemini chấm 0-3 toàn bộ pool, rồi tôi chấm các chunk Gemini cho ≥ 1 cộng 10% mẫu chunk Gemini cho 0, để giới hạn giờ chấm mà vẫn ước được tỉ lệ bỏ sót.
55. Là người làm luận văn, tôi muốn chunk tôi chấm 2-3 mà chưa nằm trong gold span thì được mở rộng gold bằng span mới, để gold đầy đủ khi thông tin lặp giữa WSTG và cheat sheet.
56. Là người làm luận văn, tôi muốn độ đồng ý giữa Gemini và tôi trên pool được tính (κ có trọng số, tỉ lệ đồng ý theo mức), để biết Gemini làm judge tin được đến đâu.
57. Là người làm luận văn, tôi muốn qrels định dạng TREC được sinh ra từ gold span và nhãn pool cho một phiên bản cách cắt chunk, để dùng được các công cụ đo chuẩn và sinh lại khi đổi cách cắt.
58. Là người làm luận văn, tôi muốn một chunk được coi là liên quan khi nó giao với gold span ít nhất 50% độ dài span, và nhãn pool ghi đè khi có, để quy tắc ánh xạ rõ ràng.

### Kiểm tra, báo cáo, đóng băng

59. Là người làm luận văn, tôi muốn một lệnh kiểm tra chạy trước mọi lượt đo, báo lỗi khi: file sai định dạng hoặc trùng id; sha256 markdown không khớp manifest; trích dẫn gold không tìm thấy đúng một lần quanh offset; span không có chunk nào phủ ≥ 50%; gold nằm trong vùng loại; phân bố lệch kế hoạch quá 5%; một `seed_id` ở hai split; cấu hình chạy thiếu hoặc mã chưa commit; thiếu canary, để lỗi lặng lẽ như vụ NIST bị bắt ngay.
60. Là người làm luận văn, tôi muốn trích dẫn lệch offset được neo lại bằng cách tìm lại quote trong snapshot mới, và tỉ lệ phải neo lại / bỏ được báo cáo, để chuyển snapshot không làm mất gold lặng lẽ.
61. Là người làm luận văn, tôi muốn phép tính điểm cho ra micro, macro theo 10 cụm (số chính) và theo mức, mỗi số kèm sai số chuẩn có điều chỉnh theo cụm (cụm là tài liệu hoặc test case WSTG, biến thể gom theo `seed_id`), để khoảng tin cậy không hẹp giả tạo.
62. Là người làm luận văn, tôi muốn tầng nhỏ dưới khoảng 300 câu dùng khoảng Wilson, để khoảng tin cậy theo cụm và theo mức đạt đúng độ phủ.
63. Là người làm luận văn, tôi muốn so sánh hai cấu hình là so sánh ghép cặp theo câu, có sai số ghép cặp theo cụm và kiểm định ngẫu nhiên hoá, để kết luận "cấu hình A tốt hơn B" có cơ sở.
64. Là người làm luận văn, tôi muốn L6 luôn báo riêng (từ chối đúng trên L6, từ chối sai trên câu trả lời được), không gộp vào điểm câu trả lời được.
65. Là người làm luận văn, tôi muốn kết quả theo cụm kèm số câu, số tài liệu và khoảng tin cậy có điều chỉnh theo cụm, và chỉ kết luận khác biệt giữa hai cụm khi kiểm định cho phép, để không rút kết luận quá mức từ khoảng 100 câu mỗi cụm.
66. Là người làm luận văn, tôi muốn báo cáo được sinh tự động thành bảng markdown và LaTeX, để đưa thẳng vào luận văn.
67. Là người làm luận văn, tôi muốn phần chấm điểm được kiểm bằng dữ liệu nhỏ có đáp số tính tay, để tin được số trong luận văn.
68. Là người làm luận văn, tôi muốn một dataset card có tiêu đề YAML kiểu Hugging Face và các mục: động cơ, thành phần (snapshot, hạn mức phương án R, phân bố thực tế), cách thu thập (model, prompt, tỉ lệ loại từng bước), cách gán nhãn (một người, độ ổn định, hướng dẫn), biến thể ngôn ngữ, cách dùng và không nên dùng, cách báo chuẩn (số chính chọn trước), phân phối (CC BY-SA 4.0, ghi công OWASP, canary), bảo trì và hạn chế đã biết, để bộ đánh giá được mô tả đủ cho hội đồng và cho người dùng lại.
69. Là người làm luận văn, tôi muốn số chính và phương pháp sai số được ghi vào card và commit trước lần đo đầu tiên, để không bị nghi chọn số đẹp sau khi thấy kết quả.
70. Là người làm luận văn, tôi muốn bộ đánh giá đánh phiên bản MAJOR.MINOR.PATCH kèm nhật ký thay đổi (MAJOR khi đổi snapshot hoặc nghĩa gold, MINOR khi thêm câu, PATCH khi sửa nhãn), để mọi số liệu ghi được nó đo trên phiên bản nào.
71. Là người làm luận văn, tôi muốn bộ smoke hiện tại được chuyển sang gold span trên snapshot mới và đưa vào dự án bộ đánh giá, để nó có lịch sử phiên bản và chạy được qua cùng hạ tầng.
72. Là người làm luận văn, tôi muốn toàn bộ dự án bộ đánh giá, trừ cache API và file nặng, nằm trong git, để hội đồng hỏi phiên bản nào thì có câu trả lời.

## Implementation Decisions

### Phía app

- **Trích văn bản**: thêm vào bước làm sạch văn bản PDF một quy tắc riêng cho WSTG: nhận mẫu dòng "ID" theo sau là mã `WSTG-XXXX-NN` ngay sau tên test case, chèn tiêu đề cấp 2 dạng mã + tên trước test case đó. Test case chỉ có nội dung "This content has been removed" không thành mục có nội dung. Bỏ dòng tiêu đề rác `## Sheet` (phần đuôi của "Cheat Sheet" bị nhận nhầm). Các tài liệu khác giữ nguyên.
- **Cắt chunk có offset**: bộ cắt chunk trả về, cho mỗi chunk, cả văn bản lẫn khoảng `[char_start, char_end)` của **phần thân** trên đúng chuỗi markdown được lưu (không tính tiêu đề mục được chèn lại; khoảng bắt đầu từ câu đầu tiên của chunk, kể cả câu chồng lấn). Hàm cắt chunk hiện có giữ nguyên chữ ký cho mọi nơi đang gọi; thêm biến thể trả về kèm khoảng.
- Offset phải đúng trên chuỗi markdown được lưu vào tài liệu, không phải trên chuỗi đã trim / chuẩn hoá xuống dòng bên trong bộ cắt; nếu bộ cắt chuẩn hoá đầu vào thì phải ánh xạ ngược. Bước làm sạch từng chunk sau khi cắt (sanitize, trim) và việc lọc chunk rỗng không được làm lệch chỉ số chunk so với offset.
- **Metadata chunk**: mỗi chunk lưu `{char_start, char_end, md_sha256, chunker_version}` vào cột metadata JSON đã có sẵn (chưa dùng). Không đổi schema DB. `chunker_version` là một hằng số đổi mỗi khi quy tắc cắt chunk đổi.
- **Reindex**: dùng lệnh reindex có sẵn, chạy một lần sau khi sửa. Chạy bộ smoke trước và sau, lưu kết quả để so.
- **Lệnh xuất snapshot**: một script chạy cùng kiểu với lệnh reindex (đọc biến môi trường của app). Tách hai phần: (1) đọc tài liệu và chunk từ DB; (2) dựng snapshot từ danh sách tài liệu + chunk thành thư mục gồm markdown từng tài liệu, manifest và danh sách chunk. Phần (2) là hàm thuần để test không cần Postgres. Đầu ra ghi thẳng vào vùng snapshot của dự án bộ đánh giá. Từ chối xuất khi có tài liệu chưa sẵn sàng hoặc có cảnh báo bỏ chunk.
- **Khoá ổn định**: khoá tài liệu = tên file bỏ tiền tố thời gian và mã ngẫu nhiên; khoá chunk = khoá tài liệu + `#` + số thứ tự chunk. Id DB chỉ lưu để tra ngược.
- **Manifest** theo các trường của Croissant để sau này xuất được: tên, `snapshot_id`, phiên bản, ngày, giấy phép, commit app (kèm cờ có thay đổi chưa commit), cấu hình chunker, danh sách tài liệu (khoá, tiêu đề, file nguồn, sha256 nguồn, sha256 markdown, số ký tự, số chunk, trạng thái, URL nguồn, ngày lấy), canary GUID.

### Phía dự án bộ đánh giá

- **Môi trường**: dự án Python riêng trong thư mục bộ đánh giá, quản lý bằng `uv`, ghim Python 3.12 (máy có 3.14 nhưng thư viện embedding có thể chưa có wheel). Một CLI duy nhất với các lệnh con theo thứ tự quy trình: snapshot (nạp và kiểm), clusters, plan, generate, filter, annotate (xuất / nhập Label Studio), pool, judge, qrels, check, score, report, card.
- **Ranh giới**: chỉ đọc snapshot; không import mã app, không kết nối Postgres (ADR 0004).
- **Định dạng là nguồn sự thật**: một module schema (pydantic) định nghĩa mọi bản ghi: tài liệu trong manifest, đơn vị lấy mẫu, chunk, câu hỏi, gold span, nhãn, mục pool, cấu hình lượt chạy. Mọi lệnh đọc / ghi qua schema này.
- **Câu hỏi**: theo schema của [R §5.3] cộng `cluster`, `unit_ids`, `seed_id`, `question_en`, `strata {level, answerable, l6_kind, question_style, gold_source}`, `split`, `review {status, annotator, guideline_version, lead_time, notes}`, `generation {model, prompt_version, seed}`.
- **Gold span**: `{doc_key, md_sha256, char_start, char_end, quote}`; câu so sánh có span riêng cho từng ô.
- **qrels / run**: định dạng TREC; qrels là sản phẩm sinh ra cho từng `chunker_version`, không sửa tay.
- **Đơn vị lấy mẫu**: mục `##` của cheat sheet; test case WSTG (nay đã có tiêu đề nhờ sửa phía app); phần mở đầu WSTG (bỏ mục lục) là một đơn vị. Vùng loại: mục lục, phụ lục payload, tham khảo.
- **Phân cụm**: 10 cụm (kiến trúc, quy trình gồm cả miền đặc thù; chuỗi cung ứng, DevOps, hạ tầng; injection, đầu vào; xác thực, phiên; trình duyệt (gồm CSRF); framework; AI; vận chuyển, header, mật mã; phân quyền; API). Nhóm WSTG ánh xạ: ATHN / SESS / IDNT → xác thực, phiên; ATHZ → phân quyền; INPV → injection; CLNT → trình duyệt; CRYP → vận chuyển, mật mã; APIT → API; INFO / CONF / ERRH / BUSL / phần mở đầu → kiến trúc, quy trình. File phân cụm do tôi duyệt trước khi lập kế hoạch.
- **Hạn mức**: phương án R (ADR 0003) với trần mỗi tài liệu và làm tròn bằng phần dư lớn nhất, seed cố định; **sàn 100 câu trả lời được mỗi cụm trên split test** (cụm dưới sàn được nâng lên 100, phần còn lại chia theo R cho các cụm trên sàn; ước tính 5 cụm nằm đúng sàn, cụm lớn nhất khoảng 139); biên theo mức khoảng 183 câu mỗi mức trả lời được và 200 câu L6 trên test; khớp hai biên (cụm, mức) bằng lặp tỉ lệ đến ±5%. Dev lấy theo cùng tỉ lệ R, không sàn. Câu L6(a) và L6(b) không thuộc cụm nào của corpus nên không tính vào sàn; L6(c) đi theo cụm của câu gốc.
- **Sinh câu**: Claude (phiên bản model ghim trong cấu hình); sinh dư khoảng 1,6 lần; prompt riêng cho từng mức; mỗi ứng viên kèm quote nguyên văn và `question_en`. Kết quả gọi API được cache theo khoá gồm prompt, model và đầu vào.
- **Lọc**: 6 bước theo thứ tự cố định: quote có thật trong snapshot; Gemini trả lời chỉ từ bằng chứng; Gemini phân loại lại mức; bỏ tham chiếu hình / bảng / "tài liệu này"; dedup ngữ nghĩa trong cụm; kiểm trùng từ vựng cho L2. Mỗi bước ghi thống kê vào / loại / lý do.
- **LLM client**: Claude và Gemini sau cùng một interface nhỏ (gửi prompt, nhận văn bản hoặc JSON có cấu trúc), để thay bằng client giả khi test. Khoá API đọc từ biến môi trường, không ghi vào file nào của bộ đánh giá. DeepSeek (LLM chat của app) không được dùng ở bất kỳ bước nào.
- **Gán nhãn**: Label Studio chạy cục bộ bằng Docker, hai project (kiểm câu; chấm pool), cấu hình giao diện lưu trong dự án. Module annotate chuyển câu hỏi ↔ task và nhập nhãn về, giữ `completed_by`, `lead_time`, phiên bản hướng dẫn.
- **Hướng dẫn gán nhãn**: v0 do agent nháp (định nghĩa L1-L7, ví dụ từ corpus, quy tắc span, thang 0-3, L6); tôi sửa trước pilot; v1 sau pilot rồi đóng băng; mọi sửa sau đó tăng phiên bản phụ kèm danh sách câu đã kiểm lại.
- **Pool**: 5 hệ chạy trong Python trên chunk của snapshot: BM25 trên `question_en`; embedding tiếng Việt cùng model của app; embedding đó + cross-encoder bge-reranker; bge-m3 trên câu tiếng Việt; bge-m3 trên `question_en`. Embedding chunk được cache theo `md_sha256` + model. Hợp top-10 + chunk phủ gold span. Gemini chấm 0-3 toàn bộ pool theo prompt kiểu UMBRELA; tôi chấm chunk Gemini cho ≥ 1 và 10% mẫu ngẫu nhiên (seed cố định) chunk Gemini cho 0.
- **Ánh xạ span → chunk**: giao khoảng trên offset; liên quan khi giao ≥ 50% độ dài span hoặc chứa trọn span; nhãn pool của người ghi đè.
- **Chấm điểm**: dùng ranx cho Hit@k, MRR, nDCG@10, Recall@k và kiểm định Fisher randomization; ir-measures cho Judged@10; tự cài sai số chuẩn theo cụm (theo phương trình 4 và 8 của Miller 2024), khoảng Wilson, micro / macro / hậu phân tầng. Độ đo phần trả lời (đúng đáp án 0-2, trung thành với nguồn, trích dẫn đúng, từ chối đúng / sai, K = 3 lần chạy) được định nghĩa ở định dạng và trong card, nhưng chỉ chạy khi có bộ chạy SecLearn (giai đoạn sau).
- **Kiểm tra**: lệnh check thực hiện 9 kiểm tra liệt kê ở user story 59; thoát với mã lỗi khác 0 khi có lỗi.
- **Phiên bản**: SemVer cho bộ đánh giá kèm nhật ký thay đổi; snapshot có định danh riêng; canary GUID trong card và đầu mỗi file câu hỏi.
- **Git**: dự án bộ đánh giá được git theo dõi; cache API, cache embedding và export thô của Label Studio bị bỏ qua.

## Testing Decisions

- **Test tốt là test hành vi nhìn thấy được qua đầu vào / đầu ra** (chuỗi markdown, danh sách chunk có offset, thư mục snapshot, file JSONL / qrels / báo cáo), không test cấu trúc nội bộ, thứ tự prompt hay lớp private.
- **Seam 1 (app): văn bản PDF đã trích → markdown → chunk có offset**, hàm thuần. Test:
  - mẫu văn bản WSTG rút gọn được chèn đúng tiêu đề `## WSTG-XXXX-NN <tên>`;
  - test case "removed" không thành mục có nội dung;
  - `## Sheet` biến mất;
  - **bất biến**: với mọi chunk, đoạn markdown tại `[char_start, char_end)` khớp phần thân chunk sau chuẩn hoá khoảng trắng, kể cả chunk có tiêu đề chèn lại, chunk có câu chồng lấn và khối dài bị cắt cứng;
  - hàm cắt chunk cũ cho ra đúng danh sách văn bản như trước với cùng đầu vào.

  Prior art: test hiện có của bộ cắt chunk và bước làm sạch site chrome (node:test qua lệnh test của app, dùng văn bản cheat sheet rút gọn làm fixture).
- **Seam 2 (app): dựng snapshot từ danh sách tài liệu + chunk** (không cần Postgres):
  - sha256 trong manifest khớp markdown;
  - số chunk khớp;
  - offset nằm trong độ dài markdown;
  - khoá tài liệu bỏ đúng tiền tố;
  - từ chối khi có tài liệu chưa sẵn sàng.

  Cùng bộ test của app.
- **Seam 3 (bộ đánh giá): mỗi lệnh CLI là file vào, file ra**, test bằng pytest trên một **snapshot mẫu rất nhỏ** đặt trong thư mục test (khoảng 3 tài liệu, trong đó có một đoạn WSTG 2-3 test case):
  - plan cho ra hạn mức đúng phương án R với seed cố định, so với số tính tay;
  - qrels ánh xạ span → chunk đúng quy tắc 50% và nhãn pool ghi đè;
  - score khớp đáp số tính tay (gồm sai số theo cụm và Wilson);
  - check bắt được từng loại lỗi khi cố tình làm hỏng fixture (sha lệch, quote lệch, seed ở hai split...).
- **Seam 4 (bộ đánh giá): client LLM giả** trả kết quả cố định để test generate / filter / judge. Phần annotate được test bằng vòng khứ hồi câu hỏi → task Label Studio → nhập nhãn về, không mất trường nào.
- **Kiểm thật một lần, không tự động**: export span từ Label Studio thật để xác nhận dạng offset (user story 46); chạy check trên snapshot thật sau khi xuất.
- Chưa có test Python nào trong repo; bộ test của dự án bộ đánh giá bắt đầu từ đầu và chạy bằng một lệnh của `uv`.

## Out of Scope

- **Bộ chạy SecLearn** (cho hệ được đo trả lời bộ câu hỏi, ghi run và câu trả lời) và **việc đo số liệu của SecLearn**: giai đoạn sau. Spec này chỉ định nghĩa định dạng run và phép tính điểm để giai đoạn đó dùng lại.
- **Silver set** (câu chỉ qua lọc tự động; sau khi gold set đã đủ sàn theo cụm thì chỉ làm nếu còn cần) và **câu thật từ log chat** (khoảng 100 câu, cần điều kiện đồng ý của người dùng): đợt 2.
- Nạp lại NIST CSWP 29 (ADR 0001).
- Người gán thứ hai, qualification, độ đồng ý giữa nhiều người (ADR 0002).
- Chọn tập con bằng IRT / tinyBenchmarks (cần nhiều model đã chạy).
- Công bố bộ đánh giá công khai, xuất `croissant.json` bằng công cụ, DVC.
- Đổi `CHUNK_SIZE`, embedding hay reranker của app.

## Further Notes

- Thứ tự phụ thuộc: sửa trích xuất + offset → reindex (kèm smoke trước / sau) → xuất snapshot → mọi bước phía bộ đánh giá. Khung dự án Python, schema, check và snapshot mẫu cho test có thể làm song song với phía app.
- Ngân sách người (ước): khoảng 60 giờ duyệt câu (khoảng 1.475 câu × 2,5 phút), khoảng 60 giờ chấm pool, 5 giờ gán lại 100 mẫu, cộng pilot, tổng khoảng 125 giờ; chỉnh lại theo `lead_time` thật sau pilot.
- Chi phí API: Claude cho khoảng 2.350 ứng viên + sinh bù; Gemini cho lọc 2 bước trên khoảng 2.350 ứng viên và chấm pool khoảng 1.475 × 20 chunk. Model ghim phiên bản, ghi trong cấu hình.
- Corpus hiện tại: 134 tài liệu OWASP, chỉ một giấy phép CC BY-SA 4.0; luận văn sửa mô tả corpus cho khớp (ADR 0001).
- Rủi ro đã biết: phân cụm theo tên tài liệu tranh cãi được (báo độ nhạy của macro với một cách phân cụm khác); macro cho cụm nhỏ trọng lượng bằng cụm lớn (báo kèm hậu phân tầng); cụm ít tài liệu có khoảng tin cậy rất rộng.
