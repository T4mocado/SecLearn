import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, jsonError } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const authz = await requireUser();
  if (authz.error) return authz.error;
  const { id } = await params;

  const quiz = await prisma.quiz.findUnique({
    where: { id },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!quiz) return jsonError("Not found", 404, "NOT_FOUND");
  if (quiz.createdById !== authz.user.id && authz.user.role !== "admin") {
    return jsonError("Forbidden", 403, "FORBIDDEN");
  }

  return NextResponse.json({
    quiz: {
      id: quiz.id,
      titleVi: quiz.titleVi,
      titleEn: quiz.titleEn,
      description: quiz.description,
      source: quiz.source,
      createdAt: quiz.createdAt,
      questions: quiz.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        options: q.options,
        order: q.order,
        locale: q.locale,
        // hide correctOptionId until submit
      })),
    },
  });
}
