# Đóng băng gold set ở 249 câu đã duyệt, không theo cỡ 1.475 câu của kế hoạch

Ngày 2026-11-09, để kịp bảo vệ, bộ đánh giá dừng duyệt và đóng băng ở các câu đã có nhãn người: 199 câu được chấp nhận trong đợt duyệt lớn (hướng dẫn v1) và 50 câu pilot (hướng dẫn v0, 50/50 chấp nhận, không sửa câu nào), tổng **249 câu** (test 217, dev 32). 795 câu còn `pending` trong `questions/v1.0/review.jsonl` không vào gold. Kế hoạch lấy mẫu (`sample-plan.json`, ADR 0003) giữ nguyên làm thiết kế, nhưng gold set không khớp với nó: không đạt sàn 100 câu trả lời được mỗi cụm trên test (mỗi cụm chỉ có 13–27 câu trả lời được trên test), và **không có câu L2, L7, L6(b), L6(c)**, vì biến thể và L6(b) chỉ được dựng sau khi duyệt xong câu gốc (ticket 09). Phần "Cách báo chuẩn" của `CARD.md` không đổi: số chính vẫn là recall@5 macro trên 10 cụm, chỉ câu trả lời được của test, cùng cách tính sai số và kiểm định. Chưa có lượt đo nào trên gold set nên đây không phải đổi đăng ký sau khi thấy số. Theo quy tắc phiên bản ở `CHANGELOG.md` (thêm câu là MINOR) bản này là **0.2.0**; 1.0.0 dành cho gold set đủ kế hoạch.

Hệ quả cho luận văn: khoảng tin cậy theo cụm rộng (khoảng ±20 điểm), nên so cụm với cụm gần như không kết luận được; số theo mức chỉ có L1, L3, L4, L5 và L6(a); số từ chối L6 dựa trên khoảng 20 câu L6(a). Các điều này phải ghi trong phần hạn chế, cùng với việc 50 câu được gán theo hướng dẫn v0 (10 câu L4 trong đó không có bước đánh dấu ô bằng tay của v1).

## Bỏ bước chấm pool bằng tay (2026-11-10)

Pool 5 hệ thống, sâu 10, có 6.947 chunk, Gemini (`judge-umbrela-v1`) đã chấm hết. Phần người chấm theo thiết kế là 3.673 chunk, khoảng 30–40 giờ, không kịp nên **bỏ hẳn**. Thiết kế không đổi: qrels vẫn là gold span cộng nhãn người, và nhãn Gemini không bao giờ được tính là liên quan. Vì không có nhãn người nào, qrels (`qrels/sentence-v2.qrels`) chỉ gồm 493 chunk liên quan từ gold span và 3.636 chunk Gemini cho 0, ghi là đã chấm, không liên quan. Có 2.818 chunk Gemini cho từ 1 trở lên mà không chứa gold (271 chunk trong đó được 2 hoặc 3) nằm ngoài qrels, tức là chưa được chấm. Hệ quả cho luận văn: không có κ Gemini × người và không có tỉ lệ âm tính giả, nên các mục này trong CARD ghi "chưa có". Tập liên quan có thể thiếu những chunk trả lời đúng mà nằm ngoài gold span, nên recall đo được là recall so với gold span. Judged@10 thấp hơn mức có nhãn người. Các điểm này phải ghi trong phần hạn chế, kèm con số 271 chunk Gemini cho từ 2 trở lên mà chưa có người kiểm.

## Considered Options

- Duyệt thêm khoảng 300 câu (35–40 giờ) để mỗi cụm có 40–50 câu: không kịp tiến độ bảo vệ.
- Duyệt hết 995 câu rồi dựng biến thể (khoảng 120 giờ): không kịp.
- Chỉ 199 câu theo hướng dẫn v1, bỏ pilot: bộ đồng nhất hơn nhưng mỗi cụm mất khoảng 5 câu; chọn gộp pilot và ghi rõ hướng dẫn v0.
