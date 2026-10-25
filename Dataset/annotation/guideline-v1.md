# Hướng dẫn gán nhãn bộ đánh giá SecLearn

guideline_version: v1

- **Trạng thái:** v1, sửa một lần từ v0 sau pilot 50 câu (ticket 07), **đóng băng** từ đợt duyệt lớn (ticket 12). Mọi sửa sau đó là errata, tăng phiên bản phụ (v1.1, …) kèm danh sách câu đã kiểm lại. Thay đổi so với v0: ô "Câu hỏi sửa" (mục 1, 2, 8), các ô bắt buộc (mục 1), quy ước Ô 1 / Ô 2 cho L4 (mục 3, 4), cách giữ `lead_time` đúng (mục 8).
- **Snapshot:** `2026-10-18-owasp`. Mọi ví dụ dưới đây trích nguyên văn từ markdown của snapshot này, dạng `[nguồn: doc_key]` rồi trích dẫn trong ngoặc kép; test `tests/test_guideline.py` kiểm từng trích dẫn có thật.
- **Phiên bản đi theo nhãn:** dòng `guideline_version:` ở trên được `annotate export` ghi vào từng task, rồi vào `review.guideline_version` và `judgments/labels.jsonl` khi nhập về. Sửa hướng dẫn thì đổi dòng này trước khi xuất task mới.
- Thuật ngữ theo `GLOSSARY.md` (gold span, mức, cụm chủ đề, snapshot).

## 1. Trình tự làm một câu (project "kiểm câu")

Màn hình xếp theo đúng thứ tự làm, từ trên xuống. Không kéo xuống phần 3 trước khi xong phần 2.

1. **Đọc câu hỏi (và các lượt trước nếu là L7, các ô nếu là câu so sánh), chưa đọc nguồn.** Chọn một ô ở "Câu hỏi" theo mục 2. Mục đích: đánh giá câu như người dùng thật đọc nó, không bị tài liệu dẫn dắt.
2. **Đọc nguồn và tự bôi span.** Nguồn là cả đơn vị lấy mẫu (một mục `##` của cheat sheet hoặc một test case WSTG), là markdown liên tục, không có ranh giới chunk. Câu L4 / L5 có hai nguồn. Bôi theo mục 4. Câu L6(a) / L6(b) không có gì để bôi.
3. **Tích "Đã bôi xong span"**: lúc này mới hiện mức LLM khai báo, đáp án, trích dẫn của LLM và bản tiếng Anh. So với span của mình; nếu LLM chỉ ra bằng chứng mình bỏ sót thì quay lại bôi thêm (được phép, nhưng ghi "bổ sung sau khi xem LLM" vào ghi chú).
4. **Quyết định** (mục 8), **chọn lại mức** (kể cả khi giữ nguyên), sửa câu hỏi nếu cần (ô "Câu hỏi sửa", mục 2), sửa đáp án nếu cần (mục 5), ghi chú, Submit.

Các ô **bắt buộc**: "Câu hỏi", "Đã bôi xong span", "Quyết định" và "Mức". Thiếu một ô thì Label Studio không cho Submit. Ô văn bản ("Câu hỏi sửa", "Đáp án sửa", "Ghi chú") chỉ được lưu khi bấm **Add** hoặc Enter sau khi gõ (Shift + Enter để xuống dòng).

Không làm ở chế độ bảng (Data Manager) với các cột `llm_*` đang hiện: ẩn các cột đó, hoặc dùng nút "Label All Tasks" để chỉ thấy giao diện gán.

## 2. Câu hỏi tốt / xấu (đánh giá trước khi đọc nguồn)

| Chọn | Khi nào | Ví dụ |
|---|---|---|
| Tự đứng được | Một người học an toàn web hiểu được câu và biết mình đang hỏi gì, không cần biết câu sinh từ tài liệu nào | "Session ID cần tối thiểu bao nhiêu bit entropy?" |
| Mơ hồ | Có nhiều cách hiểu, hoặc đáp án phụ thuộc điều kiện câu không nói | "Nên dùng bao nhiêu vòng lặp?" (thuật toán nào?) |
| Cần ngữ cảnh tài liệu | Nhắc "tài liệu này", "bảng trên", "hình 2", "chương 4", "ví dụ trong bài" | "Theo tài liệu này, có mấy cách triển khai double-submit?" |
| Hỏi ý kiến | Không có đáp án trong tài liệu nào, chỉ có quan điểm | "Argon2id có phải lựa chọn tốt nhất không?" |

Câu chọn khác "Tự đứng được" thường sẽ bị **Loại**, hoặc **Sửa** nếu sửa câu chữ là đủ: gõ cả câu mới vào ô **"Câu hỏi sửa"**. Câu mới thay câu cũ trong bộ đánh giá, câu cũ được giữ ở `review.original_question`. Câu mới phải giữ nguyên ý và vẫn trả lời được bằng đúng các span đã bôi; đổi ý thì Loại.

## 3. Các mức

Mức là loại khó của câu theo thang của SecLearn (GLOSSARY "Mức (L1-L7)"). Chọn mức theo **bằng chứng cần để trả lời**, không theo độ dài câu hay mức LLM khai báo. Ca dễ nhầm: một danh sách nằm liền trong một câu vẫn là **L3** nếu đáp án là cả danh sách (nhiều ý gộp lại), không phải L1.

### L1 Tra cứu một đoạn

Đáp án nằm trong một đoạn liền; câu hỏi dùng thuật ngữ trùng tài liệu.

- **Tốt:** "Session ID cần tối thiểu bao nhiêu bit entropy để chống đoán mò?" Bằng chứng: [nguồn: Session_Management_Cheat_Sheet] "Session identifiers must have at least 64 bits of entropy to prevent brute-force session guessing attacks."
- **Tốt:** "Thuộc tính cookie HttpOnly ngăn điều gì?" Bằng chứng: [nguồn: Session_Management_Cheat_Sheet] "The HttpOnly cookie attribute instructs web browsers not to allow scripts (e.g. JavaScript or VBscript) an ability to access the cookies via the DOM document.cookie object."
- **Xấu:** "Theo cheat sheet trên, mục Session ID Entropy nói gì?" Lý do: cần ngữ cảnh tài liệu, và không hỏi một sự kiện cụ thể.
- **Xấu:** "Session ID dùng hexadecimal phải dài ít nhất bao nhiêu ký tự, và vì sao entropy quan trọng hơn độ dài?" Lý do: hai ý ở hai đoạn khác nhau của mục Session ID Length, là L3.

### L2 Diễn đạt lại / không dấu

Như L1 nhưng không dùng thuật ngữ của tài liệu, viết không dấu, hoặc thay từ Anh bằng từ Việt. Biến thể của một câu L1 / L3 đã duyệt, cùng `seed_id`, cùng bằng chứng.

- **Tốt:** "lam sao de trinh duyet khong cho JS doc cookie dang nhap" (biến thể của câu HttpOnly ở L1). Bằng chứng như câu gốc: [nguồn: Session_Management_Cheat_Sheet] "The HttpOnly cookie attribute instructs web browsers not to allow scripts (e.g. JavaScript or VBscript) an ability to access the cookies via the DOM document.cookie object."
- **Tốt:** "Mã định danh phiên phải ngẫu nhiên đến mức nào để kẻ tấn công không đoán được?" (không dùng "entropy", "64 bits").
- **Xấu:** "HttpOnly cookie attribute ngăn scripts access cookies via DOM như thế nào?" Lý do: chép nguyên cụm từ tài liệu, thực chất là L1.
- **Xấu:** "lam sao chong CSRF" Lý do: đổi cả nghĩa so với câu gốc (câu gốc hỏi về HttpOnly); biến thể phải giữ nguyên ý.

### L3 Nhiều đoạn, một chủ đề

Cần gộp từ hai ý trở lên trong cùng chủ đề (liệt kê, các bước, các tham số), thường trong một đơn vị có ≥ 2 chunk.

- **Tốt:** "OWASP khuyến nghị cấu hình tối thiểu nào cho Argon2id, và nếu không có Argon2id thì dùng gì với tham số nào?" Bằng chứng (hai span): [nguồn: Password_Storage_Cheat_Sheet] "Use Argon2id with a minimum configuration of 19 MiB of memory, an iteration count of 2, and 1 degree of parallelism." và [nguồn: Password_Storage_Cheat_Sheet] "If Argon2id is not available, use scrypt with a minimum CPU/memory cost parameter of (2^17), a minimum block size of 8 (1024 bytes), and a parallelization parameter of 1."
- **Tốt:** "Cookie phiên cần những thuộc tính bảo mật nào và mỗi thuộc tính chống gì?" (Secure, HttpOnly, SameSite… ở nhiều đoạn của mục Cookies).
- **Xấu:** "Argon2id cần bao nhiêu MiB bộ nhớ?" Lý do: một con số trong một câu, là L1.
- **Xấu:** "Liệt kê mọi khuyến nghị trong Password Storage Cheat Sheet." Lý do: không có phạm vi, cần ngữ cảnh tài liệu, không bôi được span tối thiểu.

### L4 So sánh

Hai thực thể trở lên theo một hay nhiều khía cạnh (`compare_cells`), mỗi ô có span riêng (nhãn "Ô 1", "Ô 2", …).

Câu L4 của bộ này so sánh một thứ ở nguồn trên với một thứ ở nguồn dưới, nên mục "Câu hỏi" hiện **Ô 1 = nguồn trên, Ô 2 = nguồn dưới** (tên ô là tiêu đề nguồn). Hai vế có thể nằm trong hai mục của cùng một tài liệu. Câu ghép hai thứ không có khía cạnh chung để so thì Loại, kể cả khi mỗi vế đều có bằng chứng.

- **Tốt:** "So sánh Signed Double-Submit Cookie và Naive Double-Submit Cookie về khả năng chống cookie injection." Ô 1: [nguồn: Cross-Site_Request_Forgery_Prevention_Cheat_Sheet] "Always bind the CSRF token explicitly to session-specific data." Ô 2: [nguồn: Cross-Site_Request_Forgery_Prevention_Cheat_Sheet] "Though the Naive Double-Submit Cookie method is simple and scalable, it remains vulnerable to cookie injection attacks"
- **Tốt:** "Cookie HttpOnly và Web Storage (localStorage) khác nhau thế nào khi trang có lỗi XSS?" Ô 1: [nguồn: Session_Management_Cheat_Sheet] "The HttpOnly cookie only protects the confidentiality of the cookie" Ô 2: [nguồn: HTML5_Security_Cheat_Sheet] "A single Cross Site Scripting can be used to steal all the data in these objects, so again it's recommended not to store sensitive information in local storage."
- **Xấu:** "Nên dùng Signed hay Naive Double-Submit Cookie?" Lý do: "so sánh giả", tài liệu đã kết luận sẵn trong một câu, [nguồn: Cross-Site_Request_Forgery_Prevention_Cheat_Sheet] "always prefer the Signed Double-Submit Cookie pattern with session-bound HMAC tokens", nên thực chất là L1.
- **Xấu:** "So sánh XSS và tấn công DDoS." Lý do: hai thực thể không có khía cạnh chung để so; đáp án thành hai định nghĩa rời.

### L5 Nhiều bước / tình huống

Suy luận nối hai bằng chứng trở lên, hoặc áp dụng vào một tình huống; không bằng chứng đơn lẻ nào đủ trả lời.

- **Tốt:** "Ứng dụng lưu token phiên trong localStorage và có một lỗi XSS. Kẻ tấn công lấy được gì, và chuyển token sang cookie HttpOnly giúp được phần nào?" Bằng chứng: [nguồn: HTML5_Security_Cheat_Sheet] "A single Cross Site Scripting can be used to steal all the data in these objects, so again it's recommended not to store sensitive information in local storage." và [nguồn: Session_Management_Cheat_Sheet] "The HttpOnly cookie only protects the confidentiality of the cookie"
- **Tốt:** "Đội build image Docker cho app Node.js và truyền token npm bằng `--build-arg`. Token có lộ không, lộ ở đâu?" Bằng chứng: [nguồn: NodeJS_Docker_Cheat_Sheet] "Build arguments passed like that to Docker are kept in the history log."
- **Xấu:** "Nếu session ID chỉ có 32 bit entropy thì có đủ không?" Lý do: chỉ cần một câu ngưỡng 64 bit, là L1 bọc tình huống.
- **Xấu:** "Hãy thiết kế toàn bộ hệ thống xác thực an toàn cho ngân hàng." Lý do: không có đáp án giới hạn trong corpus, không bôi được span đủ.

### L6 Không trả lời được

Corpus không có đáp án. Ba loại, theo tỉ lệ kế hoạch 1 : 2 : 1: (a) ngoài lĩnh vực, (b) thuộc an ninh nhưng corpus không có, (c) tiền đề sai. Xem mục 6.

- **Tốt (a):** "Giá vàng SJC hôm nay bao nhiêu?"
- **Tốt (b):** "Viết luật Snort để phát hiện quét cổng SYN thế nào?" (grep `snort` trên 134 tài liệu của snapshot: 0 kết quả).
- **Tốt (c):** "Vì sao OWASP khuyên băm mật khẩu bằng MD5 cho nhanh?" Span bác bỏ: [nguồn: Password_Storage_Cheat_Sheet] "they should be slow (unlike algorithms such as MD5 and SHA-1, which were designed to be fast)"
- **Xấu (b):** "Session ID cần bao nhiêu bit entropy?" gán L6(b). Lý do: corpus có đáp án (xem L1); phải grep trước khi kết luận.
- **Xấu (c):** "Vì sao OWASP khuyên dùng Argon2id?" gán L6(c). Lý do: tiền đề đúng, đây là câu trả lời được.

### L7 Hội thoại

Câu tiếp nối chỉ hiểu được khi đọc các lượt trước (`turns`); dựng từ câu L1 / L3 / L4 đã duyệt, cùng `seed_id`. Bằng chứng là bằng chứng cho **lượt cuối**.

- **Tốt:** lượt trước "Thuộc tính HttpOnly của cookie dùng để làm gì?" → câu "Thế còn Secure thì sao?" Bằng chứng: [nguồn: wstg-v4.2] "The Secure attribute tells the browser to only send the cookie if the request is being sent over a secure channel"
- **Tốt:** lượt trước hỏi tham số Argon2id → câu "Nếu thư viện không có cái đó thì dùng gì?" (bằng chứng: câu scrypt ở L3).
- **Xấu:** lượt trước hỏi HttpOnly → câu "Session ID cần bao nhiêu bit entropy?" Lý do: không phụ thuộc lượt trước, là L1.
- **Xấu:** "còn cái thứ hai thì sao?" khi lượt trước không liệt kê gì. Lý do: không xác định được "cái thứ hai".

## 4. Quy tắc span

1. **Tự bôi trước khi xem đáp án LLM** (mục 1). Span LLM không được tô sẵn.
2. **Span tối thiểu đủ trả lời:** thường là một câu hoặc một mệnh đề; không bôi cả đoạn khi một câu đủ. Ví dụ L1 ở trên bôi đúng một câu, không bôi cả mục Session ID Entropy.
3. **Thông tin rải rác thì nhiều span**, mỗi span một ý (L3, L5). Không bôi một span dài vắt qua phần không liên quan.
4. **Không bôi dòng tiêu đề** (`## …`) và không vắt qua ranh giới mục. Span nằm trong đoạn nguồn đang hiện.
5. **Nhãn span:** "Bằng chứng" cho câu thường; "Ô 1", "Ô 2", … cho từng ô của câu so sánh (thứ tự ô như ở `compare_cells`); "Bác bỏ tiền đề" cho L6(c). **Câu L4 luôn tự bôi bằng nhãn ô** (Ô 1 ở nguồn trên, Ô 2 ở nguồn dưới), không giữ trích dẫn của LLM: trích dẫn của LLM không gắn với ô nào. Ở pilot chỉ 10 / 37 span của câu L4 dùng nhãn ô.
6. **Bôi theo ký tự, không cần thẳng hàng từ**, nhưng nên bắt đầu và kết thúc ở ranh giới từ / câu. Khoảng trắng và xuống dòng ở hai đầu không sao: khi nhập về, offset được kiểm bằng văn bản đã chuẩn hoá khoảng trắng.
7. **Cùng thông tin ở cả cheat sheet và WSTG:** bôi ở nguồn đang hiện; phần khác được bổ sung ở bước chấm pool (chunk được chấm 2-3 mà chưa có span sẽ mở rộng gold).
8. **Không chắc** span đủ hay không: bôi, rồi ghi vào ghi chú; đừng đoán đáp án ngoài tài liệu.

Khi nhập về, `annotate import` đổi offset của Label Studio (đơn vị UTF-16 của trình duyệt) sang code point của snapshot, và từ chối nếu chữ trong span không khớp markdown. Người gán không cần làm gì với offset.

## 5. Đáp án tham chiếu

- Ô "Đáp án sửa" để trống nghĩa là giữ đáp án của LLM. Chỉ gõ khi sửa.
- Tiếng Việt; giữ nguyên thuật ngữ, tên header, tên hàm, tham số bằng tiếng Anh (`HttpOnly`, `SameSite=Strict`, `Argon2id`).
- Chỉ dùng thông tin trong span; không thêm kiến thức ngoài tài liệu. Tài liệu sai hoặc lỗi thời thì ghi chú, không sửa nội dung.
- L6: không có đáp án; với L6(c) đáp án mong đợi là chỉ ra tiền đề sai (dựa vào span bác bỏ).

## 6. Quy tắc L6

- **(a) Ngoài lĩnh vực:** không liên quan an toàn thông tin. Không cần bằng chứng.
- **(b) Corpus không có:** thuộc an ninh nhưng 134 tài liệu không trả lời. Trước khi chấp nhận, xác nhận bằng chứng kèm theo câu (từ khoá tiếng Anh đã grep trên snapshot, top-20 của 2 retriever) và **ghi lệnh grep / truy vấn đã dùng vào ghi chú**, ví dụ `grep -ril "snort" corpus/2026-10-18-owasp/md` → 0 file. Thấy dù một đoạn trả lời được (kể cả một phần) thì không phải L6(b): đổi mức hoặc loại.
- **(c) Tiền đề sai:** đổi một chi tiết của câu L1 đã duyệt; **bắt buộc có span "Bác bỏ tiền đề"** chỉ ra chi tiết đúng. Không bôi được span bác bỏ thì loại.
- Chọn "Loại L6" ở giao diện cho đúng loại; đổi mức khỏi L6 thì bỏ trống loại L6.

## 7. Thang 0-3 (project "chấm pool")

Mỗi task là một câu và một chunk (đúng văn bản hệ truy xuất thấy, kèm tiêu đề mục chèn đầu chunk). Điểm của LLM judge không hiện. Mượn thang TREC DL; độ đo nhị phân tính 2-3 là liên quan.

| Điểm | Nghĩa |
|---|---|
| 3 | Chunk chứa đáp án trực tiếp, đủ để trả lời |
| 2 | Có đáp án nhưng không rõ, chỉ một phần, hoặc lẫn nhiều thông tin khác |
| 1 | Đúng chủ đề nhưng không trả lời câu hỏi |
| 0 | Không liên quan |

Ví dụ cho câu "Session ID cần tối thiểu bao nhiêu bit entropy để chống đoán mò?":

- **3:** chunk chứa [nguồn: Session_Management_Cheat_Sheet] "Session identifiers must have at least 64 bits of entropy to prevent brute-force session guessing attacks."
- **2:** chunk của mục Session ID Length, chỉ nhắc lại ngưỡng trong câu về độ dài: [nguồn: Session_Management_Cheat_Sheet] "they contain at least 64 bits of entropy to prevent brute-force guessing attacks. Although session ID length matters, it's the entropy that ensures security."
- **1:** chunk về HttpOnly của cùng cheat sheet: đúng chủ đề phiên nhưng không nói gì về entropy.
- **0:** chunk về tham số Argon2id của Password Storage Cheat Sheet.

Chấm theo chunk đứng một mình, không theo tài liệu chứa nó. Chunk chấm 2-3 mà không chồng lên gold span nào sẽ được mở rộng gold (ticket 08).

## 8. Quyết định và khi nào bỏ qua

- **Chấp nhận:** câu tự đứng được, đúng mức (sau khi chọn lại), span và đáp án đúng. Nếu không bôi span nào mà Chấp nhận, gold giữ span của LLM; hãy chỉ làm vậy khi span LLM đúng là span tối thiểu.
- **Sửa:** sửa được bằng cách đổi mức, sửa đáp án, bôi lại span hoặc sửa câu chữ (gõ câu mới vào ô "Câu hỏi sửa", mục 2). Span mình bôi luôn thay **toàn bộ** span LLM, nên đã bôi thì bôi đủ mọi bằng chứng câu cần.
- **Loại:** câu xấu theo mục 2 không sửa được, không trả lời được mà không phải L6, trùng ý một câu khác, hoặc L6(c) không có span bác bỏ.
- **Không chắc:** dùng Skip trong Label Studio và ghi lý do; không đoán. Task bị skip giữ trạng thái `pending` khi nhập về.

Chia đợt 1-1,5 giờ, tối đa khoảng 3 đợt một ngày.

**Giữ `lead_time` đúng:** `lead_time` là thời gian task mở trên màn hình, và là số đo của ngân sách giờ. Nghỉ thì nghỉ **giữa** hai task (sau Submit), không để task mở rồi bỏ đi: ở pilot 6 / 50 task mở trên 30 phút, dài nhất 91 phút. Cuối mỗi đợt: Export JSON rồi `annotate import` để có bản sao lưu; nhập lại cùng export không thêm nhãn trùng.

## 9. Ghi vết (tự động)

Mỗi nhãn nhập về mang: người gán (`completed_by` của Label Studio), thời điểm, thời gian gán (`lead_time`, giây), phiên bản hướng dẫn và snapshot. Người gán không cần ghi tay các trường này.
