# Nghiên cứu: các loại tài liệu / nội dung bảo mật, gói trả phí và tài liệu do người dùng tải lên có kiểm chứng

> Ngày lập: 2026-10-17. Câu hỏi gốc: "Ngoài tài liệu, có những loại tài liệu bảo mật nào, những loại tài liệu nào có sự cao cấp hơn
> có chính sách trả tiền - upload tài liệu cá nhân được kiểm chứng". Phạm vi gồm: (1) các loại nội dung học bảo mật ngoài PDF;
> (2) chính sách miễn phí / trả phí của các nền tảng lớn; (3) cách các nền tảng nhận, kiểm duyệt và trả tiền cho nội dung người dùng
> tải lên; (4) các thang đánh giá, phân loại có thể dùng để gắn nhãn tài liệu; (5) pháp lý Việt Nam, cổng thanh toán, an toàn file
> tải lên và rủi ro lộ nội dung trả phí qua chatbot RAG. **Không sửa code.** Mọi giá đều là giá **thấy ngày 2026-10-17** trên trang
> chính chủ. Giá có thể khác theo vùng (trình duyệt khảo sát ở châu Âu nên vài trang hiện EUR) và theo khuyến mãi.
>
> Quy ước:
> - **[Đã kiểm chứng]**: đã đọc trực tiếp trang chính chủ (link ở mục 9).
> - **[Gián tiếp]**: chỉ thấy qua đoạn trích của kết quả tìm kiếm, bài tóm tắt của cơ quan nhà nước, hoặc trang của bên thứ ba; chưa đọc toàn văn gốc.
> - **[Chưa kiểm chứng]**: không mở được trang chính chủ (403, bắt đăng nhập, chặn bot). Cần tự kiểm tra lại trước khi dùng.
> - **[Suy luận]**: đề xuất hoặc suy ra cho SecLearn, chưa kiểm chứng bằng chạy thật.
> - **[Code]**: mã nguồn SecLearn trên đĩa ngày lập (`prisma/schema.prisma`, `src/lib/rag.ts`).
>
> Tài liệu này **không lặp lại** `docs/DATA_SOURCES.md`, nơi đã có giấy phép của NIST, MITRE (CWE/CAPEC/ATT&CK/CVE), CISA KEV, CVSS,
> CIS, ISO 27001, PCI DSS, PortSwigger, Cloudflare, SANS, MDN, CyBOK và văn bản luật Việt Nam (Luật An ninh mạng 116/2025, Luật BVDLCN
> 91/2025, NĐ 356/2025). Khi cần, chỉ dẫn lại.

---

## 1. Tóm tắt

- **Ngoài "tài liệu" (PDF, bài viết), ngành bảo mật có khoảng 10 loại nội dung học.** Gồm: lab thực hành / máy ảo, thử thách CTF,
  "room" và lộ trình học (learning path), khóa video, cheat sheet / poster, write-up (lời giải), báo cáo threat intel, khuyến cáo lỗ hổng
  (CVE / KEV), tiêu chuẩn / khung, đề luyện chứng chỉ và flashcard. **Phần được thu phí thường là phần tốn hạ tầng hoặc công biên soạn.**
  Đó là lab có máy ảo riêng, nội dung nâng cao, nội dung "đã nghỉ hưu" (retired) kèm lời giải, kỳ thi lấy chứng chỉ. Lý thuyết nhập
  môn thì gần như luôn miễn phí. PortSwigger Academy miễn phí toàn bộ, 273 lab [Đã kiểm chứng].
- **Mô hình giá phổ biến (thấy 2026-10-17):** freemium theo tầng nội dung. TryHackMe có Free / Premium / MAX. HTB Labs có Free, VIP+
  $25/tháng, PRO $49/tháng. HTB Academy có tier 0–IV, Student $10/tháng, Platinum $125/tháng. Thư viện thuê bao: Coursera Plus
  $24/tháng, Pluralsight $29–45/tháng, O'Reilly $49/tháng. Khóa/chứng chỉ cao cấp bán theo gói: OffSec Learn One $2.749/năm, SANS
  SEC401 $8.780. **Hoàn tiền:** Udemy 30 ngày cho khóa lẻ, **không** áp dụng cho thuê bao. Coursera 14 ngày cho gói năm, khóa lẻ 7 ngày
  hoặc đến khi lấy chứng chỉ. HTB, TryHackMe, OffSec không ghi chính sách hoàn tiền trên trang giá.
- **Nội dung người dùng tải lên luôn đi qua kiểm duyệt nhiều bước, và nền tảng giữ quyền gỡ, giữ tiền.** Udemy chia **37%**
  doanh thu thuần cho giảng viên (97% nếu bán qua coupon của chính giảng viên). Giảng viên phải cam kết có bản quyền và nộp giấy tờ thuế
  (W-8/W-9). Ngưỡng chi trả là $25. Udemy có quyền "remove content, suspend payouts… for any reason". HTB trả **$150–$650** mỗi
  challenge (gồm phần đảm bảo và thưởng chất lượng nếu được trên 90% đánh giá tích cực). OffSec trả **tới $300 / $500 / $1.500** mỗi
  lab. TryHackMe duyệt room cộng đồng "vài tuần đến vài tháng" và trang hướng dẫn không nói đến tiền. Studocu và Course Hero không trả
  tiền mà **đổi upload lấy quyền truy cập Premium**: Studocu tặng 1 ngày cho mỗi tài liệu, thêm 12 ngày nếu chia sẻ từ 3 tài liệu;
  Course Hero tặng 5 lượt mở khóa cho mỗi 10 tài liệu được duyệt. Scribd quét **mọi** file tải lên bằng dấu vân tay văn bản (BookID)
  và tự gỡ bản trùng, không có người duyệt.
- **Thang phân loại đáng dùng cho SecLearn:** (a) độ khó theo kiểu nền tảng học. PortSwigger dùng Apprentice / Practitioner /
  Expert. HTB dùng Easy / Medium / Hard / Insane, có thêm độ khó do người chơi chấm. (b) Mức thành thạo 3 bậc
  (Cơ bản / Trung cấp / Nâng cao). Chính khung NICE **không** định nghĩa thang này, NIST và CISA chỉ dùng như ví dụ. (c) **TLP 2.0**
  (FIRST) làm nhãn "được phép chia sẻ tới đâu": CLEAR / GREEN / AMBER / AMBER+STRICT / RED. (d) Thang độ tin cậy nguồn A–F / 1–6
  (Admiralty) cho tài liệu người dùng tải lên. **Không nên dùng:** độ mật nhà nước (Mật / Tối mật / Tuyệt mật). SecLearn không được
  phép chứa bí mật nhà nước. Không dùng CVSS / EPSS làm "độ khó học", vì đó là thang mức nghiêm trọng / xác suất bị khai thác của lỗ
  hổng, không đo độ khó của bài học.
- **Pháp lý Việt Nam đã đổi nhiều trong 2025–2026.** Văn bản đề bài nêu cần cập nhật:
  - **Luật Bảo vệ bí mật nhà nước 2018 đã bị thay** bởi **Luật số 117/2025/QH15**, hiệu lực 01/3/2026 [Gián tiếp].
  - **Luật Thương mại điện tử số 122/2025/QH15** và **NĐ 248/2026/NĐ-CP** có hiệu lực 01/7/2026. Chủ nền tảng trung gian phải
    **xác thực danh tính người bán (qua VNeID) trước khi cho bán** [Gián tiếp, nguồn Bộ Công Thương].
  - **Luật sửa đổi Luật SHTT số 131/2025/QH15** có hiệu lực 01/4/2026. Luật thêm ngoại lệ cho phép dùng dữ liệu đã công bố hợp pháp
    để **huấn luyện AI**, điều kiện chi tiết do Chính phủ quy định, và giao trách nhiệm bảo vệ quyền SHTT cho chủ nền tảng số [Đã kiểm
    chứng ở mức bài giới thiệu của Chính phủ].
  - **Luật Trí tuệ nhân tạo số 134/2025/QH15** có hiệu lực 01/3/2026. Điều 11 buộc **thông báo cho người dùng biết họ đang tương tác
    với AI** [Đã kiểm chứng qua bản tin tiếng Anh của Báo Chính phủ].
  - Luật Giao dịch điện tử 20/2023/QH15 có hiệu lực 01/7/2024 [Gián tiếp].
- **Thanh toán:** VNPAY và MoMo đều có môi trường thử (sandbox) dùng được ngay. VNPAY ký bằng HMAC-SHA512, cập nhật đơn **chỉ qua IPN**
  server-to-server, không qua Return URL. MoMo bắt buộc **tài khoản doanh nghiệp đã xác minh** mới cấp khóa production [Đã kiểm chứng].
  Với đồ án, có thể làm demo bằng sandbox. Thu tiền thật thì cần pháp nhân.
- **Rủi ro kỹ thuật lớn nhất của "premium + RAG" là lộ nội dung trả phí qua chatbot.** Lọc theo quyền phải nằm **trong truy vấn
  retrieval**, không lọc sau. SecLearn đã có sẵn nền tảng cho việc này: `Document.visibility` (`public` / `authenticated`) được lọc ngay
  trong SQL, và chunk mang sang lượt sau (carried chunk) cũng được lọc lại [Code]. OWASP LLM08:2025 khuyến nghị đúng hướng này
  ("permission-aware vector stores") [Đã kiểm chứng].
- **Chưa kiểm chứng được:** giá LinkedIn Learning, Studocu Premium, Course Hero, INE, Academia.edu, giá thi BSCP (trang bắt đăng nhập,
  trả 403 hoặc không hiện giá). Toàn văn Luật 117/2025 và Luật 122/2025 (thuvienphapluat chặn bot, vbpl.vn chỉ render bằng JS). Quy
  trình duyệt khóa học của Udemy. Điều kiện go-live của ZaloPay.

---

## 2. Các loại nội dung bảo mật ngoài "tài liệu"

| Loại nội dung | Mô tả | Nền tảng tiêu biểu (miễn phí / trả phí) | Hợp với SecLearn (người mới, RAG tiếng Việt)? |
|---|---|---|---|
| **Tài liệu đọc / lý thuyết** (PDF, bài viết) | Thứ SecLearn đang có | Gần như mọi nơi. PortSwigger Academy **100% miễn phí** [Đã kiểm chứng] | Đang làm |
| **Lab thực hành / máy ảo** | Máy mục tiêu chạy trên hạ tầng của nền tảng, truy cập qua VPN hoặc máy tấn công trên trình duyệt | TryHackMe: Free giới hạn **1 giờ AttackBox/ngày**, Premium không giới hạn [Đã kiểm chứng]. HTB Labs: Free có 20 máy đang hoạt động, VIP+ mở máy đã nghỉ hưu và Pwnbox không giới hạn [Đã kiểm chứng]. PortSwigger: 273 lab miễn phí [Đã kiểm chứng]. CyberDefenders CyberRange $25/tháng [Đã kiểm chứng] | Giá trị cao nhưng **tốn hạ tầng** (VM cô lập, mạng riêng). Đây là lý do chính các nền tảng thu phí. Ngoài phạm vi đồ án |
| **Thử thách CTF** | Bài có "flag", thường chia theo độ khó | HTB: Free có 80+ challenge đang hoạt động [Đã kiểm chứng]. OverTheWire (Bandit cho người mới), miễn phí, nhận quyên góp [Đã kiểm chứng]. picoCTF [Chưa kiểm chứng, trang trả 403] | Dạng tĩnh (crypto, forensics với file tải về) làm được mà không cần VM |
| **Room / learning path** | Chuỗi bài + câu hỏi + lab | TryHackMe: Free chỉ có room miễn phí, Premium có đủ lộ trình cho người mới, MAX có lộ trình nâng cao [Đã kiểm chứng]. Cybrary: Free giới hạn 10 hoạt động/ngày [Đã kiểm chứng] | Gần với "Lesson + Quiz" SecLearn đang có |
| **Khóa video** | Bài giảng quay sẵn | Udemy (bán lẻ), Coursera Plus, Pluralsight, LinkedIn Learning, O'Reilly (thuê bao) | Không hợp với RAG trừ khi có transcript. Transcript cũng là tác phẩm có bản quyền |
| **Cheat sheet / poster** | 1–2 trang tóm tắt lệnh, khái niệm | OWASP Cheat Sheet Series (đã dùng). SANS posters (cấm dùng ngoài phép, xem DATA_SOURCES §5) | Rất hợp người mới, ingest dễ |
| **Write-up / walkthrough** | Lời giải từng bước một lab hay CTF | HTB **cấm** public lời giải cho nội dung đang hoạt động, chỉ cho phép với nội dung đã nghỉ hưu, Starting Point và Tier 0 [Đã kiểm chứng]. OverTheWire cho viết write-up nhưng **cấm đăng mật khẩu level** [Đã kiểm chứng] | Nếu cho người dùng tải write-up lên thì **phải kiểm tra quy định của nền tảng gốc** (xem §6.3) |
| **Báo cáo threat intel** | Phân tích chiến dịch, nhóm tấn công | Vendor (miễn phí, để marketing), feed trả phí. Thường gắn **TLP** | Hợp mức nhận thức. Phải tôn trọng nhãn TLP |
| **Khuyến cáo lỗ hổng** (CVE, KEV, advisory) | Bản ghi có cấu trúc | Miễn phí (xem DATA_SOURCES §3) | Đã phân tích ở DATA_SOURCES |
| **Tiêu chuẩn / khung** | NIST, ISO, CIS, PCI | NIST miễn phí. ISO và PCI trả phí, cấm dùng cho AI (DATA_SOURCES §2) | Đã phân tích |
| **Luyện thi chứng chỉ** | Đề thi thử, voucher | OffSec, HTB (voucher kèm gói năm), Cybrary Insider Pro (bài thi thử), SANS/GIAC | Câu hỏi luyện thi thương mại là tài sản có bản quyền. Không sao chép |
| **Flashcard / quiz** | Câu hỏi ngắn | SecLearn đã có Quiz (sinh tự động hoặc nhập tay) | Có sẵn |

**Nhận xét [Suy luận]:** những nội dung các nền tảng thu phí được là (1) **hạ tầng chạy lab**, (2) **nội dung nâng cao hoặc nội dung
mới ra**, (3) **lời giải chính thức**, (4) **chứng chỉ có giá trị tuyển dụng**. Với một đồ án chỉ có RAG + quiz, chỉ có (2) và một dạng
nhẹ của (3) là khả thi để làm "premium".

---

## 3. Chính sách miễn phí / trả phí của các nền tảng lớn

### 3.1 Nền tảng chuyên bảo mật

| Nền tảng | Miễn phí gồm | Gói trả phí (giá thấy 2026-10-17) | Giảm giá sinh viên | Hoàn tiền | Nhãn |
|---|---|---|---|---|---|
| **TryHackMe** | Room miễn phí, một phần lộ trình, AttackBox 1 giờ/ngày | **Premium**: trang hiện "€16.99" (giá gốc) và **€7.35/tháng khi trả năm** ("Save 56%", đang có khuyến mãi tháng 10). **MAX**: "€29.11" và **€17.99/tháng khi trả năm**. Premium mở toàn bộ lộ trình cho người mới, AttackBox không giới hạn, giảm 15% chứng chỉ. MAX thêm lộ trình nâng cao, cloud, "Recent Threats", toàn bộ room, giảm 40% một chứng chỉ. "Premium and Max users get early access to new rooms" | Có link StudentBeans, không ghi mức giảm | Không ghi trên trang giá. ToS (cập nhật 01/10/2025) không có điều khoản hoàn tiền | [Đã kiểm chứng]. Bố cục giá mơ hồ, nên kiểm tra lại ở trang thanh toán |
| **Hack The Box Labs** | 20 máy đang hoạt động, 80+ challenge, thử Pwnbox 2 giờ (1 lần) | **VIP+** $25/tháng hoặc $223/năm (máy và challenge đã nghỉ hưu, Pwnbox không giới hạn, server VIP riêng). **PRO** $49/tháng hoặc $490/năm (thêm 10 Pro Lab, 150+ Sherlock) | Không ghi | Không ghi | [Đã kiểm chứng] |
| **HTB Academy** (bảng giá mới, hiệu lực 12/10/2026) | Module Tier 0 | Student $10/tháng (Tier 0–II). Silver $30/tháng hoặc $550/năm (Tier 0–II; gói năm kèm 2 voucher thi). Gold $95/tháng hoặc $1.400/năm (Tier 0–III). Platinum $125/tháng (Tier 0–IV). Mua lẻ bằng "cube": 50 cube = $10, cube không hết hạn | Có gói Student | Không ghi | [Đã kiểm chứng] (blog chính thức 03/09/2026) |
| **PortSwigger Web Security Academy** | **Toàn bộ** bài học và 273 lab (61 Apprentice / 173 Practitioner / 39 Expert) | Chỉ thu tiền thi chứng chỉ BSCP, và phải có Burp Suite Professional; chứng chỉ có hiệu lực 5 năm. Giá thi: **[Chưa kiểm chứng]** | — | — | [Đã kiểm chứng] (trừ giá thi) |
| **OffSec** | Trang giá không có gói miễn phí. Proving Grounds Play có trong bảng nhưng không ghi giá | **CyberCore** $899 (1 khóa 100-level, 365 ngày lab, 2 lượt thi). **Course + Cert Bundle** $1.749 (khóa 200/300-level, 90 ngày lab, 1 lượt thi). **Learn One** $2.749/năm (365 ngày lab, 2 lượt thi). Doanh nghiệp liên hệ | "Achieve": tới 10% cho sinh viên toàn thời gian | Không ghi trên trang giá | [Đã kiểm chứng] |
| **SANS** | Webcast, poster, cheat sheet, white paper, "free hour" xem thử khóa | **SEC401**: $8.780 (OnDemand, 4 tháng) hoặc học trực tiếp $8.780–8.900 / €8.230. Giá thêm lượt thi GIAC không hiện trên trang | — | — | [Đã kiểm chứng] |
| **Cybrary** | Giới hạn 10 hoạt động/ngày, một phần lộ trình | **Insider Pro**: trang hiện $24.58/tháng và $44.25/tháng (có nút trả tháng / trả năm, "Save $236.04 a year"). Có lẽ $24.58 là giá quy đổi theo tháng khi trả năm | Không ghi | Không ghi | [Đã kiểm chứng], cách hiển thị giá mơ hồ |
| **CyberDefenders** | Không rõ | Chứng chỉ CCDL1 $599, CCDL2 $1.499. CyberRange $25/tháng | — | — | [Đã kiểm chứng] |
| **INE** | — | Trang giá chuyển hướng sang checkout, không đọc được | — | — | **[Chưa kiểm chứng]** |

### 3.2 Thư viện học tổng hợp và kho tài liệu

| Nền tảng | Mô hình | Giá (thấy 2026-10-17) | Hoàn tiền / dùng thử | Nhãn |
|---|---|---|---|---|
| **Coursera Plus** | Thuê bao, 10.000+ khóa. Một số khóa, bằng cấp và MasterTrack không nằm trong gói | $24/tháng hoặc $160/năm | Gói tháng thử 7 ngày. Gói năm hoàn trong 14 ngày (chứng chỉ lấy trong thời gian đó bị thu hồi). Khóa lẻ: hoàn trong 7 ngày hoặc trước khi nhận chứng chỉ. Đã truy cập nội dung premium thì không hoàn | [Đã kiểm chứng] |
| **Udemy** | Bán lẻ từng khóa, ngoài ra có gói thuê bao | Giá do giảng viên đặt theo bậc giá | **30 ngày** cho khóa lẻ. **Không** hoàn cho thuê bao, coaching, voucher thi. Udemy có thể hoàn bằng credit thay vì tiền | [Đã kiểm chứng] (ToU cập nhật 31/07/2026) |
| **Pluralsight** | Thuê bao theo mảng | Security+ / Complete / AI+ / Cloud+ / Data+: $29/tháng hoặc $299/năm. Core Tech: $45/tháng hoặc $449/năm. Gói nào cũng có lab. Thử 10 ngày (không gồm lab/sandbox) | Không ghi trên trang giá | [Đã kiểm chứng] |
| **O'Reilly** | Thuê bao thư viện sách + video | $49/tháng, $129/3 tháng, $499/năm. Có dùng thử miễn phí | — | [Đã kiểm chứng] |
| **LinkedIn Learning** | Thuê bao | Bắt đăng nhập | — | **[Chưa kiểm chứng]** |
| **Scribd** | Thuê bao đọc + kho tài liệu người dùng tải lên | Thử 30 ngày, sau đó $9.99/tháng. Upload miễn phí, trang không nói upload được thưởng gì | "Cancel anytime" | [Đã kiểm chứng] |
| **Studocu** | Freemium. Premium mở tài liệu do sinh viên tải lên | Trang Premium không hiện giá, chỉ có "Try 30 days for free". Có thể đổi upload lấy Premium (xem §4) | — | Giá: **[Chưa kiểm chứng]** |
| **Course Hero** | Thuê bao "Premier" với số lượt mở khóa mỗi tháng | Trang giá trả 404. Help center: gói Premier có 30 lượt mở khóa/tháng; hết lượt thì mua thêm được | — | Giá: **[Chưa kiểm chứng]**. Lượt mở khóa: [Đã kiểm chứng] qua kết quả tìm kiếm trong help center chính chủ |
| **Medium** | Bài trả phí ("paywall") của tác giả, chia tiền từ phí thành viên | Phí thành viên không khảo sát | — | Xem §4 |
| **Academia.edu** | Premium (tìm kiếm nâng cao, thống kê người đọc) | Trang `/premium` trả 404 | — | **[Chưa kiểm chứng]** |

**Quy luật chung [Suy luận]:** (1) Gói **năm** luôn được đẩy mạnh, rẻ hơn 25–56% so với trả tháng. (2) Giá hiển thị theo vùng (EUR
cho khách châu Âu) và **luôn có khuyến mãi**, nên phải ghi ngày xem giá. (3) Các nền tảng **đều tránh hoàn tiền cho thuê bao**. Họ
chỉ hoàn trong cửa sổ ngắn, và chỉ khi người dùng chưa tiêu thụ nội dung hoặc chưa lấy chứng chỉ. Lý do là nội dung số không "trả lại"
được.

---

## 4. Nội dung do người dùng tải lên: kiểm duyệt, bản quyền và chi trả

### 4.1 Bảng so sánh

| Nền tảng | Ai được đăng | Kiểm duyệt trước khi đăng | Bản quyền / gỡ bỏ | Chi trả | Thuế / định danh | Nhãn |
|---|---|---|---|---|---|---|
| **Udemy** | Giảng viên đủ 18 tuổi | Có Quality Review Team. Checklist: ít nhất 30 phút video, 5 bài giảng, HD. Khóa miễn phí mới phải dưới 2 giờ video [Gián tiếp]. Instructor Terms: "your use of the Services is subject to Udemy's approval" | Giảng viên cam kết sở hữu hoặc có giấy phép. Giảng viên ủy quyền cho Udemy và đối tác chống vi phạm bản quyền gửi thông báo DMCA thay mình. Udemy có thể "remove content, suspend payouts, not pay out funds… for any reason" | **37%** doanh thu thuần (sau thuế, phí 3%, phí nền tảng di động). **97%** nếu học viên dùng coupon hoặc link giới thiệu của chính giảng viên. Coaching 80%. Trả trong 45 ngày sau cuối tháng, ngưỡng **$25**. Trả bằng USD qua PayPal, Payoneer hoặc ngân hàng. Hoàn tiền cho học viên thì trừ vào doanh thu của giảng viên | Phải nộp **W-9/W-8**. Udemy có quyền khấu trừ thuế và giữ tiền nếu thiếu giấy tờ | [Đã kiểm chứng] (Instructor Terms 29/07/2026), trừ checklist |
| **Udemy, điều khoản AI** | — | — | Udemy được dùng nội dung để huấn luyện mô hình **không sinh** (tìm kiếm, gợi ý). Giảng viên **mặc định nằm trong** GenAI Program trừ khi chủ động rút ra (opt-out) trong khoảng thời gian quy định | — | — | [Đã kiểm chứng] |
| **Hack The Box** (machine / challenge / Sherlock) | Thành viên cộng đồng | Content Delivery Team đánh giá. Challenge: phản hồi lần đầu trong 2 tuần, quyết định trong 2 tháng, rồi đến Release Committee, ký **SOW**, phát hành 2–3 tháng sau. Yêu cầu: nội dung trung lập, **không chứa tài liệu có bản quyền**, độ khó phải đến từ khai thác chứ không từ đoán mò, máy ổn định, nguyên bản, nộp kèm write-up | Không chứa tài liệu có bản quyền | Challenge: Very Easy $150, Easy $250, Medium $400, Hard $500, Insane $650 (tối đa). Gồm phần đảm bảo và thưởng $50–100 nếu trên 90% đánh giá tích cực với ít nhất 10 phiếu. Trả 50% sau khi được chấp nhận hoặc ký SOW, 50% hai tuần sau phát hành | Phương thức trả tiền: không ghi trong bài | [Đã kiểm chứng] (bài 2021, help center 08/2026). Mức tiền có thể đã đổi |
| **OffSec UGC** (lab Proving Grounds) | Cộng đồng | Xác nhận đã nhận trong 24 giờ, mục tiêu duyệt trong 1 tuần. Phải có VM chạy được, nguyên bản, walkthrough chính xác, script dựng máy. **CVE không quá 12 tháng**, khớp MITRE. Tự động từ chối nội dung thù ghét, khiêu dâm, vi phạm bản quyền | Vi phạm bản quyền bị tự động từ chối | Tới **$300** (đạt tối thiểu) / **$500** (chuỗi khai thác tốt, nhiều bước) / **$1.500** (nhóm VM liên kết, kịch bản pentest thực tế) | Không ghi | [Đã kiểm chứng] |
| **TryHackMe** (room cộng đồng) | Mọi người dùng, room mặc định riêng tư | Chỉ duyệt **CTF** để công khai. Room walkthrough hiện không được duyệt để công khai. Bắt buộc nộp write-up. Các trạng thái: Submitted ("vài tuần hoặc thậm chí vài tháng"), Evaluating, Ready, Accepted. QA đối chiếu với General Guidelines | — | Trang không nhắc đến tiền. Việc xây room có trả tiền được tuyển riêng dưới dạng hợp đồng ("TryBuildMe") [Gián tiếp] | — | [Đã kiểm chứng] |
| **Exploit-DB** (OffSec) | Mọi người, gửi qua email | Đội ngũ "verify, test and catalog"; nếu được thì thử trong lab và lưu lại phần mềm có lỗi. **Từ chối**: lỗ hổng nhắm vào website đang chạy, XSS phản xạ không có CVE, DLL hijacking, lộ đường dẫn, open redirect, lỗi cần quyền admin/root, clickjacking không có CVE. Phải ghi phiên bản, môi trường đã thử, CVE | — | Không trả tiền | — | [Đã kiểm chứng] |
| **Course Hero** | Người dùng | Có duyệt. Lý do từ chối hay gặp: tài liệu trùng, nội dung ngẫu nhiên hoặc không liên quan, chưa đạt yêu cầu tối thiểu | Có chính sách DMCA, thông báo gỡ và phản thông báo. Người tải lên phải sở hữu bản quyền hoặc có phép | **5 lượt mở khóa cho mỗi 10 tài liệu** được duyệt. Lượt kiếm từ upload hết hạn sau 30 ngày. Có "Bonus Upload Rewards" (một upload tính gấp đôi) | — | [Gián tiếp] (đoạn trích trong help center chính chủ, các bài 5–13 năm tuổi) |
| **Studocu** | Sinh viên | Duyệt ban đầu. Bị từ chối thì tài liệu bị xóa, không được ngày Premium, có thể xin duyệt lại thủ công [Gián tiếp] | Khi tải lên, người dùng "declare that you own the copyrights… or have express permission". Trang cũng báo Studocu dùng chatbot AI của bên thứ ba | **1 ngày Premium mỗi tài liệu, thêm 12 ngày khi chia sẻ từ 3 tài liệu**. Chỉ nhận pdf, doc, docx | — | Trang upload: [Đã kiểm chứng]. Help center bắt đăng nhập |
| **Scribd** | Mọi người | **Không có người duyệt trước.** BookID quét mọi file tải lên và quét định kỳ thư viện cũ, so với dấu vân tay văn bản, khớp thì **tự gỡ**. Giới hạn: không đọc được ảnh, OCR kém thì khó khớp, không khớp xuyên ngôn ngữ (bản dịch lọt qua). Có báo nhầm với văn bản phạm vi công cộng như luật hay tài liệu chính phủ | Khiếu nại gửi copyright@scribd.com | Không | — | [Đã kiểm chứng] |
| **Medium Partner Program** | Thành viên trả phí, đã đăng ít nhất 1 bài, hồ sơ đầy đủ, đủ 18 tuổi, ngân hàng ở nước được hỗ trợ (**có Việt Nam**) | **Không duyệt hồ sơ**: đủ điều kiện là được ghi danh ngay. Bài trả phí phải theo chính sách "Content eligible for the paywall" | — | Chia một phần phí thành viên theo mức độ tương tác. Nếu số dư đạt $10 mà chưa cài đặt nhận tiền trong 30 ngày liên tiếp thì bị gỡ khỏi paywall | **Stripe** (yêu cầu tên thật) + **Tipalti** (thông tin thuế) | [Đã kiểm chứng] |
| **Academia.edu** | Nhà nghiên cứu | — | — | — | — | **[Chưa kiểm chứng]** (không mở được) |

### 4.2 Các mẫu chung rút ra [Suy luận]

1. **Hai mô hình thưởng cho người đóng góp.** (a) **Trả tiền mặt** cho nội dung **do nền tảng đặt hàng hoặc tuyển chọn** (HTB, OffSec).
   Số lượng ít, chất lượng cao, có hợp đồng (SOW) và định danh. (b) **Trả bằng quyền truy cập** (Studocu, Course Hero) cho nội dung đại
   trà. Rẻ, nhưng rất dễ bị đăng lậu tài liệu có bản quyền. Medium và Udemy là dạng **chia doanh thu**, đòi hỏi hạ tầng thuế và chi trả
   quốc tế.
2. **Kiểm duyệt gồm 3 lớp:** tự động (định dạng, trùng lặp, dấu vân tay bản quyền như BookID), con người (QA nội dung, kiểm tra kỹ
   thuật), cộng đồng (đánh giá sau khi phát hành, ví dụ thưởng của HTB phụ thuộc tỷ lệ đánh giá tích cực).
3. **Người đăng luôn phải tự cam kết bản quyền.** Nền tảng giữ quyền gỡ, giữ tiền và thu hồi tiền khi có hoàn tiền hoặc vi phạm.
4. **Nội dung tấn công có lọc riêng:** HTB và OffSec chỉ nhận lab chạy trong môi trường cô lập. Exploit-DB từ chối lỗ hổng nhắm vào
   website đang chạy. Write-up của nội dung đang hoạt động bị cấm.

---

## 5. Thang đánh giá / phân loại liên quan tới tài liệu bảo mật

| Thang | Chủ sở hữu | Các mức | Đo cái gì | Dùng cho SecLearn? |
|---|---|---|---|---|
| **Độ khó máy HTB** | Hack The Box | Easy (xanh lá) / Medium (vàng) / Hard (đỏ) / Insane (bạc). Thêm độ khó do người chơi chấm sau khi nộp flag [Đã kiểm chứng] | Độ khó kỹ thuật | **Nên tham khảo ý "độ khó do người chơi chấm"**. Bốn mức có "Insane" là thừa với người mới |
| **Mức lab PortSwigger** | PortSwigger | Apprentice / Practitioner / Expert (61 / 173 / 39 lab) [Đã kiểm chứng] | Độ khó | **Nên dùng kiểu 3 mức** này |
| **Tier HTB Academy** | HTB | Tier 0 → IV; Tier 0 miễn phí và được viết lời giải công khai [Đã kiểm chứng] | Gộp độ sâu nội dung với quyền truy cập | Ví dụ tốt cho việc **gắn tầng giá với tầng độ khó** |
| **Mức thành thạo NICE** | NIST | **SP 800-181r1 không định nghĩa thang thành thạo**. NIST và CISA dùng ví dụ Basic/Entry, Intermediate, Advanced. Một hội thảo NIST đề xuất 5 mức (0–4) và ánh xạ Bloom/Dreyfus, nhưng đó là đề xuất, chưa được áp dụng chính thức [Gián tiếp] | Năng lực người học | **Nên dùng 3 mức (Cơ bản / Trung cấp / Nâng cao)** và ghi rõ đây không phải thang chính thức của NICE. Có thể gắn Work Role của NICE làm thẻ chủ đề (xem DATA_SOURCES §2) |
| **Thang Bloom (bản sửa đổi)** | Anderson & Krathwohl (2001) | Nhớ / Hiểu / Áp dụng / Phân tích / Đánh giá / Sáng tạo [Gián tiếp] | Mức nhận thức của câu hỏi | **Nên dùng cho Quiz** (gắn mức Bloom cho từng câu sinh tự động). Không dùng để gắn nhãn tài liệu |
| **TLP 2.0** | FIRST (bản chính thức từ 08/2022) | **CLEAR**: chia sẻ cho cả thế giới (vẫn theo luật bản quyền). **GREEN**: trong cộng đồng, không đăng công khai. **AMBER**: trong tổ chức và khách hàng, theo nhu cầu. **AMBER+STRICT**: chỉ trong tổ chức. **RED**: chỉ người nhận [Đã kiểm chứng] | Phạm vi được phép chia sẻ | **Nên dùng ở dạng kiểm tra đầu vào:** chỉ cho nạp vào RAG công khai tài liệu **TLP:CLEAR**. File có dấu TLP:GREEN, AMBER hoặc RED thì **từ chối**, vì chatbot là kênh công khai. Không dùng TLP làm tầng giá (TLP nói về quyền chia sẻ, không nói về giá trị) |
| **Độ mật nhà nước** | Luật Bảo vệ BMNN | Tuyệt mật / Tối mật / Mật; thời hạn bảo vệ tối đa 30 / 20 / 10 năm theo luật 2018. **Luật 2018 đã bị thay bởi Luật 117/2025/QH15 (hiệu lực 01/3/2026)**. Luật mới cấm dùng AI để xâm phạm bí mật nhà nước [Gián tiếp] | Bí mật nhà nước | **Không dùng, dễ gây hiểu lầm.** SecLearn không được chứa thông tin mật. Ngược lại, nên có **quy tắc từ chối** file có dấu "MẬT", "TỐI MẬT", "TUYỆT MẬT" hoặc "CONFIDENTIAL" và báo admin |
| **Admiralty / NATO** (độ tin cậy nguồn × độ tin của thông tin) | Học thuyết tình báo (ví dụ US Army FM 2-22.3, Phụ lục B) | Nguồn: A (hoàn toàn tin cậy) → E (không tin cậy), **F (chưa đánh giá được)**. Thông tin: 1 (được nguồn khác xác nhận) → 5, **6 (chưa xác định được)**. Nguồn mới chưa có lịch sử thì xếp F [Gián tiếp, toàn văn học thuyết không công khai] | Độ tin cậy | **Nên dùng bản đơn giản cho tài liệu người dùng tải lên**: tài khoản mới mặc định "F". Tài liệu gốc chính thống (NIST, OWASP) xếp A. Hiển thị cạnh trích dẫn `[n]` |
| **CVSS v4.0** | FIRST | None 0.0 / Low 0.1–3.9 / Medium 4.0–6.9 / High 7.0–8.9 / Critical 9.0–10.0. Đo **mức nghiêm trọng** của lỗ hổng, không đo rủi ro [Đã kiểm chứng] | Lỗ hổng | **Không dùng làm độ khó hay mức premium.** Chỉ hiển thị khi nội dung nói về một CVE cụ thể |
| **EPSS** | FIRST | Xác suất 0–1 rằng CVE bị khai thác trong **30 ngày** tới, cập nhật hằng ngày [Đã kiểm chứng] | Lỗ hổng | **Không dùng** cho tài liệu học |

**Thang chất lượng tài liệu [Suy luận]:** không có thang chuẩn ngành nào. Có thể ghép từ tiêu chí của các nền tảng:

| Tiêu chí | Lấy từ |
|---|---|
| Chính xác kỹ thuật, có nguồn | Exploit-DB (verify/test), Admiralty (A–F) |
| Nguyên bản, không trùng | HTB ("original"), Course Hero (từ chối bản trùng), Scribd BookID |
| Còn hiệu lực, có phiên bản | OffSec (CVE ≤ 12 tháng), DATA_SOURCES (luật cũ hết hiệu lực) |
| Phù hợp người mới, có mục tiêu học | Udemy (quality standards), PortSwigger (Apprentice) |
| An toàn / đạo đức | HTB (không có chính trị), OffSec (tự động từ chối), Exploit-DB (không nhắm vào website đang chạy) |
| Hợp pháp chia sẻ | TLP:CLEAR, giấy phép rõ ràng |

---

## 6. Những điều cần biết

### 6.1 Pháp lý Việt Nam (cập nhật đến 2026-10-17)

| Văn bản | Hiệu lực | Liên quan gì đến SecLearn | Nhãn |
|---|---|---|---|
| **Luật Giao dịch điện tử số 20/2023/QH15** | 01/7/2024 (riêng khoản 2 Điều 60 từ 01/01/2026) | Giá trị pháp lý của hợp đồng điện tử, tức điều khoản người dùng bấm "Đồng ý" khi mua gói hoặc tải tài liệu lên | [Gián tiếp] (trang vanban.chinhphu.vn qua kết quả tìm kiếm) |
| **Luật Thương mại điện tử số 122/2025/QH15** + **NĐ 248/2026/NĐ-CP** | 01/7/2026 | Nếu SecLearn **cho người dùng bán tài liệu** thì SecLearn trở thành **nền tảng TMĐT trung gian**. Khi đó phải xác thực danh tính người bán (VNeID) **trước khi** cho bán, công khai quy chế hoạt động, tiếp nhận phản ánh, lưu thông tin và xử lý nội dung vi phạm. Nếu **chỉ SecLearn bán** nội dung của mình thì gánh nặng nhẹ hơn (vai trò người bán / website bán hàng). Chưa đọc toàn văn để biết luật có bãi bỏ NĐ 52/2013 và NĐ 85/2021 hay không | Ngày hiệu lực: [Đã kiểm chứng] (Công báo). Nghĩa vụ: [Gián tiếp] (bài của Bộ Công Thương, Báo Chính phủ) |
| **Luật SHTT sửa đổi số 131/2025/QH15** | 01/4/2026 | (1) Ngoại lệ cho phép dùng văn bản, dữ liệu **đã công bố hợp pháp và công chúng được tiếp cận** để nghiên cứu, thử nghiệm, **huấn luyện AI**, nếu "không ảnh hưởng bất hợp lý" đến tác giả; điều kiện chi tiết do Chính phủ quy định (NĐ 100/2026 [Gián tiếp]). (2) Trách nhiệm của **chủ quản nền tảng số** trong bảo vệ quyền SHTT. (3) Thêm chế tài dân sự cho xâm phạm trên môi trường số, tăng mức bồi thường. Ghi chú: ngoại lệ AI nói về **huấn luyện**. Việc RAG **trích nguyên văn** đoạn tài liệu cho người dùng là sao chép và phân phối, nên vẫn phải có quyền hoặc giấy phép | Hiệu lực và nội dung chính: [Đã kiểm chứng] (bài giới thiệu trên xaydungchinhsach.chinhphu.vn). Số điều: chưa đọc |
| **NĐ 17/2023/NĐ-CP** (quyền tác giả) | 26/4/2023 | Nghĩa vụ của doanh nghiệp trung gian: có công cụ tiếp nhận yêu cầu gỡ, gỡ hoặc chặn nội dung xâm phạm (Mục 4 Chương VI, Điều 110–114). **Thời hạn gỡ cụ thể chưa xác minh được.** NĐ 341/2025/NĐ-CP quy định xử phạt vi phạm hành chính về quyền tác giả | **[Gián tiếp]** |
| **Luật Trí tuệ nhân tạo số 134/2025/QH15** | 01/3/2026 (hệ thống đã có trước đó: giáo dục được 18 tháng chuyển tiếp, lĩnh vực khác 12 tháng) | Điều 9 chia rủi ro cao / trung bình / thấp. Điều 11: nhà cung cấp phải để **người dùng biết họ đang tương tác với AI**. Một chatbot học tập nhiều khả năng là rủi ro thấp, nhưng nhà cung cấp phải **tự phân loại** | [Đã kiểm chứng] (bản tin tiếng Anh của Báo Chính phủ) |
| **Luật An ninh mạng 116/2025**, **Luật BVDLCN 91/2025**, **NĐ 356/2025** | Xem DATA_SOURCES §4.2 | Dữ liệu cá nhân khi định danh người bán hoặc người tải lên (CCCD, tài khoản ngân hàng) là dữ liệu cần bảo vệ. Upload có thể chứa dữ liệu cá nhân của bên thứ ba (ví dụ log, ảnh chụp màn hình) | Xem DATA_SOURCES |
| **Bộ luật Hình sự, Điều 285** | Văn bản hợp nhất 135/VBHN-VPQH (05/9/2025) | Tội sản xuất, mua bán, trao đổi, **tặng cho** công cụ hoặc phần mềm có tính năng tấn công mạng để dùng vào mục đích trái pháp luật. Phạt tiền từ 20 triệu đồng. Nếu SecLearn cho tải lên hoặc bán exploit, công cụ tấn công thì có rủi ro hình sự | **[Gián tiếp]** |
| **Luật Bảo vệ BMNN số 117/2025/QH15** | 01/3/2026, thay Luật 29/2018/QH14 | Xem §5. Chỉ liên quan ở chỗ phải **từ chối** tài liệu mật | [Gián tiếp] (bài của VKSND Tối cao) |

**Thuế khi chi trả cho người đóng góp:** nếu trả tiền cho cá nhân thì phát sinh nghĩa vụ khấu trừ thuế thu nhập cá nhân hoặc kê khai.
Udemy và Medium đều bắt nộp thông tin thuế trước khi trả tiền. Quy định cụ thể của Việt Nam **chưa khảo sát**, cần hỏi kế toán hoặc
luật sư.

### 6.2 Cổng thanh toán Việt Nam

| Cổng | Sandbox | Điều kiện production | Kỹ thuật | Nhãn |
|---|---|---|---|---|
| **VNPAY** | Đăng ký sandbox, nhận `vnp_TmnCode` và `vnp_HashSecret` qua email | Trang tài liệu không nói về thủ tục production. Mỗi TmnCode gắn với một domain hoặc app | Chuyển hướng GET sang trang thanh toán. Số tiền **nhân 100**. `vnp_SecureHash` hỗ trợ SHA256 và **HMAC-SHA512**. **Return URL chỉ để hiển thị**, cập nhật đơn **chỉ trong IPN** (server-to-server, bắt buộc SSL, trả `RspCode`). VNPAY gọi lại IPN tối đa 10 lần, cách nhau 5 phút. Phải kiểm checksum, kiểm đơn tồn tại, số tiền khớp, trạng thái còn chờ (chống xử lý trùng) | [Đã kiểm chứng] |
| **MoMo** | Đăng ký hồ sơ trên M4B (business.momo.vn) là có thông tin đăng nhập môi trường test | **Tài khoản doanh nghiệp phải được xác minh** (giấy tờ pháp lý) và hoàn tất tích hợp. Quy trình 7 bước: hồ sơ, tích hợp test, SIT, xác minh, nhận khóa production, UAT trên production, duyệt và go-live | Thuật toán chữ ký không đọc trong đợt này | [Đã kiểm chứng] |
| **ZaloPay** | Có môi trường test | Phải đăng ký doanh nghiệp. Có xác thực bằng MAC/HMAC | — | [Gián tiếp] (trang render bằng JS, chỉ đọc được phần tổng quan) |

**Hệ quả cho đồ án [Suy luận]:** demo được trọn luồng mua gói bằng **sandbox VNPAY** mà không cần pháp nhân. Thu tiền thật thì cần
pháp nhân, xác minh merchant và các nghĩa vụ TMĐT ở §6.1. Bản đồ án nên ghi rõ "chế độ thử nghiệm".

### 6.3 Rủi ro nội dung tấn công trong tài liệu tải lên

- **Exploit hoạt động được, công cụ tấn công, mã độc mẫu:** rủi ro theo Điều 285 BLHS [Gián tiếp] và trái với định hướng "người mới,
  phòng thủ" (DATA_SOURCES §9). Exploit-DB, HTB, OffSec đều chỉ nhận nội dung chạy trong **môi trường cô lập** hoặc đã có CVE.
- **Write-up vi phạm quy định của nền tảng khác:** HTB cấm công khai lời giải nội dung đang hoạt động và Pro Lab. Chính sách sử dụng
  của HTB (hiệu lực 01/4/2026) cấm "share, publish, sell" lời giải, flag, gợi ý cho nội dung đang hoạt động [Gián tiếp]. OverTheWire
  cấm đăng mật khẩu level. ToS của TryHackMe (01/10/2025) coi thông tin trên site là "confidential to TryHackMe" [Đã kiểm chứng]. Nếu
  SecLearn **bán** write-up của người dùng về các nền tảng này thì rủi ro hợp đồng và bản quyền đều cao.
- **Dữ liệu thật trong tài liệu:** log, ảnh chụp, báo cáo pentest của khách hàng có thể chứa IP, tên miền, dữ liệu cá nhân, hoặc mang
  nhãn TLP:AMBER/RED.
- **Prompt injection trong file tải lên:** OWASP LLM08:2025 nêu ví dụ CV có chữ ẩn điều khiển hệ thống RAG. Khuyến nghị dùng bộ trích
  xuất văn bản bỏ định dạng và **phát hiện chữ ẩn** [Đã kiểm chứng].

### 6.4 Quét mã độc và an toàn file tải lên (OWASP File Upload Cheat Sheet) [Đã kiểm chứng]

- Danh sách đuôi file được phép (chỉ `.pdf`, sau này có thể thêm `.md`). Kiểm tra sau khi giải mã tên file. Chặn đuôi kép, null byte
  và ký tự `:`.
- Không tin `Content-Type` do client gửi. Kiểm tra chữ ký file (magic bytes), nhưng không dựa vào mỗi bước này.
- Đổi tên file thành UUID phía server. Lưu **ngoài webroot** hoặc trên host riêng. Truy cập qua ID.
- Giới hạn dung lượng (với file nén thì tính dung lượng sau giải nén).
- **Quét bằng antivirus hoặc sandbox trước khi dùng.** Áp dụng **CDR (Content Disarm & Reconstruct)** cho PDF/DOCX. Kiểm tra macro
  và script ẩn.
- Chỉ người dùng đã xác thực và có quyền mới được tải lên. Chống CSRF.

### 6.5 RAG + nội dung trả phí: chống lộ đoạn premium cho người dùng miễn phí

OWASP LLM08:2025 (Vector and Embedding Weaknesses) nêu rủi ro "unauthorized access & data leakage" và "cross-context leaks" khi nhiều
nhóm dùng chung một vector DB. Biện pháp được khuyến nghị: **permission-aware vector stores**, phân vùng dữ liệu nghiêm ngặt, gắn nhãn
phân loại cho dữ liệu, ghi log truy xuất [Đã kiểm chứng].

Hiện trạng SecLearn [Code]:
- `Document.visibility` là enum `public | authenticated`. Các truy vấn vector, keyword và fallback trong `src/lib/rag.ts` đều có
  `d.visibility::text = ANY($n)` **ngay trong SQL**, tức là lọc **trước** khi xếp hạng.
- Chunk mang sang lượt sau (`fetchChunksById`) cũng được lọc lại theo `visibilities` của người hỏi.
- `docVisibilitiesFor(role)` được gọi ở route chat của người dùng và của khách.

Những chỗ cần chú ý khi thêm premium [Suy luận]:
1. **Mở rộng quyền, đừng tạo đường đi riêng:** thêm giá trị `premium` (hoặc trường `tier`) vào enum. Tính tập visibility từ
   **quyền lợi (entitlement) hiện tại** của người dùng ở **mỗi request**, không lấy từ JWT cũ. Nếu dùng JWT thì phải xử lý trường hợp
   gói hết hạn giữa phiên.
2. **Lịch sử hội thoại là kênh rò rỉ:** câu trả lời cũ đã chứa nội dung premium nằm trong `Message`. Khi người dùng hết gói, lịch sử
   đó vẫn được gửi lại cho LLM làm ngữ cảnh, và chunk mang sang thì bị lọc lại (tốt). Cần quyết định có ẩn hay tóm tắt lại những câu
   trả lời cũ đó không.
3. **Cache:** cache câu trả lời hoặc embedding theo câu hỏi phải có **khóa gồm cả tầng quyền**. Nếu không, người dùng miễn phí có thể
   nhận câu trả lời đã cache của người dùng premium.
4. **Quiz sinh từ tài liệu premium** (`QuizSource.generated`) cũng phải mang theo tầng quyền của tài liệu nguồn.
5. **Trích dẫn `[n]`:** với người dùng miễn phí, không được trả về tiêu đề hay đoạn trích của tài liệu premium. Có thể hiện "Có tài
   liệu premium liên quan" mà không lộ nội dung (đây là lựa chọn sản phẩm).
6. Khóa tài liệu khỏi chatbot **không đủ** nếu file gốc tải được qua `storagePath` mà không kiểm tra quyền.

### 6.6 Điều khoản AI / TDM trong giấy phép

- Đã có ở DATA_SOURCES: ISO cấm dùng cho AI/TDM, Cloudflare cấm bot thu thập cho AI/ML, PortSwigger chỉ cho dùng cá nhân.
- **Udemy** tự cấp cho mình quyền dùng nội dung giảng viên cho AI không sinh, và **mặc định** đưa giảng viên vào GenAI Program
  (opt-out) [Đã kiểm chứng]. Đây là mẫu tham khảo: nếu SecLearn đưa tài liệu người dùng vào RAG thì **điều khoản tải lên phải nói rõ**
  tài liệu sẽ được cắt đoạn, nhúng (embedding) và trích dẫn bởi chatbot.
- **Studocu** ghi ngay ở trang upload rằng họ dùng chatbot AI của bên thứ ba [Đã kiểm chứng]. Đây là một ví dụ về minh bạch.
- **Luật SHTT 131/2025** cho phép huấn luyện AI trên dữ liệu đã công bố hợp pháp, với điều kiện do Chính phủ quy định. Ngoại lệ này
  **không** thay thế giấy phép khi chatbot **hiển thị lại** nguyên văn (xem §6.1).

---

## 7. Đề xuất cho SecLearn [Suy luận]

### 7.1 Tầng nội dung (content tiers)

| Tầng | Nội dung | Ai xem | Ghi chú |
|---|---|---|---|
| **Miễn phí (khách)** | Bài nhập môn, OWASP, NIST, luật VN (giấy phép thoáng, xem DATA_SOURCES) | Mọi người | Giữ đúng tinh thần PortSwigger: phần nền tảng luôn miễn phí |
| **Thành viên** (`authenticated`) | Như hiện tại, cộng thêm quiz và lịch sử chat | Đã đăng nhập | Đã có |
| **Premium** | (a) lộ trình nâng cao do admin biên soạn, (b) bộ quiz luyện chứng chỉ tự soạn, (c) tài liệu người dùng **đã qua kiểm duyệt cấp cao** | Có gói | Không đưa tài liệu bên thứ ba có giấy phép NC (phi thương mại) vào tầng trả phí. CIS (NC-ND), OpenLearn / MIT OCW / SecQA (NC-SA) chỉ được để ở tầng miễn phí |

Với đồ án, nên làm **một tầng premium duy nhất**, thanh toán bằng sandbox VNPAY, thời hạn theo tháng. Không làm chia doanh thu cho
người đóng góp ở phiên bản đầu: chia doanh thu kéo theo định danh người bán (Luật TMĐT), thuế và đối soát.

### 7.2 Quy trình kiểm duyệt tài liệu người dùng tải lên

1. **Kiểm tra tự động khi nhận file:** đuôi `.pdf`, magic bytes, giới hạn dung lượng, tên UUID, lưu ngoài webroot, quét antivirus (ví
   dụ ClamAV), CDR hoặc tối thiểu từ chối PDF có JavaScript hay file đính kèm (§6.4).
2. **Kiểm tra nội dung tự động:**
   - Phát hiện dấu **TLP:GREEN/AMBER/RED** và dấu **MẬT / TỐI MẬT / TUYỆT MẬT / CONFIDENTIAL**: từ chối.
   - Phát hiện dữ liệu cá nhân (CCCD, số điện thoại, email) hoặc IP nội bộ: cảnh báo.
   - Phát hiện chữ ẩn hoặc chỉ dẫn kiểu prompt injection.
   - Kiểm tra trùng lặp với kho hiện có (so embedding hoặc MinHash, giống tinh thần BookID).
   - Phát hiện exploit chạy được hoặc shellcode: chuyển duyệt tay.
3. **Duyệt bởi người (admin hoặc reviewer):** chấm theo tiêu chí ở §5 (chính xác, nguyên bản, còn hiệu lực, hợp người mới, an toàn, có
   quyền chia sẻ). Gán **độ khó (3 mức)**, **độ tin cậy nguồn (A–F)**, **giấy phép**, **TLP:CLEAR**.
4. **Trạng thái:** `pending → in_review → approved / rejected (kèm lý do) → published`. Bảng `Document` hiện có
   `status: pending/ready/failed` cho ingest; nên tách **trạng thái kiểm duyệt** khỏi **trạng thái ingest**. Chỉ tài liệu `approved` mới
   được embed vào kho chatbot dùng chung.
5. **Sau khi đăng:** người học đánh giá (giống HTB). Nút "Báo vi phạm bản quyền" nhận yêu cầu gỡ (theo NĐ 17/2023) và ghi log xử lý.
6. **Điều khoản tải lên:** người dùng cam kết sở hữu hoặc có phép, đồng ý cho cắt đoạn, embedding và trích dẫn bởi chatbot, chấp nhận
   cho SecLearn gỡ không cần báo trước. Cấm exploit hoạt động được, write-up nội dung đang hoạt động của nền tảng khác, tài liệu mật,
   dữ liệu cá nhân.

### 7.3 Bộ nhãn nên áp dụng

| Trường | Giá trị | Nguồn cảm hứng |
|---|---|---|
| `level` | `basic` / `intermediate` / `advanced` (Cơ bản / Trung cấp / Nâng cao) | PortSwigger, ví dụ của NICE/CISA |
| `tier` | `free` / `member` / `premium` | TryHackMe, HTB Academy |
| `sharing` | Chỉ nhận `TLP:CLEAR` | FIRST TLP 2.0 |
| `sourceReliability` | `A`–`F` (người đăng mới = `F`) | Admiralty |
| `license`, `version`, `effectiveDate` | Đã đề xuất ở DATA_SOURCES §7 | — |
| `bloom` (cho câu hỏi Quiz) | remember / understand / apply / analyze | Bloom sửa đổi |

### 7.4 Checklist pháp lý và thanh toán

- [ ] Hiện rõ cho người dùng biết họ đang trò chuyện với AI (Luật AI 134/2025, Điều 11). Tự phân loại rủi ro của hệ thống.
- [ ] Điều khoản sử dụng và điều khoản tải lên (hợp đồng điện tử theo Luật GDĐT 2023). Chính sách hoàn tiền rõ ràng: nội dung số nên
      giới hạn hoàn tiền giống Coursera/Udemy, và ghi trước khi mua.
- [ ] Cơ chế tiếp nhận yêu cầu gỡ vì vi phạm bản quyền (NĐ 17/2023; trách nhiệm của nền tảng số theo Luật SHTT 131/2025).
- [ ] Nếu cho người dùng **bán**: định danh người bán qua VNeID, quy chế hoạt động công khai, lưu thông tin (Luật TMĐT 122/2025 + NĐ
      248/2026). Kê khai thuế khi chi trả.
- [ ] Thông báo xử lý dữ liệu cá nhân cho dữ liệu thanh toán và định danh (Luật BVDLCN 91/2025, NĐ 356/2025).
- [ ] Thanh toán: dùng sandbox VNPAY; chỉ cập nhật quyền lợi trong IPN sau khi kiểm checksum, số tiền và trạng thái đơn; IPN phải
      idempotent; không cập nhật trong Return URL.
- [ ] RAG: lọc theo tầng quyền trong SQL (đã có cơ chế `visibility`), khóa cache có tầng quyền, xử lý lịch sử chat khi hết gói, kiểm
      quyền khi tải file gốc (§6.5).

---

## 8. Những điểm chưa chắc chắn / chưa kiểm chứng

- Giá **LinkedIn Learning** (bắt đăng nhập), **Studocu Premium** (trang không hiện giá), **Course Hero** (trang giá 404), **INE**
  (chuyển sang checkout), **Academia.edu** (404), giá thi **BSCP** của PortSwigger (không hiện giá khi chưa đăng nhập), giá lượt thi
  GIAC.
- Giá TryHackMe và Cybrary **hiển thị mơ hồ**: hai con số và nút trả tháng / trả năm, kèm khuyến mãi tháng 10/2026.
- Mức trả tiền challenge của HTB lấy từ bài blog **2021**, có thể đã đổi. Bài về machine (08/2026) không ghi số tiền.
- Checklist chất lượng của Udemy (30 phút, 5 bài giảng) chỉ thấy qua đoạn trích tìm kiếm. Help center chuyển hướng sang trang khác.
- **Toàn văn** Luật 117/2025 (BMNN), Luật 122/2025 (TMĐT), Luật 131/2025 (SHTT), NĐ 248/2026, NĐ 100/2026, NĐ 17/2023 và Điều 285 BLHS:
  chưa đọc. thuvienphapluat chặn bot bằng xác minh Cloudflare, vbpl.vn render bằng JS. Các ý ở §6.1 dựa vào bài giới thiệu của cơ quan
  nhà nước (chinhphu.vn, moit.gov.vn, vksndtc.gov.vn). Cần đọc bản gốc trên Công báo trước khi đưa vào luận văn, nhất là: luật TMĐT có
  bãi bỏ NĐ 52/2013 / 85/2021 không; thời hạn gỡ nội dung của nền tảng trung gian; các độ mật trong luật BMNN 2025 có giữ nguyên 3 mức
  không.
- Thang thành thạo NICE: chưa kiểm tra NIST đã chốt thang chính thức sau NISTIR 8355 (bản nháp) hay chưa.
- Thang Admiralty: văn bản học thuyết gốc không công khai; nội dung lấy từ các bản tái hiện trong bài báo (MISP taxonomy, arXiv).
- Điều kiện go-live của ZaloPay; thuật toán chữ ký của MoMo.
- Quy định thuế thu nhập cá nhân khi trả tiền cho người đóng góp ở Việt Nam: chưa khảo sát.

---

## 9. Nguồn

Tất cả đã mở ngày 2026-10-17, trừ khi ghi chú khác.

### Nền tảng học bảo mật
1. TryHackMe, Pricing: https://tryhackme.com/pricing
2. TryHackMe, Terms of Use (Last Update 01/10/2025): https://tryhackme.com/legal/terms-of-use
3. TryHackMe Help, Making your room public: https://help.tryhackme.com/en/articles/6495828-making-your-room-public
4. TryHackMe Careers, TryBuildMe [Gián tiếp]: https://careers.tryhackme.com/jobs/8094939-trybuildme-become-a-room-builder
5. Hack The Box Help, HTB Labs Subscriptions: https://help.hackthebox.com/en/articles/7257535-htb-labs-subscriptions
6. Hack The Box Blog, Pricing changes on HTB Academy (03/09/2026): https://www.hackthebox.com/blog/new-academy-pricing
7. Hack The Box Help, How to Play Machines: https://help.hackthebox.com/en/articles/5185338-how-to-play-machines-on-hack-the-box
8. Hack The Box Help, Platform Rules: https://help.hackthebox.com/en/articles/12325897-hack-the-box-platform-rules
9. Hack The Box, Acceptable Use Policy (hiệu lực 01/4/2026) [Gián tiếp]: https://resources.hackthebox.com/hubfs/Legal/AUP.pdf
10. Hack The Box Help, Machine Submission Process: https://help.hackthebox.com/en/articles/5188378-machine-submission-process
11. Hack The Box Blog, New challenge submission process (12/11/2021): https://www.hackthebox.com/blog/new-challenge-submission-process
12. PortSwigger, Web Security Academy: https://portswigger.net/web-security
13. PortSwigger, All labs (đếm mức lab): https://portswigger.net/web-security/all-labs
14. PortSwigger, Certification: https://portswigger.net/web-security/certification
15. OffSec, Pricing: https://www.offsec.com/pricing/
16. OffSec, User-generated content: https://www.offsec.com/community/ugc/
17. Exploit-DB, Submit: https://www.exploit-db.com/submit
18. SANS, Courses: https://www.sans.org/cyber-security-courses/
19. SANS, SEC401: https://www.sans.org/cyber-security-courses/security-essentials-bootcamp-style/
20. Cybrary, Pricing: https://www.cybrary.it/pricing
21. CyberDefenders, Pricing: https://cyberdefenders.org/pricing/
22. OverTheWire, Wargames: https://overthewire.org/wargames/
23. OverTheWire, Rules: https://overthewire.org/rules/
24. INE (chuyển hướng, không đọc được): https://ine.com/pricing

### Thư viện học và kho tài liệu
25. Coursera Plus: https://www.coursera.org/courseraplus
26. Coursera, Terms of Use (hoàn tiền): https://www.coursera.org/about/terms
27. Udemy, Terms of Use (cập nhật 31/07/2026): https://www.udemy.com/terms/terms-of-use/
28. Udemy, Instructor Terms (cập nhật 29/07/2026): https://www.udemy.com/terms/instructor/
29. Udemy Support, course quality checklist [Gián tiếp]: https://support.udemy.com/hc/en-us/articles/229604988
30. Pluralsight, Individual pricing: https://www.pluralsight.com/individuals/pricing
31. O'Reilly, Pricing: https://www.oreilly.com/online-learning/pricing
32. Scribd, Subscribe: https://www.scribd.com/subscribe
33. Scribd Support, About the BookID Copyright Protection System: https://support.scribd.com/hc/en-us/articles/360037497152-About-the-BookID-Copyright-Protection-System
34. Studocu, Upload: https://www.studocu.com/en-us/document/upload
35. Studocu, Premium: https://www.studocu.com/en-us/premium
36. Studocu Help, I uploaded a document, why don't I have Premium access? (bắt đăng nhập) [Gián tiếp]: https://help.studocu.com/hc/en-us/articles/360019945691
37. Course Hero Support, kết quả tìm kiếm "upload unlocks" và "copyright review upload" [Gián tiếp]: https://support.coursehero.com/hc/en-us/search?query=upload%20unlocks
38. Medium Help, Enroll in the Medium Partner Program: https://help.medium.com/hc/en-us/articles/115011694187
39. Medium Help, Medium Partner Program eligibility: https://help.medium.com/hc/en-us/articles/39121627791639
40. LinkedIn Learning (bắt đăng nhập): https://www.linkedin.com/learning/subscription/products
41. Academia.edu Premium (404): https://www.academia.edu/premium

### Thang phân loại
42. FIRST, Traffic Light Protocol 2.0: https://www.first.org/tlp/
43. FIRST, CVSS v4.0 Specification: https://www.first.org/cvss/v4.0/specification-document
44. FIRST, EPSS: https://www.first.org/epss/
45. NIST SP 800-181r1 (NICE Framework): https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-181r1.pdf
46. NIST, NICE Framework Competencies news (2021) [Gián tiếp]: https://www.nist.gov/news-events/news/2021/03/nice-framework-competencies-assessing-learners-cybersecurity-work
47. NIST, Defining a Proficiency Scale for the NICE Framework [Gián tiếp]: https://www.nist.gov/document/nist-nice-framework-measuring-cybersecurity-workforce-capabilities
48. CISA/NICCS, Cybersecurity Workforce Training Guide [Gián tiếp]: https://niccs.cisa.gov/sites/default/files/documents/Cybersecurity_Workforce_Training_Guide_7.28.21_508c.pdf
49. MISP taxonomy "admiralty-scale" [Gián tiếp]: https://eugit.opencloud.lu/MISP/misp-taxonomies/raw/tag/rm/admiralty-scale/README.md
50. arXiv 2105.07937, Confidence Assertions in Cyber-Security for an Information-Sharing Environment [Gián tiếp]: https://arxiv.org/pdf/2105.07937

### Pháp lý Việt Nam
51. Công báo, Luật Thương mại điện tử số 122/2025/QH15: https://congbao.chinhphu.vn/van-ban/luat-so-122-2025-qh15-468683/61714.htm
52. Bộ Công Thương, Phổ biến Luật TMĐT và NĐ 248/2026/NĐ-CP [Gián tiếp]: https://moit.gov.vn/tin-tuc/bo-cong-thuong-pho-bien-luat-thuong-mai-dien-tu-va-nghi-dinh-so-248-2026-nd-cp.html
53. Báo Chính phủ, Luật TMĐT: "Lấp đầy" khoảng trống pháp lý [Gián tiếp]: https://baochinhphu.vn/luat-thuong-mai-dien-tu-lap-day-khoang-trong-phap-ly-cho-kinh-te-so-bao-ve-nguoi-tieu-dung-102260106142452861.htm
54. Xây dựng chính sách, Những nội dung chủ yếu trong Luật sửa đổi Luật SHTT: https://xaydungchinhsach.chinhphu.vn/nhung-noi-dung-chu-yeu-trong-luat-sua-doi-bo-sung-mot-so-dieu-cua-luat-so-huu-tri-tue-119260127143503456.htm
55. Văn bản Chính phủ, Luật số 131/2025/QH15 [Gián tiếp]: https://vanban.chinhphu.vn/?pageid=27160&docid=216511&classid=1&typegroupid=3
56. Cục Bản quyền tác giả, Giới thiệu Luật SHTT sửa đổi 2025 (quyền tác giả) [Gián tiếp]: https://cov.gov.vn/tin-tuc/gioi-thieu-luat-sua-doi-bo-sung-mot-so-dieu-cua-luat-so-huu-tri-tue-nam-2025-noi-dung-quyen-tac-gia-quyen-lien-quan-168841.html
57. Báo Chính phủ (EN), Viet Nam's Law on Artificial Intelligence: https://en.baochinhphu.vn/viet-nams-law-on-artificial-intelligence-111260715113551787.htm
58. Công báo, Luật Trí tuệ nhân tạo số 134/2025/QH15 [Gián tiếp]: https://congbao.chinhphu.vn/van-ban/luat-so-134-2025-qh15-468694.htm
59. Công báo, Luật Giao dịch điện tử số 20/2023/QH15 [Gián tiếp]: https://congbao.chinhphu.vn/van-ban/luat-so-20-2023-qh15-39848/45939.htm
60. VKSND Tối cao, Một số điểm mới nổi bật của Luật Bảo vệ bí mật nhà nước [Gián tiếp]: https://vksndtc.gov.vn/tin-tuc/cong-tac-kiem-sat/mot-so-diem-moi-noi-bat-cua-luat-bao-ve-bi-mat-nha-d10-t13878.html
61. Thư viện Pháp luật, Luật 117/2025/QH15 (chặn bot, chưa đọc): https://thuvienphapluat.vn/van-ban/Bo-may-hanh-chinh/Law-117-2025-QH15-State-Secrets-Protection-694682.aspx
62. Văn bản hợp nhất 135/VBHN-VPQH Bộ luật Hình sự (bản đăng lại, Điều 285) [Gián tiếp]: https://legalzone.vn/wp-content/uploads/legal-sources/criminal-procedure/vbhn-135-vbhn-vpqh-bo-luat-hinh-su-phan-4.pdf
63. NĐ 17/2023/NĐ-CP (quyền tác giả) [Gián tiếp]: https://thuvienphapluat.vn/van-ban/So-huu-tri-tue/Decree-17-2023-ND-CP-elaborating-the-Law-on-Intellectual-Property-regarding-copyrights-570403.aspx

### Thanh toán
64. VNPAY Sandbox, Thanh toán PAY: https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html
65. VNPAY Sandbox, tổng quan API: https://sandbox.vnpayment.vn/apis/
66. MoMo Developers, Onboarding Process: https://developers.momo.vn/v3/docs/payment/onboarding/overall/
67. MoMo Developers, Merchant Profile: https://developers.momo.vn/v3/docs/payment/onboarding/merchant-profile/
68. ZaloPay Docs [Gián tiếp]: https://docs.zalopay.vn/docs/guides/intro

### Bảo mật ứng dụng / LLM
69. OWASP, File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
70. OWASP GenAI, LLM08:2025 Vector and Embedding Weaknesses: https://genai.owasp.org/llmrisk/llm082025-vector-and-embedding-weaknesses/

### File trong repo
71. `docs/DATA_SOURCES.md`: giấy phép nguồn dữ liệu, luật VN, rủi ro ingest.
72. `prisma/schema.prisma`: `DocVisibility`, `Document`, `DocumentChunk`.
73. `src/lib/rag.ts`: lọc `visibility` trong SQL, `fetchChunksById` cho chunk mang sang.
