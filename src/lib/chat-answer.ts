import type { DocVisibility } from "@prisma/client";
import { buildContext, retrieveChunks } from "@/lib/rag";
import { streamChatCompletion, type ChatTurn } from "@/lib/llm";
import { planSearch } from "@/lib/query";
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
  // The rewrite gets the history as stored: it numbers refused questions too and strips the markers.
  const plan = await planSearch(opts.question, opts.history);
  const { recent, questions, shownFrom } = historyForAnswer(opts.history);
  const note = questionsNote(questions, { shownFrom, understoodAs: plan.queries[1] });
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

  const chunks = await retrieveChunks({
    query: opts.question,
    visibilities: opts.visibilities,
    queries: plan.queries,
    carryChunkIds: carriedChunkIds(recent),
  });
  const { context, sources } = buildContext(chunks);
  const tokens = sources.length
    ? await streamChatCompletion({ messages, questionsNote: note, context, locale: opts.locale, signal: opts.signal })
    : fixedAnswer(noSourcesAnswer(opts.locale));
  return { tokens, sources };
}
