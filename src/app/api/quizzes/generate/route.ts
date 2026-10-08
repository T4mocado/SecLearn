import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/session";
import { generateQuizSchema } from "@/lib/validations";
import { generateQuizJson } from "@/lib/llm";

export async function POST(req: Request) {
  const authz = await requireUser();
  if (authz.error) return authz.error;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = generateQuizSchema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid generate request", 400, "VALIDATION");

    let conversationSnippet: string | undefined;
    if (parsed.data.conversationId) {
      const conv = await prisma.conversation.findFirst({
        where: { id: parsed.data.conversationId, userId: authz.user.id },
        include: { messages: { orderBy: { createdAt: "desc" }, take: 12 } },
      });
      if (!conv) return jsonError("Conversation not found", 404, "NOT_FOUND");
      conversationSnippet = conv.messages
        .reverse()
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");
    }

    const locale = parsed.data.locale ?? authz.user.preferredLocale;
    const generated = await generateQuizJson({
      locale,
      topicHint: parsed.data.topicHint,
      conversationSnippet,
    });

    const quiz = await prisma.quiz.create({
      data: {
        titleVi: generated.titleVi,
        titleEn: generated.titleEn,
        description: generated.description,
        source: "generated",
        published: false,
        createdById: authz.user.id,
        basedOnConversationId: parsed.data.conversationId,
        questions: {
          create: generated.questions.map((q, index) => ({
            prompt: q.prompt,
            options: q.options,
            correctOptionId: q.correctOptionId,
            order: index,
            locale,
          })),
        },
      },
      include: {
        questions: { orderBy: { order: "asc" } },
      },
    });

    return NextResponse.json(
      {
        quiz: {
          id: quiz.id,
          titleVi: quiz.titleVi,
          titleEn: quiz.titleEn,
          description: quiz.description,
          questionCount: quiz.questions.length,
        },
      },
      { status: 201 },
    );
  } catch {
    return jsonError("Could not generate quiz", 500, "SERVER");
  }
}
