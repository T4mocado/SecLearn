import { prisma } from "@/lib/prisma";
import { requireUser, jsonAppError, jsonError } from "@/lib/session";
import { chatMessageSchema } from "@/lib/validations";
import { retrieveChunks, buildContext } from "@/lib/rag";
import { stripCitations } from "@/lib/sources";
import { assertLlmConfigured, streamChatCompletion } from "@/lib/llm";
import { fixedAnswer, noSourcesAnswer } from "@/lib/grounding";
import { assertEmbedConfigured } from "@/lib/embed";
import { createSseResponse, streamLlmToSse } from "@/lib/sse";
import { finalizeSources } from "@/lib/verify";
import { isAppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const authz = await requireUser();
  if (authz.error) return authz.error;
  const { id } = await params;

  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id, userId: authz.user.id },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 40 } },
    });
    if (!conversation) return jsonError("Not found", 404, "NOT_FOUND");

    const body = await req.json();
    const parsed = chatMessageSchema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid message", 400, "VALIDATION");

    const locale = parsed.data.locale ?? conversation.locale ?? authz.user.preferredLocale;

    try {
      assertLlmConfigured();
      assertEmbedConfigured();
    } catch (err) {
      if (isAppError(err)) return jsonAppError(err, locale);
      throw err;
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: parsed.data.content,
      },
    });

    if (!conversation.title || conversation.title === "New chat") {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { title: parsed.data.content.slice(0, 60), updatedAt: new Date() },
      });
    } else {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });
    }

    const history = conversation.messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.role === "assistant" ? stripCitations(m.content) : m.content,
    }));

    const chunks = await retrieveChunks({
      query: parsed.data.content,
      visibilities: ["public", "authenticated"],
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

    // Set before onDone runs, so the stored message keeps the citation check and judgement.
    let finalSources = sources;
    const stream = await streamLlmToSse({
      tokens,
      sources,
      finalizeSources: async function* (full) {
        for await (const step of finalizeSources({ question: parsed.data.content, answer: full, sources, locale })) {
          finalSources = step;
          yield step;
        }
      },
      onDone: async (full) => {
        if (!full.trim()) {
          full =
            locale === "vi"
              ? "Xin lỗi, mình chưa tạo được câu trả lời. Vui lòng thử lại."
              : "Sorry, no answer was generated. Please try again.";
        }
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            role: "assistant",
            content: full,
            sources: finalSources,
          },
        });
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { updatedAt: new Date() },
        });
      },
    });

    return createSseResponse(stream);
  } catch (err) {
    if (isAppError(err)) {
      const accept = req.headers.get("accept-language") || "";
      const loc = accept.toLowerCase().startsWith("vi") ? "vi" : "en";
      return jsonAppError(err, loc);
    }
    console.error("[conversations/messages]", err);
    return jsonError("Chat unavailable right now", 500, "SERVER");
  }
}
