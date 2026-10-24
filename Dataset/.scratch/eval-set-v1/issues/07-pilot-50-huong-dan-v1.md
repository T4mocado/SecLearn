# 07: Pilot 50 câu, hướng dẫn v1, chỉnh cỡ gold

**Phía:** dự án bộ đánh giá (thao tác của người)

**What to build:** Người gán duyệt 50 ứng viên trải đều các mức trong Label Studio, đo thời gian gán thật, sửa hướng dẫn một lần thành v1 rồi đóng băng (sau đó chỉ errata có tăng phiên bản), và chỉnh cỡ gold nếu trung vị trên 3 phút mỗi câu. Spec: user story 48, 49; "Further Notes" về ngân sách giờ.

**Blocked by:** 05, 06

**Status:** ready-for-human

- [ ] 50 câu pilot được duyệt và nhập về với `lead_time`
- [ ] Trung vị thời gian gán được ghi lại; ngân sách giờ và cỡ gold được chỉnh nếu cần
- [ ] Hướng dẫn v1 được commit và đánh dấu đóng băng

## Comments

**2026-10-23, agent (chuẩn bị pilot, các bước cho bạn):** Đã chọn sẵn 50 câu và xuất task. Chưa ai gán nhãn.

**Mẫu pilot:** `questions/v1.0/pilot.jsonl`, lấy từ `questions/v1.0/filtered.jsonl` (lần filter 2026-10-22, 920 câu). Mỗi mức L1 / L3 / L4 / L5 / L6 lấy 10 câu, rải vòng tròn qua các cụm, seed `20261023`. Kết quả: 10 cụm × 4 câu + 10 câu L6(a) không có cụm; split test 45, dev 5. Câu pilot là câu thật, nhãn pilot làm theo hướng dẫn v0. Sau khi có v1, quyết định giữ hay duyệt lại 50 câu này ở ticket 12.

**Task:** `annotation/pilot/tasks.json` (50 task, guideline v0, snapshot `2026-10-18-owasp`), xuất bằng:
`.venv\Scripts\seclearn-eval.exe annotate export --snapshot corpus/2026-10-18-owasp --questions questions/v1.0/pilot.jsonl --out annotation/pilot/tasks.json`

**Các bước** (trong `Dataset/`):
1. `cd annotation; docker compose up -d`, mở http://localhost:8080, đăng nhập tài khoản đã tạo ở ticket 06 (dữ liệu nằm trong `annotation/ls-data/`).
2. Tạo project mới **"kiểm câu (pilot)"**. Settings → Labeling Interface → Code: dán toàn bộ `annotation/review.xml`, Save.
3. Import `annotation/pilot/tasks.json`. Phải ra đúng 50 task.
4. **Bắt buộc, mỗi project làm lại:** ở Data Manager bấm Columns, bỏ tích `llm_level`, `llm_answer`, `llm_quotes`, `question_en`. Kiểm bằng mắt là bảng không còn hiện đáp án / mức / trích dẫn của LLM.
5. Đọc hết `annotation/guideline-v0.md` một lần trước khi bắt đầu.
6. Gán bằng nút **"Label All Tasks"**, không mở task từ bảng. Mỗi câu làm đúng thứ tự mục 1 của hướng dẫn: đánh giá câu → đọc nguồn và tự bôi span → tích "Đã bôi xong span" → quyết định, chọn lại mức, sửa đáp án, ghi chú → Submit.
7. **Đo thời gian:** `lead_time` là thời gian task mở trên màn hình. Nghỉ thì nghỉ **giữa** hai task, đừng để task mở rồi bỏ đi. Chia đợt 1-1,5 giờ (50 câu × khoảng 3 phút ≈ 2,5 giờ, tức 2 đợt).
8. **Ghi lại chỗ hướng dẫn chưa rõ:** mỗi khi phân vân (mức nào, span đến đâu, L6 loại gì…), viết vào ô ghi chú của câu đó, bắt đầu bằng `HD:`. Đây là đầu vào để sửa hướng dẫn thành v1. Câu không chắc thì Skip và ghi lý do, không đoán.
9. Xong 50 câu: Export → JSON, lưu thành `annotation/exports/raw/pilot.json`.
10. Nhập về (nhãn pilot để riêng, không trộn vào `judgments/labels.jsonl` của gold):
    `.venv\Scripts\seclearn-eval.exe annotate import --snapshot corpus/2026-10-18-owasp --questions questions/v1.0/pilot.jsonl --export annotation/exports/raw/pilot.json --out annotation/pilot/reviewed.jsonl --labels annotation/pilot/labels.jsonl`
11. Báo agent. Agent sẽ: tính trung vị `lead_time` và tỷ lệ chấp nhận / sửa / loại theo mức, gom các ghi chú `HD:`, nháp `guideline-v1.md` (`guideline_version: v1`) để bạn duyệt. Nếu trung vị trên 3 phút / câu thì đề xuất chỉnh cỡ gold và ngân sách giờ. Bạn duyệt xong thì commit v1 và đánh dấu đóng băng (sau đó chỉ errata, có tăng phiên bản).

**2026-10-25, agent (pilot đã gán, sửa 4 lỗi trước đợt duyệt lớn):** Project "kiểm câu (pilot)" có 50 / 50 task đã gán, không task nào bị Skip (lần cuối 2026-10-24). Chưa có file export JSON trong dự án, nên kết quả dưới đây phân tích trên một bản export tạm dựng từ bản sao cơ sở dữ liệu của Label Studio (scratchpad, không commit). Bước 9-10 vẫn cần bạn làm: Export → `annotation/exports/raw/pilot.json`, rồi `annotate import` như trên.

Số liệu sơ bộ:
- `lead_time`: trung vị 445 s (khoảng 7,4 phút), bỏ 6 task để mở trên 30 phút thì khoảng 7 phút. Theo mức: L1 khoảng 6 phút, L4 khoảng 7,5, L3 / L5 khoảng 10, L6 10 s. Vượt ngưỡng 3 phút; spec ước 60 giờ ở 2,5 phút / câu, đo được thì 1.475 câu cần khoảng 170 giờ. **Cần chỉnh cỡ gold hoặc cách duyệt (tiêu chí 2).**
- 50 / 50 "Chấp nhận", nhưng 31 câu không "Tự đứng được" (26 "Mơ hồ", 4 "Hỏi ý kiến", 1 "Cần ngữ cảnh"). Không câu nào đổi mức, sửa đáp án hay có ghi chú. L4: 10 / 37 span dùng nhãn "Ô n". Chờ bạn giải thích cách hiểu mục "Câu hỏi" trước khi viết hướng dẫn v1.

Sửa, mỗi lỗi có test viết trước (đỏ rồi xanh), 222 pytest qua, `ruff check .` sạch:
- **Import đọc `\n` của Label Studio:** Label Studio 1.13.1 ghi mỗi chỗ xuống dòng trong chữ của region thành hai ký tự `\n` (87 / 126 region của pilot); offset vẫn đếm ký tự xuống dòng thật. `annotate import` giờ nhận cả hai dạng. Bản export thô của pilot nhập được, span giống hệt bản đã sửa tay.
- **`review.xml`:** "Đã bôi xong span", "Quyết định" và "Mức" giờ bắt buộc (cùng "Câu hỏi" đã bắt buộc từ trước). Thêm ô **"Câu hỏi sửa"** (`question_edit`) trong phần mở sau khi bôi xong: có chữ thì thay `question`, câu cũ giữ ở `review.original_question`. `question_en` không đổi theo.
- **`compare_cells` cho L4:** `filter` giờ điền một ô cho mỗi đơn vị, đúng thứ tự (Ô 1 = đơn vị 1, hiện ở nguồn trên; Ô 2 = nguồn dưới), tên ô là tiêu đề nguồn, khía cạnh để trống. Câu L4 lọc trước bản sửa này (như `filtered.jsonl` hiện có) được export với ô dựng từ nguồn, và import ghi ô vào câu.
- **`check` không kèm `--questions`** giờ chỉ đọc `questions/<version>/dev.jsonl` và `test.jsonl` (file `split` ghi), không đọc các file làm việc bên cạnh (`candidates*`, `filtered*`, `pilot`, `variants`…).

Khi tạo project duyệt mới: dán `review.xml` **hiện tại**, xuất lại task bằng `annotate export`, và làm lại bước ẩn 4 cột `llm_*`. Hướng dẫn v1 cần nói thêm về ô "Câu hỏi sửa" và quy ước Ô 1 / Ô 2.
