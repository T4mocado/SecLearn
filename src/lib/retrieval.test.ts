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

test("historyForRewrite keeps the last turns, shortened and without citations", async () => {
  const { historyForRewrite } = await import("./query");
  const long = "Mật khẩu mạnh nên dài [1]. " + "x".repeat(400);
  const out = historyForRewrite([
    { role: "user", content: "câu cũ nhất" },
    { role: "assistant", content: "trả lời cũ nhất" },
    { role: "user", content: "Mật khẩu mạnh cần những gì?" },
    { role: "assistant", content: long },
    { role: "user", content: "Còn MFA thì sao?" },
    { role: "assistant", content: "MFA chặn 99.9% [2]." },
  ]);
  const lines = out.split("\n");
  assert.equal(lines.length, 4);
  assert.equal(lines[0], "User: Mật khẩu mạnh cần những gì?");
  assert.ok(lines[1]!.startsWith("Assistant: Mật khẩu mạnh nên dài.") && lines[1]!.endsWith("…"));
  assert.ok(lines[1]!.length <= "Assistant: ".length + 301);
  assert.equal(lines[3], "Assistant: MFA chặn 99.9%.");
  assert.equal(historyForRewrite([]), "");
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
  const followUp = rewritePrompt(true);
  assert.match(followUp, /topic of the previous question/);
  assert.match(followUp, /NONE only for greetings or thanks/);
});
