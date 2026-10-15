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
    "2. Cite every sentence that states a fact right after it, e.g. [1] or [2][3]. Only cite numbers that appear below, and do not add a separate reference list.",
    "3. A passage is relevant when it has information on the subject, even in other words or without a heading of that name " +
      '(e.g. "limit file upload size" is about limiting resources). Answer first with what the relevant passages say. ' +
      `Then, if part of the question is not covered, say which part (e.g. "${locale === "vi" ? "Tài liệu không đề cập đến" : "The documents do not cover"} ..."). ` +
      "Only when no passage has anything on the subject, say so in one or two sentences.",
    "4. You may rephrase, translate, summarise and structure the passages (headings, lists). Passages may be in English.",
    "5. Earlier answers in this conversation were also based on the documents; you may refer to them, but do not add facts that are not in the passages below.",
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

const OLDER_QUESTION_CHARS = 200;

/**
 * Added to the system prompt when the oldest turns are not sent (history over its limit): their
 * questions only, numbered in order, so "the first vulnerability" still resolves (docs/ERRORS.md #25).
 * Questions carry no facts; the answers, which do, stay out.
 */
export function olderQuestionsNote(questions: string[]): string {
  if (!questions.length) return "";
  const lines = questions.map((q, i) => {
    const flat = q.replace(/\s+/g, " ").trim();
    return `${i + 1}. ${flat.length > OLDER_QUESTION_CHARS ? `${flat.slice(0, OLDER_QUESTION_CHARS)}…` : flat}`;
  });
  return [
    "Earlier in this conversation, before the messages below, the user asked (oldest first; answers not shown):",
    ...lines,
  ].join("\n");
}

/**
 * Appended to the latest question when there are earlier turns. Earlier answers reach the model
 * without their [n] markers (they point at older passages), and in long chats the model copied that
 * style and stopped citing (docs/ERRORS.md #21); restating the rule right before the question keeps it.
 * Only about citing: "answer only from the passages above" made it refuse follow-ups whose passages
 * were relevant, 6/6 times (docs/ERRORS.md #22).
 */
export function citationReminder(locale: string): string {
  return locale === "vi"
    ? "\n\n(Hãy gắn [n] sau mỗi câu nêu thông tin lấy từ các đoạn tài liệu, kể cả khi các câu trả lời trước không có [n].)"
    : "\n\n(Put [n] after every sentence that states information from the passages, even though earlier answers show no [n].)";
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
 * Earlier turns as sent to the model, without refused exchanges: a refused follow-up was copied
 * word for word by the next one, 3/3 times, though its passages were relevant (docs/ERRORS.md #22).
 * The question goes too: left unanswered, the model answered it again from older answers and cited
 * the new passages for those facts (3/3).
 */
export function withoutRefusals<T extends { role: string; content: string }>(history: T[]): T[] {
  const out: T[] = [];
  for (const m of history) {
    if (m.role === "assistant" && isRefusal(m.content)) {
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
  /tài liệu (?:\S+ ){0,3}(?:không|chưa)|không (?:đề cập|có thông tin|nêu)|documents? (?:\S+ ){0,3}(?:do(?:es)? not|don't|doesn't)|not (?:mentioned|covered)|\?\s*$/i;

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
