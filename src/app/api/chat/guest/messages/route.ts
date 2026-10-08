import { chatMessageSchema } from "@/lib/validations";
import { getGuestQuota, getOrCreateGuestKey, incrementGuestQuota } from "@/lib/guest";
import { retrieveChunks, formatContext } from "@/lib/rag";
import { streamChatCompletion } from "@/lib/llm";
import { createSseResponse, streamLlmToSse } from "@/lib/sse";
import { jsonError } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = chatMessageSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid message", 400, "VALIDATION");
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

    const locale = parsed.data.locale ?? "vi";
    const history = parsed.data.history ?? [];
    const chunks = await retrieveChunks({
      query: parsed.data.content,
      visibilities: ["public"],
    });
    const context = formatContext(chunks);
    const tokens = await streamChatCompletion({
      messages: [...history, { role: "user", content: parsed.data.content }],
      context,
      locale,
      signal: req.signal,
    });

    const stream = await streamLlmToSse({ tokens });
    return createSseResponse(stream);
  } catch {
    return jsonError("Chat unavailable right now", 500, "SERVER");
  }
}
