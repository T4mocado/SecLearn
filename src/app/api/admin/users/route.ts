import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

export async function GET() {
  const authz = await requireAdmin();
  if (authz.error) return authz.error;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      preferredLocale: true,
      disabledAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ users });
}
