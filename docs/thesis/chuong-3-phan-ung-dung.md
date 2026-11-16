<!--
Chương 3, mục 3.1–3.6 (phần ứng dụng). Mục 3.7–3.8 (bộ đánh giá) viết sau.
[HÌNH] = hình cần vẽ; nguồn Mermaid ghi kèm, nằm trong Detali-design.md.
Bảng thuộc tính đầy đủ của CSDL và đặc tả API chi tiết đưa sang Phụ lục E.
-->

# CHƯƠNG 3. PHÂN TÍCH, THIẾT KẾ HỆ THỐNG VÀ BỘ DỮ LIỆU ĐÁNH GIÁ

Chương này gồm hai phần. Các mục 3.1 đến 3.6 phân tích, thiết kế và triển khai ứng dụng SecLearn, trong đó mục 3.5 trình bày chi tiết pipeline RAG. Các mục 3.7 và 3.8 thiết kế bộ dữ liệu đánh giá dùng để đo pipeline đó.

## 3.1. Phân tích yêu cầu

### 3.1.1. Tác nhân và phân quyền

SecLearn có ba tác nhân:

- Khách: người chưa đăng nhập. Khách xem được bài học và hỏi trợ lý tối đa 10 câu; lịch sử hội thoại chỉ lưu trong trình duyệt.
- Người học: người đã đăng ký và đăng nhập. Người học được lưu và xem lại lịch sử hội thoại.
- Quản trị viên: có mọi quyền của người học, cộng thêm quyền quản lý người dùng, tài liệu và bài học.

Toàn bộ chính sách phân quyền đặt ở một module duy nhất (`src/lib/permissions.ts`) để các API kiểm tra cùng một nguồn. Bảng 3.1 liệt kê các quyền.

Bảng 3.1. Phân quyền theo tác nhân

| Quyền | Khách | Người học | Quản trị viên |
|---|:-:|:-:|:-:|
| Xem bài học | ✔ | ✔ | ✔ |
| Hỏi trợ lý | ✔ (tối đa 10 câu) | ✔ | ✔ |
| Lưu và xem lịch sử hội thoại | | ✔ | ✔ |
| Quản lý người dùng, tài liệu, bài học | | | ✔ |
| Tài liệu được dùng để trả lời | `public` | `public`, `authenticated` | `public`, `authenticated` |

Ngoài bảng trên có một số quy tắc bổ sung. Quản trị viên không được tự khóa tài khoản hay tự đổi vai trò của mình, và không được thực hiện thao tác làm hệ thống không còn quản trị viên nào đang hoạt động. Tài khoản bị khóa bị từ chối ở mọi API; vì phiên lưu bằng JWT, máy chủ đọc lại vai trò và trạng thái khóa của người dùng sau mỗi 5 phút để thay đổi có hiệu lực mà không cần chờ phiên hết hạn.

### 3.1.2. Yêu cầu chức năng

Bảng 3.2 liệt kê 18 chức năng của hệ thống, chia theo nhóm.

Bảng 3.2. Danh sách chức năng

| Mã | Nhóm | Chức năng | Tác nhân |
|---|---|---|---|
| F01 | Xác thực | Đăng ký tài khoản, kiểm tra độ mạnh mật khẩu | Khách |
| F02 | Xác thực | Đăng nhập, đăng xuất | Khách, người dùng |
| F03 | Xác thực | Lấy thông tin người dùng hiện tại | Người dùng |
| F04 | Trợ lý | Khách hỏi tối đa 10 câu, lịch sử lưu trong trình duyệt | Khách |
| F05 | Trợ lý | Xem số câu hỏi khách còn lại | Khách |
| F06 | Trợ lý | Tạo, liệt kê, mở, xóa hội thoại | Người dùng |
| F07 | Trợ lý | Gửi câu hỏi, nhận câu trả lời dạng streaming có trích dẫn | Người dùng |
| F08 | Trợ lý | Chuyển hội thoại khách vào tài khoản sau khi đăng nhập | Người dùng |
| F09 | Trợ lý | Panel nguồn: đoạn được và không được trích, điểm rerank, kiểm tra trích dẫn, đánh giá của LLM | Mọi người |
| F10 | RAG | Lập kế hoạch truy vấn: viết lại, dịch sang tiếng Anh, HyDE, tách câu so sánh, nhận diện câu hỏi về chính hội thoại | Hệ thống |
| F11 | RAG | Truy xuất lai vector và từ khóa, rerank, ngưỡng liên quan | Hệ thống |
| F12 | RAG | Trả lời từ chối cố định khi không có đoạn liên quan, không gọi LLM | Hệ thống |
| F13 | Bài học | Xem danh sách và chi tiết bài học theo ngôn ngữ | Mọi người |
| F14 | Quản trị | Quản lý người dùng: đổi vai trò, khóa, mở khóa | Quản trị viên |
| F15 | Quản trị | Quản lý tài liệu: tải nhiều PDF, đặt mức hiển thị, xem file, lập chỉ mục lại, xóa | Quản trị viên |
| F16 | Quản trị | Nạp tài liệu chạy nền: trích PDF, làm sạch, cắt đoạn, embedding, lưu | Hệ thống |
| F17 | Quản trị | Quản lý bài học song ngữ: tạo, sửa, xóa, xuất bản | Quản trị viên |
| F18 | Chung | Đổi ngôn ngữ Việt – Anh, đổi giao diện sáng – tối | Mọi người |

### 3.1.3. Yêu cầu phi chức năng

- Bám tài liệu: trợ lý chỉ trả lời từ các đoạn tài liệu đã truy xuất; khi không có đoạn liên quan thì từ chối mà không gọi LLM.
- Phản hồi nhanh về mặt cảm nhận: câu trả lời được gửi dần về trình duyệt bằng Server-Sent Events, danh sách đoạn nguồn hiện trước khi LLM bắt đầu trả lời.
- Song ngữ: toàn bộ giao diện và thông báo lỗi có bản tiếng Việt và tiếng Anh.
- Bảo mật: mật khẩu tối thiểu 8 ký tự, có chữ hoa, chữ thường, chữ số và ký tự đặc biệt, băm bằng bcrypt; mọi dữ liệu đầu vào của API được kiểm tra bằng lược đồ zod; API chỉ trả dữ liệu thuộc về người gọi (hội thoại của người khác trả 404).
- Đổi được nhà cung cấp: LLM và embedding chọn bằng biến môi trường; khi chọn nhà cung cấp thật mà thiếu khóa API, hệ thống báo lỗi rõ ràng thay vì âm thầm chuyển sang dữ liệu giả.
- Đo được: các tham số của pipeline RAG đều là biến môi trường có giá trị mặc định (Bảng 3.8), để mỗi lượt đo ghi lại được cấu hình chính xác.
- Chạy thử được khi không có khóa API: đặt nhà cung cấp là `mock` thì LLM trả câu trả lời mẫu và embedding dùng vector băm, đủ để kiểm tra giao diện.

## 3.2. Mô hình hóa chức năng

### 3.2.1. Biểu đồ use case

Hình 3.1 là biểu đồ use case tổng quát. Quản trị viên kế thừa mọi use case của người học.

[HÌNH: hinh/3-01-use-case.png] Hình 3.1. Biểu đồ use case tổng quát của SecLearn.

Bảng 3.3 và Bảng 3.4 đặc tả hai use case chính. Đặc tả các use case còn lại nằm ở Phụ lục E.

Bảng 3.3. Đặc tả use case "Hỏi trợ lý"

| Mục | Nội dung |
|---|---|
| Tác nhân | Khách, người học, quản trị viên |
| Mô tả | Người dùng gửi câu hỏi và nhận câu trả lời có trích dẫn, dựa trên tài liệu đã nạp |
| Tiền điều kiện | Nhà cung cấp LLM và embedding đã được cấu hình; với khách, còn lượt hỏi |
| Luồng chính | 1. Người dùng nhập câu hỏi và gửi. 2. Hệ thống lập kế hoạch truy vấn. 3. Hệ thống truy xuất và chọn các đoạn liên quan, gửi danh sách đoạn về trình duyệt. 4. LLM sinh câu trả lời, gửi dần từng phần. 5. Hệ thống kiểm tra trích dẫn và gửi kết quả kiểm tra. 6. LLM chấm mức liên quan của từng đoạn. 7. Với người đã đăng nhập, câu hỏi và câu trả lời được lưu |
| Luồng thay thế | 3a. Không có đoạn nào đạt ngưỡng: hệ thống trả câu từ chối cố định, không gọi LLM. 2a. Câu hỏi về chính hội thoại ("tóm tắt lại"): trả lời từ lịch sử, không truy xuất |
| Ngoại lệ | Khách hết lượt: trả lỗi `GUEST_LIMIT`, giao diện mời đăng nhập. Lỗi nhà cung cấp: trả lỗi song ngữ |
| Hậu điều kiện | Câu trả lời và danh sách đoạn nguồn hiển thị trên giao diện |

Bảng 3.4. Đặc tả use case "Tải tài liệu PDF"

| Mục | Nội dung |
|---|---|
| Tác nhân | Quản trị viên |
| Mô tả | Quản trị viên tải file PDF lên để hệ thống nạp vào chỉ mục |
| Tiền điều kiện | Đã đăng nhập với vai trò quản trị viên |
| Luồng chính | 1. Chọn tối đa 20 file PDF, nhập tiêu đề và mức hiển thị. 2. Hệ thống lưu file, tạo bản ghi tài liệu ở trạng thái `pending` và đưa vào hàng đợi. 3. Hàng đợi trích văn bản, làm sạch, cắt đoạn, tạo embedding và lưu. 4. Tài liệu chuyển sang `ready`; giao diện hiện thông báo |
| Luồng thay thế | 3a. Không lưu được đoạn nào: tài liệu chuyển sang `failed` kèm thông báo lỗi song ngữ. 3b. Một số đoạn lỗi khi tạo embedding: bỏ các đoạn đó, tài liệu vẫn `ready` kèm cảnh báo |
| Ngoại lệ | File không phải PDF: lỗi `ONLY_PDF` |
| Hậu điều kiện | Các đoạn của tài liệu tìm kiếm được khi người dùng hỏi |

### 3.2.2. Biểu đồ hoạt động

Hình 3.2 mô tả hoạt động hỏi trợ lý, gồm nhánh trả lời từ lịch sử và nhánh từ chối. Hình 3.3 mô tả hoạt động nạp tài liệu PDF, gồm nhánh thử lại từng đoạn khi tạo embedding lỗi.

[HÌNH: hinh/3-02-hoat-dong-hoi-tro-ly.png] Hình 3.2. Biểu đồ hoạt động "Hỏi trợ lý".

[HÌNH: hinh/3-03-hoat-dong-nap-tai-lieu.png] Hình 3.3. Biểu đồ hoạt động "Nạp tài liệu PDF".

### 3.2.3. Biểu đồ tuần tự

Hình 3.4 là biểu đồ tuần tự của luồng chính khi người đã đăng nhập hỏi trợ lý. Máy chủ nạp tối đa 200 tin nhắn gần nhất của hội thoại, lưu câu hỏi, rồi gọi hàm điều phối trả lời. Hàm này lập kế hoạch truy vấn, truy xuất các đoạn và gọi LLM. Trong lúc LLM sinh câu trả lời, máy chủ gửi về trình duyệt lần lượt các sự kiện SSE: `sources` (danh sách đoạn), nhiều sự kiện `token`, `sources` (kèm kết quả kiểm tra trích dẫn), `sources` (kèm điểm của LLM chấm) và `done`. Câu trả lời được lưu cùng danh sách đoạn cuối cùng.

[HÌNH: hinh/3-04-tuan-tu-hoi-tro-ly.png] Hình 3.4. Biểu đồ tuần tự "Người dùng hỏi trợ lý".

Hình 3.5 là biểu đồ tuần tự chuyển hội thoại của khách vào tài khoản. Khi khách đăng nhập, giao diện đọc bản nháp trong `localStorage`, gửi tối đa 40 tin nhắn lên máy chủ; máy chủ tạo hội thoại mới đánh dấu là chuyển từ khách, xóa bản ghi hạn mức của khách và cookie tương ứng.

[HÌNH: hinh/3-05-tuan-tu-chuyen-hoi-thoai.png] Hình 3.5. Biểu đồ tuần tự "Chuyển hội thoại khách vào tài khoản".

## 3.3. Thiết kế cơ sở dữ liệu

### 3.3.1. Mô hình thực thể – quan hệ

Cơ sở dữ liệu gồm 8 bảng, định nghĩa trong lược đồ Prisma (`prisma/schema.prisma`). Hình 3.6 là sơ đồ thực thể – quan hệ. Các bảng chia thành bốn nhóm:

- Người dùng: `User` và `GuestQuota` (hạn mức câu hỏi của khách, khóa theo một UUID lưu trong cookie, hết hạn sau 7 ngày).
- Hội thoại: `Conversation` và `Message`. Mỗi tin nhắn của trợ lý lưu kèm trường `sources` dạng JSON, chứa bản sao nội dung các đoạn đã dùng, điểm rerank, kết quả kiểm tra trích dẫn và điểm của LLM chấm. Vì lưu bản sao, câu trả lời cũ vẫn xem được nguồn khi tài liệu bị lập chỉ mục lại hoặc bị xóa.
- Tài liệu: `Document` và `DocumentChunk`. Mỗi đoạn có cột `embedding` kiểu `vector(768)` của pgvector và cột `searchText` kiểu `tsvector` cho tìm kiếm từ khóa.
- Bài học: `Lesson` và `LessonTranslation` (mỗi bài học có một bản dịch cho mỗi ngôn ngữ).

[HÌNH: hinh/3-06-erd.png] Hình 3.6. Sơ đồ thực thể – quan hệ.

Các khóa ngoại dùng `ON DELETE CASCADE`, nên xóa một tài liệu thì các đoạn của nó bị xóa theo, xóa một hội thoại thì các tin nhắn bị xóa theo.

### 3.3.2. Đặc tả bảng

Bảng 3.5 và Bảng 3.6 đặc tả hai bảng chính của phần RAG. Đặc tả đầy đủ cả 8 bảng nằm ở Phụ lục E.

Bảng 3.5. Đặc tả bảng `Document`

| Cột | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| id | text | Khóa chính | |
| title | text | Không rỗng | Tiêu đề hiển thị |
| filename | text | Không rỗng | Tên file đã làm sạch |
| mimeType | text | Không rỗng | `application/pdf`, hoặc `text/markdown` với dữ liệu mẫu |
| storagePath | text | Không rỗng | Đường dẫn file trong thư mục tải lên |
| markdown | text | | Văn bản đã trích và làm sạch |
| visibility | enum | Mặc định `public` | `public` hoặc `authenticated` |
| status | enum | Mặc định `pending` | `pending`, `ready` hoặc `failed` |
| errorMessage | text | | Lỗi song ngữ, hoặc cảnh báo số đoạn bị bỏ |
| uploadedById | text | Khóa ngoại tới `User` | Người tải lên |
| createdAt, updatedAt | timestamp | | |

Bảng 3.6. Đặc tả bảng `DocumentChunk`

| Cột | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| id | text | Khóa chính | |
| documentId | text | Khóa ngoại tới `Document`, xóa theo | |
| content | text | Không rỗng | Nội dung đoạn, khoảng 800 ký tự |
| chunkIndex | int | Không rỗng | Thứ tự đoạn trong tài liệu |
| embedding | vector(768) | | Vector của đoạn; số chiều phải khớp biến `EMBED_DIM` |
| searchText | tsvector | Chỉ mục GIN | `to_tsvector('english', content)` |
| tokenCount | int | | Ước lượng bằng số ký tự chia 4 |
| metadata | jsonb | | Dự phòng |
| createdAt | timestamp | | |

Số chiều của cột `embedding` đã đổi nhiều lần theo mô hình embedding (1536, 384, rồi 1536, và hiện tại 768). Mỗi lần đổi cần chạy migration rồi lập chỉ mục lại toàn bộ tài liệu, vì vector cũ không so được với vector mới.

## 3.4. Thiết kế kiến trúc hệ thống

### 3.4.1. Kiến trúc tổng thể

SecLearn là một ứng dụng Next.js nguyên khối: cùng một tiến trình Node.js phục vụ giao diện và API. Hình 3.7 là sơ đồ thành phần. Hệ thống gồm bốn khối:

- Trình duyệt: giao diện React; với khách, lịch sử hội thoại lưu trong `localStorage`.
- Máy chủ Next.js (cổng 3847): middleware chọn ngôn ngữ theo đường dẫn, Auth.js xác thực, các route handler của API, các module nghiệp vụ trong `src/lib` và một hàng đợi nạp tài liệu chạy trong bộ nhớ với số worker đặt bằng `INGEST_CONCURRENCY` (mặc định 2).
- PostgreSQL 16 có pgvector: lưu toàn bộ dữ liệu ứng dụng và vector.
- Dịch vụ bên ngoài: máy chủ embedding và rerank viết bằng Python (cổng 8008), và API của nhà cung cấp LLM.

[HÌNH: hinh/3-07-thanh-phan.png] Hình 3.7. Sơ đồ thành phần của SecLearn.

Máy chủ embedding cung cấp hai endpoint: `POST /` nhận một hoặc nhiều đoạn văn và trả vector đã chuẩn hóa, `POST /rerank` nhận các cặp (truy vấn, đoạn văn) và trả điểm liên quan từ 0 đến 1. Mô hình embedding và mô hình rerank được tách khỏi ứng dụng Next.js vì chúng chạy bằng Python và cần tải trọng số mô hình một lần khi khởi động.

Truy cập LLM và embedding đi qua hai module adapter (`llm.ts`, `embed.ts`). Phần còn lại của ứng dụng không phụ thuộc vào nhà cung cấp cụ thể. Khi máy chủ khởi động, nó ghi ra log cấu hình đang dùng (nhà cung cấp, mô hình, số chiều, rerank bật hay tắt), và đưa các tài liệu còn ở trạng thái `pending` vào lại hàng đợi.

### 3.4.2. Thiết kế API

API gồm 29 endpoint, chia thành bốn nhóm (Bảng 3.7). Mọi endpoint nhận và trả JSON, trừ endpoint tải file (multipart) và hai endpoint hỏi trợ lý (trả luồng SSE). Lỗi có định dạng chung gồm thông điệp, mã lỗi và, với lỗi cấu hình hoặc lỗi nhà cung cấp, thêm thông điệp tiếng Việt và tiếng Anh.

Bảng 3.7. Các nhóm API

| Nhóm | Đường dẫn | Số endpoint | Quyền |
|---|---|---|---|
| Xác thực | `/api/auth/*` | 4 | Công khai, người dùng |
| Trợ lý | `/api/chat/*` | 8 | Khách, người dùng (chủ hội thoại) |
| Bài học | `/api/lessons/*` | 2 | Công khai |
| Quản trị | `/api/admin/*` | 15 | Quản trị viên |

Luồng SSE của trợ lý gồm năm loại sự kiện. `sources` mang danh sách đoạn và được gửi ba lần: trước câu trả lời, sau khi kiểm tra trích dẫn và sau khi LLM chấm. `token` mang từng phần câu trả lời. `done` báo kết thúc, và `error` báo lỗi giữa chừng. Cách gửi danh sách đoạn nhiều lần cho phép giao diện hiện nguồn ngay, rồi bổ sung kết quả kiểm tra khi có, mà không phải chờ bước chậm nhất. Đặc tả chi tiết từng endpoint nằm ở Phụ lục E.

## 3.5. Thiết kế pipeline RAG

Hình 3.8 là sơ đồ tổng thể của pipeline RAG trong SecLearn. Pipeline gồm hai phần: phần lập chỉ mục chạy khi quản trị viên tải tài liệu lên (mục 3.5.1), và phần trả lời chạy cho mỗi câu hỏi, gồm lập kế hoạch truy vấn (3.5.2), truy xuất và rerank (3.5.3), sinh và kiểm tra câu trả lời (3.5.4).

[HÌNH: hinh/3-08-pipeline-rag.png] Hình 3.8. Pipeline RAG của SecLearn: lập chỉ mục (PDF → làm sạch → Markdown → cắt đoạn → embedding → pgvector, tsvector) và trả lời (kế hoạch truy vấn → tìm vector và từ khóa → rerank → chọn theo ngưỡng → sinh câu trả lời → kiểm tra trích dẫn → LLM chấm).

Thiết kế hiện tại là kết quả của nhiều vòng sửa lỗi. Trong quá trình phát triển, mỗi lỗi phát hiện khi dùng thử được ghi vào nhật ký lỗi của dự án (`docs/ERRORS.md`, 36 mục) cùng nguyên nhân và cách sửa. Các mục dưới đây nêu lý do của từng quyết định khi lý do đó đến từ một lỗi cụ thể.

### 3.5.1. Nạp tài liệu và lập chỉ mục

Khi quản trị viên tải file PDF lên, API lưu file, tạo bản ghi `Document` ở trạng thái `pending` và đưa mã tài liệu vào hàng đợi. Worker của hàng đợi xử lý tài liệu qua các bước sau.

Trích văn bản: thư viện pdf-parse đọc văn bản từ PDF.

Làm sạch: module `pdf-cleanup.ts` bỏ đầu trang và chân trang bằng cách tìm các dòng ở mép trang lặp lại trên ít nhất một tỉ lệ nhất định số trang. Các cheat sheet của OWASP được in từ website nên đầu mỗi file có menu liệt kê mọi cheat sheet và mục lục; riêng menu chiếm 743 trên 5.684 đoạn trước khi sửa. Tìm kiếm từ khóa xếp các đoạn menu này lên cao vì chúng nhắc tới mọi chủ đề, và LLM dựa vào chúng để khẳng định "tài liệu có một mục về…". Bước làm sạch bỏ phần menu, mục lục và chân trang của website, và đổi các dòng tiêu đề dạng "Monitoring¶" thành tiêu đề Markdown "## Monitoring". Với WSTG, tài liệu không có tiêu đề mục, nên bước làm sạch ghép tên test case, chữ "ID" và mã test case thành một tiêu đề dạng "## WSTG-INFO-01 <tên>", để mỗi đoạn biết nó thuộc test case nào.

Cắt đoạn: module `chunking.ts` cắt văn bản Markdown thành các đoạn tối đa `CHUNK_SIZE` = 800 ký tự. Đoạn kết thúc tại cuối câu; một tiêu đề mục bắt đầu đoạn mới khi đoạn hiện tại đã đầy ít nhất 25%; đoạn bắt đầu giữa một mục được gắn lại tiêu đề của mục đó ở đầu; hai đoạn liên tiếp trong cùng mục chia sẻ các câu trọn vẹn nằm trong `CHUNK_OVERLAP` = 80 ký tự cuối. Trước khi đổi sang cách cắt này, 93% đoạn kết thúc giữa câu khi cắt mỗi 800 ký tự tại khoảng trắng. Các tiêu đề chung chung như "Cons" được ghép thêm tên tiêu đề cụ thể gần nhất phía trên. Mỗi đoạn được ghi lại vị trí ký tự bắt đầu và kết thúc trên văn bản Markdown, và cách cắt có số phiên bản (hiện tại là `sentence-v2`); bộ đánh giá dựa vào hai thông tin này.

Tạo embedding và lưu: các đoạn được gửi tới máy chủ embedding theo lô 32 đoạn. Nếu cả lô lỗi, hệ thống thử lại từng đoạn và dừng sau 5 lỗi liên tiếp. Mỗi lô được ghi bằng một câu lệnh `INSERT` nhiều dòng, đồng thời tính cột `searchText`. Nếu lưu được ít nhất một đoạn, tài liệu chuyển sang `ready`, kèm cảnh báo nếu có đoạn bị bỏ; nếu không, tài liệu chuyển sang `failed`.

Sau lần lập chỉ mục lại toàn bộ với bộ làm sạch và bộ cắt mới, corpus gồm 134 tài liệu và 5.915 đoạn.

### 3.5.2. Lập kế hoạch truy vấn

Trước khi tìm kiếm, module `query.ts` gọi LLM một lần (nhiệt độ 0, thời gian chờ tối đa 8 giây) để lập kế hoạch truy vấn từ câu hỏi và lịch sử hội thoại. Kết quả là một số dòng văn bản theo định dạng cố định, được phân tích thành các thành phần sau:

- Ý định: `search` (cần tìm trong tài liệu), `conversation` (câu hỏi về chính hội thoại, như "tóm tắt lại" hay "câu đầu tiên mình hỏi là gì") hoặc `reformat` (chỉ yêu cầu trình bày lại câu trả lời trước, như "trả lời ngắn gọn hơn").
- Tối đa ba truy vấn tìm kiếm bằng tiếng Anh, mỗi truy vấn cho một chủ đề khi câu hỏi hỏi về nhiều chủ đề, viết sao cho tự đứng được mà không cần lịch sử.
- Dòng `COMPARE` và `ASPECTS` cho câu hỏi so sánh: các đối tượng được so (tối đa 4) và các khía cạnh (tối đa 3). Hệ thống dựng truy vấn cho từng ô (đối tượng, khía cạnh), tối đa 6 ô.
- Dòng `PASSAGE`: một đoạn văn giả định trả lời câu hỏi, viết bằng tiếng Anh, dùng cho HyDE.
- Dòng `ENTITY`: tên riêng được hỏi (mã CVE, tên giao thức, sản phẩm), viết theo cách tài liệu có thể viết.

Có hai lý do để luôn tìm thêm bằng tiếng Anh. Thứ nhất, corpus là tiếng Anh. Thứ hai, khi thử nghiệm, cross-encoder chấm một câu hỏi tiếng Việt với đoạn tiếng Anh thấp hơn khoảng 100 lần so với cùng câu hỏi viết bằng tiếng Anh, nên đoạn đúng thường bị loại ở bước ngưỡng. Câu hỏi được coi là không phải tiếng Anh khi có chữ cái ngoài bảng ASCII, hoặc khi chứa các từ và cặp từ tiếng Việt không dấu thường gặp như "la gi", "the nao", "phong chong"; trường hợp thứ hai được thêm vào vì câu hỏi gõ không dấu từng bị từ chối do không đoạn nào vượt ngưỡng. Việc dịch có thể tắt bằng `RAG_TRANSLATE_QUERY=off` để đo ảnh hưởng của nó.

Với câu hỏi nối tiếp, LLM lập kế hoạch nhận mọi câu hỏi trước đó (mỗi câu cắt còn 120 ký tự, các câu bị từ chối được đánh dấu) và 300 ký tự đầu của câu trả lời gần nhất. Các câu hỏi được đánh số giống nhau ở bước lập kế hoạch và ở lời nhắc gửi cho LLM trả lời, để "câu thứ hai" được hiểu là cùng một câu ở cả hai bước; trước khi sửa, hai bước đếm khác nhau khi có câu bị từ chối.

### 3.5.3. Truy xuất lai và rerank

Với ý định `search`, module `rag.ts` thực hiện các bước sau.

Tìm ứng viên. Các truy vấn (câu hỏi gốc, các truy vấn tiếng Anh và đoạn HyDE) được gửi tới máy chủ embedding trong một yêu cầu. Với mỗi truy vấn, hệ thống lấy `RAG_CANDIDATES` = 20 đoạn gần nhất theo khoảng cách cosine của pgvector, chỉ trong các tài liệu ở trạng thái `ready` và có mức hiển thị người hỏi được phép xem. Song song, hệ thống tìm từ khóa bằng `tsvector`, lấy 10 đoạn có điểm `ts_rank_cd` cao nhất cho các từ của truy vấn tiếng Anh. Hệ thống cũng đưa vào các đoạn đã được trích trong những câu trả lời trước của hội thoại, vì câu hỏi nối tiếp như "hai lỗ hổng này" có thể cần lại ý của các câu trả lời cũ. Các đoạn còn sót lại của menu website (đoạn nhắc tên từ 10 cheat sheet trở lên) bị loại.

Rerank. Mọi cặp (truy vấn, ứng viên) được gửi tới cross-encoder trong một yêu cầu. Điểm liên quan của một đoạn là điểm cao nhất của nó trên các truy vấn của câu hỏi gốc và bản dịch.

Chọn theo ngưỡng. Hàm chọn áp các quy tắc sau theo thứ tự:

1. Khi có truy vấn tiếng Anh, loại các đoạn có điểm dưới ngưỡng tuyệt đối `RAG_MIN_RELEVANCE_EN` = 0,05 hoặc dưới `RAG_RELATIVE_MIN` = 10% điểm của đoạn tốt nhất. Thử nghiệm cho thấy các đoạn dưới hai ngưỡng này, khi được trích, có tỉ lệ trích dẫn yếu cao gấp 2 đến 4 lần.
2. Khi chỉ có truy vấn tiếng Việt (bước dịch thất bại), dùng ngưỡng nới `RAG_MIN_RELEVANCE` = 0,01, và nếu có ít nhất một đoạn đạt ngưỡng thì giữ ít nhất `RAG_MIN_KEEP` = 2 đoạn, vì điểm xuyên ngôn ngữ của đoạn đúng thường chỉ khoảng 0,01 đến 0,05.
3. Nếu không đoạn nào đạt ngưỡng tuyệt đối, câu hỏi được coi là ngoài phạm vi tài liệu và không đoạn nào được giữ.
4. Giữ tối đa `RAG_TOP_K` = 5 đoạn. Với câu hỏi nhiều chủ đề, đoạn tốt nhất của mỗi chủ đề được giữ nếu đạt 0,1, kể cả khi nằm ngoài top 5, để một chủ đề không chiếm hết chỗ của các chủ đề khác. Tối đa 2 đoạn của các câu trả lời trước được giữ nếu còn đạt 0,1.
5. Với HyDE, đoạn được xếp hạng theo điểm cao hơn giữa điểm với câu hỏi và điểm với đoạn giả định, nhưng mức liên quan vẫn quyết định bằng điểm với câu hỏi: đoạn chỉ được nới ngưỡng tương đối khi điểm với đoạn giả định từ 0,5 trở lên và điểm với câu hỏi từ 0,05 trở lên. Khi thử chỉ dùng điểm với đoạn giả định, các câu hỏi ngoài tài liệu vẫn giữ lại 3 đến 5 đoạn không liên quan.
6. Với câu hỏi so sánh, mỗi ô (đối tượng, khía cạnh) được dành trước đoạn mà nó chấm cao nhất và chưa ô nào lấy, hai đoạn mỗi ô khi có tối đa 3 ô, một đoạn mỗi ô khi nhiều hơn; tổng số đoạn tối đa là 8. Trước khi có quy tắc này, câu hỏi so sánh 6 ô chỉ có 5 chỗ, và nhiều ô cùng lấy một đoạn định nghĩa.

Các ngưỡng đều là biến môi trường, để đo và chỉnh được trên tập dev của bộ đánh giá. Bảng 3.8 tóm tắt các tham số chính và giá trị mặc định.

Bảng 3.8. Tham số chính của pipeline RAG

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `CHUNK_SIZE` | 800 | Số ký tự tối đa mỗi đoạn |
| `CHUNK_OVERLAP` | 80 | Số ký tự chồng lấp giữa hai đoạn liên tiếp |
| `RAG_CANDIDATES` | 20 | Số ứng viên vector mỗi truy vấn |
| `RAG_TOP_K` | 5 | Số đoạn đưa cho LLM trả lời |
| `RAG_MIN_RELEVANCE_EN` | 0,05 | Ngưỡng tuyệt đối khi có truy vấn tiếng Anh |
| `RAG_MIN_RELEVANCE` | 0,01 | Ngưỡng tuyệt đối khi chỉ có truy vấn tiếng Việt |
| `RAG_RELATIVE_MIN` | 0,1 | Tỉ lệ tối thiểu so với điểm đoạn tốt nhất |
| `RAG_MIN_KEEP` | 2 | Số đoạn giữ tối thiểu khi có đoạn đạt ngưỡng (chỉ truy vấn tiếng Việt) |
| `RAG_TRANSLATE_QUERY` | `on` | Tìm thêm bằng bản dịch tiếng Anh |
| `RAG_JUDGE` | `on` | Cho LLM chấm các đoạn sau khi trả lời |

### 3.5.4. Sinh câu trả lời và kiểm soát chất lượng

Nếu không còn đoạn nào sau bước chọn, hệ thống trả một câu từ chối cố định theo ngôn ngữ của người dùng, nói rằng tài liệu SecLearn không có nội dung liên quan và gợi ý một số chủ đề tài liệu có. Câu từ chối này được gửi dưới dạng luồng token như một câu trả lời bình thường, nhưng không gọi LLM, nên câu trả lời không thể đến từ kiến thức riêng của mô hình.

Nếu có đoạn, các đoạn được đánh số từ 1 và ghép vào lời nhắc hệ thống, tổng độ dài tối đa 6.000 ký tự (với câu hỏi so sánh, mỗi đoạn được dành 850 ký tự). Lời nhắc yêu cầu LLM chỉ trả lời từ các đoạn này và gắn số `[n]` sau mỗi ý. Lịch sử hội thoại gửi kèm được cắt còn 12.000 ký tự gần nhất, bỏ các lượt bị từ chối và bỏ các số `[n]` cũ, vì chúng trỏ tới các đoạn của lượt trước; các câu hỏi cũ hơn phần được gửi chỉ còn lại dưới dạng danh sách câu hỏi đánh số. Với câu hỏi nối tiếp, quy tắc trích dẫn được nhắc lại ngay trước câu hỏi: trong hội thoại dài, LLM từng bắt chước các câu trả lời cũ không có số `[n]` và ngừng trích dẫn.

Sau khi LLM trả lời xong, hệ thống chạy hai bước kiểm tra:

1. Kiểm tra trích dẫn (`verify.ts`): mỗi mệnh đề có trích dẫn được ghép với đoạn nó trích và với từng câu của đoạn đó, rồi gửi tới cross-encoder trong một yêu cầu. Điểm của cặp (mệnh đề, đoạn) cho biết đoạn có hỗ trợ mệnh đề không; câu có điểm cao nhất trong đoạn được lưu làm bằng chứng, và giao diện tô sáng câu đó khi người dùng di chuột lên mệnh đề. Bước này không tốn token của LLM.
2. LLM chấm (`judge.ts`): LLM chấm mỗi đoạn trên thang 0 đến 100 theo hai tiêu chí, mức liên quan với câu hỏi và mức đóng góp vào câu trả lời, kèm lý do ngắn. Bước này có thời gian chờ tối đa 30 giây và có thể tắt bằng `RAG_JUDGE=off`.

Ngoài hai bước trên, giao diện đánh dấu các câu trong câu trả lời có nội dung khẳng định nhưng không có số `[n]` nào, trừ tiêu đề, câu dẫn, đoạn mã, bảng và câu nói rằng tài liệu không đề cập, để người đọc biết câu nào không có căn cứ trong tài liệu.

Kết quả của hai bước kiểm tra được gửi về trình duyệt ngay khi có, qua sự kiện `sources`, và lưu cùng câu trả lời. Nếu một bước lỗi, câu trả lời vẫn giữ nguyên vì đã được gửi; panel nguồn chỉ thiếu phần kết quả của bước đó.

## 3.6. Triển khai hệ thống

### 3.6.1. Môi trường và cấu hình

Hệ thống được đóng gói bằng Docker Compose và gồm hai dịch vụ. Dịch vụ thứ nhất là ứng dụng Next.js, chạy ở cổng 3847. Dịch vụ thứ hai là PostgreSQL 16 có pgvector, chạy ở cổng 5432. Compose khai báo thêm các volume cho file tải lên và bộ nhớ đệm mô hình. Máy chủ embedding và rerank chạy riêng bằng lệnh `python scripts/embed_server.py` ở cổng 8008, và dùng GPU nếu máy có.

Cấu hình đặt trong file `.env`. Khi khởi động, ứng dụng kiểm tra file này bằng một lược đồ zod (`src/lib/env.ts`); nếu có giá trị sai kiểu, ứng dụng dừng ngay và đưa ra thông báo rõ ràng. Các khóa API chỉ nằm trong `.env` và không được đưa vào Git; file `.env.example` chỉ chứa giá trị giữ chỗ. Khi xây dựng corpus và bộ đánh giá, em dùng LLM DeepSeek `deepseek-flash`, mô hình embedding BKAI 768 chiều chạy qua máy chủ cục bộ, mô hình rerank `bge-reranker-v2-m3` và các tham số RAG trong Bảng 3.8.

Việc triển khai gồm bốn bước:

1. Sao chép `.env.example` thành `.env` rồi điền các khóa API.
2. Tạo lược đồ cơ sở dữ liệu bằng `prisma db push` (hoặc `prisma migrate deploy`). Sau đó chạy `prisma/seed.ts` để tạo tài khoản quản trị, lấy từ hai biến `ADMIN_EMAIL` và `ADMIN_PASSWORD`, cùng các bài học mẫu.
3. Khởi động máy chủ embedding trước, rồi khởi động ứng dụng bằng `docker compose up --build`. Khi phát triển thì dùng `npm run dev`.
4. Đăng nhập bằng tài khoản quản trị và tải các file PDF của corpus lên. Với các tài liệu đã có, có thể chạy `npm run db:reindex` để lập chỉ mục lại toàn bộ.

Khi lập chỉ mục lại, máy chủ embedding phải đang chạy. Lý do là bước nạp xóa các đoạn cũ trước rồi mới tạo embedding, nên nếu máy chủ embedding tắt, tài liệu sẽ chuyển sang `failed` và không còn đoạn nào. Em đã gặp sự cố này một lần trong quá trình làm khóa luận và khắc phục bằng cách lập chỉ mục lại.

### 3.6.2. Kiểm thử phần mềm

Ứng dụng có 8 file kiểm thử đơn vị, chạy bằng `npm test` với trình chạy test có sẵn của Node.js qua tsx. Các file này tập trung vào những module có logic dễ sai.

Ở bước nạp tài liệu, `chunking.test.ts` kiểm tra việc bỏ menu và chân trang website, thêm tiêu đề cho test case WSTG, cắt đoạn tại cuối câu, gắn tiêu đề mục, chồng lấp bằng câu trọn vẹn và vị trí ký tự của đoạn.

Phần truy xuất và trả lời có bốn file. `retrieval.test.ts` kiểm tra các quy tắc chọn đoạn theo ngưỡng ở mục 3.5.3. `grounding.test.ts` kiểm tra lời nhắc (cấm dùng kiến thức ngoài, yêu cầu trích dẫn), câu từ chối, cách đánh số câu hỏi và việc nhận diện câu trả lời từ chối. `remark-citations.test.ts` kiểm tra việc phát hiện và đánh dấu câu khẳng định không có trích dẫn. `judge.test.ts` kiểm tra việc gắn điểm của LLM chấm vào từng đoạn, và việc bỏ qua bước này khi bước chấm bị tắt.

Hai file kiểm tra quyền truy cập. `sources.test.ts` kiểm tra rằng chỉ file nằm trong thư mục tải lên mới được mở, và kiểm tra tên file tiếng Việt khi trả về trình duyệt. `permissions.test.ts` kiểm tra bảng phân quyền và các quy tắc về quản trị viên cuối cùng. File còn lại, `snapshot.test.ts`, kiểm tra việc xuất bản đóng băng của corpus cho bộ đánh giá.

Ngoài kiểm thử đơn vị, dự án còn kiểm tra kiểu bằng `npm run typecheck`, kiểm tra mã bằng `npm run lint` và có hai script kiểm tra nhanh. Script `smoke-retrieval.ts` chạy bộ 40 câu hỏi mẫu qua đúng hàm truy xuất của ứng dụng rồi báo tỉ lệ tìm được đoạn bằng chứng. Em dùng script này để so kết quả trước và sau lần lập chỉ mục lại ở mục 3.5.1.

Cuối cùng, script `export-snapshot.ts` xuất bản đóng băng của corpus (snapshot), gồm văn bản Markdown của từng tài liệu, mã băm sha256 và danh sách đoạn kèm vị trí ký tự. Snapshot là ranh giới duy nhất giữa ứng dụng và bộ đánh giá: bộ đánh giá ở mục 3.7 và 3.8 chỉ đọc snapshot, không đọc mã nguồn hay cơ sở dữ liệu của ứng dụng.
