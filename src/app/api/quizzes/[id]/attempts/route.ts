import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/session";
import { attemptSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const authz = await requireUser();
  if (authz.error) return authz.error;
  const { id } = await params;

  try {
    const body = await req.json();
    const parsed = attemptSchema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid answers", 400, "VALIDATION");

    const quiz = await prisma.quiz.findUnique({
      where: { id },
      include: { questions: true },
    });
    if (!quiz) return jsonError("Not found", 404, "NOT_FOUND");
    if (quiz.createdById !== authz.user.id && authz.user.role !== "admin") {
      return jsonError("Forbidden", 403, "FORBIDDEN");
    }

    let correct = 0;
    const details = quiz.questions.map((q) => {
      const chosen = parsed.data.answers[q.id] ?? "";
      const isCorrect = chosen === q.correctOptionId;
      if (isCorrect) correct += 1;
      return {
        questionId: q.id,
        chosen,
        correctOptionId: q.correctOptionId,
        isCorrect,
      };
    });
    const score = quiz.questions.length
      ? Math.round((correct / quiz.questions.length) * 100)
      : 0;

    const attempt = await prisma.quizAttempt.create({
      data: {
        userId: authz.user.id,
        quizId: quiz.id,
        score,
        answers: parsed.data.answers,
        mode: "review",
      },
    });

    return NextResponse.json({
      attempt: {
        id: attempt.id,
        score,
        mode: attempt.mode,
        completedAt: attempt.completedAt,
        details,
      },
    });
  } catch {
    return jsonError("Could not save attempt", 500, "SERVER");
  }
}
