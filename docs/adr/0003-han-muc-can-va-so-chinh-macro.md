# Hạn mức theo căn bậc hai hai tầng; số chính là macro theo cụm chủ đề

Corpus lệch mạnh: WSTG chiếm 23% số chunk. Quyết định ngày 2026-10-18: hạn mức câu của mỗi cụm chủ đề tỉ lệ với √(số chunk của cụm); trong cụm, mỗi tài liệu tỉ lệ với √(số chunk của tài liệu), phần WSTG của cụm coi là **một** tài liệu rồi chia tiếp theo test case WSTG; có trần mỗi tài liệu và seed cố định. Trên split test có **sàn 100 câu trả lời được mỗi cụm** (bổ sung cùng ngày): cụm dưới sàn được nâng lên 100, phần còn lại chia theo R, nên gold set tăng lên khoảng 1.475 câu (test 1.100 câu trả lời được + 200 L6, dev khoảng 175) và kết quả theo cụm đủ chặt để so cụm với cụm. Số chính của luận văn là trung bình đều trên các cụm (macro), chọn trước lần đo đầu tiên; micro và kết quả theo mức chỉ báo kèm. Vì vậy bộ đánh giá **không** đại diện cho phân bố corpus, và macro cho cụm nhỏ trọng lượng bằng cụm lớn.

## Considered Options

- Tỉ lệ thuận số chunk: WSTG vẫn ~23%, nhiều tài liệu không có câu.
- √ theo tài liệu, WSTG là một tài liệu: WSTG chỉ ~5%, một nửa test case không có câu.
- √ trên từng test case WSTG như tài liệu độc lập: WSTG lại tăng lên ~30% (√ là hàm dưới cộng tính).
- Chia đều các cụm: cụm nhỏ bị khai thác quá mức (tới 39 câu một tài liệu).
