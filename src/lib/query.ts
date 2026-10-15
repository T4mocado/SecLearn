import { getEnv } from "@/lib/env";
import { completeText, type ChatTurn } from "@/lib/llm";
import { stripCitations } from "@/lib/sources";

const REWRITE_TIMEOUT_MS = 8_000;
const REWRITE_MAX_TOKENS = 120;
/** Earlier user questions sent for rewriting, and characters kept from each; plus the last answer. */
const HISTORY_QUESTIONS = 10;
const QUESTION_CHARS = 200;
const ANSWER_CHARS = 300;
/** The rewrite model's answer when a message has nothing to search for. */
const NO_TOPIC = "NONE";
/** The rewrite model's answer when a message is about the conversation itself. */
const ABOUT_CHAT = "CONVERSATION";
/** A letter outside ASCII (Vietnamese diacritics, other scripts): the question is not plain English. */
const NON_ENGLISH_RE = /(?![\u0000-\u007f])\p{L}/u;

/**
 * - `search`: retrieve chunks with `queries` (the message, plus its standalone English rewrite).
 * - `conversation`: the message is about the conversation itself ("tóm tắt lại", "câu đầu tiên mình
 *   hỏi là gì"); answer from the earlier messages, without retrieval (docs/ERRORS.md #21).
 */
export type SearchPlan = { intent: "search" | "conversation"; queries: string[] };

/**
 * Most of the corpus is English, and the cross-encoder scores a Vietnamese question against an
 * English chunk ~100x lower than the same question in English (docs/ERRORS.md #10, #17), so
 * retrieval also searches with an English version of a non-English question.
 * Unaccented Vietnamese ("phong chong xss") looks like English and is not translated.
 */
export function needsTranslation(query: string): boolean {
  return NON_ENGLISH_RE.test(query);
}

function cleanRewrite(raw: string): string {
  return raw
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .split("\n")[0]!
    .trim();
}

const shorten = (text: string, max: number) => {
  const flat = stripCitations(text).replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

/**
 * Every earlier user question (numbered, so "the first topic" or "the second vulnerability" can be
 * resolved however far back it is) and the last answer, shortened. Cheap in tokens.
 */
export function historyForRewrite(history: ChatTurn[]): string {
  const questions = history.filter((m) => m.role === "user").slice(-HISTORY_QUESTIONS);
  if (!questions.length) return "";
  const lastAnswer = history.findLast((m) => m.role === "assistant");
  return [
    "Earlier questions (oldest first):",
    ...questions.map((m, i) => `${i + 1}. ${shorten(m.content, QUESTION_CHARS)}`),
    ...(lastAnswer ? [`Last answer: ${shorten(lastAnswer.content, ANSWER_CHARS)}`] : []),
  ].join("\n");
}

/**
 * With a conversation, "shorter" or "explain more" is about the previous question's topic; without
 * one it has no topic, and the model must say so rather than invent one (it once turned
 * "Trả lời ngắn gọn" into "what is the NIST Cybersecurity Framework").
 */
export function rewritePrompt(hasConversation: boolean): string {
  if (!hasConversation) {
    return [
      "Translate the user's message into one English search query for cybersecurity documentation.",
      "Keep technical terms, acronyms and product names. Do not answer it. Reply with the query only.",
      `If the message has no topic to search for (a greeting, thanks, or an instruction like "shorter" or "explain more"), ` +
        `reply exactly ${NO_TOPIC}. Never invent a topic.`,
    ].join(" ");
  }
  return [
    "Rewrite the user's latest message as one standalone English search query for cybersecurity documentation.",
    "The query must be in English even when the conversation is not.",
    "Keep technical terms, acronyms and product names. Do not answer it. Reply with the query only.",
    'Resolve references with the earlier questions: "it" or "that" is the most recent topic; ' +
      '"the first topic" or "the second vulnerability" counts topics in the order they were first asked.',
    "Include only the topic the latest message asks about; do not add terms from earlier questions it does not refer to.",
    "If it only asks to change the previous answer (shorter, more detail, an example, simpler), reply with a query for the topic of the previous question.",
    `If it asks about the conversation itself rather than a topic (summarise the whole discussion, what I asked earlier), reply exactly ${ABOUT_CHAT}. ` +
      'Asking for the previous answer again in another form ("Trả lời ngắn gọn lại ý vừa rồi", "explain it more simply") ' +
      "is the rule above, not this one: reply with a query for that topic, so the new answer can cite the documents again.",
    `Reply exactly ${NO_TOPIC} only for greetings or thanks.`,
  ].join(" ");
}

/**
 * What to do with a message: search with it plus one standalone English query when it is not
 * English or follows earlier turns ("Trả lời ngắn gọn" alone finds nothing), or answer from the
 * conversation. One short LLM call (~150 tokens); any failure just means searching with the original.
 */
export async function planSearch(query: string, history: ChatTurn[] = []): Promise<SearchPlan> {
  const env = getEnv();
  const original: SearchPlan = { intent: "search", queries: [query] };
  const context = historyForRewrite(history);
  if (env.RAG_TRANSLATE_QUERY === "off" || env.LLM_PROVIDER === "mock") return original;
  if (!context && !needsTranslation(query)) return original;
  try {
    const raw = await completeText({
      system: rewritePrompt(!!context),
      user: context ? `${context}\n\nLatest message: ${query}` : query,
      maxTokens: REWRITE_MAX_TOKENS,
      signal: AbortSignal.timeout(REWRITE_TIMEOUT_MS),
    });
    const rewritten = cleanRewrite(raw);
    const word = rewritten.toUpperCase().replace(/\W/g, "");
    if (word === ABOUT_CHAT && context) return { intent: "conversation", queries: [] };
    // No topic: search with the message alone, which finds nothing and gets the fixed reply.
    if (!rewritten || word === NO_TOPIC || word === ABOUT_CHAT) return original;
    return rewritten.toLowerCase() !== query.trim().toLowerCase()
      ? { intent: "search", queries: [query, rewritten] }
      : original;
  } catch (err) {
    console.warn("[query] rewrite failed, searching with the original:", err instanceof Error ? err.message : err);
    return original;
  }
}

/** Queries to retrieve with (see `planSearch`); a conversation question still gets the message itself. */
export async function searchQueries(query: string, history: ChatTurn[] = []): Promise<string[]> {
  const plan = await planSearch(query, history);
  return plan.queries.length ? plan.queries : [query];
}
