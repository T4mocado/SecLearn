import { test } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  askedQuestions,
  citationReminder,
  groundedSystemPrompt,
  isConversationAnswer,
  isRefusal,
  noSourcesAnswer,
  questionsNote,
  uncitedSentences,
  withoutRefusals,
} from "./grounding";
import { inlineDisposition, isInsideDir } from "./document-file";
import { remarkCitations } from "./remark-citations";
import { citationClaims, citedChunkIds, citedClauses, type MessageSource } from "./sources";

const texts = (content: string, count = 3) => uncitedSentences(content, count).map((r) => content.slice(r.start, r.end));

// --- Grounded prompt and the no-sources reply ---

test("the prompt forbids outside knowledge and requires citations", () => {
  const prompt = groundedSystemPrompt("[1] (source: A)\nText", "vi");
  assert.match(prompt, /ONLY from the numbered SecLearn document passages/);
  assert.match(prompt, /Do not add facts.*from your own knowledge/);
  assert.match(prompt, /Cite every sentence that states a fact/);
  // Says what the search found, not what the whole library holds: "Tài liệu không đề cập OAuth2" was false
  // when the search had missed it (ERRORS.md #34).
  assert.match(prompt, /Các đoạn tài liệu tìm được không đề cập đến/);
  assert.match(groundedSystemPrompt("[1] x", "en"), /The passages found do not cover/);
  assert.match(prompt, /Answer in Vietnamese/);
  assert.ok(prompt.includes("[1] (source: A)\nText"));
  assert.doesNotMatch(prompt, /general guidance/);
  // Related content counts even under another name; refuse only when nothing is related (ERRORS.md #22).
  assert.match(prompt, /even in other words or without a heading of that name/);
  assert.match(prompt, /Only when no passage has anything on the subject/);
});

test("no [n] on what the documents lack or on the conversation; earlier answers' facts are not restated", () => {
  // "Tài liệu không đề cập … [1][2][3][4][5]" and table cells "Không được tài liệu đề cập [1]": 31 in 36 answers (ERRORS.md #32).
  for (const locale of ["vi", "en"]) {
    const prompt = groundedSystemPrompt("[1] (source: A)\nText", locale);
    assert.match(prompt, /Never put \[n\] on a sentence or table cell that only says the passages do not cover something/);
    assert.match(prompt, /or on what the user asked earlier/);
    // Facts only in earlier answers were restated and cited to the new passages (ERRORS.md #26, #32).
    assert.match(prompt, /A fact that is only in an earlier answer, not in the passages below, must not be repeated/);
  }
  assert.match(citationReminder("vi"), /không gắn \[n\] cho câu chỉ nói các đoạn tài liệu không đề cập/);
  assert.match(citationReminder("en"), /no \[n\] on a sentence that only says the passages do not cover something/);
});

test("uncitedSentences skips sentences saying the passages found do not cover something", () => {
  const vi = "Các đoạn tài liệu tìm được không đề cập đến việc PKCE có bắt buộc với confidential client hay không.";
  const en = "The passages found do not cover whether PKCE is required for confidential clients.";
  assert.deepEqual(texts(vi), []);
  assert.deepEqual(texts(en), []);
});

// --- Refusals are not fed back to the model ---

const REFUSED_DOS =
  "Các đoạn tài liệu được đánh số ở trên không đề cập đến \"phòng chống DoS ở mức ứng dụng\" như một mục riêng, nên tôi không thể nói thêm về chủ đề này dựa trên các đoạn đó.";

test("isRefusal: fixed reply and short refusals, not cited or long answers", () => {
  assert.equal(isRefusal(noSourcesAnswer("vi")), true);
  assert.equal(isRefusal(noSourcesAnswer("en")), true);
  assert.equal(isRefusal(REFUSED_DOS), true);
  assert.equal(isRefusal("The documents do not cover resource limits, so I cannot say more."), true);
  assert.equal(isRefusal("Tài liệu không đề cập đến WAF, nhưng nêu cần giới hạn kích thước request [1]."), false);
  assert.equal(isRefusal(`${"Giới hạn tài nguyên gồm bộ nhớ, CPU và số tiến trình. ".repeat(10)}Tài liệu không đề cập đến WAF.`), false);
  assert.equal(isRefusal("Câu hỏi đầu tiên bạn hỏi mình là: \"SQL injection là gì?\""), false);
});

test("withoutRefusals drops refused exchanges, question included", () => {
  const history = [
    { role: "user", content: "DDoS là gì?" },
    { role: "assistant", content: "DoS làm cạn tài nguyên [1]." },
    { role: "user", content: "nói thêm về DoS ở mức ứng dụng" },
    { role: "assistant", content: REFUSED_DOS },
    { role: "user", content: "nói thêm về giới hạn tài nguyên" },
  ];
  assert.deepEqual(
    withoutRefusals(history).map((m) => m.content),
    ["DDoS là gì?", "DoS làm cạn tài nguyên [1].", "nói thêm về giới hạn tài nguyên"],
  );
});

// --- Every question stays numbered, refused ones included ---

const REFUSED_LAW = "Tài liệu không đề cập đến Luật An ninh mạng Việt Nam hay các quy định về lưu trữ dữ liệu người dùng.";

test("askedQuestions keeps every question in order and marks the refused ones", () => {
  // Dropping refused questions made "câu hỏi thứ 6" the 8th question and counted 9 of 14 (ERRORS.md #27).
  const history = [
    { role: "user", content: "Lưu mật khẩu thế nào?" },
    { role: "assistant", content: "Dùng Argon2id [1]." },
    { role: "user", content: "Luật An ninh mạng quy định gì?" },
    { role: "assistant", content: REFUSED_LAW },
    { role: "user", content: "Vậy còn ở châu Âu?" },
    { role: "assistant", content: noSourcesAnswer("vi") },
    { role: "user", content: "Header chống clickjacking?" },
  ];
  assert.deepEqual(askedQuestions(history), [
    { text: "Lưu mật khẩu thế nào?", answered: true },
    { text: "Luật An ninh mạng quy định gì?", answered: false },
    { text: "Vậy còn ở châu Âu?", answered: false },
    { text: "Header chống clickjacking?", answered: true },
  ]);
  assert.deepEqual(askedQuestions([]), []);
});

test("an answer about the conversation is never a refusal, even when it says the documents lack something", () => {
  // Such answers carry no [n] by design; "câu 6 và 7: tài liệu không đề cập" was taken for a refusal, so the
  // question was marked unanswered and the exchange dropped (ERRORS.md #28).
  const listing = "Các câu không tìm thấy tài liệu là câu 6 (Luật An ninh mạng) và câu 7: tài liệu không đề cập đến pháp luật.";
  const history = [
    { role: "user", content: "Lưu mật khẩu thế nào?" },
    { role: "assistant", content: "Dùng Argon2id [1]." },
    { role: "user", content: "Những câu nào không tìm thấy tài liệu?" },
    { role: "assistant", content: listing, conversation: true },
    { role: "user", content: "Luật An ninh mạng quy định gì?" },
    { role: "assistant", content: REFUSED_LAW },
  ];
  assert.deepEqual(
    askedQuestions(history).map((q) => q.answered),
    [true, true, false],
  );
  assert.deepEqual(
    withoutRefusals(history).map((m) => m.content),
    ["Lưu mật khẩu thế nào?", "Dùng Argon2id [1].", "Những câu nào không tìm thấy tài liệu?", listing],
  );
});

test("isConversationAnswer: no stored sources and not the fixed reply", () => {
  assert.equal(isConversationAnswer("Câu hỏi thứ 6 của bạn là …", 0), true);
  assert.equal(isConversationAnswer(noSourcesAnswer("vi"), 0), false);
  assert.equal(isConversationAnswer(noSourcesAnswer("en"), 0), false);
  // A model refusal in a document answer has its passages stored.
  assert.equal(isConversationAnswer(REFUSED_LAW, 2), false);
});

test("questionsNote numbers every earlier question and says which ones the messages show", () => {
  const questions = [
    { text: "Lưu mật khẩu thế nào?", answered: true },
    { text: "Luật  An ninh mạng\nquy định gì?", answered: false },
    { text: "Header chống clickjacking?", answered: true },
    { text: "x".repeat(300), answered: true },
  ];
  const lines = questionsNote(questions, { shownFrom: 3 }).split("\n");
  assert.match(lines[0]!, /numbered in order.*the latest message is question 5/);
  assert.deepEqual(lines.slice(1, 4), [
    "1. Lưu mật khẩu thế nào?",
    "2. Luật An ninh mạng quy định gì? (not answered: nothing in the documents)",
    "3. Header chống clickjacking?",
  ]);
  assert.equal(lines[4], `4. ${"x".repeat(200)}…`);
  assert.match(lines[5]!, /The messages below show questions 3–4 with their answers.*not shown/);
  assert.equal(lines.length, 6);

  assert.match(questionsNote(questions, { shownFrom: 1 }), /The messages below show questions 1–4 with their answers/);
  assert.match(questionsNote(questions, { shownFrom: null }), /No earlier answers are shown/);
  // The rewrite's reading of the latest message, so the answer resolves "câu thứ hai" the same way.
  assert.match(
    questionsNote(questions, { shownFrom: 1, understoodAs: "OWASP Top 10 category for IDOR" }),
    /\nThe latest message \(question 5\) was understood as: "OWASP Top 10 category for IDOR"$/,
  );
  assert.equal(questionsNote([], { shownFrom: null }), "");
  // A REFORMAT request: the model expanded "explain it more simply" with new topics (ERRORS.md #33).
  assert.match(
    questionsNote(questions, { shownFrom: 1, reformat: true }),
    /\nThe latest message asks to redo the earlier answer in another form.*add no new topics/,
  );
  assert.doesNotMatch(questionsNote(questions, { shownFrom: 1 }), /redo the earlier answer/);
});

test("citedChunkIds returns the chunks an answer cites", () => {
  const sources = [1, 2, 3].map((index) => ({ index, chunkId: `c${index}` }) as MessageSource);
  assert.deepEqual(citedChunkIds("Giới hạn tài nguyên [3]. Thiết kế chịu lỗi [1][9].", sources), ["c1", "c3"]);
  assert.deepEqual(citedChunkIds("Không có trích dẫn.", sources), []);
});

test("the no-sources reply says the documents lack it, in the chat language", () => {
  assert.match(noSourcesAnswer("vi"), /không tìm thấy nội dung liên quan trong tài liệu/);
  assert.match(noSourcesAnswer("en"), /could not find anything related in the SecLearn documents/);
});

// --- Uncited sentences ---

test("flags statements without a citation and keeps cited ones", () => {
  const answer =
    "Mật khẩu mạnh nên dài ít nhất 12 ký tự [1]. Nên dùng trình quản lý mật khẩu để lưu trữ an toàn. " +
    "Không dùng lại mật khẩu cho nhiều tài khoản. [2]";
  assert.deepEqual(texts(answer), ["Nên dùng trình quản lý mật khẩu để lưu trữ an toàn."]);
});

test("numbers and versions with dots don't split a sentence", () => {
  const answer = "Phân tích của Microsoft cho thấy MFA ngăn được 99.9% vụ xâm phạm tài khoản [2].";
  assert.deepEqual(texts(answer), []);
  assert.deepEqual(texts("Theo OWASP WSTG v4.2 cần kiểm tra cơ chế khoá tài khoản sau nhiều lần sai."), [
    "Theo OWASP WSTG v4.2 cần kiểm tra cơ chế khoá tài khoản sau nhiều lần sai.",
  ]);
});

test("skips headings, lead-ins, short fragments, code, tables and 'not covered' sentences", () => {
  const answer = [
    "## Cách phòng chống XSS khi phát triển web",
    "Các biện pháp chính gồm những bước sau:",
    "- Mã hóa đầu ra [1].",
    "- Ngắn gọn thôi.",
    "| Cột A dài hơn hai mươi lăm ký tự | Cột B |",
    "```js",
    "const value = escapeHtml(userInput); // không có trích dẫn",
    "```",
    "Tài liệu không đề cập đến cách cấu hình WAF cụ thể cho từng framework.",
    "The documents do not cover how to configure a WAF for each framework.",
    "Bạn có muốn mình giải thích thêm về Content Security Policy không?",
  ].join("\n");
  assert.deepEqual(texts(answer), []);
});

test("a list item without a citation is flagged without its bullet", () => {
  const answer = "- **Dùng CSP** để hạn chế script chạy trên trang web.\n- Mã hóa đầu ra theo ngữ cảnh [1].";
  assert.deepEqual(texts(answer), ["**Dùng CSP** để hạn chế script chạy trên trang web."]);
});

test("nothing is flagged without sources, or when the marker is out of range", () => {
  assert.deepEqual(texts("Câu này dài đủ hai mươi lăm ký tự mà không có nguồn.", 0), []);
  assert.deepEqual(texts("Câu này trích một nguồn không tồn tại trong danh sách [7].", 3), [
    "Câu này trích một nguồn không tồn tại trong danh sách [7].",
  ]);
});

test("uncited sentences are wrapped when rendered, cited clauses are not", () => {
  const content = "Mã hóa đầu ra theo ngữ cảnh HTML [1]. Nên dùng thêm tường lửa ứng dụng web cho mọi hệ thống.";
  const html = renderToStaticMarkup(
    createElement(
      Markdown,
      {
        remarkPlugins: [
          remarkGfm,
          [
            remarkCitations,
            {
              content,
              sourceCount: 1,
              claims: citationClaims(content, 1),
              clauses: citedClauses(content, 1),
              uncited: uncitedSentences(content, 1),
            },
          ],
        ],
      },
      content,
    ),
  );
  assert.ok(html.includes('<span data-uncited="true">Nên dùng thêm tường lửa ứng dụng web cho mọi hệ thống.</span>'), html);
  assert.ok(html.includes('<span data-clause="0">Mã hóa đầu ra theo ngữ cảnh HTML</span>'), html);
});

// --- Document file helpers ---

test("isInsideDir only accepts paths inside the upload folder", () => {
  const dir = path.resolve("data/uploads");
  assert.equal(isInsideDir(dir, path.join(dir, "a.pdf")), true);
  assert.equal(isInsideDir("data/uploads", "data/uploads/sub/b.pdf"), true);
  assert.equal(isInsideDir(dir, path.join(dir, "..", ".env")), false);
  assert.equal(isInsideDir(dir, path.join(dir, "..", "uploads-evil", "x.pdf")), false);
  assert.equal(isInsideDir(dir, dir), false);
  assert.equal(isInsideDir(dir, path.resolve("/etc/passwd")), false);
});

test("inlineDisposition keeps the Vietnamese name and a safe ASCII fallback", () => {
  const header = inlineDisposition("Bảo mật \"web\"\r\n.pdf", "Bao_mat.pdf");
  assert.ok(header.startsWith('inline; filename="Bao_mat.pdf"; filename*=UTF-8\'\''));
  assert.ok(!/[\r\n]/.test(header));
  assert.equal(decodeURIComponent(header.split("UTF-8''")[1]!), "Bảo mật web .pdf");
});
