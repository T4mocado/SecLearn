import { getEnv } from "@/lib/env";
import { completeText, type ChatTurn } from "@/lib/llm";
import { askedQuestions, UNANSWERED_MARK, type StoredTurn } from "@/lib/grounding";
import { stripCitations } from "@/lib/sources";

const REWRITE_TIMEOUT_MS = 8_000;
/** Room for up to three queries plus the COMPARE, ASPECTS, PASSAGE and ENTITY lines. */
const REWRITE_MAX_TOKENS = 400;
/** Characters kept from each earlier user question sent for rewriting (all of them), and from the last answer. */
const QUESTION_CHARS = 120;
const ANSWER_CHARS = 300;
/** The rewrite model's answer when a message has nothing to search for. */
const NO_TOPIC = "NONE";
/** The rewrite model's answer when a message is about the conversation itself. */
const ABOUT_CHAT = "CONVERSATION";
/** First line of the rewrite when a message only asks to change the previous answer. */
const REFORMAT = "REFORMAT";
/** Rewrite lines that are not queries: a hypothetical answer passage (HyDE) and the entity asked about. */
const PASSAGE_PREFIX = "PASSAGE:";
const ENTITY_PREFIX = "ENTITY:";
/** Rewrite lines naming what a comparison compares and on which aspects; the queries are built from them (`compareQueries`). */
const COMPARE_PREFIX = "COMPARE:";
const ASPECTS_PREFIX = "ASPECTS:";
const NOT_QUERY_PREFIXES = [PASSAGE_PREFIX, ENTITY_PREFIX, COMPARE_PREFIX, ASPECTS_PREFIX];
const isPrefixed = (line: string, prefix: string) => line.trim().toUpperCase().startsWith(prefix);
/** The text after `prefix` on the first line that starts with it. */
const prefixedLine = (raw: string, prefix: string) =>
  raw.split("\n").find((l) => isPrefixed(l, prefix))?.trim().slice(prefix.length).trim();
/** A letter outside ASCII (Vietnamese diacritics, other scripts): the question is not plain English. */
const NON_ENGLISH_RE = /(?![\u0000-\u007f])\p{L}/u;

/**
 * - `search`: retrieve chunks with `queries` (the message, plus its standalone English rewrite: one
 *   query per topic when it asks about several).
 * - `conversation`: the message is about the conversation itself ("tóm tắt lại", "câu đầu tiên mình
 *   hỏi là gì"); answer from the earlier messages, without retrieval (docs/ERRORS.md #21).
 */
export type SearchPlan = {
  intent: "search" | "conversation";
  queries: string[];
  /**
   * The message only asks to change the previous answer ("Trả lời lại bằng tiếng Việt", "ngắn gọn hơn"): its
   * passages must be there again, or the model restates its facts and cites the new ones (docs/ERRORS.md #32).
   */
  reformat?: boolean;
  /**
   * HyDE: what a passage answering the message would say, in English. Only searched with and scored
   * against; relevance is still judged against the message (docs/ERRORS.md #34).
   */
  passage?: string;
  /** The named thing asked about (CVE ID, protocol, product, law…), spellings as the documents may write it. */
  entity?: string[];
  /**
   * A comparison: the items compared and the aspects named, which `queries` were built from. "Lập bảng so sánh
   * TOTP, SMS OTP và FIDO2" came back as one query 3/3 times and "ba lỗ hổng đó" 6/6 (docs/ERRORS.md #35).
   */
  compare?: { items: string[]; aspects?: string[]; truncated?: boolean };
};

/**
 * Most of the corpus is English, and the cross-encoder scores a Vietnamese question against an
 * English chunk ~100x lower than the same question in English (docs/ERRORS.md #10, #17), so
 * retrieval also searches with an English version of a non-English question.
 */
export function needsTranslation(query: string): boolean {
  return NON_ENGLISH_RE.test(query) || looksUnaccentedVietnamese(query);
}

/** Word pairs of unaccented Vietnamese that English text does not contain. */
const VI_PAIRS_RE = /\b(?:la gi|the nao|tai sao|lam sao|co nen|phong chong|bao mat|tan cong|mat khau|nhu the|cach nao|nhung gi)\b/i;
/** Unaccented Vietnamese words that are not English words. */
const VI_WORDS_RE = /\b(?:khong|duoc|nhung|cua|nen|voi|cach|chong|gi|nao|sao|dang|nhu)\b/gi;

/**
 * Vietnamese typed without accents ("phong chong clickjacking the nao") has only ASCII letters. Searched
 * as it is, nothing scored above 0.021, so the stricter threshold refused it (docs/ERRORS.md #31).
 */
function looksUnaccentedVietnamese(query: string): boolean {
  return VI_PAIRS_RE.test(query) || new Set(query.toLowerCase().match(VI_WORDS_RE) ?? []).size >= 2;
}

/** Search queries at most per message: one per topic of a comparison. */
const MAX_TOPIC_QUERIES = 3;

/** The rewrite's queries, one per line (list markers and quotes dropped), at most MAX_TOPIC_QUERIES. */
export function parseRewrite(raw: string): string[] {
  const lines = raw
    .split("\n")
    .filter((line) => !NOT_QUERY_PREFIXES.some((prefix) => isPrefixed(line, prefix)))
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

/** Items and aspects kept from the COMPARE and ASPECTS lines, and the queries they may build at most. */
const MAX_COMPARE_ITEMS = 4;
const MAX_ASPECTS = 3;
const MAX_CELL_QUERIES = 6;

/** The " | "-separated values of a COMPARE or ASPECTS line, deduplicated. */
const listLine = (raw: string, prefix: string, max: number) => {
  const values = (prefixedLine(raw, prefix) ?? "").split("|").map((v) => v.trim()).filter(Boolean);
  return values.filter((v, i) => values.findIndex((o) => o.toLowerCase() === v.toLowerCase()) === i).slice(0, max);
};

/**
 * One query per item, or per (item, aspect) cell when there are aspects and at most MAX_CELL_QUERIES cells: "XSS attack
 * mechanism and prevention" found definition chunks only, and the CSRF and SQL injection defences were answered as not
 * covered although aspect queries found them at 0.97-0.99 (docs/ERRORS.md #35). Over the cap, one query per item with
 * its aspects, as before.
 */
export function compareQueries(items: string[], aspects: string[] = []): { queries: string[]; truncated: boolean } {
  if (!aspects.length) return { queries: items, truncated: false };
  if (items.length * aspects.length <= MAX_CELL_QUERIES) {
    return { queries: items.flatMap((item) => aspects.map((aspect) => `${item} ${aspect}`)), truncated: false };
  }
  return { queries: items.map((item) => `${item} ${aspects.join(" and ")}`), truncated: true };
}

/**
 * Shared by both rewrite prompts. A comparison searched as one query ("comparison table password storage
 * session management JWT") scored every passage under 0.11; one query per topic scored 0.86-1.0. Passages
 * name SSRF "Server-Side Request Forgery", so the full name with the acronym found "A10 Server-Side
 * Request Forgery" (rerank 0.89) where "SSRF OWASP Top 10 category" did not (0.23) (docs/ERRORS.md #29).
 */
const QUERY_SHAPE = [
  // With the COMPARE and ASPECTS lines the model left out the query line 5/60 times ("Lỗ hổng ở câu số 9 thuộc mục
  // nào trong OWASP Top 10?" came back as ENTITY and PASSAGE only) and the search fell back to the Vietnamese message (docs/ERRORS.md #35).
  "Always start with the query line or lines: plain English search queries with no prefix, never the message copied as it is. " +
    "Every line that starts with a prefix below comes after them.",
  'If the message asks about several distinct topics (a comparison, "X and Y"), write one query per topic, each on its own line, at most three; otherwise write one line.',
  'Write acronyms together with their full names (e.g. "Server-Side Request Forgery SSRF", "JSON Web Token JWT").',
  // HyDE: "STRIDE threat modeling acronym" scored the STRIDE table 0.05-0.09, its expansion 0.95 (docs/ERRORS.md #34).
  `After the query lines, add a line starting with "${PASSAGE_PREFIX} " and 2-3 short English sentences that a documentation passage ` +
    "answering the message would contain, with the standard terms and full names; it is only used for searching and never shown.",
  `If the message asks about a specific named thing (a CVE ID, protocol, standard, product, tool, law or acronym), add a line starting with ` +
    `"${ENTITY_PREFIX} " with its name as the documents would write it, other spellings separated by " | ".`,
  // "Lập bảng so sánh TOTP, SMS OTP và FIDO2" came back as one query 3/3 times, "ba lỗ hổng đó" 6/6 (docs/ERRORS.md #35).
  `If the message compares two or more things, in any wording (so sánh, lập bảng so sánh, khác gì, phân biệt, cái nào tốt hơn, nên chọn cái nào, A hay B, ` +
    `ưu nhược điểm của A và B), add a line starting with "${COMPARE_PREFIX} " listing each thing separated by " | ", at most four, ` +
    "each written as a standalone search phrase: full name with acronym, plus any qualifier the message applies to all of them. " +
    'This includes plural references to things named in earlier questions ("ba lỗ hổng đó", "các phương thức đó", "hai cái đó"): list them by name. ' +
    `If the message also names what to compare them on (cách tấn công và cách phòng chống, độ an toàn và chi phí, mức độ nguy hiểm), add a line starting with ` +
    `"${ASPECTS_PREFIX} " listing those aspects in English separated by " | ", at most three; never add aspects the message does not name. ` +
    "A question about one thing that mentions another (how CSP prevents XSS) is not a comparison. " +
    'Examples: "Lập bảng so sánh TOTP, SMS OTP và khóa FIDO2" → "COMPARE: Time-based One-Time Password TOTP | SMS One-Time Password OTP | FIDO2 hardware security key". ' +
    '"So sánh XSS và CSRF về cách tấn công và cách phòng chống" → "COMPARE: Cross-Site Scripting XSS | Cross-Site Request Forgery CSRF" and ' +
    '"ASPECTS: attack mechanism | prevention".',
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
      "Keep technical terms, acronyms and product names. Do not answer it. Reply only with the lines described here.",
      QUERY_SHAPE,
      `Leave out the ${COMPARE_PREFIX}, ${ASPECTS_PREFIX}, ${PASSAGE_PREFIX} and ${ENTITY_PREFIX} lines when you reply ${NO_TOPIC}.`,
      `If the message has no subject to search for (only a greeting, thanks, or an instruction about the answer itself like "shorter" or "explain more"), ` +
        `reply exactly ${NO_TOPIC}. Never invent a topic.`,
      // "Mật khẩu mạnh cần những gì?" came back NONE 5/6 times (docs/ERRORS.md #31).
      'A question about a security subject, even in everyday words ("Mật khẩu mạnh cần những gì?", "Có nên log mật khẩu không?"), ' +
        "has a subject: translate it.",
    ].join(" ");
  }
  return [
    "Rewrite the user's latest message as a standalone English search query for cybersecurity documentation.",
    "The query must be in English even when the conversation is not.",
    "Keep technical terms, acronyms and product names. Do not answer it. Reply only with the lines described here.",
    QUERY_SHAPE,
    `Leave out the ${COMPARE_PREFIX}, ${ASPECTS_PREFIX}, ${PASSAGE_PREFIX} and ${ENTITY_PREFIX} lines when you reply ${NO_TOPIC} or ${ABOUT_CHAT}, and after ${REFORMAT}.`,
    'Resolve references with the earlier questions: "it" or "that" is the most recent topic; ' +
      '"the first topic" or "the second vulnerability" counts topics in the order they were first asked.',
    "Include only the topic the latest message asks about; do not add terms from earlier questions it does not refer to.",
    "If it only asks to change the previous answer (shorter, more detail, an example, simpler, another language), reply with a first line " +
      `${REFORMAT}, then a query for the topic of the previous question; when that question was about several topics, one query per topic as above.`,
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
 * What to do with a message: search with it plus standalone English queries (one per topic) and a
 * HyDE passage, or answer from the conversation. English first questions are rewritten too: alone,
 * "Compare OAuth2 and SAML" was searched as one query, found only SAML passages and the answer said
 * the documents do not cover OAuth2 (docs/ERRORS.md #34). One short LLM call; any failure just means
 * searching with the original.
 */
export async function planSearch(query: string, history: Array<ChatTurn & StoredTurn> = []): Promise<SearchPlan> {
  const env = getEnv();
  const original: SearchPlan = { intent: "search", queries: [query] };
  const context = historyForRewrite(history);
  if (env.RAG_TRANSLATE_QUERY === "off" || env.LLM_PROVIDER === "mock") return original;
  try {
    const raw = await completeText({
      system: rewritePrompt(!!context),
      user: context ? `${context}\n\nLatest message: ${query}` : query,
      maxTokens: REWRITE_MAX_TOKENS,
      signal: AbortSignal.timeout(REWRITE_TIMEOUT_MS),
    });
    return planFromRewrite(raw, query, !!context);
  } catch (err) {
    console.warn("[query] rewrite failed, searching with the original:", err instanceof Error ? err.message : err);
    return original;
  }
}

/** The plan a rewrite reply stands for (see `rewritePrompt`); `hasConversation` as the prompt was chosen. */
export function planFromRewrite(raw: string, query: string, hasConversation: boolean): SearchPlan {
  const original: SearchPlan = { intent: "search", queries: [query] };
  const marked = raw.trim().toUpperCase().startsWith(REFORMAT);
  const lines = parseRewrite(marked ? raw.trim().slice(REFORMAT.length).replace(/^[:\s]+/, "") : raw);
  const reformat = hasConversation && marked;
  const word = (lines[0] ?? "").toUpperCase().replace(/\W/g, "");
  if (word === ABOUT_CHAT && hasConversation) return { intent: "conversation", queries: [] };
  // A comparison: its queries are built here rather than taken from the model's query lines, which it
  // often leaves out once it writes COMPARE, after REFORMAT too (docs/ERRORS.md #35).
  const items = listLine(raw, COMPARE_PREFIX, MAX_COMPARE_ITEMS);
  const comparing = items.length >= 2;
  // No topic: search with the message alone, which finds nothing and gets the fixed reply.
  if ((!lines.length && !comparing) || word === NO_TOPIC || word === ABOUT_CHAT) return original;
  const extra = lines.filter((q) => q.toLowerCase() !== query.trim().toLowerCase());
  // Redoing the previous answer: no HyDE passage (no new topics) and no entity check (docs/ERRORS.md #34);
  // its query lines, or the items when it only wrote COMPARE.
  if (reformat) return { intent: "search", queries: [query, ...(lines.length ? extra : items)], reformat: true };
  const passage = prefixedLine(raw, PASSAGE_PREFIX);
  const entity = prefixedLine(raw, ENTITY_PREFIX)?.split("|").map((e) => e.trim()).filter(Boolean);
  const aspects = comparing ? listLine(raw, ASPECTS_PREFIX, MAX_ASPECTS) : [];
  const cells = comparing ? compareQueries(items, aspects) : null;
  return {
    intent: "search",
    queries: [query, ...(cells ? cells.queries : extra)],
    ...(passage ? { passage } : {}),
    ...(entity?.length ? { entity } : {}),
    ...(cells ? { compare: { items, ...(aspects.length ? { aspects } : {}), ...(cells.truncated ? { truncated: true } : {}) } } : {}),
  };
}

/** Queries to retrieve with (see `planSearch`); a conversation question still gets the message itself. */
export async function searchQueries(query: string, history: ChatTurn[] = []): Promise<string[]> {
  const plan = await planSearch(query, history);
  return plan.queries.length ? plan.queries : [query];
}
