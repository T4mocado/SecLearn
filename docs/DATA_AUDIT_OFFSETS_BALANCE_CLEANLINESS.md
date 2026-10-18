# Kiểm tra dữ liệu: offset chunk, độ cân bằng, độ sạch

> Ngày kiểm: 2026-10-18 (khoảng 22:40 giờ máy), nhánh `fix/chat-context`, có thay đổi chưa commit ở `src/lib/chunking.ts`, `ingest.ts`, `pdf-cleanup.ts`.
> Cách làm: đọc mã và tài liệu; đọc DB Postgres local (`localhost:5432/seclearn`) **chỉ bằng truy vấn đọc** (Prisma `findMany` / `count` cho
> `Document`, `DocumentChunk`, `LessonTranslation`, `Quiz`, `Question`), đổ ra file JSON trong scratchpad rồi tính bằng script Node viết riêng
> (không nằm trong repo). Không sửa mã, không sửa dữ liệu.
>
> Ký hiệu: **[Mã]** = có trong code; **[Dữ liệu]** = đã đo trên dữ liệu thật; **[Kế hoạch]** = mới ghi trong tài liệu / ticket.

## TL;DR

| Câu hỏi | Trả lời | Một dòng |
|---|---|---|
| 1. Chunk đã có offset chưa? | **Một phần** | Mã đã có (`chunkMarkdownWithSpans`, ingest ghi `metadata`). Trong DB: **5.859 / 5.915 chunk (99,1%)** ở **132 / 134 tài liệu** có `{char_start, char_end, md_sha256, chunker_version}` và **cả 5.859 span đều khớp** nội dung chunk. Còn **2 tài liệu chưa reindex** (`Deserialization_Cheat_Sheet` 31 chunk, `File_Upload_Cheat_Sheet` 25 chunk) nên **chưa xuất được snapshot** (`Dataset/corpus/` chưa tồn tại). Bộ smoke 40 câu **không có offset** nào. |
| 2. Dữ liệu đã cân bằng chưa? | **Chưa** | Corpus lệch mạnh: WSTG = **24,8%** chunk (1.468 / 5.915), Gini = 0,486. Đây là đặc điểm của corpus, không sửa ở corpus; cách cân (phương án R, sàn 100 câu / cụm) mới **ở mức kế hoạch** (ADR 0003, ticket 04 chưa làm). Bộ đánh giá thật (gold ~1.475 câu) **chưa có**. Bộ smoke 40 câu cân theo mức (L1-L5 mỗi mức 6) nhưng lệch chủ đề: 19 / 134 tài liệu, 0 câu WSTG, dồn vào xác thực / phiên. |
| 3. Dữ liệu đã sạch chưa? | **Phần lớn sạch, còn vài điểm** | Không còn `## Sheet`, `¶`, "Skip to content", U+FFFD, mojibake, ký tự điều khiển, NBSP; 0 chunk trùng hoàn toàn, 0 cặp gần trùng (Jaccard ≥ 0,8). Còn: phần đầu / Reporting / phụ lục WSTG chưa bị đánh dấu loại (WSTG-APIT-01 nuốt 54 chunk Reporting + phụ lục), ~22 số trang và dòng "Follow @owasp_wstg" lọt trong WSTG, 133 chunk chỉ là danh sách "References", 61 chunk thân < 100 ký tự. Bộ smoke: tiếng Việt chuẩn NFC, không lỗi dấu; 81 / 82 quote khớp nguyên văn, 1 quote lệch dấu gạch (`--` thay cho `—`). |

---

## 1. Offset của chunk

### 1.1 Trong mã [Mã]

- **Bộ cắt trả về span.** `src/lib/chunking.ts:127` định nghĩa `ChunkSpan = { text, charStart, charEnd }`; `chunkMarkdownWithSpans`
  (`chunking.ts:147-214`) tính offset cho từng chunk. Span chạy từ câu đầu (kể cả câu chồng lấn) tới câu cuối của **phần thân**, không tính tiêu đề
  chèn lại (`chunking.ts:156-165`). Offset được ánh xạ ngược về chuỗi gốc khi có CRLF hoặc khoảng trắng đầu (`originalIndex`, `chunking.ts:133-144`).
  `CHUNKER_VERSION = "sentence-v2"` (`chunking.ts:121`). `chunkMarkdown` cũ vẫn giữ chữ ký (`chunking.ts:116-118`).
- **Ingest ghi offset vào DB.** `src/lib/ingest.ts:20` khai báo `ChunkMetadata = { char_start, char_end, md_sha256, chunker_version }`;
  `ingest.ts:116-122` tính `md_sha256` trên đúng chuỗi `markdown`, rồi giữ text và offset theo cặp qua bước sanitize và lọc chunk rỗng;
  `insertChunks` ghi cột `metadata` (`ingest.ts:38`, `:43`). Chuỗi `markdown` này chính là chuỗi được lưu vào `Document.markdown` ở cuối hàm,
  nên offset trỏ đúng vào văn bản lưu trong DB.
- **Schema không đổi.** `prisma/schema.prisma:119-134`: `DocumentChunk.metadata Json?` có sẵn; không có cột offset riêng.
- **Test.** `src/lib/chunking.test.ts` (diff chưa commit) thêm `assertSpans`: với mọi chunk, markdown tại `[charStart, charEnd)` bằng thân chunk
  sau khi bỏ dòng tiêu đề và gộp khoảng trắng (hàm `comparable`); có ca chồng lấn, cắt cứng khối dài, WSTG, CRLF.
- **Snapshot.** `src/lib/snapshot.ts:97-185` (`buildSnapshot`) từ chối nếu chunk thiếu offset (`:124-125`), lệch `md_sha256` (`:126`), khác phiên bản
  bộ cắt (`:127`) hoặc offset ra ngoài markdown (`:128-130`); xuất `chunks.<version>.jsonl` có `char_start`, `char_end`, `text` (`:131-142`).
  `scripts/export-snapshot.ts:38-39` ghi vào `Dataset/corpus/<id>/` và không ghi đè.
- **Phía bộ đánh giá.** `Dataset/src/seclearn_eval/` có `schema.py`, `spans.py`, `reanchor.py`, `check.py` (ticket 03, resolved).

### 1.2 Trong dữ liệu [Dữ liệu]

Đọc toàn bộ `DocumentChunk` (5.915 dòng) và `Document` (134 dòng):

| Đại lượng | Giá trị |
|---|---|
| Tài liệu, trạng thái | 134, tất cả `ready`, không có `errorMessage`, tất cả là PDF |
| Chunk có `metadata` đủ 4 khoá | **5.859 / 5.915 (99,05%)**, đều `chunker_version = "sentence-v2"` |
| Tài liệu có offset | **132 / 134** |
| `md_sha256` khớp sha256 của `Document.markdown` | 5.859 / 5.859 |
| `markdown[char_start:char_end]` khớp nội dung chunk (cùng phép so `comparable` như test) | **5.859 / 5.859** |
| Khoảng trống trong `chunkIndex` | 0 tài liệu |
| Độ phủ markdown bởi các span | 96,7% ký tự (phần còn lại là tiêu đề, mục lục…) |

Ghi chú về phép so: nếu so thô (chỉ gộp khoảng trắng) thì 87 chunk "lệch", vì bộ cắt đổi tên tiêu đề chung chung bên trong chunk
(ví dụ trong markdown là `## Examples`, trong chunk là `## Permissions — Examples`, `Nodejs_Security_Cheat_Sheet#36`). Đây là hành vi có chủ đích
(`chunking.ts:15-21`, `:190-196`), test cũng bỏ dòng tiêu đề khi so. Khi làm gold span, cần nhớ: **quote phải lấy từ markdown, không lấy từ text của chunk**.

**Hai tài liệu chưa có offset** (chunk `metadata = null`):

| Tài liệu | Chunk | `Document.updatedAt` |
|---|---|---|
| `Deserialization_Cheat_Sheet` | 31 | 2026-10-16T18:04:02Z |
| `File_Upload_Cheat_Sheet` | 25 | 2026-10-16T18:04:04Z |

132 tài liệu còn lại có `updatedAt` 2026-10-18 15:39-15:40 UTC, tức đã chạy reindex bằng mã mới; hai tài liệu này bị sót (lần reindex dừng giữa
chừng hoặc bị bỏ qua; log không có trong repo nên không xác định được nguyên nhân). Hệ quả:

- `npm run db:snapshot` sẽ vẫn **từ chối** với 56 lỗi "no offsets in metadata (reindex first)" (`snapshot.ts:125`).
- `Dataset/corpus/` **chưa tồn tại** (`ls Dataset/corpus` → không có).
- `File_Upload_Cheat_Sheet` là tài liệu gold của một câu smoke (bộ B, chủ đề upload).

So với ghi nhận cũ: `docs/EVAL_DATASET_BALANCE_INFRA.md:82-85` ghi "0 / 5.804 chunk có metadata"; ticket 01 (`Dataset/.scratch/eval-set-v1/issues/01-…md:27`)
ghi lệnh xuất "từ chối … 5800 problem(s)". Nay đã reindex gần hết, nhưng ticket 02 (`02-reindex-smoke-xuat-snapshot-that.md:9`) vẫn
`Status: ready-for-human`, mọi ô chưa đánh dấu (smoke trước / sau chưa lưu, snapshot chưa xuất).

**Fixture** `Dataset/tests/fixtures/snapshot-mini/`: 3 tài liệu, 11 chunk, 11 / 11 span khớp (cùng phép so) [Dữ liệu].

### 1.3 Bộ smoke 40 câu không có offset [Dữ liệu]

- `data/eval/set-a.jsonl`, `set-b.jsonl`: 82 mục `gold_evidence`, khoá chỉ gồm `document`, `quote`, `grade`, `cell`; **0 / 82 có `char_start`**.
  README nói rõ điều này (`data/eval/README.md:14`: "Không có `char_start`/`char_end`/`doc_sha256` vì trích từ `pdftotext`").
- `gold_evidence.document` là tên file PDF (`Session_Management_Cheat_Sheet.pdf`), không phải `doc_key` của snapshot.
- Việc chuyển bộ smoke sang gold span trên snapshot là ticket 11 (`11-eval-card-phien-ban-smoke.md:14`), chưa làm [Kế hoạch].
- `data/` nằm trong `.gitignore` (`.gitignore:38`, `git check-ignore` xác nhận), nên bộ smoke **không được git quản lý**.

---

## 2. Độ cân bằng

### 2.1 Corpus (chunk) [Dữ liệu]

| Đại lượng | Ghi nhận cũ (`EVAL_DATASET_BALANCE_INFRA.md:94-104`) | Hiện tại (DB, sau reindex) |
|---|---|---|
| Tài liệu / chunk | 138 / 5.804 | **134 / 5.915** |
| Chunk / tài liệu: min, p25, trung vị, p75, p90, max | 1, 16, 29, 41, 59, 1.353 | **7, 18, 29, 42, 59, 1.468** |
| WSTG | 23,3% | **24,8%** (1.468) |
| 5 tài liệu lớn nhất | 30,4% | **31,7%** (WSTG 1.468, Kubernetes 116, Secrets Management 105, Session Management 94, XSS Filter Evasion 94) |
| Gini | 0,49 | **0,486** |
| Ngoài WSTG: trung vị / max | — | 29 / 116 |

Nhỏ nhất: `HTTP_Strict_Transport_Security`, `XPath_Injection_Prevention`, `Prototype_Pollution_Prevention` (7 chunk mỗi tài liệu). 4 file stub
và NIST đã ra khỏi DB (không còn tài liệu ≤ 3 chunk; ADR 0001 `docs/adr/0001-corpus-chi-owasp.md:3` ghi 134 tài liệu, khớp).

WSTG tăng từ 1.353 lên 1.468 chunk sau reindex, vì `addWstgHeadings` chèn 97 tiêu đề `##` (`pdf-cleanup.ts:74-95`) làm chunk bị cắt tại ranh giới test case.

**WSTG theo test case** (gán chunk vào tiêu đề `## WSTG-XXXX-NN` gần nhất đứng trước `char_start`):

- 97 tiêu đề, 97 mã khác nhau, không trùng (ghi nhận cũ: 95 test case có nội dung, `EVAL_DATASET_BALANCE_INFRA.md:108-115`).
- 177 chunk đứng trước test case đầu tiên (mục lục + chương 1-3).
- Mỗi test case: min 1, trung vị 10, max **173** (`WSTG-INPV-05` SQL Injection).
- Theo nhóm: INPV 380, CONF 137, CLNT 134, INFO 129, SESS 113, ATHN 98, APIT 81, BUSL 74, CRYP 53, ATHZ 52, IDNT 31, ERRH 9.
- `WSTG-APIT-01` có 81 chunk, trong đó **54 chunk là Reporting + phụ lục A-F** (bắt đầu từ ký tự ~890.000 trong markdown 925.191 ký tự), vì sau
  test case cuối không có tiêu đề nào. Ghi nhận cũ chỉ tính APIT 26 chunk. Nếu lấy mẫu theo test case mà không cắt vùng này, APIT sẽ bị phóng to
  và câu hỏi có thể rơi vào danh sách payload (phụ lục C, D).

**Kết luận:** corpus không cân bằng, và theo thiết kế **không cân ở corpus** (hệ thật chạy trên toàn corpus); việc cân nằm ở phía câu hỏi
(`EVAL_DATASET_BALANCE_INFRA.md:165-168`).

### 2.2 Cân bằng phía bộ đánh giá: mới là kế hoạch [Kế hoạch]

Mục tiêu đã ghi:

- 10 cụm chủ đề, ánh xạ nhóm WSTG theo spec (`Dataset/.scratch/eval-set-v1/spec.md:147`).
- Phương án R: cụm ∝ √(chunk cụm), trong cụm ∝ √(chunk tài liệu), WSTG của cụm là một tài liệu, mục tiêu WSTG ≈ 10% (`docs/adr/0003-han-muc-can-va-so-chinh-macro.md:6`,
  `spec.md:57`, `EVAL_DATASET_BALANCE_INFRA.md:332`).
- Sàn 100 câu trả lời được / cụm trên test; 6 mức L1-L5, L7 khoảng 183 câu / mức; 200 câu L6; sai lệch ≤ 5% (`spec.md:58-59`, `:148`).
- `check` có kiểm "phân bố lệch kế hoạch > 5%" (`Dataset/src/seclearn_eval/check.py:24`, `:85`).

Hiện trạng: **không có** `clusters.json`, file kế hoạch, ứng viên hay câu gold nào trong `Dataset/` (ngoài fixture test). Ticket 04 (phân cụm + hạn mức)
`Status: ready-for-agent`, chưa đánh dấu ô nào (`04-eval-phan-cum-don-vi-ke-hoach-han-muc.md:9-14`); bị chặn bởi 02 cho phần chạy thật. Bảng cỡ cụm ở
`EVAL_DATASET_BALANCE_INFRA.md:307-320` được tính **trên số trước reindex** (5.786 chunk) và theo 11 cụm, trong khi spec chốt 10 cụm (miền đặc thù gộp vào
kiến trúc, quy trình); cần tính lại trên snapshot thật.

### 2.3 Bộ smoke 40 câu [Dữ liệu]

| Chiều | Phân bố | Nhận xét |
|---|---|---|
| Split | dev 20 / test 20 | Cân |
| Mức | L1-L5 mỗi mức 6 (3 + 3), L6 8 (4 + 4), L7 2 (1 + 1) | Cân giữa hai bộ, đúng như README (`data/eval/README.md:3-4`) |
| Loại | lookup 6, paraphrase 6, set 6, comparison 6, scenario 6, unanswerable 6, false_premise 2, conversation 2 | |
| Trả lời được | 32 có / 8 không (out_of_domain 2, not_in_corpus 4, false_premise 2) | |
| Ngôn ngữ / kiểu câu | vi 40; có dấu 36, không dấu 2 (`a04`, `b04`), trộn Việt-Anh 2 | Biến thể không dấu rất ít |
| Nguồn / duyệt | manual 40; `review.status = draft` 40 | Chưa ai duyệt lần hai |
| Tài liệu gold | **19 / 134** tài liệu; 0 câu WSTG | Lệch chủ đề |

Theo số câu có gold ở tài liệu: Session Management 5, Password Storage 4, JWT 3, CSRF 3, Clickjacking 3, Docker 3, MFA 2, OAuth2 2, SQLi 2,
Forgot Password 2, các tài liệu khác 1. **15 / 32** câu trả lời được có gold ở nhóm tài liệu xác thực / phiên (Session, Password Storage, JWT, MFA,
Forgot Password, Credential Stuffing, OAuth2; phân nhóm theo tên tài liệu, do tôi tự gán); các cụm AI, framework, API,
chuỗi cung ứng / hạ tầng (trừ Docker) và toàn bộ WSTG không có câu nào. Bộ này đủ cho smoke test, không dùng để báo cáo theo cụm.

### 2.4 Dữ liệu khác trong DB

`Quiz` 5, `Question` 25, `LessonTranslation` 4. Không phải dữ liệu đánh giá RAG, không phân tích thêm.

---

## 3. Độ sạch

### 3.1 Markdown và chunk của corpus [Dữ liệu]

Quét regex trên 134 `Document.markdown` và 5.915 `DocumentChunk.content`:

| Kiểm tra | Tài liệu | Chunk | Nhận xét |
|---|---|---|---|
| `## Sheet` | 0 | 0 | Đã sửa (`pdf-cleanup.ts:64-67`); trước đó 10 tài liệu (`EVAL_DATASET_BALANCE_INFRA.md:83`) |
| "This content has been removed" | 0 | 0 | Đã bỏ (`pdf-cleanup.ts:75`, `:88-90`) |
| "Skip to content", dòng "OWASP Cheat Sheet Series", `¶` | 0 | 0 | |
| U+FFFD, mojibake (`Ã`, `â€`), ký tự điều khiển, NBSP, zero-width, soft hyphen, ligature `ﬁ` | 0 | 0 | |
| Chunk trùng hoàn toàn (sau gộp khoảng trắng, có / không tiêu đề) | — | 0 nhóm | |
| Cặp gần trùng, Jaccard shingle 5 từ ≥ 0,8 | — | 0 cặp | |
| Cặp khác tài liệu, Jaccard ≥ 0,5 hoặc chứa ≥ 80% | — | 14 cặp | Trùng nội dung thật giữa các cheat sheet, không phải lỗi trích: `Injection_Prevention` ↔ `wstg-v4.2` 6 cặp (ví dụ `wstg-v4.2#835` ↔ `Injection_Prevention_Cheat_Sheet#10`, Jaccard 0,67), `Injection_Prevention` ↔ `OS_Command_Injection_Defense` 2, `DotNet` ↔ `Java` 2. Cần lưu ý khi làm qrels: chunk ở tài liệu khác có thể cũng đúng |
| Thẻ HTML / entity HTML | 24 / 7 | 192 / 21 | Hầu hết là **nội dung thật** (ví dụ mã XSS, `<script>`, `&lt;` trong `Symfony_Cheat_Sheet`), không phải rác |
| Xuống dòng sau dấu gạch nối `[a-z]-\n[a-z]` | 74 | 182 | 191 chỗ; mẫu đã xem là từ ghép thật bị ngắt dòng (`sign-\nup` ở `Authentication_Cheat_Sheet` @2099, `clock-\nskew` ở `AI_Agent_Security_Cheat_Sheet` @15856). Chưa thấy từ bị cắt đôi, nhưng chưa kiểm hết |
| Dòng chỉ có số | 2 | 23 | `wstg-v4.2`: 22 dòng là **số trang lọt lại** (ví dụ `"…April 19, 2013\n\n7\nOpen Web Application…"`, `"…\n\n40\nFigure 3-1…"`); `C-Based_Toolchain_Hardening`: số dòng trong mã, hợp lệ |
| Site chrome WSTG | 1 | — | `"Follow Us\n\n10\nFollow @owasp_wstg\tFollow @owasp_wstg \t831\t831"` trong `wstg-v4.2` |
| "Table of Contents" | 2 | 3 | `wstg-v4.2#0` (mục lục), `Security_Terminology_Cheat_Sheet#1` (mục lục trong bài) |

**Kích thước chunk:** độ dài min 66, p1 147, p5 229, trung vị 641, max 872 (62 chunk > 800 do có tiêu đề chèn lại; `CHUNK_SIZE=800`,
`CHUNK_OVERLAP=80` trong `.env`). **61 chunk có thân < 100 ký tự**, 5 chunk < 50 ký tự; phần lớn là đuôi "References"
(ví dụ `Zero_Trust_Architecture_Cheat_Sheet#58`, `XSS_Filter_Evasion_Cheat_Sheet#93`, `Abuse_Case_Cheat_Sheet#45`) hoặc mảnh thừa
(`wstg-v4.2#490`, `NodeJS_Docker_Cheat_Sheet#5` có tiêu đề giả `## FROM node:lts-alpine` do một dòng `FROM node:lts-alpine¶` bị coi là tiêu đề).

**Vùng nên loại khỏi lấy mẫu nhưng chưa được đánh dấu:**

- 133 chunk có tiêu đề kiểu "… — References" / "Further Reading" (danh sách link).
- 146 chunk nặng mã (> 6% ký tự là `{};()<>=`); không phải rác, nhưng khó đặt câu L1.
- WSTG: 10 chunk mục lục đầu (trước "Foreword" ở ký tự 6.017), 54 chunk Reporting + phụ lục (từ ký tự ~889.900).
- Các mục con WSTG ("Summary", "Test Objectives", "How to Test", "Remediation", "References") vẫn là **dòng thường**, không phải `##`
  (đếm: 105, 95, 104, 39, 87 lần), nên trong một test case không có ranh giới mục con. Đơn vị lấy mẫu là test case nên chấp nhận được, nhưng
  chunk WSTG có thể trộn "How to Test" với "References".

Việc đánh dấu vùng loại thuộc ticket 04 (`04-…md:12`: "vùng loại bị đánh dấu không lấy mẫu") [Kế hoạch].

### 3.2 Bộ smoke 40 câu [Dữ liệu]

- 40 / 40 dòng parse được JSON, 0 trùng `id`, 0 thiếu `id` / `question` / `reference_answer`; cả 40 dòng có cùng bộ khoá.
- Tiếng Việt: 40 / 40 câu ở dạng NFC, 0 dấu kết hợp rời (U+0300-036F), 0 mojibake, 0 U+FFFD. Hai câu không dấu (`a04`, `b04`) có
  `question_style = unaccented` đúng nhãn.
- Quote: **81 / 82** quote có nguyên văn (sau gộp khoảng trắng, NFC) trong `Document.markdown` của đúng tài liệu. Câu lệch:
  `seclearn-smoke-a07` (`data/eval/set-a.jsonl` dòng 7), quote ghi `"…these headers -- most importantly Sec-Fetch-Site -- as…"`
  trong khi markdown là `"…these\nheaders — most importantly Sec-Fetch-Site — as…"` (dấu `—` thật). Đây là lỗi đánh máy khi chép quote, sẽ làm
  bước "quote có thật trong snapshot" của `check` thất bại.
- Thông tin cũ: README ghi đã grep "toàn bộ 142 PDF" (`data/eval/README.md:10`), nay corpus còn 134 tài liệu (ADR 0001).

### 3.3 Mục đã sạch so với ghi nhận cũ

So với `EVAL_DATASET_BALANCE_INFRA.md:79-86`: NIST và `owasp_MFA_cheatsheet` đã bỏ; 4 stub đã bỏ (không còn trong DB); WSTG đã có 97 tiêu đề;
`## Sheet` đã hết. Thư mục `data/uploads/` có 135 mục: 134 file khớp `storagePath` trong DB, cộng 1 thư mục `bundle`.

---

## 4. Theo dõi trong issue tracker

Quy ước ở `docs/agents/issue-tracker.md`; một feature `Dataset/.scratch/eval-set-v1/` (spec + 12 ticket).

| Ticket | Liên quan | Status | Thực tế |
|---|---|---|---|
| 01 markdown sạch, chunk offset, lệnh snapshot | Offset, sạch | resolved | Khớp: mã có, 5.859 span đúng |
| 02 reindex, smoke trước / sau, snapshot thật | Offset | ready-for-human, 0 / 5 ô | Reindex đã chạy cho 132 / 134 tài liệu; smoke trước / sau và snapshot chưa có |
| 03 khung Python, schema, `check` | Offset, cân | resolved | Có mã và fixture |
| 04 phân cụm, đơn vị, kế hoạch hạn mức | Cân, vùng loại | ready-for-agent | Chưa làm |
| 05, 09, 12 sinh / lọc / bù hạn mức / gold v1.0 | Cân, dedup | ready-for-agent / ready-for-human | Chưa làm |
| 11 card, chuyển smoke sang gold span | Offset bộ smoke | ready-for-agent | Chưa làm |

Các điểm **chưa có ticket**: hai tài liệu sót reindex; số trang và "Follow @owasp_wstg" còn trong WSTG; quote sai ở `a07`; tiêu đề giả
`## FROM node:lts-alpine`; Reporting + phụ lục WSTG bị gộp vào `WSTG-APIT-01`; `data/eval/` nằm ngoài git (ticket 11 có nhắc "đưa vào git").

---

## 5. Việc cần làm

1. **Reindex lại 2 tài liệu** `Deserialization_Cheat_Sheet` và `File_Upload_Cheat_Sheet` (hoặc chạy lại `npm run db:reindex` toàn bộ), rồi kiểm
   `count(*) WHERE metadata IS NULL = 0`. Sau đó làm nốt ticket 02: smoke trước / sau, `npm run db:snapshot`, kiểm tay chunk WSTG.
2. **Đánh dấu vùng loại** khi dựng đơn vị lấy mẫu (ticket 04): mục lục WSTG (trước ký tự ~6.017), Reporting + phụ lục A-F (từ ~889.900), các mục
   "References" / "Further Reading". Tách Reporting và phụ lục ra khỏi `WSTG-APIT-01` trước khi tính hạn mức, nếu không APIT bị tính 81 thay vì ~27 chunk.
3. **Tính lại bảng cỡ cụm** (10 cụm theo spec) trên snapshot thật; số ở `EVAL_DATASET_BALANCE_INFRA.md:307-320` là số trước reindex, 11 cụm.
4. **Dọn rác nhỏ ở WSTG** (tuỳ chọn, cần reindex và snapshot mới nếu làm sau khi có gold): ~22 dòng số trang, dòng "Follow @owasp_wstg … 831 831".
   Nếu không sửa thì ghi vào phần hạn chế của dataset card.
5. **Sửa quote `seclearn-smoke-a07`** (`--` → `—`) khi chuyển bộ smoke sang gold span (ticket 11), và cập nhật số "142 PDF" trong `data/eval/README.md`.
6. **Đưa bộ smoke vào git** (đang bị `.gitignore:38` bỏ qua), ví dụ chuyển sang `Dataset/`, đúng như ticket 11 yêu cầu.
7. **Mở rộng chủ đề bộ smoke** nếu còn dùng để chỉnh tham số: hiện 0 câu WSTG và không có câu cho AI, framework, API.
8. (Tuỳ chọn) Xem lại tiêu đề giả từ dòng mã kết thúc bằng `¶` (`NodeJS_Docker_Cheat_Sheet#5`, `## FROM node:lts-alpine`) và 61 chunk thân < 100 ký tự;
   ít ảnh hưởng tới truy xuất nhưng có thể thành đơn vị lấy mẫu vô nghĩa.
9. Khi làm qrels (ticket 08), nhớ 14 cặp chunk trùng nội dung giữa các tài liệu (đặc biệt `Injection_Prevention` ↔ WSTG INPV): pooling cần thấy cả hai.
