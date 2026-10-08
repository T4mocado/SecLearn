import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export async function GET() {
  const authz = await requireUser();
  if (authz.error) return authz.error;

  const quizzes = await prisma.quiz.findMany({
    where: { createdById: authz.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { questions: true, attempts: true } },
    },
  });

  return NextResponse.json({
    quizzes: quizzes.map((q) => ({
      id: q.id,
      titleVi: q.titleVi,
      titleEn: q.titleEn,
      description: q.description,
      source: q.source,
      createdAt: q.createdAt,
      questionCount: q._count.questions,
      attemptCount: q._count.attempts,
    })),
  });
}
