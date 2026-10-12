import { test } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { groundedSystemPrompt, noSourcesAnswer, uncitedSentences } from "./grounding";
import { inlineDisposition, isInsideDir } from "./document-file";
import { remarkCitations } from "./remark-citations";
import { citationClaims, citedClauses } from "./sources";

const texts = (content: string, count = 3) => uncitedSentences(content, count).map((r) => content.slice(r.start, r.end));

// --- Grounded prompt and the no-sources reply ---

test("the prompt forbids outside knowledge and requires citations", () => {
  const prompt = groundedSystemPrompt("[1] (source: A)\nText", "vi");
  assert.match(prompt, /ONLY from the numbered SecLearn document passages/);
  assert.match(prompt, /Do not add facts.*from your own knowledge/);
  assert.match(prompt, /Cite every sentence that states a fact/);
  assert.match(prompt, /Tài liệu không đề cập đến/);
  assert.match(prompt, /Answer in Vietnamese/);
  assert.ok(prompt.includes("[1] (source: A)\nText"));
  assert.doesNotMatch(prompt, /general guidance/);
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
