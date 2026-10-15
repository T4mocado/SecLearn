import { chatMessageSchema } from "@/lib/validations";
import { getGuestQuota, getOrCreateGuestKey, incrementGuestQuota } from "@/lib/guest";
import { assertLlmConfigured } from "@/lib/llm";
import { answerQuestion } from "@/lib/chat-answer";
import { assertEmbedConfigured } from "@/lib/embed";
import { createSseResponse, streamLlmToSse } from "@/lib/sse";
import { finalizeSources } from "@/lib/verify";
import { jsonAppError, jsonError } from "@/lib/session";
import { isAppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let locale: string = "vi";
  try {
    const body = await req.json();
    const parsed = chatMessageSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid message", 400, "VALIDATION");
    }

    locale = parsed.data.locale ?? "vi";

    try {
      assertLlmConfigured();
      assertEmbedConfigured();
    } catch (err) {
      if (isAppError(err)) return jsonAppError(err, locale);
      throw err;
    }

    const guestKey = await getOrCreateGuestKey();
    const quota = await getGuestQuota(guestKey);
    if (quota.remaining <= 0) {
      return jsonError("Guest limit reached. Please sign in to continue.", 403, "GUEST_LIMIT");
    }

    const bumped = await incrementGuestQuota(guestKey);
    if (!bumped.ok) {
      return jsonError("Guest limit reached. Please sign in to continue.", 403, "GUEST_LIMIT");
    }

    // As sent by the client: answerQuestion drops refusals and strips the [n] markers itself.
    const history = (parsed.data.history ?? []).map((m) => ({ role: m.role, content: m.content }));
    const { tokens, sources } = await answerQuestion({
      question: parsed.data.content,
      history,
      visibilities: ["public"],
      locale,
      signal: req.signal,
    });

    const stream = await streamLlmToSse({
      tokens,
      sources,
      finalizeSources: (full) =>
        finalizeSources({ question: parsed.data.content, answer: full, sources, locale }),
    });
    return createSseResponse(stream);
  } catch (err) {
    if (isAppError(err)) return jsonAppError(err, locale);
    console.error("[guest/messages]", err);
    return jsonError("Chat unavailable right now", 500, "SERVER");
  }
}
