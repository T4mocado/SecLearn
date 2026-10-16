import { getEnv } from "@/lib/env";
import { completeText, type ChatTurn } from "@/lib/llm";
import { askedQuestions, UNANSWERED_MARK, type StoredTurn } from "@/lib/grounding";
import { stripCitations } from "@/lib/sources";

const REWRITE_TIMEOUT_MS = 8_000;
const REWRITE_MAX_TOKENS = 120;
/** Characters kept from each earlier user question sent for rewriting (all of them), and from the last answer. */
const QUESTION_CHARS = 120;
const ANSWER_CHARS = 300;
/** The rewrite model's answer when a message has nothing to search for. */
const NO_TOPIC = "NONE";
/** The rewrite model's answer when a message is about the conversation itself. */
const ABOUT_CHAT = "CONVERSATION";
/** A letter outside ASCII (Vietnamese diacritics, other scripts): the question is not plain English. */
const NON_ENGLISH_RE = /(?![\u0000-\u007f])\p{L}/u;

/**
 * - `search`: retrieve chunks with `queries` (the message, plus its standalone English rewrite: one
 *   query per topic when it asks about several).
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

/** Search queries at most per message: one per topic of a comparison. */
const MAX_TOPIC_QUERIES = 3;

/** The rewrite's queries, one per line (list markers and quotes dropped), at most MAX_TOPIC_QUERIES. */
export function parseRewrite(raw: string): string[] {
  const lines = raw
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^(?:[-*•]|\d+[.)])\s+/, "")
        .replace(/^["'“”]+|["'“”]+$/g, "")
        .trim(),
    )
    .filter(Boolean);
  return [...new Set(lines)].slice(0, MAX_TOPIC_QUERIES);
}

/**
 * Shared by both rewrite prompts. A comparison searched as one query ("comparison table password storage
 * session management JWT") scored every passage under 0.11; one query per topic scored 0.86-1.0. Passages
 * name SSRF "Server-Side Request Forgery", so the full name with the acronym found "A10 Server-Side
 * Request Forgery" (rerank 0.89) where "SSRF OWASP Top 10 category" did not (0.23) (docs/ERRORS.md #29).
 */
const QUERY_SHAPE = [
  'If the message asks about several distinct topics (a comparison, "X and Y"), write one query per topic, each on its own line, at most three; otherwise write one line.',
  'Write acronyms together with their full names (e.g. "Server-Side Request Forgery SSRF", "JSON Web Token JWT").',
].join(" ");

const shorten =(text: string, max: number) => {
  const flat = stripCitations(text).replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

/**
 * Every earlier user question (numbered, so "the first topic" or "the second vulnerability" can be
 * resolved however far back it is) and the last answer, shortened. Cheap in tokens. Keeping only the
 * last 10 questions lost the first topic from the 11th question on (docs/ERRORS.md #25).
 * Takes the history as stored, refusals included: refused questions keep their number, marked, so the
 * numbering matches the answer model's and a follow-up to one keeps its topic (docs/ERRORS.md #27).
 */
export function historyForRewrite(history: Array<ChatTurn & StoredTurn>): string {
  const questions = askedQuestions(history);
  if (!questions.length) return "";
  const lastAnswer = history.findLast((m) => m.role === "assistant");
  return [
    "Earlier questions (oldest first):",
    ...questions.map((q, i) => `${i + 1}. ${shorten(q.text, QUESTION_CHARS)}${q.answered ? "" : ` ${UNANSWERED_MARK}`}`),
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
      "Translate the user's message into an English search query for cybersecurity documentation.",
      "Keep technical terms, acronyms and product names. Do not answer it. Reply with the query only.",
      QUERY_SHAPE,
      `If the message has no topic to search for (a greeting, thanks, or an instruction like "shorter" or "explain more"), ` +
        `reply exactly ${NO_TOPIC}. Never invent a topic.`,
    ].join(" ");
  }
  return [
    "Rewrite the user's latest message as a standalone English search query for cybersecurity documentation.",
    "The query must be in English even when the conversation is not.",
    "Keep technical terms, acronyms and product names. Do not answer it. Reply with the query only.",
    QUERY_SHAPE,
    'Resolve references with the earlier questions: "it" or "that" is the most recent topic; ' +
      '"the first topic" or "the second vulnerability" counts topics in the order they were first asked.',
    "Include only the topic the latest message asks about; do not add terms from earlier questions it does not refer to.",
    "If it only asks to change the previous answer (shorter, more detail, an example, simpler), reply with a query for the topic of the previous question; " +
      "when that question was about several topics, one query per topic as above.",
    `If it asks about the conversation itself rather than a topic (summarise the whole discussion, what I asked earlier), reply exactly ${ABOUT_CHAT}. ` +
      "Asking only what an earlier question was, how many questions were asked, or which ones were not answered " +
      `("Câu hỏi thứ 6 của mình là gì?", "Mình đã hỏi bao nhiêu câu?") is about the conversation too: reply exactly ${ABOUT_CHAT}. ` +
      "Asking for information about an earlier question's topic " +
      '("Quay lại câu hỏi đầu tiên, có nên giới hạn độ dài không?", "Lỗ hổng ở câu thứ hai thuộc mục nào trong OWASP Top 10?") ' +
      "is a search: reply with a query for that topic. " +
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
export async function planSearch(query: string, history: Array<ChatTurn & StoredTurn> = []): Promise<SearchPlan> {
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
    const rewrites = parseRewrite(raw);
    const word = (rewrites[0] ?? "").toUpperCase().replace(/\W/g, "");
    if (word === ABOUT_CHAT && context) return { intent: "conversation", queries: [] };
    // No topic: search with the message alone, which finds nothing and gets the fixed reply.
    if (!rewrites.length || word === NO_TOPIC || word === ABOUT_CHAT) return original;
    const extra = rewrites.filter((q) => q.toLowerCase() !== query.trim().toLowerCase());
    return extra.length ? { intent: "search", queries: [query, ...extra] } : original;
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
