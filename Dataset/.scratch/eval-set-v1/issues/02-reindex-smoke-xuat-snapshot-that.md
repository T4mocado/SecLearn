# 02: Reindex, smoke trước / sau, xuất snapshot thật đầu tiên

**Phía:** app SecLearn (thao tác của người)

**What to build:** Corpus được reindex một lần với bộ trích và bộ cắt mới, có số smoke trước và sau để ghi nhận tác động của việc sửa trích xuất, và snapshot corpus đầu tiên nằm trong vùng snapshot của `Dataset/`. Spec: user story 6, 7; "Kiểm thật một lần".

**Blocked by:** 01

**Status:** resolved

- [x] Chạy smoke trước reindex, lưu kết quả
- [x] Chạy lệnh reindex có sẵn trên toàn corpus; mọi tài liệu ở trạng thái sẵn sàng, không có cảnh báo bỏ chunk
- [x] Chạy smoke sau reindex, lưu kết quả cạnh bản trước và ghi chênh lệch
- [x] Xuất snapshot thật; lệnh không từ chối
- [x] Kiểm tay vài chunk WSTG có tiêu đề test case đúng và không còn `## Sheet`

## Comments

**2026-10-19, agent:** Đã làm xong.

**Snapshot:** `Dataset/corpus/2026-10-18-owasp` (app commit `e854947`, `dirty: false`): 134 tài liệu, 5.915 chunk, chunker `sentence-v2`, offset theo code point. `seclearn-eval snapshot` và `check` đều OK. Sau lượt reindex "after", DB khớp snapshot ở 134/134 sha markdown và 5.915/5.915 sha1 nội dung chunk.

**Smoke truy xuất** (`npm run smoke:retrieval`, 40 câu của `data/eval/set-a`, `set-b`):
- Đo trên các chunk mà mô hình trả lời sẽ thấy (top K sau rerank), dùng đường `retrieveForQuestion` của app. Kế hoạch tìm kiếm do LLM lập ở lượt đầu được cache trong `data/eval/results/smoke-plans.json` và dùng lại, nên các lượt chỉ khác nhau ở corpus.
- Một quote gold được tính là "tìm thấy" khi chunk chứa cả quote, hoặc chứa một nửa quote dài ≥ 30 ký tự (vì quote có thể vắt qua ranh giới chunk). Cả 83/83 quote đều có trong ít nhất một chunk của corpus.
- Lượt "before": reindex bằng mã `893e3fa` từ một git worktree tạm (5.800 chunk, WSTG không có tiêu đề, 9 tài liệu còn `## Sheet`). Lượt "after": reindex bằng mã hiện tại (5.915 chunk).
- Chạy lại "before" lần hai cho kết quả giống hệt, nên phép đo không có nhiễu.

| Nhóm (34 câu có gold) | before | after |
|---|---|---|
| Hit (có ít nhất 1 quote gold trong top K) | 0,765 | 0,765 |
| Hit@1 | 0,559 | 0,559 |
| Quote recall | 0,554 | 0,554 |
| MRR | 0,645 | 0,645 |
| Doc hit (có chunk từ tài liệu gold) | 0,971 | 0,971 |
| 6 câu L6 không có gold: số chunk trả về trung bình | 0,167 | 0,333 |

Theo mức: L1 hit 1,0; L2 1,0; L3 0,667; L4 0,833; L5 0,333; L7 0,5 (giống nhau ở cả hai lượt).

**Đọc kết quả:** việc sửa trích xuất **không làm đổi** số đo trên gold. Lý do: cả 83 quote gold của bộ smoke đều nằm trong cheat sheet, không quote nào trong WSTG, và các tài liệu có `## Sheet` chỉ mất một dòng tiêu đề. Danh sách chunk trả về thì đổi ở 18/40 câu, chủ yếu là chunk WSTG được thay bằng chunk WSTG khác (WSTG giờ có tiêu đề test case). Với bộ smoke này, chỉ số gold không thể nhìn thấy thay đổi đó, vì không có nhãn cho các chunk WSTG được kéo vào. Đây chính là lý do spec cần pooling. Câu L6 a17 (Snort, corpus không có) giờ kéo về 2 chunk WSTG thay vì 1, tức nhích nhẹ theo hướng bất lợi cho việc từ chối.

**Sự cố trong lúc làm:** lần reindex đầu bằng mã cũ chạy khi embed server (cổng 8008) đã tắt. Vì ingest xoá chunk trước khi nhúng, cả 134 tài liệu bị đánh dấu `failed` với 0 chunk trong vài phút. Agent đã khởi động lại `python scripts/embed_server.py` (đang chạy nền từ phiên agent), reindex lại, và giờ cả 134 tài liệu đều `ready`. Bài học: kiểm embed server ngay trước khi reindex.

**Lưu ý:** `data/` nằm trong `.gitignore`, nên kết quả smoke trong `data/eval/results/` chưa được git quản lý (ticket 11 sẽ chuyển bộ smoke vào `Dataset/`).
