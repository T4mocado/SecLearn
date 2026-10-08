import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/session";
import { chatMessageSchema } from "@/lib/validations";
import { retrieveChunks, formatContext } from "@/lib/rag";
import { streamChatCompletion } from "@/lib/llm";
import { createSseResponse, streamLlmToSse } from "@/lib/sse";

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

    const chunks = await retrieveChunks({
      query: parsed.data.content,
      visibilities: ["public", "authenticated"],
    });
    const context = formatContext(chunks);
    const locale = parsed.data.locale ?? conversation.locale ?? authz.user.preferredLocale;

    const history = conversation.messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    const tokens = await streamChatCompletion({
      messages: [...history, { role: "user", content: parsed.data.content }],
      context,
      locale,
      signal: req.signal,
    });

    const stream = await streamLlmToSse({
      tokens,
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
          },
        });
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { updatedAt: new Date() },
        });
      },
    });

    return createSseResponse(stream);
  } catch {
    return jsonError("Chat unavailable right now", 500, "SERVER");
  }
}
