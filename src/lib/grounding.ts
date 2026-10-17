import { maskCode, type TextRange } from "@/lib/sources";

/**
 * Answers come only from the uploaded documents. These helpers enforce that around the LLM:
 * the system prompt, the fixed reply when retrieval finds nothing (no LLM call), and spotting
 * answer sentences that state something without citing a passage.
 */

const TOPICS_VI = "mật khẩu mạnh, xác thực đa yếu tố (MFA), SQL injection, XSS, quản lý phiên đăng nhập";
const TOPICS_EN = "strong passwords, multi-factor authentication (MFA), SQL injection, XSS, session management";

/** Reply when no chunk is relevant: answering anyway could only come from the model's own knowledge. */
export function noSourcesAnswer(locale: string): string {
  return locale === "vi"
    ? "Mình không tìm thấy nội dung liên quan trong tài liệu SecLearn nên không thể trả lời câu này. " +
        "SecLearn chỉ trả lời dựa trên các tài liệu đã được tải lên.\n\n" +
        `Bạn có thể hỏi về các chủ đề có trong tài liệu, ví dụ: ${TOPICS_VI}.`
    : "I could not find anything related in the SecLearn documents, so I can't answer this. " +
        "SecLearn only answers from the uploaded documents.\n\n" +
        `You can ask about topics the documents cover, for example: ${TOPICS_EN}.`;
}

/** The fixed reply as a token stream, so routes handle it like an LLM answer. */
export async function* fixedAnswer(text: string): AsyncGenerator<string, void, unknown> {
  yield text;
}

export function groundedSystemPrompt(context: string, locale: string): string {
  return [
    "You are SecLearn, a beginner cybersecurity tutor. You answer ONLY from the numbered SecLearn document passages below.",
    "Rules:",
    "1. Use only facts stated in the passages. Do not add facts, examples, numbers, tools or advice from your own knowledge, even when you are sure they are correct.",
    "2. Cite every sentence that states a fact right after it, e.g. [1] or [2][3]. Only cite numbers that appear below, and do not add a separate reference list. " +
      "Never put [n] on a sentence or table cell that only says the passages do not cover something, or on what the user asked earlier: no passage states it.",
    "3. A passage is relevant when it has information on the subject, even in other words or without a heading of that name " +
      '(e.g. "limit file upload size" is about limiting resources). Answer first with what the relevant passages say. ' +
      // The search sees 5 passages, not the whole library: "Tài liệu không đề cập OAuth2" was false when it
      // had missed them (docs/ERRORS.md #34).
      `Then, if part of the question is not covered, say which part (e.g. "${locale === "vi" ? "Các đoạn tài liệu tìm được không đề cập đến" : "The passages found do not cover"} ..."). ` +
      "Only when no passage has anything on the subject, say so in one or two sentences.",
    "4. You may rephrase, translate, summarise and structure the passages (headings, lists). Passages may be in English.",
    "5. Earlier answers in this conversation were also based on the documents; you may refer to them, but do not add facts that are not in the passages below. " +
      "A fact that is only in an earlier answer, not in the passages below, must not be repeated: citing a passage below for it would be wrong.",
    "6. Never invent CVE numbers or claim access to private data.",
    `Answer in ${locale === "vi" ? "Vietnamese" : "English"}.`,
    `Passages:\n---\n${context}\n---`,
  ].join("\n");
}

/**
 * Questions about the conversation itself ("summarise", "what did I ask first") are answered from
 * the earlier messages only: they were document-based, and nothing new may be added.
 */
export function conversationSystemPrompt(locale: string): string {
  return [
    "You are SecLearn, a beginner cybersecurity tutor. The user is asking about this conversation itself",
    "(for example a summary of what was discussed, or what they asked earlier).",
    "Answer only from the earlier messages of this conversation. Do not add facts, examples or advice that are not in them,",
    "and do not use citation numbers like [1].",
    "If the user actually asks for new information, say that you can answer it if they ask it as a question about the documents.",
    `Answer in ${locale === "vi" ? "Vietnamese" : "English"}.`,
  ].join(" ");
}

const NOTE_QUESTION_CHARS = 200;

/** An earlier question; `answered` is false when the reply was a refusal (left out of the turns sent). */
export type AskedQuestion = { text: string; answered: boolean };

/** Appended to a refused question wherever questions are listed, for the rewrite and the answer model alike. */
export const UNANSWERED_MARK = "(not answered: nothing in the documents)";

/**
 * Every user question in order, refused ones included and marked. Needs the stored answers with
 * their [n] markers (`isRefusal`). Dropping refused questions shifted the numbering: "câu hỏi thứ 6"
 * became the 8th question and 14 questions were counted as 9 (docs/ERRORS.md #27).
 */
export function askedQuestions(history: StoredTurn[]): AskedQuestion[] {
  return history.flatMap((m, i) => {
    if (m.role !== "user") return [];
    const reply = history[i + 1];
    return [{ text: m.content, answered: !(reply && isRefusedTurn(reply)) }];
  });
}

/**
 * Added to the system prompt for follow-ups: every earlier question numbered as the rewrite numbers
 * them, which of them the turns below show, and the rewrite's reading of the latest message. The
 * model counted only the turns it saw, so "câu thứ hai" became question 7 while the search used
 * question 2 (docs/ERRORS.md #27). Questions carry no facts; answers cut from the turns stay out (#25).
 */
export function questionsNote(
  questions: AskedQuestion[],
  opts: { shownFrom: number | null; understoodAs?: string; reformat?: boolean },
): string {
  if (!questions.length) return "";
  const latest = questions.length + 1;
  const lines = questions.map((q, i) => {
    const flat = q.text.replace(/\s+/g, " ").trim();
    const text = flat.length > NOTE_QUESTION_CHARS ? `${flat.slice(0, NOTE_QUESTION_CHARS)}…` : flat;
    return `${i + 1}. ${text}${q.answered ? "" : ` ${UNANSWERED_MARK}`}`;
  });
  const shown =
    opts.shownFrom === null
      ? "No earlier answers are shown."
      : `The messages below show questions ${opts.shownFrom}–${questions.length} with their answers, except unanswered ones; ` +
        "answers to earlier questions are not shown.";
  return [
    `Questions the user asked earlier in this conversation, numbered in order (oldest first; the latest message is question ${latest}). ` +
      'Use this numbering for "the first question", "question 6" or how many questions were asked:',
    ...lines,
    shown,
    ...(opts.understoodAs ? [`The latest message (question ${latest}) was understood as: "${opts.understoodAs}"`] : []),
    // "Giải thích đơn giản hơn" came back longer, with new topics cited to the old passages (docs/ERRORS.md #33).
    ...(opts.reformat
      ? ["The latest message asks to redo the earlier answer in another form (simpler, shorter, another language): keep to its facts and add no new topics."]
      : []),
  ].join("\n");
}

/**
 * Appended to the latest question when there are earlier turns. Earlier answers reach the model
 * without their [n] markers (they point at older passages), and in long chats the model copied that
 * style and stopped citing (docs/ERRORS.md #21); restating the rule right before the question keeps it.
 * Only about citing: "answer only from the passages above" made it refuse follow-ups whose passages
 * were relevant, 6/6 times (docs/ERRORS.md #22). It also says which sentences get none: "the documents
 * do not cover …" was cited [1]…[5] (docs/ERRORS.md #32).
 */
export function citationReminder(locale: string): string {
  return locale === "vi"
    ? "\n\n(Hãy gắn [n] sau mỗi câu nêu thông tin lấy từ các đoạn tài liệu, kể cả khi các câu trả lời trước không có [n]; " +
        "không gắn [n] cho câu chỉ nói các đoạn tài liệu không đề cập.)"
    : "\n\n(Put [n] after every sentence that states information from the passages, even though earlier answers show no [n]; " +
        "no [n] on a sentence that only says the passages do not cover something.)";
}

/** Short replies saying the documents lack something: the fixed reply, or a model refusal. */
const REFUSAL_RE =
  /không (?:tìm thấy nội dung liên quan|đề cập|có thông tin)|không thể (?:nói|trả lời)|could not find anything related|do(?:es)? not (?:cover|mention)|can(?:not|'t) (?:answer|say more)/i;
const REFUSAL_MAX = 400;

/** Needs the stored answer with its [n] markers: a short cited answer saying part is missing is not a refusal. */
export function isRefusal(content: string): boolean {
  return content.length <= REFUSAL_MAX && REFUSAL_RE.test(content) && !/\[\d{1,2}\]/.test(content);
}

/**
 * A stored turn. `conversation`: an answer about the conversation itself (no passages, so never [n]),
 * known only where sources are stored (signed-in chats).
 */
export type StoredTurn = { role: string; content: string; conversation?: boolean };

/** A stored answer about the conversation itself: no passages stored, and not the fixed no-sources reply. */
export function isConversationAnswer(content: string, storedSources: number): boolean {
  // Document answers store their passages; the fixed reply stores none but is a refusal.
  return storedSources === 0 && content !== noSourcesAnswer("vi") && content !== noSourcesAnswer("en");
}

/**
 * A refused answer. One about the conversation is not: listing "câu 6 và 7: tài liệu không đề cập…"
 * matched the refusal wording, so the question was marked unanswered and dropped (docs/ERRORS.md #28).
 */
export function isRefusedTurn(m: StoredTurn): boolean {
  return m.role === "assistant" && !m.conversation && isRefusal(m.content);
}

/**
 * Earlier turns as sent to the model, without refused exchanges: a refused follow-up was copied
 * word for word by the next one, 3/3 times, though its passages were relevant (docs/ERRORS.md #22).
 * The question goes too: left unanswered, the model answered it again from older answers and cited
 * the new passages for those facts (3/3).
 */
export function withoutRefusals<T extends StoredTurn>(history: T[]): T[] {
  const out: T[] = [];
  for (const m of history) {
    if (isRefusedTurn(m)) {
      if (out.at(-1)?.role === "user") out.pop();
      continue;
    }
    out.push(m);
  }
  return out;
}

const CITATION_RE = /\[(\d{1,2})\]/g;
/**
 * A sentence ends at ., ! or ? followed by a space or the line end ("99.9%" and "v4.2" don't end
 * one); citation markers right after the end ("Sentence. [1]") stay in that sentence.
 */
const SENTENCE_RE = /(?:[^.!?]|[.!?](?!\s|$))+(?:[.!?]+(?=\s|$)(?:\s*\[\d{1,2}\])*)?/g;
const UNCITED_MIN = 25;
/** Sentences that state nothing to cite: saying the documents lack something, or asking back. */
const NO_CLAIM_RE =
  /tài liệu (?:\S+ ){0,3}(?:không|chưa)|không (?:đề cập|có thông tin|nêu)|(?:documents?|passages?) (?:\S+ ){0,3}(?:do(?:es)? not|don't|doesn't)|not (?:mentioned|covered)|\?\s*$/i;

/**
 * Answer sentences that make a statement without a valid `[n]` citation, as ranges in `content`.
 * Skips code, headings, table rows, short fragments, lead-ins ending with ":" and sentences that
 * only say the documents lack something. Nothing is flagged when there are no sources.
 */
export function uncitedSentences(content: string, sourceCount: number): TextRange[] {
  if (!sourceCount) return [];
  const masked = maskCode(content);
  const out: TextRange[] = [];
  let lineStart = 0;
  for (const line of masked.split("\n")) {
    const offset = lineStart;
    lineStart += line.length + 1;
    if (/^\s*(?:#{1,6}\s|\|)/.test(line)) continue;
    for (const m of line.matchAll(SENTENCE_RE)) {
      const raw = m[0];
      const cited = [...raw.matchAll(CITATION_RE)].some((c) => {
        const n = Number(c[1]);
        return n >= 1 && n <= sourceCount;
      });
      if (cited) continue;
      const lead = raw.length - raw.trimStart().length;
      const start = offset + m.index + lead;
      const end = offset + m.index + raw.trimEnd().length;
      const text = content
        .slice(start, end)
        .replace(/^(?:[-*+]|\d+\.)\s+/, "")
        .replace(/[*_`]/g, "")
        .trim();
      if (text.length < UNCITED_MIN || text.endsWith(":") || NO_CLAIM_RE.test(text)) continue;
      // Skip the list marker so only the sentence itself is underlined.
      const marker = /^(?:[-*+]|\d+\.)\s+/.exec(content.slice(start, end))?.[0].length ?? 0;
      out.push({ start: start + marker, end });
    }
  }
  return out;
}
