import { test } from "node:test";
import assert from "node:assert/strict";
import type { MessageSource } from "./sources";

// Mock provider: no network. Set before the env cache is first read.
Object.assign(process.env, {
  DATABASE_URL: process.env.DATABASE_URL || "postgresql://test@localhost/test",
  AUTH_SECRET: process.env.AUTH_SECRET || "test-secret-123",
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || "admin@example.com",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "change-me",
  LLM_PROVIDER: "mock",
});

/** Imported lazily so the env above is in place first (the package is CommonJS: no top-level await). */
async function load(judgeEnv: "on" | "off") {
  process.env.RAG_JUDGE = judgeEnv;
  const { resetEnvCache } = await import("./env");
  resetEnvCache();
  return (await import("./judge")).judgeSources;
}

const sources: MessageSource[] = [1, 2, 3].map((index) => ({
  index,
  chunkId: `c${index}`,
  documentId: "d",
  documentTitle: `Doc ${index}`,
  chunkIndex: 0,
  content: `content ${index}`,
  score: 0.5,
  method: "vector",
  rerankScore: index / 10,
}));

test("judgeSources attaches a judgement to every source without renumbering", async () => {
  const judgeSources = await load("on");
  const out = await judgeSources({ question: "q", answer: "A [2]. B [1].", sources, locale: "vi" });
  assert.deepEqual(
    out.map((s) => s.index),
    [1, 2, 3],
  );
  for (const s of out) {
    assert.ok(s.judge, `source ${s.index} judged`);
    assert.ok(s.judge.questionRelevance >= 0 && s.judge.questionRelevance <= 100);
    assert.ok(s.judge.answerContribution >= 0 && s.judge.answerContribution <= 100);
  }
  // Mock: uncited sources contribute nothing.
  assert.equal(out[2]?.judge?.answerContribution, 0);
});

test("judgeSources is a no-op when off, without sources or without an answer", async () => {
  let judgeSources = await load("off");
  assert.equal(await judgeSources({ question: "q", answer: "A [1]", sources, locale: "vi" }), sources);
  judgeSources = await load("on");
  assert.equal(await judgeSources({ question: "q", answer: "  ", sources, locale: "vi" }), sources);
  assert.deepEqual(await judgeSources({ question: "q", answer: "A", sources: [], locale: "vi" }), []);
});
