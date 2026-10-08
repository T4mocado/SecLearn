import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export async function GET() {
  const authz = await requireUser();
  if (authz.error) return authz.error;

  const attempts = await prisma.quizAttempt.findMany({
    where: { userId: authz.user.id },
    orderBy: { completedAt: "desc" },
    include: {
      quiz: {
        select: { id: true, titleVi: true, titleEn: true },
      },
    },
    take: 50,
  });

  return NextResponse.json({ attempts });
}
