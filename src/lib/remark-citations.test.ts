import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkCitations } from "./remark-citations";
import {
  citationClaims,
  citedClauses,
  citedIndexes,
  maskCode,
  splitSentences,
} from "./sources";

/** Renders like answer-markdown.tsx does, without the React components around it. */
function render(content: string, sourceCount = 3): string {
  const claims = citationClaims(content, sourceCount);
  const clauses = citedClauses(content, sourceCount);
  return renderToStaticMarkup(
    createElement(
      Markdown,
      { remarkPlugins: [remarkGfm, [remarkCitations, { content, sourceCount, claims, clauses }]] },
      content,
    ),
  );
}

const textOf = (html: string) => html.replace(/<[^>]+>/g, "");

/** Text of every piece tagged with a clause, joined per clause. */
function clauseTexts(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/<span data-clause="(\d+)">([^<]*)<\/span>/g)) {
    out.set(m[1]!, (out.get(m[1]!) ?? "") + m[2]);
  }
  return out;
}

// --- T1: code is never a citation ---

test("maskCode keeps offsets and newlines", () => {
  const s = "a `x[1]` b\n```js\ny[2]\n```\nc [3]";
  const masked = maskCode(s);
  assert.equal(masked.length, s.length);
  assert.equal(masked.split("\n").length, s.split("\n").length);
  assert.ok(!masked.includes("[1]") && !masked.includes("[2]") && masked.includes("[3]"));
});

test("citations inside code are ignored by the parser and the renderer", () => {
  const answer = "Dùng `arr[1]` để lấy phần tử thứ hai của mảng [2].\n\n```js\nconst x = list[1];\n```";
  assert.deepEqual([...citedIndexes(answer, 3)], [2]);
  assert.deepEqual(
    citationClaims(answer, 3).map((c) => c.index),
    [2],
  );
  const html = render(answer);
  assert.ok(html.includes("<code>arr[1]</code>"));
  assert.ok(html.includes("list[1];"));
  assert.equal([...html.matchAll(/data-cite=/g)].length, 1);
});

test("an unclosed code fence while streaming hides its markers too", () => {
  const answer = "Ví dụ [1]:\n```py\nx = a[2]";
  assert.deepEqual([...citedIndexes(answer, 3)], [1]);
  assert.equal([...render(answer).matchAll(/data-cite=/g)].length, 1);
});

// --- T2/T3: markdown around citations, offsets line up ---

test("citation inside bold, italic, list items and headings becomes a button", () => {
  const answer = [
    "## Tiêu đề quan trọng [1]",
    "",
    "- **Mã hóa đầu ra trước khi hiển thị [2]**",
    "- *Dùng Content Security Policy để giảm rủi ro [3]*",
  ].join("\n");
  const html = render(answer);
  assert.match(html, /<h2>.*data-cite="1".*<\/h2>/);
  assert.match(html, /<strong>.*data-cite="2".*<\/strong>/);
  assert.match(html, /<em>.*data-cite="3".*<\/em>/);
});

test("every rendered marker maps to its claim and clause (T3)", () => {
  const answer =
    "XSS cho phép kẻ tấn công **chèn script độc hại** vào trang web [1]. " +
    "Cần mã hóa đầu ra theo ngữ cảnh HTML [2][3], và dùng CSP như lớp bảo vệ thêm [3].";
  const claims = citationClaims(answer, 3);
  const html = render(answer);
  const ats = [...html.matchAll(/data-at="(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(
    ats,
    claims.map((c) => c.at),
  );
  for (const m of html.matchAll(/data-cite="(\d+)" data-at="(\d+)" data-clause="(\d+)"/g)) {
    assert.equal(answer.slice(Number(m[2]), Number(m[2]) + m[1]!.length + 2), `[${m[1]}]`);
  }
  // The clause in the first sentence spans the bold part, and its pieces add up to the source text.
  const clauses = citedClauses(answer, 3);
  const texts = clauseTexts(html);
  clauses.forEach((c, i) => {
    assert.equal(texts.get(String(i)), answer.slice(c.start, c.end).replace(/\*\*/g, ""));
  });
});

test("grouped markers share one clause", () => {
  const answer = "Mã hóa đầu ra theo ngữ cảnh là biện pháp chính [2][3].";
  const clauses = citedClauses(answer, 3);
  assert.equal(clauses.length, 1);
  assert.deepEqual(clauses[0]!.indexes, [2, 3]);
  assert.equal(answer.slice(clauses[0]!.start, clauses[0]!.end), "Mã hóa đầu ra theo ngữ cảnh là biện pháp chính");
});

test("clause ranges skip leading punctuation and stop before the marker", () => {
  const answer = "Phishing lừa người dùng nhập mật khẩu trên trang giả [1], còn MFA giúp chặn đăng nhập trái phép [2].";
  const [first, second] = citationClaims(answer, 2);
  assert.equal(answer.slice(first!.start, first!.end), "Phishing lừa người dùng nhập mật khẩu trên trang giả");
  assert.equal(answer.slice(second!.start, second!.end), "còn MFA giúp chặn đăng nhập trái phép");
  assert.equal(second!.claim, "còn MFA giúp chặn đăng nhập trái phép");
});

test("out-of-range markers stay text", () => {
  const html = render("Không có nguồn số chín [9] hay số không [0].", 3);
  assert.ok(!html.includes("data-cite"));
  assert.ok(textOf(html).includes("[9]") && textOf(html).includes("[0]"));
});

// --- T4: raw HTML is never rendered ---

test("raw HTML in an answer is shown as text, not executed", () => {
  for (const payload of ['<script>alert(1)</script>', '<img src=x onerror="alert(1)">', '<a href="javascript:alert(1)">x</a>']) {
    const html = render(`Ví dụ payload XSS: ${payload} [1]`);
    // Escaped text ("&lt;img onerror=...") is fine; a real tag or javascript: href is not.
    assert.ok(!/<(script|img)\b|href="javascript:/i.test(html), html);
    assert.ok(html.includes("&lt;"), html);
  }
  const link = render("[bấm](javascript:alert(1)) [1]");
  assert.ok(!link.includes("javascript:"), link);
});

// --- T5: half-written Markdown while streaming ---

test("half-written markdown renders without throwing", () => {
  for (const partial of ["**Đậm chưa đóng [1", "**Đậm chưa đóng [1]", "- mục [2", "| a | b |\n|---", "```", "[1][", "*"]) {
    assert.doesNotThrow(() => render(partial), partial);
  }
});

// --- Evidence sentences ---

test("splitSentences returns trimmed ranges and skips fragments", () => {
  const chunk = "Use output encoding. Ok.\n\n  Apply a strict Content Security Policy!  Short\n\nSanitize HTML with a vetted library.";
  const ranges = splitSentences(chunk);
  assert.deepEqual(
    ranges.map((r) => chunk.slice(r.start, r.end)),
    ["Use output encoding.", "Apply a strict Content Security Policy!", "Sanitize HTML with a vetted library."],
  );
});

test("splitSentences keeps a hard-wrapped PDF sentence whole but splits list items", () => {
  const chunk =
    "analysis by Microsoft suggesting that it would have\nstopped 99.9% of account compromises. Next sentence here.\n" +
    "- First list item text\n- Second list item text\n## Heading line text";
  assert.deepEqual(
    splitSentences(chunk).map((r) => chunk.slice(r.start, r.end)),
    [
      "analysis by Microsoft suggesting that it would have\nstopped 99.9% of account compromises.",
      "Next sentence here.",
      "- First list item text",
      "- Second list item text",
      "## Heading line text",
    ],
  );
});
