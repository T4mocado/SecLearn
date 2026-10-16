import { test } from "node:test";
import assert from "node:assert/strict";

Object.assign(process.env, {
  DATABASE_URL: process.env.DATABASE_URL || "postgresql://test@localhost/test",
  AUTH_SECRET: process.env.AUTH_SECRET || "test-secret-123",
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || "admin@example.com",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "change-me",
  LLM_PROVIDER: "mock",
});

const item = (id: string, rerankScore: number) => ({ id, rerankScore });
const ids = (list: Array<{ id: string }>) => list.map((x) => x.id);
const opts = { topK: 5, minRelevance: 0.01, minKeep: 2 };

test("selectByRelevance keeps every passing chunk up to topK, best first", async () => {
  const { selectByRelevance } = await import("./rerank");
  const items = [item("a", 0.2), item("b", 0.9), item("c", 0.05), item("d", 0.001)];
  assert.deepEqual(ids(selectByRelevance(items, opts)), ["b", "a", "c"]);
  assert.deepEqual(ids(selectByRelevance(items, { ...opts, topK: 2 })), ["b", "a"]);
});

test("selectByRelevance tops up to minKeep when only one chunk passes (Vietnamese question, English corpus)", async () => {
  const { selectByRelevance } = await import("./rerank");
  // Real scores for "Mật khẩu mạnh cần những gì?": one at 0.157, the rest ~0.004.
  const items = [item("a", 0.0045), item("b", 0.157), item("c", 0.004), item("d", 0.0038)];
  assert.deepEqual(ids(selectByRelevance(items, opts)), ["b", "a"]);
  assert.deepEqual(ids(selectByRelevance(items, { ...opts, minKeep: 0 })), ["b"]);
});

test("selectByRelevance keeps nothing for an off-topic question", async () => {
  const { selectByRelevance } = await import("./rerank");
  assert.deepEqual(selectByRelevance([item("a", 0.003), item("b", 0.002)], opts), []);
  assert.deepEqual(selectByRelevance([], opts), []);
});

test("bestScores takes the best score per document over the queries", async () => {
  const { bestScores } = await import("./rerank");
  assert.deepEqual(bestScores([[0.004, 0.6, 0.1]]), [0.004, 0.6, 0.1]);
  assert.deepEqual(
    bestScores([
      [0.004, 0.6, 0.1],
      [0.87, 0.2, 0.1],
    ]),
    [0.87, 0.6, 0.1],
  );
});

test("needsTranslation: non-ASCII letters mean not English", async () => {
  const { needsTranslation } = await import("./query");
  assert.equal(needsTranslation("Mật khẩu mạnh cần những gì?"), true);
  assert.equal(needsTranslation("Đường dẫn"), true);
  assert.equal(needsTranslation("What makes a strong password?"), false);
  assert.equal(needsTranslation("XSS là gì?"), true);
  // Punctuation and symbols alone are not letters.
  assert.equal(needsTranslation("“SQL injection” – how? €"), false);
  // Unaccented Vietnamese is translated too: alone, "phong chong clickjacking the nao" found nothing above 0.021 (ERRORS.md #31).
  assert.equal(needsTranslation("phong chong xss"), true);
  assert.equal(needsTranslation("phong chong clickjacking the nao"), true);
  assert.equal(needsTranslation("SQL injection la gi"), true);
  assert.equal(needsTranslation("co nen luu mat khau dang plain text khong"), true);
  // English with words that look like Vietnamese syllables stays English.
  assert.equal(needsTranslation("What is the best way to store tokens?"), false);
  assert.equal(needsTranslation("How does cookie theft work in a CORS setup?"), false);
  assert.equal(needsTranslation("Explain the CSRF token pattern"), false);
});

test("searchQueries does not call the LLM in mock mode or when the question is English", async () => {
  const { searchQueries } = await import("./query");
  assert.deepEqual(await searchQueries("Mật khẩu mạnh?"), ["Mật khẩu mạnh?"]);
  assert.deepEqual(await searchQueries("strong password"), ["strong password"]);
});

test("historyForRewrite lists every earlier question in order plus the last answer, shortened", async () => {
  const { historyForRewrite } = await import("./query");
  const long = "Mật khẩu mạnh nên dài [1]. " + "x".repeat(400);
  const out = historyForRewrite([
    { role: "user", content: "SQL injection là gì?" },
    { role: "assistant", content: "SQLi là ... [1]" },
    { role: "user", content: "Còn XSS thì sao?" },
    { role: "assistant", content: "XSS là ... [2]" },
    { role: "user", content: "Mật khẩu mạnh cần những gì?" },
    { role: "assistant", content: long },
  ]);
  const lines = out.split("\n");
  assert.deepEqual(lines.slice(0, 4), [
    "Earlier questions (oldest first):",
    "1. SQL injection là gì?",
    "2. Còn XSS thì sao?",
    "3. Mật khẩu mạnh cần những gì?",
  ]);
  assert.ok(lines[4]!.startsWith("Last answer: Mật khẩu mạnh nên dài.") && lines[4]!.endsWith("…"));
  assert.ok(lines[4]!.length <= "Last answer: ".length + 301);
  assert.equal(lines.length, 5);
  assert.equal(historyForRewrite([]), "");
});

test("historyForRewrite keeps every question, so the first topic resolves in a long chat", async () => {
  // Keeping the last 10 lost "the first vulnerability" at question 19 (ERRORS.md #25).
  const { historyForRewrite } = await import("./query");
  const history = Array.from({ length: 25 }, (_, i) => ({ role: "user" as const, content: `câu ${i + 1}` }));
  const lines = historyForRewrite(history).split("\n");
  assert.equal(lines.length, 26);
  assert.equal(lines[1], "1. câu 1");
  assert.equal(lines[25], "25. câu 25");
  const long = historyForRewrite([{ role: "user", content: "x".repeat(500) }]).split("\n")[1]!;
  assert.equal(long, `1. ${"x".repeat(120)}…`);
});

test("historyForRewrite numbers refused questions too, so a follow-up to one keeps its topic", async () => {
  // Without them "Vậy còn ở châu Âu thì sao?" after a refused question about Vietnamese law became
  // "cookie attributes GDPR Europe" (ERRORS.md #27).
  const { historyForRewrite } = await import("./query");
  const { noSourcesAnswer } = await import("./grounding");
  const lines = historyForRewrite([
    { role: "user", content: "Cookie nên đặt thuộc tính nào?" },
    { role: "assistant", content: "Secure, HttpOnly, SameSite [1]." },
    { role: "user", content: "Luật An ninh mạng Việt Nam quy định gì về lưu trữ dữ liệu?" },
    { role: "assistant", content: noSourcesAnswer("vi") },
  ]).split("\n");
  assert.deepEqual(lines.slice(1, 3), [
    "1. Cookie nên đặt thuộc tính nào?",
    "2. Luật An ninh mạng Việt Nam quy định gì về lưu trữ dữ liệu? (not answered: nothing in the documents)",
  ]);
  assert.match(lines[3]!, /^Last answer: Mình không tìm thấy nội dung liên quan/);
});

test("historyForAnswer leaves refused exchanges out of the turns but numbers every question", async () => {
  const { historyForAnswer } = await import("./chat-answer");
  const { noSourcesAnswer } = await import("./grounding");
  const history = [
    { role: "user" as const, content: "q1" },
    { role: "assistant" as const, content: "a1 [1]".padEnd(100, ".") },
    { role: "user" as const, content: "q2" },
    { role: "assistant" as const, content: noSourcesAnswer("vi") },
    { role: "user" as const, content: "q3" },
    { role: "assistant" as const, content: "a3 [2]".padEnd(100, ".") },
    { role: "user" as const, content: "q4" },
    { role: "assistant" as const, content: "a4 [1]".padEnd(100, ".") },
  ];
  const all = historyForAnswer(history, 10_000);
  assert.deepEqual(all.recent.map((m) => m.content.slice(0, 2)), ["q1", "a1", "q3", "a3", "q4", "a4"]);
  assert.ok(!all.recent.some((m) => /\[\d\]/.test(m.content)), "citation markers are stripped");
  assert.deepEqual(all.questions.map((q) => [q.text, q.answered]), [
    ["q1", true], ["q2", false], ["q3", true], ["q4", true],
  ]);
  assert.equal(all.shownFrom, 1);
  // Over the limit: q1 is cut, so the turns shown start at question 3 (q2 was refused).
  const cut = historyForAnswer(history, 250);
  assert.deepEqual(cut.recent.map((m) => m.content.slice(0, 2)), ["q3", "a3", "q4", "a4"]);
  assert.equal(cut.shownFrom, 3);
  // Only refusals: nothing to show.
  assert.equal(historyForAnswer(history.slice(2, 4)).shownFrom, null);
});

const turns = (n: number, size: number) =>
  Array.from({ length: n }, (_, i) => [
    { role: "user" as const, content: `q${i + 1}` },
    { role: "assistant" as const, content: `a${i + 1}`.padEnd(size, ".") },
  ]).flat();

test("selectByRelevance keeps carried chunks above their floor in place of the lowest others", async () => {
  const { selectByRelevance } = await import("./rerank");
  const items = [item("a", 0.9), item("b", 0.8), item("c", 0.7), item("d", 0.6), item("e", 0.5), item("x", 0.3), item("y", 0.2), item("z", 0.05)];
  const carried = (ids: string[]) => ({ ...opts, carried: { ids, max: 2, minRelevance: 0.1 } });
  assert.deepEqual(ids(selectByRelevance(items, carried(["x", "y"]))), ["a", "b", "c", "x", "y"]);
  // At most `max` of them, the best ones.
  assert.deepEqual(ids(selectByRelevance(items, { ...opts, carried: { ids: ["x", "y"], max: 1, minRelevance: 0.1 } })), [
    "a", "b", "c", "d", "x",
  ]);
  // Below the floor a carried chunk is not kept: it pushed out better ones (ERRORS.md #26).
  assert.deepEqual(ids(selectByRelevance(items, carried(["z"]))), ["a", "b", "c", "d", "e"]);
  // Already in the top K: nothing changes.
  assert.deepEqual(ids(selectByRelevance(items, carried(["a", "e"]))), ["a", "b", "c", "d", "e"]);
  // Off topic stays off topic.
  assert.deepEqual(selectByRelevance([item("x", 0.005)], carried(["x"])), []);
});

test("carriedChunkIds collects the chunks every answer in the window cited, newest first", async () => {
  const { carriedChunkIds } = await import("./chat-answer");
  assert.deepEqual(
    carriedChunkIds([
      { role: "user", content: "XSS?" },
      { role: "assistant", content: "…", citedChunkIds: ["xss1", "shared"] },
      { role: "user", content: "CSRF?" },
      { role: "assistant", content: "…", citedChunkIds: ["csrf1", "shared"] },
      { role: "user", content: "Còn gì?" },
      { role: "assistant", content: "Không có trích dẫn." },
    ]),
    ["csrf1", "shared", "xss1"],
  );
  assert.deepEqual(carriedChunkIds([]), []);
});

test("splitHistory sends everything while the history fits", async () => {
  const { splitHistory } = await import("./chat-answer");
  const history = turns(3, 100);
  assert.deepEqual(splitHistory(history, 1000), { recent: history, olderQuestions: [] });
  assert.deepEqual(splitHistory([], 1000), { recent: [], olderQuestions: [] });
});

test("splitHistory keeps the latest whole turns and lists the older questions in order", async () => {
  const { splitHistory } = await import("./chat-answer");
  // Each turn is 2 + 100 characters: three fit in 320, a fourth does not.
  const { recent, olderQuestions } = splitHistory(turns(6, 100), 320);
  assert.deepEqual(recent.map((m) => m.content.slice(0, 2)), ["q4", "a4", "q5", "a5", "q6", "a6"]);
  assert.deepEqual(olderQuestions, ["q1", "q2", "q3"]);
});

test("splitHistory starts at a question and always keeps the last exchange", async () => {
  const { splitHistory } = await import("./chat-answer");
  // 2 + 100 + 2 + 100 = 204: the budget ends inside turn 1's answer, which is dropped with it.
  assert.deepEqual(splitHistory(turns(2, 100), 150).olderQuestions, ["q1"]);
  // A single answer longer than the limit still goes out with its question.
  const huge = splitHistory(turns(2, 5000), 1000);
  assert.deepEqual(huge.recent.map((m) => m.content.slice(0, 2)), ["q2", "a2"]);
  assert.deepEqual(huge.olderQuestions, ["q1"]);
});

test("searchQueries does not call the LLM in mock mode even with history", async () => {
  const { searchQueries } = await import("./query");
  assert.deepEqual(await searchQueries("Trả lời ngắn gọn", [{ role: "user", content: "XSS là gì?" }]), ["Trả lời ngắn gọn"]);
});

test("rewritePrompt: NONE for any topicless message alone, only greetings within a conversation", async () => {
  const { rewritePrompt } = await import("./query");
  const alone = rewritePrompt(false);
  assert.match(alone, /only a greeting, thanks, or an instruction about the answer itself like "shorter" or "explain more".*reply exactly NONE/);
  assert.match(alone, /Never invent a topic/);
  // "Mật khẩu mạnh cần những gì?" came back NONE 5/6 times and was searched in Vietnamese only (ERRORS.md #31).
  assert.match(alone, /security subject, even in everyday words \("Mật khẩu mạnh cần những gì\?"/);
  assert.doesNotMatch(alone, /CONVERSATION/);
  const followUp = rewritePrompt(true);
  assert.match(followUp, /topic of the previous question/);
  assert.match(followUp, /NONE only for greetings or thanks/);
  assert.match(followUp, /about the conversation itself.*reply exactly CONVERSATION/);
  // Once question 6 kept its number, "Câu hỏi thứ 6 của mình là gì?" became a search for its topic (ERRORS.md #27).
  assert.match(followUp, /only what an earlier question was.*how many questions.*which ones were not answered.*CONVERSATION/);
  // ...but new information about that question's topic is still a search.
  assert.match(followUp, /information about an earlier question's topic \("Quay lại câu hỏi đầu tiên.*OWASP Top 10\?"\) is a search/);
  assert.match(followUp, /"the second vulnerability" counts topics in the order/);
  assert.match(followUp, /do not add terms from earlier questions/);
});

test("planSearch in mock mode searches with the message and never calls the LLM", async () => {
  const { planSearch } = await import("./query");
  assert.deepEqual(await planSearch("Tóm tắt lại", [{ role: "user", content: "XSS là gì?" }]), {
    intent: "search",
    queries: ["Tóm tắt lại"],
  });
});

test("chatRequestMessages adds the citation reminder only to a follow-up question", async () => {
  const { chatRequestMessages } = await import("./llm");
  const first = chatRequestMessages({ messages: [{ role: "user", content: "XSS là gì?" }], context: "[1] x", locale: "vi" });
  assert.equal(first.length, 2);
  assert.equal(first[1]!.content, "XSS là gì?");

  const history = [
    { role: "user" as const, content: "SQLi là gì?" },
    { role: "assistant" as const, content: "SQLi là ..." },
    { role: "user" as const, content: "Còn XSS?" },
  ];
  const follow = chatRequestMessages({ messages: history, context: "[1] x", locale: "vi" });
  assert.match(follow[0]!.content, /ONLY from the numbered SecLearn document passages/);
  assert.equal(follow[1]!.content, "SQLi là gì?");
  assert.match(follow[3]!.content, /^Còn XSS\?\n\n\(Hãy gắn \[n\] sau mỗi câu/);
  // "Answer only from the passages above" made the model refuse relevant follow-ups (ERRORS.md #22).
  assert.doesNotMatch(follow[3]!.content, /chỉ dựa trên|ở trên/);
  assert.equal(history[2]!.content, "Còn XSS?", "caller's history is not mutated");

  const chat = chatRequestMessages({ messages: history, context: "", locale: "vi", mode: "conversation" });
  assert.match(chat[0]!.content, /asking about this conversation itself/);
  assert.match(chat[0]!.content, /do not use citation numbers/);
  assert.equal(chat[3]!.content, "Còn XSS?");
});

test("chatRequestMessages adds the numbered questions to the system prompt, in both modes", async () => {
  // The answer model counted only the turns it saw: "câu thứ hai" became question 7 while the
  // rewrite, which saw every question numbered, read question 2 (ERRORS.md #27).
  const { chatRequestMessages } = await import("./llm");
  const messages = [
    { role: "user" as const, content: "SQLi là gì?" },
    { role: "assistant" as const, content: "SQLi là ..." },
    { role: "user" as const, content: "Lỗ hổng đầu tiên là gì?" },
  ];
  const questionsNote = "Questions the user asked earlier…\n1. XSS là gì?\n2. SQLi là gì?";
  const grounded = chatRequestMessages({ messages, questionsNote, context: "[1] x", locale: "vi" });
  assert.ok(grounded[0]!.content.endsWith(`Passages:\n---\n[1] x\n---\n\n${questionsNote}`));
  assert.equal(grounded.length, 4, "the questions go in the system prompt, not as turns");
  const chat = chatRequestMessages({ messages, questionsNote, context: "", locale: "vi", mode: "conversation" });
  assert.ok(chat[0]!.content.endsWith(`\n\n${questionsNote}`));
  // First question: no note.
  const plain = chatRequestMessages({ messages: messages.slice(2), context: "[1] x", locale: "vi" });
  assert.ok(plain[0]!.content.endsWith("\n---"));
});

// --- Several topics, keyword candidates (docs/ERRORS.md #29) ---

test("parseRewrite keeps one query per line, at most three, without list markers or quotes", async () => {
  const { parseRewrite } = await import("./query");
  assert.deepEqual(parseRewrite('"Server-Side Request Forgery SSRF OWASP Top 10"'), ["Server-Side Request Forgery SSRF OWASP Top 10"]);
  assert.deepEqual(
    parseRewrite("1. password storage hashing\n- session management\n\n* JSON Web Token JWT\nsession management\nfourth topic"),
    ["password storage hashing", "session management", "JSON Web Token JWT"],
  );
  assert.deepEqual(parseRewrite("  \n"), []);
});

test("rewritePrompt asks for one query per topic and for acronyms with their full names", async () => {
  const { rewritePrompt } = await import("./query");
  for (const prompt of [rewritePrompt(true), rewritePrompt(false)]) {
    assert.match(prompt, /one query per topic/i);
    assert.match(prompt, /Server-Side Request Forgery SSRF/);
  }
});

test("keywordQuery ORs the words of the English queries and skips the others", async () => {
  const { keywordQuery } = await import("./rag");
  assert.equal(
    keywordQuery(["Lỗ hổng SSRF thuộc mục nào?", "Server-Side Request Forgery SSRF OWASP Top 10", "SSRF A10"]),
    "server | side | request | forgery | ssrf | owasp | top | 10 | a10",
  );
  // Only letters and digits reach to_tsquery: its operators in a question cannot break the query.
  assert.equal(keywordQuery(["what's (a) & b | !c:* top-10"]), "what | top | 10");
  assert.equal(keywordQuery(["Mật khẩu là gì?"]), "");
});

test("selectByRelevance keeps the best chunk of each topic above its floor", async () => {
  const { selectByRelevance } = await import("./rerank");
  // One topic fills the top K; the second and third topics' best chunks score lower.
  const items = [item("a", 0.9), item("b", 0.85), item("c", 0.8), item("d", 0.75), item("e", 0.7), item("x", 0.4), item("y", 0.3), item("z", 0.05)];
  const topics = (best: string[]) => ({ ...opts, topics: { ids: best, minRelevance: 0.1 } });
  assert.deepEqual(ids(selectByRelevance(items, topics(["a", "x", "y"]))), ["a", "b", "c", "x", "y"]);
  // A topic whose best chunk is below the floor has nothing relevant: nothing is forced in.
  assert.deepEqual(ids(selectByRelevance(items, topics(["a", "z"]))), ["a", "b", "c", "d", "e"]);
  // Topics come before carried chunks when both do not fit.
  assert.deepEqual(
    ids(selectByRelevance(items, { ...topics(["a", "x", "y"]), topK: 4, carried: { ids: ["z", "e"], max: 2, minRelevance: 0.1 } })),
    ["a", "e", "x", "y"],
  );
});

test("isSiteMenu: the cheat-sheet site's navigation list, not a table of contents", async () => {
  const { isSiteMenu, menuNames } = await import("./rag");
  const names = menuNames([
    "Bot_Management_and_Anti-Automation_Cheat_Sheet", "Clickjacking_Defense_Cheat_Sheet", "Content_Security_Policy_Cheat_Sheet",
    "Cookie_Theft_Mitigation_Cheat_Sheet", "Forgot_Password_Cheat_Sheet", "GraphQL_Cheat_Sheet", "HTML5_Security_Cheat_Sheet",
    "HTTP_Headers_Cheat_Sheet", "Injection_Prevention_Cheat_Sheet", "JAAS_Cheat_Sheet", "Password_Storage_Cheat_Sheet", "wstg-v4.2",
  ]);
  assert.ok(names.includes("Bot Management and Anti-Automation") && !names.includes("wstg-v4.2"));
  // As ingested from the PDFs: the site menu lists every cheat sheet (19-34 names per chunk).
  const menu =
    "Bot Management and Anti-Automation Clickjacking Defense Content Security Policy Cookie Theft Mitigation Forgot Password " +
    "GraphQL HTML5 Security HTTP Headers Injection Prevention JAAS Password Storage Pinning";
  assert.equal(isSiteMenu(menu, names, 10), true);
  // A table of contents naming OWASP Top 10 categories answers "which category": kept (ERRORS.md #29).
  assert.equal(isSiteMenu("A09 Security Logging and Monitoring Failures A10 Server-Side Request Forgery (SSRF) Password Storage", names, 10), false);
});

test("selectByRelevance drops chunks far below the best one when relativeMin is set", async () => {
  const { selectByRelevance } = await import("./rerank");
  // An English query scored them: Docker DoS limits (0.057) next to IDOR prevention (0.67) are not about the question (ERRORS.md #31).
  const english = { topK: 5, minRelevance: 0.05, minKeep: 0, relativeMin: 0.1 };
  const items = [item("idor", 0.67), item("authz", 0.45), item("tests", 0.13), item("docker", 0.057), item("drone", 0.03)];
  assert.deepEqual(ids(selectByRelevance(items, english)), ["idor", "authz", "tests"]);
  // Nothing reaches the floor: off topic, nothing kept (the fixed reply, no LLM call).
  assert.deepEqual(selectByRelevance([item("law", 0.012), item("nist", 0.009)], english), []);
  // Reserved topic chunks keep their own floor.
  assert.deepEqual(
    ids(selectByRelevance([item("a", 0.99), item("b", 0.95), item("jwt", 0.09)], { ...english, topics: { ids: ["jwt"], minRelevance: 0.05 } })),
    ["a", "b", "jwt"],
  );
});

test("relevanceFloor: strict when an English query scored the chunks, lenient for Vietnamese alone", async () => {
  const { relevanceFloor } = await import("./rag");
  const env = { RAG_MIN_RELEVANCE: 0.01, RAG_MIN_KEEP: 2, RAG_MIN_RELEVANCE_EN: 0.05, RAG_RELATIVE_MIN: 0.1 };
  assert.deepEqual(relevanceFloor(["Mật khẩu mạnh cần những gì?", "What makes a strong password?"], env), {
    minRelevance: 0.05,
    minKeep: 0,
    relativeMin: 0.1,
  });
  // The translation failed: the cross-encoder scores Vietnamese against English chunks ~100x lower (ERRORS.md #10, #17).
  assert.deepEqual(relevanceFloor(["Mật khẩu mạnh cần những gì?"], env), { minRelevance: 0.01, minKeep: 2, relativeMin: 0 });
});
