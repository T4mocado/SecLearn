import { chatMessageSchema } from "@/lib/validations";
import { getGuestQuota, getOrCreateGuestKey, incrementGuestQuota } from "@/lib/guest";
import { retrieveChunks, buildContext } from "@/lib/rag";
import { stripCitations } from "@/lib/sources";
import { assertLlmConfigured, streamChatCompletion } from "@/lib/llm";
import { fixedAnswer, noSourcesAnswer } from "@/lib/grounding";
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

    const history = (parsed.data.history ?? []).map((m) => ({
      role: m.role,
      content: m.role === "assistant" ? stripCitations(m.content) : m.content,
    }));
    const chunks = await retrieveChunks({
      query: parsed.data.content,
      visibilities: ["public"],
      history,
    });
    const { context, sources } = buildContext(chunks);
    // Nothing relevant in the documents: answering would mean using the model's own knowledge.
    const tokens = sources.length
      ? await streamChatCompletion({
          messages: [...history, { role: "user", content: parsed.data.content }],
          context,
          locale,
          signal: req.signal,
        })
      : fixedAnswer(noSourcesAnswer(locale));

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
