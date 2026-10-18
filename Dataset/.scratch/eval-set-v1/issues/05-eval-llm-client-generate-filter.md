# 05: Eval: LLM client có cache, sinh ứng viên và lọc 6 bước

**Phía:** dự án bộ đánh giá (`Dataset/`)

**What to build:** Claude và Gemini nằm sau một interface nhỏ (gửi prompt, nhận văn bản hoặc JSON có cấu trúc), có client giả cho test; khoá API đọc từ biến môi trường; model ghim trong cấu hình; DeepSeek không được dùng. Kết quả API được cache theo khoá prompt + model + đầu vào để chạy lại không tốn tiền. Lệnh `generate` sinh dư khoảng 1,6 lần theo kế hoạch cho các mức gốc: L1 / L3 theo kiểu rút câu khẳng định rồi đặt câu hỏi, L4 / L5 từ cặp đơn vị cùng cụm, L6(a) ngoài lĩnh vực; mỗi ứng viên có câu tiếng Việt, `question_en`, đáp án tham chiếu, mức dự kiến, quote nguyên văn, và `generation {model, prompt_version, seed}`. Lệnh `filter` chạy 6 bước theo thứ tự: quote có thật trong snapshot; Gemini trả lời chỉ từ bằng chứng; Gemini phân loại lại mức (đổi nhãn hoặc loại); bỏ tham chiếu "tài liệu này" / hình / bảng / chương; dedup ngữ nghĩa trong cụm; kiểm trùng từ vựng cho L2. Spec: user story 26-28, 32-40; Seam 4.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Test bằng client giả: generate ra ứng viên đúng schema, đúng ô của kế hoạch
- [ ] Mỗi bước lọc ghi số vào, số loại, lý do; test từng bước loại đúng ca hỏng
- [ ] Chạy lại generate / filter không gọi lại API cho phần đã cache
- [ ] Không có khoá API nào bị ghi vào file của bộ đánh giá
