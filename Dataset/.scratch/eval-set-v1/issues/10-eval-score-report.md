# 10: Eval: chấm điểm và báo cáo

**Phía:** dự án bộ đánh giá (`Dataset/`)

**What to build:** Lệnh `score` nhận qrels + run TREC và cho ra Hit@k, MRR, nDCG@10, Recall@k (ranx), Judged@10 (ir-measures) theo micro, macro 10 cụm (số chính), theo mức và hậu phân tầng; mỗi số kèm sai số chuẩn điều chỉnh theo cụm (cụm là tài liệu hoặc test case WSTG, biến thể gom theo `seed_id`; phương trình 4 và 8 của Miller 2024); tầng dưới khoảng 300 câu dùng Wilson; so sánh hai cấu hình ghép cặp theo câu với sai số ghép cặp theo cụm và kiểm định Fisher randomization; L6 báo riêng (từ chối đúng / sai). Định dạng run và độ đo phần trả lời được định nghĩa nhưng chưa chạy. Lệnh `report` sinh bảng markdown và LaTeX, kết quả theo cụm kèm số câu, số tài liệu, khoảng tin cậy. Spec: user story 61-67.

**Blocked by:** 03

**Status:** resolved

- [x] Test trên dữ liệu nhỏ có đáp số tính tay: micro, macro, SE theo cụm, Wilson, so sánh ghép cặp
- [x] L6 không bị gộp vào điểm câu trả lời được
- [x] Report sinh được cả markdown và LaTeX từ cùng kết quả

## Comments

**2026-10-19, agent:** Phần code đã xong (chưa chạy trên dữ liệu thật vì chưa có qrels của 08 và chưa có bộ chạy SecLearn).

**Lệnh** (chạy trong `Dataset/`):
1. `uv run seclearn-eval score --questions questions/v1.0/test.jsonl --qrels <qrels> --run runs/<run_id> [--baseline runs/<run_id_khác>] [--units corpus/<snapshot>/units.jsonl] [--min-grade 2]`: đọc `runs/<run_id>/run.trec` (và `answers.jsonl` nếu có), ghi `runs/<run_id>/scores.json` (hoặc `--out`).
2. `uv run seclearn-eval report --scores runs/<run_id>/scores.json [--out reports/<tên>]`: ghi `<tên>.md` và `<tên>.tex` từ cùng một danh sách bảng, nên hai bản không thể lệch nhau.

**Đã làm:**
- Độ đo theo câu: ranx cho Hit@1/5/10, MRR@10, nDCG@10, Recall@5/10; ir-measures cho Judged@10. Thứ hạng lấy theo cột `rank` của run, không theo `score`. Câu không có gì trong run được 0 ở mọi độ đo.
- Tầng: micro, macro trên các cụm chủ đề (số chính), hậu phân tầng (trọng số = tỉ lệ `weight_chunks` của đơn vị lấy mẫu được trong từng cụm, chỉ khi có `--units`), từng cụm (kèm số câu, số tài liệu / test case), từng mức.
- Sai số chuẩn theo cụm: phương trình 4 của Miller 2024. Nhóm sai số của một câu là tài liệu của đơn vị đầu tiên trong `unit_ids`, riêng WSTG thì là chính đơn vị (test case, phần mở đầu, Reporting…); biến thể lấy nhóm của câu gốc theo `seed_id`. Macro và hậu phân tầng: SE² = Σ w²·SE²_cụm (nhóm lồng trong cụm nên các cụm độc lập).
- Khoảng tin cậy: tầng dưới 300 câu có điểm 0/1 (Hit@k) dùng Wilson trên cỡ mẫu hiệu dụng n / hệ số thiết kế (SE²_cụm / (p(1−p)/n), sàn 1); còn lại dùng trung bình ± 1,96 SE, cắt về [0, 1].
- So sánh ghép cặp (`--baseline`): hiệu theo câu, SE theo cụm của hiệu (phương trình 8 + điều chỉnh của phương trình 4), cho micro, macro và từng cụm. p-value chính là kiểm định ngẫu nhiên hoá **đổi nhãn A/B cho cả nhóm** (cả tài liệu / test case), đúng 2^G khi G ≤ 16 nhóm, ngoài ra 20.000 lần lấy mẫu với seed cố định. Cột phụ "p (theo câu, ranx)" là Fisher randomization của ranx, đổi nhãn từng câu (chỉ ở micro).
- L6: không vào bất kỳ số nào của phần truy xuất (không vào micro, macro, cụm hay mức). Báo riêng: từ chối đúng trên L6 (chung và theo loại a/b/c) và từ chối sai trên câu trả lời được, mỗi câu là tỉ lệ từ chối trên K lần trả lời. Khi chưa có `answers.jsonl` thì báo "chưa đo".
- Định dạng phần trả lời: `AnswerLine` trong `schema.py` (`qid`, `k`, `answer`, `refused`, `cited_chunks`, và `correctness` 0-2, `faithful`, `citations_correct` để người / judge điền sau). Chỉ phần từ chối được tính; các độ đo còn lại chưa chạy.

**Test:** 18 pytest mới (tổng 50). Số tính tay gồm: SE theo cụm (0,0096 và 0,125), Wilson (có và không co theo hệ số thiết kế), macro 0,75 / hậu phân tầng 0,625, hiệu ghép cặp và SE, p theo nhóm (0,5; 1; 0,75 với trọng số macro) so với p theo câu 0,125, và một bộ 5 câu đi qua CLI (micro, macro, cụm, mức, hậu phân tầng, nDCG có mức, Judged, L6, từ chối, so sánh, report).

**Bạn xem lại:**
1. **Var trong phương trình 4** dùng phương sai tổng thể (chia n, như p(1−p) của Miller), không chia n−1.
2. **Ngưỡng liên quan** cho Hit / MRR / Recall mặc định là mức ≥ 2 (`--min-grade`); nDCG dùng nguyên mức 0-3 (gain tuyến tính của ranx). Nếu muốn mức 1 cũng tính là liên quan thì đổi mặc định.
3. **p-value**: spec ghi "ranx cho Fisher randomization", nhưng Fisher của ranx đổi nhãn từng câu, bỏ qua cụm, nên lạc quan như SE không điều chỉnh. Agent lấy p theo nhóm làm số chính và giữ p của ranx làm cột phụ. Bạn chọn cột nào báo trong luận văn.
4. **Wilson + cụm**: spec chỉ nói "dưới 300 câu dùng Wilson"; agent co n theo hệ số thiết kế để khoảng vẫn có điều chỉnh theo cụm (user story 65). Độ đo không phải 0/1 (MRR, nDCG, Recall, Judged) ở tầng nhỏ vẫn dùng khoảng chuẩn.
5. **Câu L4 / L5** (hai đơn vị) được xếp vào nhóm của đơn vị đầu tiên. Gộp hai tài liệu thành một nhóm (union-find) sẽ dễ nối cả cụm thành một nhóm.
6. **Hậu phân tầng** cân theo tỉ lệ chunk của corpus trong từng cụm. Spec không nói rõ trọng số; nếu bạn muốn cân theo cách khác (ví dụ theo mức) thì cần sửa.
7. **Judged@10** của câu mà run không trả gì được tính là 0.

**2026-10-19, agent (sửa sau review):** Các lỗi review đã sửa, mỗi lỗi có test số tính tay viết trước. Các lựa chọn phương pháp ở mục "Bạn xem lại" giữ nguyên.
- `stats.combine()` (macro, hậu phân tầng) cắt khoảng tin cậy về [0, 1] như `estimate()`; riêng hiệu ghép cặp macro (có thể âm) không cắt (`bounded=False`).
- **So sánh cụm với cụm** (user story 65): `score` ghi `cluster_differences` cho mọi cặp cụm × mọi độ đo: hiệu hai trung bình, SE² = SE²_A + SE²_B (hai cụm không chung nhóm sai số), kiểm z hai phía, p hiệu chỉnh Holm trong từng độ đo; cụm không có độ phân tán (SE 0 cả hai) cho p = 1. `report` có bảng "Khác biệt giữa hai cụm có ý nghĩa thống kê", chỉ liệt kê cặp có p (Holm) < 0,05; không có cặp nào thì ghi "(không cặp nào)". Bạn xem lại: dùng Holm cho 45 cặp là lựa chọn của agent (để không kết luận quá mức); bỏ hiệu chỉnh thì đọc cột `p_value`.
- `score --run` lưu vào `args.run_dir`, mọi lệnh con dùng chung `run` làm handler (bỏ cách `run_cmd`). `report` ghi file qua `io.write_text`; đổi tên hàm `_f` thành `_num`.

**2026-10-20, người duyệt (agent ghi lại): chốt các lựa chọn phương pháp.** Giữ nguyên toàn bộ cách đang cài; ticket 11 ghi các lựa chọn này vào card trước lần đo đầu tiên.
- **A. p-value chính** khi so hai cấu hình: kiểm định ngẫu nhiên hoá đổi nhãn theo nhóm (tài liệu / test case WSTG). Fisher theo câu của ranx giữ làm cột phụ. Spec (Implementation Decisions, mục "Chấm điểm") đã sửa theo.
- **B. So cụm với cụm**: giữ hiệu chỉnh Holm trong từng độ đo (45 cặp); bảng chỉ liệt kê cặp có p (Holm) < 0,05.
- **C. Ngưỡng liên quan** cho Hit / MRR / Recall: mức ≥ 2 (`--min-grade 2`); nDCG dùng nguyên thang 0-3.
- **D. Câu L4 / L5** xếp vào nhóm của đơn vị đầu tiên, **kèm số kiểm độ nhạy**: sai số tính lại khi gộp nhóm hai tài liệu của mỗi câu L4 / L5, và (chỉ cho micro) khi nhóm = cụm chủ đề. Với từng cụm và macro, nhóm = cụm chủ đề suy biến nên không dùng. Phần code làm ở ticket 13.
- **E. Wilson** ở tầng dưới 300 câu cho độ đo 0/1, cỡ mẫu co theo hệ số thiết kế; độ đo khác dùng khoảng chuẩn.
- **F. Hậu phân tầng** cân theo tỉ lệ chunk của corpus trong từng cụm; là số phụ, số chính vẫn là macro (ADR 0003).
- **G.** Phương sai chia n (như Miller) trong phương trình 4; Judged@10 của câu run không trả gì là 0.
