import type { DocVisibility } from "@prisma/client";
import { getEnv } from "@/lib/env";
import { buildContext, entityInDocuments, retrieveChunks, type RetrievedChunk } from "@/lib/rag";
import { streamChatCompletion, type ChatTurn } from "@/lib/llm";
import { planSearch, type SearchPlan } from "@/lib/query";
import {
  askedQuestions,
  fixedAnswer,
  noSourcesAnswer,
  questionsNote,
  withoutRefusals,
  type AskedQuestion,
} from "@/lib/grounding";
import { stripCitations, type MessageSource } from "@/lib/sources";

/**
 * Characters of earlier turns sent word for word with a question. Forty messages were ~28k
 * characters, all resent with every question (docs/ERRORS.md #25).
 */
export const HISTORY_CHAR_LIMIT = 12_000;

/**
 * Splits the history into the latest turns that fit `limit` (whole messages, starting at a question,
 * at least the last exchange) and the questions of the turns before them, oldest first.
 */
export function splitHistory<T extends ChatTurn>(
  history: T[],
  limit = HISTORY_CHAR_LIMIT,
): { recent: T[]; olderQuestions: string[] } {
  let start = history.length;
  let length = 0;
  while (start > 0) {
    const next = history[start - 1]!.content.length;
    if (history.length - start >= 2 && length + next > limit) break;
    length += next;
    start--;
  }
  while (start < history.length && history[start]!.role !== "user") start++;
  return {
    recent: history.slice(start),
    olderQuestions: history.slice(0, start).filter((m) => m.role === "user").map((m) => m.content),
  };
}

/**
 * An earlier turn. Signed-in chats store sources, so a stored answer also lists the chunks it cited and
 * says whether it was about the conversation itself (`isConversationAnswer`).
 */
export type HistoryTurn = ChatTurn & { citedChunkIds?: string[]; conversation?: boolean };

/**
 * Chunks cited by the answers in the turns sent to the model, newest answer first. A follow-up can
 * reuse any of them ("hai lỗ hổng này" took facts from the first and fourth answers), not only the
 * previous one (docs/ERRORS.md #26).
 */
export function carriedChunkIds(recent: HistoryTurn[]): string[] {
  return [...new Set(recent.toReversed().flatMap((m) => (m.role === "assistant" ? (m.citedChunkIds ?? []) : [])))];
}

/**
 * Carried chunks kept outside the top K: at most this many, only when they still score this much
 * against the question. Without the floor, kept chunks unrelated to the question pushed out better
 * ones and doubled weak citations (docs/ERRORS.md #26).
 */
const CARRY_KEEP = 2;
const CARRY_MIN_RELEVANCE = 0.1;

/**
 * Which earlier chunks to carry into retrieval. A REFORMAT request ("Trả lời lại bằng tiếng Việt") redoes
 * the earlier answer: the chunks every answer in the window cited stay, newest first, whatever they score
 * against the rewrite. Without them the model restated that answer and cited the new passages for it,
 * 10 weak citations in one answer (docs/ERRORS.md #32); with the previous answer's alone, "Giải thích đơn
 * giản hơn" re-explained the one before it too (#33).
 */
export function carryFor(
  recent: HistoryTurn[],
  reformat: boolean,
  topK: number,
): { ids: string[]; max: number; minRelevance: number; inOrder?: boolean } {
  const ids = carriedChunkIds(recent);
  // Newest answer first, kept in that order: picked by score, an older answer's chunks took the previous one's slots.
  return reformat ? { ids, max: topK, minRelevance: 0, inOrder: true } : { ids, max: CARRY_KEEP, minRelevance: CARRY_MIN_RELEVANCE };
}

/**
 * What the answer model gets from the stored history: the latest turns that fit `limit`, without
 * refused exchanges (#22) and [n] markers, plus every question numbered, refused ones marked, and the
 * number of the first question those turns show (null when they show none). The numbering is the
 * rewrite's (`historyForRewrite`), so both read "câu thứ 6" as the same question (docs/ERRORS.md #27).
 */
export function historyForAnswer(
  history: HistoryTurn[],
  limit = HISTORY_CHAR_LIMIT,
): { recent: HistoryTurn[]; questions: AskedQuestion[]; shownFrom: number | null } {
  // Refusals are dropped before the markers are stripped: a short answer with [n] is not one.
  const kept = withoutRefusals(history).map((m) =>
    m.role === "assistant" ? { ...m, content: stripCitations(m.content) } : m,
  );
  const { recent, olderQuestions } = splitHistory(kept, limit);
  const questions = askedQuestions(history);
  // The first answered question after those cut from the turns.
  let answered = 0;
  const first = recent.length
    ? questions.findIndex((q) => q.answered && answered++ === olderQuestions.length)
    : -1;
  return { recent, questions, shownFrom: first < 0 ? null : first + 1 };
}

/**
 * The search half of answering: plan the message, and for a search, the chunks to answer from.
 * A named entity the documents never mention (CVE-2021-44228, "Vietnam Cybersecurity Law") means
 * nothing to answer from, whatever the search returns (docs/ERRORS.md #34); REFORMAT plans carry none.
 */
export async function retrieveForQuestion(opts: {
  question: string;
  history: HistoryTurn[];
  visibilities: DocVisibility[];
  /** Turns sent to the answer model (`historyForAnswer`); computed from `history` when left out. */
  recent?: HistoryTurn[];
}): Promise<{ plan: SearchPlan; chunks: RetrievedChunk[] }> {
  const plan = await planSearch(opts.question, opts.history);
  if (plan.intent === "conversation") return { plan, chunks: [] };
  const recent = opts.recent ?? historyForAnswer(opts.history).recent;
  const [entityFound, chunks] = await Promise.all([
    plan.entity?.length ? entityInDocuments(plan.entity, opts.visibilities) : Promise.resolve(true),
    retrieveChunks({
      query: opts.question,
      visibilities: opts.visibilities,
      queries: plan.queries,
      carry: carryFor(recent, !!plan.reformat, getEnv().RAG_TOP_K),
      ...(plan.passage ? { passage: plan.passage } : {}),
    }),
  ]);
  return { plan, chunks: keepAfterEntityCheck(entityFound, chunks) };
}

/** Below this best question score, chunks found for an entity the documents never mention are not trusted. */
const ENTITY_MISSING_MIN = 0.3;

/**
 * A named entity the documents never mention leaves nothing to answer from, unless the search is sure of
 * its chunks: the rewrite once named a side detail ("ISP" for a DDoS question) and the question was
 * refused though the DoS passages scored 0.40 (docs/ERRORS.md #34).
 */
export function keepAfterEntityCheck<T extends { rerankScore?: number }>(entityFound: boolean, chunks: T[]): T[] {
  if (entityFound) return chunks;
  return chunks.some((c) => (c.rerankScore ?? 0) >= ENTITY_MISSING_MIN) ? chunks : [];
}

/**
 * Shared by the signed-in and guest chat routes: decides how to answer one question and returns
 * the token stream plus the sources shown with it.
 * - About the conversation itself: answered from the history, no retrieval and no sources.
 * - Otherwise: retrieve; nothing relevant means the fixed reply (no LLM call), since answering
 *   would mean using the model's own knowledge.
 */
export async function answerQuestion(opts: {
  question: string;
  /** Earlier turns as stored, assistant answers still with their [n] markers. */
  history: HistoryTurn[];
  visibilities: DocVisibility[];
  locale: string;
  signal?: AbortSignal;
}): Promise<{ tokens: AsyncGenerator<string, void, unknown>; sources: MessageSource[] }> {
  const { recent, questions, shownFrom } = historyForAnswer(opts.history);
  // The rewrite gets the history as stored: it numbers refused questions too and strips the markers.
  const { plan, chunks } = await retrieveForQuestion({ ...opts, recent });
  // One rewrite per topic when it asks about several.
  const note = questionsNote(questions, {
    shownFrom,
    understoodAs: plan.queries.slice(1).join("; ") || undefined,
    reformat: plan.reformat,
  });
  const messages: ChatTurn[] = [...recent.map(({ role, content }) => ({ role, content })), { role: "user", content: opts.question }];

  if (plan.intent === "conversation") {
    const tokens = await streamChatCompletion({
      messages,
      questionsNote: note,
      context: "",
      locale: opts.locale,
      mode: "conversation",
      signal: opts.signal,
    });
    return { tokens, sources: [] };
  }

  const { context, sources } = buildContext(chunks);
  const tokens = sources.length
    ? await streamChatCompletion({ messages, questionsNote: note, context, locale: opts.locale, signal: opts.signal })
    : fixedAnswer(noSourcesAnswer(opts.locale));
  return { tokens, sources };
}
