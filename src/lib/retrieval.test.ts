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
  // Known limit: unaccented Vietnamese is taken for English.
  assert.equal(needsTranslation("phong chong xss"), false);
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

const turns = (n: number, size: number) =>
  Array.from({ length: n }, (_, i) => [
    { role: "user" as const, content: `q${i + 1}` },
    { role: "assistant" as const, content: `a${i + 1}`.padEnd(size, ".") },
  ]).flat();

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
  assert.match(alone, /instruction like "shorter" or "explain more"\), reply exactly NONE/);
  assert.match(alone, /Never invent a topic/);
  assert.doesNotMatch(alone, /CONVERSATION/);
  const followUp = rewritePrompt(true);
  assert.match(followUp, /topic of the previous question/);
  assert.match(followUp, /NONE only for greetings or thanks/);
  assert.match(followUp, /about the conversation itself.*reply exactly CONVERSATION/);
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

test("chatRequestMessages lists the questions of turns left out, in both modes", async () => {
  const { chatRequestMessages } = await import("./llm");
  const messages = [
    { role: "user" as const, content: "SQLi là gì?" },
    { role: "assistant" as const, content: "SQLi là ..." },
    { role: "user" as const, content: "Lỗ hổng đầu tiên là gì?" },
  ];
  const olderQuestions = ["XSS là gì?", "Còn  CSRF\nthì sao?"];
  const note = /the user asked \(oldest first; answers not shown\):\n1\. XSS là gì\?\n2\. Còn CSRF thì sao\?$/;
  const grounded = chatRequestMessages({ messages, olderQuestions, context: "[1] x", locale: "vi" });
  assert.match(grounded[0]!.content, /Passages:\n---\n\[1\] x\n---\n\nEarlier in this conversation/);
  assert.match(grounded[0]!.content, note);
  assert.equal(grounded.length, 4, "the questions go in the system prompt, not as turns");
  const chat = chatRequestMessages({ messages, olderQuestions, context: "", locale: "vi", mode: "conversation" });
  assert.match(chat[0]!.content, note);
  // Within the limit nothing is left out and the prompt is unchanged.
  const plain = chatRequestMessages({ messages, olderQuestions: [], context: "[1] x", locale: "vi" });
  assert.doesNotMatch(plain[0]!.content, /Earlier in this conversation/);
});
