# Nguồn dữ liệu mở rộng cho chatbot SecLearn (ngoài OWASP)

> Ngày lập: 2026-10-16. Phạm vi: khảo sát nguồn bên ngoài, **không sửa code**. Mọi URL, giấy phép và phiên bản đều được tra trên trang chính chủ vào ngày lập. Chỗ nào không mở được trang chính chủ thì ghi **"chưa kiểm chứng"**.
>
> Quy ước:
> - **[Đã kiểm chứng]**: đọc trực tiếp trang chính chủ / trang giấy phép (link ngay bên cạnh).
> - **[Gián tiếp]**: chỉ thấy qua kết quả tìm kiếm giới hạn trong domain chính chủ, chưa mở được toàn văn.
> - **Chưa kiểm chứng**: không truy cập được nguồn gốc. Cần tự mở lại trước khi dùng.
>
> Bối cảnh hiện tại: ingest chỉ nhận **PDF** do admin tải lên (pdf-parse → markdown → chunk 800 ký tự), embed bằng `bkai-foundation-models/vietnamese-bi-encoder`, rerank bằng `BAAI/bge-reranker-v2-m3`. Câu trả lời chỉ được dựa trên tài liệu đã ingest và phải trích dẫn `[n]`.

---

## 1. Tóm tắt

- **Dễ thêm ngay (PDF, giấy phép thoáng):** NIST SP 800-63B-4, SP 800-61r3, CSF 2.0; ACSC Essential Eight (CC BY 4.0); NCSC UK (OGL v3); CyBOK (OGL v3); CISA (TLP:CLEAR, phần lớn là tác phẩm của chính phủ Mỹ).
- **Giá trị cao nhưng cần ingest mới (JSON/XML/STIX):** CWE, CAPEC, MITRE ATT&CK, CVE, CISA KEV. Giấy phép đều cho phép dùng miễn phí, kể cả thương mại, nhưng **bắt buộc giữ thông báo bản quyền**.
- **Tiếng Việt:** văn bản luật (Luật An ninh mạng 2025, Luật Bảo vệ dữ liệu cá nhân 2025, Nghị định 356/2025) **không được bảo hộ quyền tác giả** theo Điều 15 Luật SHTT, nên ingest thoải mái. Nội dung kỹ thuật tiếng Việt của cơ quan nhà nước thì ít, và điều khoản tái sử dụng chưa rõ.
- **Không nên ingest:** ISO/IEC 27001 (giấy phép cấm dùng cho AI/TDM), PCI DSS (chỉ được dùng nội bộ để học), PortSwigger Academy, Cloudflare Learning Center (cấm cào nội dung cho AI), Exploit-DB (cấm sao chép và nội dung không phù hợp người mới).
- **Lưu ý thời sự:** Luật An toàn thông tin mạng 2015 và Luật An ninh mạng 2018 đã được hợp nhất thành **Luật An ninh mạng số 116/2025/QH15, hiệu lực 01/7/2026**. Nghị định 13/2023 đã bị **Nghị định 356/2025** thay thế từ 01/01/2026. Nếu chatbot trả lời theo luật cũ thì sẽ sai.

---

## 2. Tiêu chuẩn và khung (Standards & frameworks)

| Nguồn | Chủ sở hữu / URL | Định dạng | Giấy phép / điều khoản | Hợp với ingest PDF? | Cập nhật | Hợp người mới? |
|---|---|---|---|---|---|---|
| NIST SP 800-63B-4 (Xác thực) | NIST, https://csrc.nist.gov/pubs/sp/800/63/b/4/final | PDF + HTML (pages.nist.gov) | Không có bản quyền tại Mỹ (17 U.S.C. §105). Ngoài Mỹ, NIST cấp quyền tái bản và tạo tác phẩm phái sinh miễn phí, đề nghị ghi "Republished courtesy of the National Institute of Standards and Technology" [Gián tiếp] (https://www.nist.gov/open/license) | Có, PDF ingest ngay | Theo revision (bản cuối 07/2025) | Cao (mật khẩu, MFA) |
| NIST SP 800-61r3 (Ứng phó sự cố) | NIST, https://doi.org/10.6028/NIST.SP.800-61r3 | PDF | Như trên | Có | Bản cuối 03/04/2025, thay r2 | Trung bình |
| NIST CSF 2.0 (CSWP 29) | NIST, https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf | PDF; OSCAL JSON | Như trên | Có (PDF). Bản JSON cần parser OSCAL | Bản cuối 26/02/2024 | Trung bình (khái niệm quản trị) |
| NIST SP 800-53 Rev.5 (Danh mục control) | NIST, https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final; JSON: https://github.com/usnistgov/oscal-content | PDF (~500 trang), OSCAL JSON/XML, bảng tính | Như trên | PDF quá dài và khô; nên ingest từng control từ JSON | Release 5.2.0 ngày 27/08/2025 [Gián tiếp] | Thấp |
| NICE Framework (SP 800-181r1) | NIST, https://doi.org/10.6028/NIST.SP.800-181r1; thành phần dữ liệu: NICE Framework Resource Center → "Current Versions" | PDF + bảng/JSON thành phần | Như trên | PDF có, nhưng phần giá trị (Work Role, TKS) nằm ở bảng dữ liệu | Thành phần cập nhật riêng | Trung bình (định hướng nghề nghiệp) |
| CIS Controls v8.1 | CIS, https://www.cisecurity.org/controls | PDF, Excel | **CC BY-NC-ND 4.0**: được chia sẻ phi thương mại nếu ghi công CIS và link giấy phép, **không phân phối bản đã sửa**; dùng thương mại phải xin phép [Gián tiếp] (https://www.cisecurity.org/terms-of-use-for-non-member-cis-products, https://cas.docs.cisecurity.org/en/latest/source/terms-of-use/) | Có. Ingest nguyên văn PDF để trích dẫn thì ổn với đồ án phi thương mại; câu trả lời tóm tắt có thể bị coi là "phái sinh" (vùng xám) | Vài năm một lần | Cao (IG1 = vệ sinh cơ bản) |
| CIS Benchmarks | CIS | PDF (yêu cầu đăng ký) | Điều khoản non-member như trên; chi tiết tải về chưa kiểm chứng | Có nhưng rất dài, theo từng sản phẩm | Liên tục | Thấp |
| ISO/IEC 27001 | ISO, https://www.iso.org | PDF trả phí | **Không dùng được.** Thỏa thuận End Customer Licence hạn chế "digital, automated, or AI-related uses"; điều khoản OBP cấm rõ huấn luyện/truy vấn mô hình và TDM bằng nội dung ISO [Gián tiếp] (https://www.iso.org/terms-conditions-licence-agreement.html, https://www.iso.org/home/store/iso-obp-terms.html) | Không | — | — |
| PCI DSS v4.0.1 | PCI SSC, https://www.pcisecuritystandards.org/document_library/ | PDF (phải bấm "ACCEPT" license) | Mức "study": chỉ được tải, sao chép **nội bộ**, chia sẻ cho nhân viên để học, **không sublicense, không sửa** [Gián tiếp] (https://listings.pcisecuritystandards.org/minisite/en) | Về kỹ thuật thì có; về pháp lý, đưa lên chatbot cho người ngoài là rủi ro | v4.0 hết hiệu lực 31/12/2024, chỉ còn v4.0.1 | Thấp |

**Ví dụ cụ thể:**
- **NIST SP 800-63B-4 §3.1.1 Passwords**: mật khẩu dùng làm yếu tố duy nhất phải dài **tối thiểu 15 ký tự**; mật khẩu chỉ dùng trong MFA thì tối thiểu 8 ký tự (https://pages.nist.gov/800-63-4/sp800-63b/authenticators/). Lưu ý: §5.1.1 "Memorized Secrets" là của bản 800-63B cũ, **đã rút ngày 01/08/2025** (https://csrc.nist.gov/pubs/sp/800/63/b/4/final). Chatbot cần bản mới.
- **NIST SP 800-63B-4 §3.2.5 Phishing Resistance**: bắt buộc ở AAL3, khuyến nghị ở AAL2. SMS/voice OTP không được coi là chống phishing.
- **NIST CSF 2.0, chức năng Govern (GV)**: các category GV.OC, GV.RM, GV.SC, GV.RR, GV.PO, GV.OV (https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf).
- **NIST SP 800-61r3, Bảng 1**: ánh xạ vòng đời ứng phó sự cố cũ sang 6 chức năng CSF 2.0.
- **CIS Control 4** "Secure Configuration of Enterprise Assets and Software" (tên control chưa kiểm chứng trên PDF gốc v8.1).

> NIST **không có bản dịch tiếng Việt** cho CSF hay các tài liệu an ninh mạng khác. Trang dịch thuật chỉ liệt kê Thái, Indonesia, Malay, Nhật, Hàn... (https://www.nist.gov/cybersecurity/translations).

---

## 3. Cơ sở tri thức về mối đe dọa và lỗ hổng

| Nguồn | Chủ sở hữu / URL | Định dạng | Giấy phép / điều khoản | Ingest cần gì | Cập nhật | Hợp người mới? |
|---|---|---|---|---|---|---|
| **CWE** | MITRE, https://cwe.mitre.org/data/downloads.html | XML (zip), CSV theo view, HTML booklet, PDF toàn bộ, REST API | Miễn phí cho nghiên cứu, phát triển và **thương mại**; mọi bản sao phải giữ ghi chú bản quyền MITRE và giấy phép [Đã kiểm chứng] (https://cwe.mitre.org/about/termsofuse.html) | Nên dùng parser XML/CSV: mỗi CWE = 1 tài liệu (tên, mô tả, hậu quả, ví dụ, cách giảm thiểu). PDF toàn bộ thì cắt 800 ký tự sẽ rời rạc | Phiên bản 4.20; vài lần/năm | **Cao**: giải thích lớp lỗi |
| **CAPEC** | MITRE, https://capec.mitre.org/data/downloads.html | XML, CSV, HTML booklet | Giấy phép miễn phí, không độc quyền như CWE [Đã kiểm chứng] (https://capec.mitre.org/about/termsofuse.html) | Parser XML/CSV | v3.9, 559 attack pattern | Trung bình |
| **MITRE ATT&CK** | MITRE, https://attack.mitre.org; dữ liệu: https://github.com/mitre-attack/attack-stix-data | **STIX 2.1 JSON** (Enterprise/Mobile/ICS), Excel, web | Miễn phí cho nghiên cứu, phát triển và thương mại. Bản sao phải giữ ghi chú "© … The MITRE Corporation. This work is reproduced and distributed with the permission of The MITRE Corporation." [Đã kiểm chứng] (https://attack.mitre.org/resources/legal-and-branding/terms-of-use/) | Cần ingest **STIX/JSON**: lọc `attack-pattern`, ghép tên + mô tả + mitigation + detection | ~2 lần/năm. Bản hiện tại **v20 (13/10/2026)** [Gián tiếp] (https://attack.mitre.org/resources/versions/) | Trung bình (từ vựng nhiều, nhưng ví dụ thực tế tốt) |
| **CVE List** | CVE Program/MITRE, https://www.cve.org; dữ liệu: https://github.com/CVEProject/cvelistV5 | CVE JSON 5.x | Giấy phép vĩnh viễn, miễn phí, cho phép tái bản và phân phối nếu giữ ghi chú bản quyền MITRE; **không được sửa nội dung CVE** [Gián tiếp] (CVE Program Terms of Use, trích trong https://www.cve.org/Resources/Roles/Cnas/CNA_Rules_v3.0.pdf). Repo GitHub dẫn về Terms of Use của CVE Program [Đã kiểm chứng] | JSON, và **khối lượng rất lớn** (>300k bản ghi): chỉ nên ingest có chọn lọc (ví dụ các CVE trong KEV) | ~7 phút/lần; baseline hằng ngày | Thấp (mô tả ngắn, kỹ thuật) |
| **NVD** | NIST, https://nvd.nist.gov | API 2.0 (JSON) | Dữ liệu chính phủ Mỹ. Câu ghi công bắt buộc, hạn mức API và yêu cầu API key: **chưa kiểm chứng** (trang developers render bằng JS, không đọc được). Đã biết: request bị giới hạn trả về HTTP 429 từ 05/2025; key cấp qua form (https://nvd.nist.gov/general/news) | Cần job gọi API + JSON | Liên tục | Thấp |
| **CISA KEV** | CISA, https://www.cisa.gov/known-exploited-vulnerabilities-catalog; mirror: https://github.com/cisagov/kev-data | JSON, CSV + JSON schema | **CC0** (public domain) [Đã kiểm chứng] (https://github.com/cisagov/kev-data) | JSON/CSV, nhỏ gọn. Mỗi dòng = 1 tài liệu ngắn (CVE, vendor, mô tả, hành động yêu cầu) | Vài lần/tuần | Trung bình: giúp trả lời "lỗ hổng nào đang bị khai thác thật" |
| **FIRST CVSS v4.0** | FIRST, https://www.first.org/cvss/v4.0/specification-document | HTML/PDF | FIRST "licenses it to the public freely for use"; phải ghi rằng CVSS thuộc FIRST và được dùng với sự cho phép [Đã kiểm chứng] (trang specification) | PDF/HTML ingest được | Hiếm (v4.0 hiện hành) | Trung bình (dạy cách đọc điểm CVSS) |
| **FIRST EPSS** | FIRST, https://www.first.org/epss/; API https://api.first.org/epss/ | API JSON, CSV hằng ngày | Trang chỉ nói dữ liệu "freely and openly accessible". **Điều khoản tái sử dụng chưa kiểm chứng** | Là số liệu, không phải văn bản. Hợp với tool-call hơn RAG | Hằng ngày | Thấp |
| **Exploit-DB** | OffSec, https://www.exploit-db.com | Web, repo GitLab | Điều khoản cấm "reproduce, duplicate, copy… any portion of the Service" khi chưa có văn bản cho phép [Đã kiểm chứng] (https://www.exploit-db.com/terms) | **Không nên.** Vừa vướng điều khoản, vừa là mã khai thác, trái với persona gia sư cho người mới | — | Không |

**Ví dụ cụ thể:**
- **CWE-918** Server-Side Request Forgery (SSRF); **CWE-79** XSS; **CWE-89** SQL Injection. Các mục này khớp trực tiếp với nội dung OWASP đang có, nên chatbot trích dẫn chéo được.
- **CAPEC-66** SQL Injection; **CAPEC-98** Phishing (số hiệu theo danh mục CAPEC, chưa mở từng trang).
- **ATT&CK T1566 Phishing** (các sub-technique .001 Spearphishing Attachment, .002 Spearphishing Link); **T1110 Brute Force**.
- **CVE-2021-44228** (Log4Shell): có trong cả CVE, NVD và KEV. Đây là ví dụ kinh điển để dạy chuỗi CVE → CWE-502/CWE-917 → CVSS → KEV.

---

## 4. Khuyến cáo của cơ quan chính phủ

### 4.1 Quốc tế

| Nguồn | URL | Định dạng | Giấy phép | Ví dụ | Hợp người mới? |
|---|---|---|---|---|---|
| **CISA (Mỹ)** | https://www.cisa.gov | PDF/HTML | Trang linking policy coi cisa.gov là "public domain"; tài liệu gắn nhãn TLP:CLEAR "may be distributed without restriction", tùy theo quy tắc bản quyền tiêu chuẩn; tài liệu của bên thứ ba thì không [Gián tiếp] (https://www.cisa.gov/linking-policy, https://www.cisa.gov/notification, https://www.cisa.gov/terms-use) | "Phishing Guidance: Stopping the Attack Cycle at Phase One" (2025); "Zero Trust Maturity Model v2.0" (04/2023); loạt Secure by Design | **Cao** |
| **NCSC (Anh)** | https://www.ncsc.gov.uk | PDF/HTML, infographic | Crown copyright, **OGL v3.0**: tái sử dụng không cần xin phép nếu ghi nguồn; ảnh/logo/bên thứ ba bị loại trừ [Gián tiếp] (https://www.ncsc.gov.uk/section/about-this-website/terms-and-conditions) | "Cyber Essentials: Requirements for IT Infrastructure v3.2"; infographic "Use 2-step verification (2SV)"; "What to do when cyber attacks disrupt your organisation" (07/2026) | **Rất cao**: văn phong cho người không chuyên |
| **ENISA (EU)** | https://www.enisa.europa.eu | PDF | Được tái bản nếu ghi nguồn, trừ khi trang ghi khác; logo và ảnh bên thứ ba bị loại trừ [Gián tiếp] (https://www.enisa.europa.eu/about-enisa/legal-notice) | "ENISA Threat Landscape 2025" (10/2025): phishing chiếm ~60% vector truy cập ban đầu; đã có bản 2026 | Trung bình (báo cáo xu hướng) |
| **ASD/ACSC (Úc)** | https://www.cyber.gov.au | PDF/HTML | **CC BY 4.0**, ghi "© Commonwealth of Australia <năm>"; trừ quốc huy, logo, nội dung bên thứ ba [Gián tiếp] (https://www.cyber.gov.au/about-us/copyright) | "Essential Eight Maturity Model FAQ" (10/2024); "Restricting Administrative Privileges"; "Essential Eight maturity model and ISM mapping" | **Cao**: 8 biện pháp dễ nhớ |

Tất cả đều là PDF/HTML tiếng Anh nên **ingest PDF hiện tại dùng ngay được**. Riêng trang HTML thì cần thêm bộ chuyển HTML → markdown (xem mục 7).

### 4.2 Việt Nam

| Nguồn | URL | Định dạng | Giấy phép / điều khoản | Ghi chú |
|---|---|---|---|---|
| **Văn bản quy phạm pháp luật** | Công báo: https://congbao.chinhphu.vn; CSDL: https://vbpl.vn; https://vanban.chinhphu.vn | PDF/DOC/HTML | **Không thuộc phạm vi bảo hộ quyền tác giả**: Điều 15 Luật SHTT loại trừ "văn bản quy phạm pháp luật, văn bản hành chính… và bản dịch chính thức". Chưa đọc toàn văn Điều 15 trên vbpl.vn; nội dung này chỉ đối chiếu qua tìm kiếm | Nguồn tiếng Việt "sạch" nhất về pháp lý |
| **Cục An toàn thông tin (AIS)** | https://ais.gov.vn | HTML, PDF (cẩm nang, cảnh báo) | **Chưa kiểm chứng**: trang không phân giải DNS được lúc khảo sát. Trang "Giới thiệu" vẫn ghi chức năng theo QĐ 1499/QĐ-BTTTT (2023). Việc Cục thuộc Bộ KH&CN sau hợp nhất **chưa kiểm chứng**. Một phần nhiệm vụ (cấp phép sản phẩm, dịch vụ ATTT mạng) đã chuyển sang **Bộ Công an từ 01/3/2025** (https://xaydungchinhsach.chinhphu.vn/ban-giao-nhiem-vu-bao-dam-an-toan-thong-tin-mang-giua-2-bo-11925022816531506.htm) | Có cẩm nang "An toàn trực tuyến" (hợp tác với Google), cảnh báo lỗ hổng (ví dụ F5 BIG-IP CVE-2020-5902) |
| **NCSC Việt Nam** | https://khonggianmang.vn | HTML | **Chưa kiểm chứng** (DNS lỗi lúc khảo sát) | Có cẩm nang cho người cao tuổi về lừa đảo trực tuyến, rất hợp cho người mới |
| **VNCERT/CC** | https://vncert.vn | HTML | Footer chỉ ghi "© Bản quyền thuộc … VNCERT", **không có điều khoản tái sử dụng** [Đã kiểm chứng] | Mục Tin tức gần như trống lúc khảo sát; giá trị ingest thấp |
| **TCVN 11930:2017** | Tiêu chuẩn quốc gia (Bộ KH&CN công bố) | PDF | **Chưa kiểm chứng.** TCVN thường được bán; bản PDF lưu hành trên trang sở/ngành không phải nguồn phát hành chính thức | Yêu cầu an toàn HTTT theo 5 cấp độ (quản lý + kỹ thuật). Phù hợp người học quản trị, không phải người mới |

**Văn bản luật nên ingest (đã đối chiếu số hiệu trên cổng Chính phủ):**
- **Luật An ninh mạng số 116/2025/QH15**, thông qua 10/12/2025, **hiệu lực 01/7/2026**. Luật hợp nhất Luật An ninh mạng 2018 và Luật An toàn thông tin mạng 2015 (https://congbao.chinhphu.vn/van-ban/luat-so-116-2025-qh15-468678.htm; văn bản hợp nhất 171/2026/VBHN-VPQH: https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/10/171-vbhn-vpqh.signed.pdf). Số chương/điều: nguồn thứ cấp ghi khác nhau, **cần đọc bản gốc**.
- **Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15**, hiệu lực 01/01/2026 (https://congbao.chinhphu.vn/van-ban/luat-so-91-2025-qh15-45578.htm).
- **Nghị định 356/2025/NĐ-CP** hướng dẫn Luật BVDLCN, hiệu lực 01/01/2026 (https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-356-2025-nd-cp-468371.htm). Theo PwC Việt Nam, nghị định này **thay thế Nghị định 13/2023/NĐ-CP**; chưa đọc điều khoản chuyển tiếp trong văn bản gốc.
- Luật An ninh mạng 2018 và Luật ATTT mạng 2015: chỉ nên giữ kèm nhãn **"hết hiệu lực từ 01/7/2026"** để chatbot không trích như luật hiện hành.

---

## 5. Tài liệu học tập

| Nguồn | URL | Giấy phép | Ingest | Ví dụ | Hợp người mới? |
|---|---|---|---|---|---|
| **MDN Web Security** | https://developer.mozilla.org/en-US/docs/Web/Security | Văn bản: **CC BY-SA 2.5+** (ghi "Mozilla Contributors" + link trang, nêu chỗ đã sửa); code mẫu sau 20/8/2010: CC0 [Đã kiểm chứng] (https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines/Attrib_copyright_license) | HTML. Tốt hơn: lấy markdown gốc từ repo `mdn/content` trên GitHub (chưa kiểm chứng đường dẫn cụ thể). Có bản dịch một số trang, **chưa kiểm chứng có tiếng Việt** | CSP, Same-origin policy, CORS, cookie `SameSite`/`HttpOnly` | **Cao** |
| **Microsoft Learn (security docs)** | https://learn.microsoft.com; nguồn: org GitHub `MicrosoftDocs` | Các repo MicrosoftDocs thường để docs **CC BY 4.0**, code MIT [Gián tiếp] (https://github.com/orgs/MicrosoftDocs/repositories). Cần kiểm LICENSE của từng repo cụ thể (repo `MicrosoftDocs/security` trả 404 lúc khảo sát) | Markdown trong repo, ingest dễ nếu thêm loader `.md` | Zero Trust, MFA trong Entra ID | Trung bình (nặng sản phẩm) |
| **CyBOK v1.1** | https://www.cybok.org/knowledgebase/ | **OGL v3.0**, "© Crown Copyright, The National Cyber Security Centre 2021" [Gián tiếp] (thông báo trong PDF, ví dụ https://www.cybok.org/media/downloads/Introduction_tree_1.1.0.pdf) | PDF từng Knowledge Area, ingest ngay | KA "Web & Mobile Security", "Authentication, Authorisation & Accountability", "Human Factors" | Trung bình–cao (học thuật nhưng có hệ thống) |
| **MIT OCW 6.858 Computer Systems Security** | https://ocw.mit.edu/courses/6-858-computer-systems-security-fall-2014/ | **CC BY-NC-SA 4.0** (metadata trang) [Gián tiếp] | PDF lecture notes | Lecture 1 (threat model), Lab 1 (buffer overflow) | Thấp (sau đại học) |
| **OpenLearn "Introduction to cyber security: stay safe online"** | https://www.open.edu/openlearn/digital-computing/introduction-cyber-security-stay-safe-online/content-section-overview | **CC BY-NC-SA 4.0**, trừ tài liệu bên thứ ba [Gián tiếp] | Có bản tải OUXML/Word/PDF (alt formats) | Malware, mật khẩu, 2FA | **Rất cao** |
| **PortSwigger Web Security Academy** | https://portswigger.net/web-security | Bảo lưu mọi quyền; chỉ cho in hoặc trích để dùng cá nhân, cấm dùng thương mại [Gián tiếp] (https://portswigger.net/web-security/certification/terms-and-conditions/website-terms-of-use) | **Không ingest.** Chỉ đưa link "đọc thêm" | — | Cao (nhưng chỉ link) |
| **Cloudflare Learning Center** | https://www.cloudflare.com/learning/ | Mục 8 Website Terms **cấm bot thu thập nội dung cho AI/ML**; muốn dùng Materials phải được cho phép rõ ràng [Đã kiểm chứng] (https://www.cloudflare.com/website-terms/) | **Không ingest** | — | — |
| **SANS posters / cheat sheets** | https://www.sans.org/posters/ | Footer: "unauthorized use is expressly prohibited"; điều khoản chi tiết **chưa kiểm chứng** | Không ingest khi chưa có phép | "Burp Suite Cheat Sheet" (PDF) | — |
| **Google (Safety Center, v.v.)** | — | **Chưa kiểm chứng** (chưa khảo sát) | — | — | — |

---

## 6. Bộ dữ liệu đánh giá (QA benchmark)

Các bộ này dùng để **đo** chatbot (độ chính xác retrieval và câu trả lời), **không ingest vào corpus** (nếu ingest thì sẽ "lộ đề").

| Bộ | Nguồn chính | Kích thước / định dạng | Giấy phép | Ghi chú |
|---|---|---|---|---|
| **CyberMetric** | https://github.com/cybermetric/CyberMetric; bài báo IEEE CSR 2024, DOI 10.1109/CSR61664.2024.10679494 | Trắc nghiệm, các bản 80 / 500 / 2.000 / 10.000 câu, JSON + script chấm | **Repo không ghi giấy phép** [Đã kiểm chứng], nên mặc định là bảo lưu quyền. Chỉ dùng để đánh giá nội bộ | Câu hỏi sinh từ NIST, RFC... bằng RAG nên có phần trùng corpus |
| **SecQA** | https://huggingface.co/datasets/zefang-liu/secqa; arXiv:2312.15838 | 242 câu MCQ (v1: 127, v2: 115), CSV, do GPT-4 sinh từ một giáo trình | **CC BY-NC-SA 4.0** [Đã kiểm chứng] | Nhỏ, hợp để smoke test |
| **CTIBench** | https://huggingface.co/datasets/AI4Sec/cti-bench; arXiv:2406.07599 | 5.610 dòng TSV: cti-mcq (2.5k), cti-rcm (CVE→CWE), cti-vsp (CVSS), cti-ate (ATT&CK), cti-taa | **CC BY-NC-SA 4.0** [Đã kiểm chứng] | cti-rcm và cti-ate hữu ích nếu ingest CWE/ATT&CK |

Cả ba bộ đều **bằng tiếng Anh**. Với đồ án, nên tự dịch một mẫu khoảng 100 câu sang tiếng Việt (giấy phép NC-SA cho phép tạo phái sinh phi thương mại nếu chia sẻ cùng giấy phép; CyberMetric thì không) và đo recall@5 trước/sau khi thêm nguồn.

---

## 7. Ingest hiện tại cần đổi gì

| Loại nguồn | Thay đổi tối thiểu |
|---|---|
| PDF (NIST, NCSC, ACSC, CISA, CyBOK, ENISA, luật VN) | Không cần đổi. Chỉ nên thêm metadata `source`, `license`, `version`, `effective_date` cho mỗi tài liệu để hiển thị cạnh `[n]` và để lọc tài liệu hết hiệu lực |
| Markdown/HTML (MDN, Microsoft Learn, cổng luật) | Thêm loader `.md`/`.html` (HTML → markdown), bỏ menu/footer. Chunk theo heading thay vì cứng 800 ký tự |
| JSON/XML/CSV có cấu trúc (CWE, CAPEC, KEV, CVE) | Thêm "record loader": **1 bản ghi = 1 tài liệu** (ví dụ `CWE-918: <tên>\n<mô tả>\n<giảm thiểu>`), giữ ID làm tiêu đề để trích dẫn chính xác. Không nên cắt 800 ký tự xuyên qua nhiều bản ghi |
| STIX 2.1 (ATT&CK) | Lọc object `attack-pattern` (bỏ `revoked`/`x_mitre_deprecated`), ghép `external_id` + `name` + `description` + mitigation liên quan |
| Nguồn cập nhật liên tục (KEV, CVE) | Job đồng bộ định kỳ + ghi `fetched_at`. Chatbot nên nói rõ "dữ liệu tính đến ngày …" |
| Thông báo bản quyền bắt buộc (MITRE, CVSS, NIST ngoài Mỹ, OGL, CC BY) | Lưu chuỗi attribution theo tài liệu và hiển thị ở phần nguồn/trang "Giới thiệu dữ liệu" |

Lưu ý về embedding: `vietnamese-bi-encoder` được tối ưu cho tiếng Việt. Thêm nhiều văn bản tiếng Anh sẽ dựa vào khả năng cross-lingual (mục "cross-lingual retrieval" ở commit `e73f76d`) và reranker đa ngôn ngữ `bge-reranker-v2-m3`. Nên đo lại recall khi corpus tiếng Anh tăng mạnh. Chưa kiểm chứng bằng thực nghiệm.

---

## 8. Đề xuất ưu tiên (5–8 nguồn thêm trước)

| # | Nguồn | Lý do | Công sức |
|---|---|---|---|
| 1 | **NIST SP 800-63B-4** (+ CSF 2.0) | Public domain tại Mỹ. Chủ đề mật khẩu/MFA đúng với người mới và bổ trợ cheat sheet MFA của OWASP. Thay thế kiến thức cũ ("đổi mật khẩu định kỳ", 8 ký tự) | Thấp (PDF) |
| 2 | **CWE** (lọc theo view Top 25 / Software Development) | Giấy phép cho phép cả thương mại. Liên kết trực tiếp với lỗi OWASP (A03 Injection → CWE-89). ID ổn định nên trích dẫn rõ ràng | Trung bình (loader XML/CSV) |
| 3 | **NCSC UK** (Cyber Essentials, infographic 2SV, hướng dẫn cho cá nhân) | OGL v3 rất thoáng. Văn phong dành cho người không chuyên | Thấp (PDF) |
| 4 | **ACSC Essential Eight** | CC BY 4.0. Khung "8 việc cần làm" dễ dạy, có mức trưởng thành | Thấp (PDF) |
| 5 | **Luật An ninh mạng 116/2025 + Luật BVDLCN 91/2025 + NĐ 356/2025** | Nguồn tiếng Việt duy nhất có giấy phép rõ (không bảo hộ quyền tác giả). Người học VN thường hỏi "có phạm luật không?" | Thấp (PDF/DOC). Phải gắn ngày hiệu lực |
| 6 | **MITRE ATT&CK** (Enterprise, chỉ technique chính) | Từ vựng chuẩn của ngành, có ví dụ nhóm tấn công thật. Giấy phép cho phép, cần giữ ghi chú MITRE | Trung bình–cao (STIX) |
| 7 | **CISA KEV** + CISA hướng dẫn phishing | CC0. Trả lời câu hỏi "lỗ hổng này có đang bị khai thác không?" bằng dữ liệu thật | Trung bình (JSON + đồng bộ) |
| 8 | **MDN Web Security** hoặc **CyBOK** | MDN: giải thích CSP/CORS/cookie rất dễ hiểu (CC BY-SA, nhớ ghi công). CyBOK: khung kiến thức đầy đủ (OGL) | Thấp–trung bình |

Thứ tự gợi ý: làm 1, 3, 4, 5 trước vì chỉ cần upload PDF. Sau đó viết **một** record loader dùng chung cho 2 và 7, rồi mới đến ATT&CK.

---

## 9. Rủi ro

| Rủi ro | Mô tả | Giảm thiểu |
|---|---|---|
| **Giấy phép** | ISO, PCI DSS, PortSwigger, Cloudflare, Exploit-DB, SANS không cho tái sử dụng như corpus. CIS là NC-ND (vùng xám nếu chatbot "diễn giải"). CC BY-SA (MDN) và NC-SA (OpenLearn, SecQA) có điều kiện chia sẻ tương tự | Lưu trường `license` mỗi tài liệu; chỉ ingest nguồn có giấy phép rõ; nguồn còn lại chỉ đưa link |
| **Bắt buộc ghi công** | MITRE (ATT&CK/CWE/CAPEC/CVE), FIRST CVSS, OGL, CC BY đều yêu cầu attribution | Hiển thị attribution ở danh sách nguồn `[n]` và trang giới thiệu |
| **Lỗi thời** | SP 800-63B cũ (rút 08/2025), Luật ATTT mạng 2015/Luật ANM 2018 (hết hiệu lực 01/7/2026), NĐ 13/2023 (bị thay 01/01/2026). ATT&CK/CWE/KEV thay đổi liên tục | Metadata `version`/`effective_date`; ẩn tài liệu bị thay thế; job đồng bộ cho KEV/CVE |
| **Chỉ có tiếng Anh** | Gần như mọi nguồn kỹ thuật đều tiếng Anh; NIST không có bản dịch tiếng Việt | Dựa vào cross-lingual retrieval và LLM trả lời bằng tiếng Việt kèm trích dẫn gốc; đo recall riêng cho câu hỏi tiếng Việt |
| **Prompt injection trong nội dung cào** | HTML/JSON từ web (CVE description, bài viết, comment) có thể chứa câu như "ignore previous instructions". Chunk được đưa nguyên vào context | Chỉ ingest từ domain chính chủ; làm sạch HTML; đóng khung context như dữ liệu trong system prompt; admin duyệt trước khi publish |
| **Nội dung tấn công** | CVE/ATT&CK/Exploit-DB có thể khiến chatbot hướng dẫn khai thác cụ thể | Không ingest exploit; giữ ở mức khái niệm + phòng thủ; thêm chính sách an toàn (đã nêu ở `docs/CHATBOT_VS_CHATGPT.md`) |
| **Khối lượng** | CVE >300k bản ghi; SP 800-53 hàng trăm trang. Corpus loãng làm giảm chất lượng top-K=5 | Lọc theo mức liên quan với người mới; ưu tiên chất lượng hơn số lượng |
| **Nguồn VN khó truy cập** | ais.gov.vn và khonggianmang.vn không phân giải được DNS lúc khảo sát; VNCERT không có điều khoản tái sử dụng | Hỏi trực tiếp cơ quan hoặc chỉ dùng văn bản pháp luật |

---

## 10. Nguồn (trang chính chủ đã tra)

**NIST**
- https://www.nist.gov/oism/copyrights
- https://www.nist.gov/open/license
- https://csrc.nist.gov/pubs/sp/800/63/b/4/final
- https://pages.nist.gov/800-63-4/sp800-63b/authenticators/
- https://doi.org/10.6028/NIST.SP.800-61r3
- https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf
- https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final
- https://github.com/usnistgov/oscal-content
- https://csrc.nist.gov/pubs/sp/800/181/r1/final
- https://www.nist.gov/cybersecurity/translations
- https://nvd.nist.gov/general/news

**Tiêu chuẩn có phí hoặc hạn chế**
- https://www.cisecurity.org/terms-of-use-for-non-member-cis-products
- https://cas.docs.cisecurity.org/en/latest/source/terms-of-use/
- https://www.iso.org/terms-conditions-licence-agreement.html
- https://www.iso.org/home/store/iso-obp-terms.html
- https://www.pcisecuritystandards.org/document_library/
- https://listings.pcisecuritystandards.org/minisite/en

**MITRE, FIRST, CISA**
- https://attack.mitre.org/resources/legal-and-branding/terms-of-use/
- https://attack.mitre.org/resources/versions/
- https://github.com/mitre-attack/attack-stix-data
- https://cwe.mitre.org/about/termsofuse.html
- https://cwe.mitre.org/data/downloads.html
- https://capec.mitre.org/about/termsofuse.html
- https://capec.mitre.org/data/downloads.html
- https://www.cve.org/Resources/Roles/Cnas/CNA_Rules_v3.0.pdf
- https://github.com/CVEProject/cvelistV5
- https://github.com/cisagov/kev-data
- https://www.first.org/cvss/v4.0/specification-document
- https://www.first.org/epss/
- https://www.exploit-db.com/terms
- https://www.cisa.gov/linking-policy
- https://www.cisa.gov/notification
- https://www.cisa.gov/terms-use

**Cơ quan quốc tế khác**
- https://www.ncsc.gov.uk/section/about-this-website/terms-and-conditions
- https://www.enisa.europa.eu/about-enisa/legal-notice
- https://www.enisa.europa.eu/sites/default/files/2025-11/ENISA%20Threat%20Landscape%202025.pdf
- https://www.cyber.gov.au/about-us/copyright

**Việt Nam**
- https://congbao.chinhphu.vn/van-ban/luat-so-116-2025-qh15-468678.htm
- https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/10/171-vbhn-vpqh.signed.pdf
- https://congbao.chinhphu.vn/van-ban/luat-so-91-2025-qh15-45578.htm
- https://vbpl.vn/TW/Pages/vbpq-van-ban-goc.aspx?ItemID=179252
- https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-356-2025-nd-cp-468371.htm
- https://xaydungchinhsach.chinhphu.vn/ban-giao-nhiem-vu-bao-dam-an-toan-thong-tin-mang-giua-2-bo-11925022816531506.htm
- https://ais.gov.vn/ve-chung-toi/ (không truy cập được lúc khảo sát)
- https://vncert.vn/

**Học liệu**
- https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines/Attrib_copyright_license
- https://github.com/orgs/MicrosoftDocs/repositories
- https://www.cybok.org/knowledgebase/
- https://ocw.mit.edu/courses/6-858-computer-systems-security-fall-2014/
- https://www.open.edu/openlearn/digital-computing/introduction-cyber-security-stay-safe-online/content-section-overview
- https://portswigger.net/web-security/certification/terms-and-conditions/website-terms-of-use
- https://www.cloudflare.com/website-terms/
- https://www.sans.org/posters/

**Bộ dữ liệu đánh giá**
- https://github.com/cybermetric/CyberMetric
- https://huggingface.co/datasets/zefang-liu/secqa
- https://huggingface.co/datasets/AI4Sec/cti-bench
