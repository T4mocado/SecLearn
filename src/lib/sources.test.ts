import { test } from "node:test";
import assert from "node:assert/strict";
import {
  citationClaims,
  citedIndexes,
  compareByPriority,
  judgeVerdict,
  orderSources,
  parseJudgement,
  parseSources,
  prioritySources,
  type MessageSource,
  type SourceJudgement,
} from "./sources";

function source(index: number, extra: Partial<MessageSource> = {}): MessageSource {
  return {
    index,
    chunkId: `c${index}`,
    documentId: "d",
    documentTitle: `Doc ${index}`,
    chunkIndex: index - 1,
    content: `content ${index}`,
    score: 0.5,
    method: "vector",
    ...extra,
  };
}

function judge(answerContribution: number, questionRelevance = 50): SourceJudgement {
  return { answerContribution, questionRelevance, reason: "" };
}

const indexes = (list: MessageSource[]) => list.map((s) => s.index);

test("parseJudgement reads a valid reply", () => {
  const raw = JSON.stringify({
    sources: [
      { index: 1, questionRelevance: 90, answerContribution: 80, reason: "Trả lời trực tiếp." },
      { index: 2, questionRelevance: 10, answerContribution: 0, reason: "Lạc đề." },
    ],
  });
  const out = parseJudgement(raw, 2)!;
  assert.deepEqual(out.get(1), { questionRelevance: 90, answerContribution: 80, reason: "Trả lời trực tiếp." });
  assert.equal(out.get(2)?.questionRelevance, 10);
});

test("parseJudgement accepts a code fence and a bare array", () => {
  const item = { index: 1, questionRelevance: 50, answerContribution: 50, reason: "x" };
  assert.equal(parseJudgement("```json\n" + JSON.stringify({ sources: [item] }) + "\n```", 1)?.size, 1);
  assert.equal(parseJudgement(JSON.stringify([item]), 1)?.size, 1);
});

test("parseJudgement returns null for unusable replies", () => {
  assert.equal(parseJudgement("not json", 3), null);
  assert.equal(parseJudgement("{}", 3), null);
  assert.equal(parseJudgement(JSON.stringify({ sources: [] }), 3), null);
  assert.equal(parseJudgement("null", 3), null);
});

test("parseJudgement drops bad entries, clamps scores and keeps the first duplicate", () => {
  const raw = JSON.stringify({
    sources: [
      { index: 0, questionRelevance: 50, answerContribution: 50 },
      { index: 4, questionRelevance: 50, answerContribution: 50 },
      { index: 1.5, questionRelevance: 50, answerContribution: 50 },
      { index: 1, questionRelevance: "abc", answerContribution: 50 },
      { index: 2, questionRelevance: 150, answerContribution: -5, reason: "a".repeat(500) },
      { index: 2, questionRelevance: 1, answerContribution: 1 },
      { index: "3", questionRelevance: "80", answerContribution: 33.6 },
    ],
  });
  const out = parseJudgement(raw, 3)!;
  assert.deepEqual([...out.keys()].sort(), [2, 3]);
  assert.equal(out.get(2)?.questionRelevance, 100);
  assert.equal(out.get(2)?.answerContribution, 0);
  assert.equal(out.get(2)?.reason.length, 300);
  assert.deepEqual(out.get(3), { questionRelevance: 80, answerContribution: 34, reason: "" });
});

test("judgeVerdict thresholds", () => {
  assert.equal(judgeVerdict(judge(0, 70)), "relevant");
  assert.equal(judgeVerdict(judge(0, 69)), "partial");
  assert.equal(judgeVerdict(judge(0, 40)), "partial");
  assert.equal(judgeVerdict(judge(0, 39)), "irrelevant");
});

test("priority: answer contribution first, then question relevance", () => {
  const list = [
    source(1, { judge: judge(20, 90) }),
    source(2, { judge: judge(80, 40) }),
    source(3, { judge: judge(20, 95) }),
  ];
  assert.deepEqual(indexes(prioritySources(list)), [2, 3, 1]);
});

test("priority without judge falls back to rerank score, then retrieval order", () => {
  assert.deepEqual(
    indexes(prioritySources([source(1, { rerankScore: 0.1 }), source(2, { rerankScore: 0.9 }), source(3, { rerankScore: 0.1 })])),
    [2, 1, 3],
  );
  assert.deepEqual(indexes(prioritySources([source(3), source(1), source(2)])), [1, 2, 3]);
});

test("priority is a total order when only some sources are judged", () => {
  // Mixing scales would make A > C (judge), B > A (rerank), C > B (rerank): a cycle.
  const a = source(1, { judge: judge(90), rerankScore: 0.1 });
  const b = source(2, { rerankScore: 0.5 });
  const c = source(3, { judge: judge(10), rerankScore: 0.9 });
  const perms = [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]];
  for (const p of perms) assert.deepEqual(indexes(prioritySources(p)), [1, 3, 2]);
  assert.ok(compareByPriority(a, c) < 0 && compareByPriority(c, b) < 0 && compareByPriority(a, b) < 0);
});

test("prioritySources does not mutate or renumber", () => {
  const list = [source(1, { judge: judge(10) }), source(2, { judge: judge(90) })];
  const sorted = prioritySources(list);
  assert.deepEqual(indexes(list), [1, 2]);
  assert.deepEqual(indexes(sorted), [2, 1]);
});

test("orderSources: cited first, each group by priority", () => {
  const list = [
    source(1, { judge: judge(60) }),
    source(2, { judge: judge(0, 90) }),
    source(3, { judge: judge(90) }),
    source(4, { judge: judge(0, 20) }),
  ];
  const { cited, unused } = orderSources(list, new Set([1, 3]));
  assert.deepEqual(indexes(cited), [3, 1]);
  assert.deepEqual(indexes(unused), [2, 4]);
});

test("citations outside the source range are ignored", () => {
  const answer = "Phishing lừa người dùng nhập mật khẩu [1]. MFA giúp chặn đăng nhập trái phép [2][9]. Câu khác [0].";
  assert.deepEqual([...citedIndexes(answer, 2)].sort(), [1, 2]);
  for (const c of citationClaims(answer, 2)) assert.ok(c.index >= 1 && c.index <= 2);
});

test("parseSources keeps a valid judge and drops a malformed one", () => {
  const out = parseSources([
    source(1, { judge: judge(50, 60) }),
    { ...source(2), judge: { questionRelevance: "x" } },
    { ...source(3), judge: "bad" },
  ])!;
  assert.deepEqual(out[0]?.judge, judge(50, 60));
  assert.equal(out[1]?.judge, undefined);
  assert.equal(out[2]?.judge, undefined);
});

test("parseSources keeps evidence that fits the chunk and drops the rest", () => {
  const s = source(1, { content: "0123456789" });
  const out = parseSources([
    {
      ...s,
      support: [
        { claim: "a", score: 0.5, evidence: { start: 2, end: 6 } },
        { claim: "b", score: 0.5, evidence: { start: 4, end: 99 } },
        { claim: "c", score: 0.5, evidence: { start: 5, end: 5 } },
        { claim: "d", score: 0.5 },
      ],
    },
  ])!;
  assert.deepEqual(out[0]?.support, [
    { claim: "a", score: 0.5, evidence: { start: 2, end: 6 } },
    { claim: "b", score: 0.5 },
    { claim: "c", score: 0.5 },
    { claim: "d", score: 0.5 },
  ]);
});
