import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 }) };
  }
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.disabledAt) {
    return { error: NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 }) };
  }
  return { user, session };
}

export async function requireAdmin() {
  const result = await requireUser();
  if ("error" in result && result.error) return result;
  if (!can(result.user!.role, "admin:access")) {
    return { error: NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 }) };
  }
  return result;
}

export function jsonError(
  message: string,
  status = 400,
  code?: string,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ error: message, code, ...extra }, { status });
}

export function jsonAppError(
  err: { code: string; status: number; messageFor: (locale?: string | null) => string; messageVi: string; messageEn: string },
  locale?: string | null,
) {
  return NextResponse.json(
    {
      error: err.messageFor(locale),
      code: err.code,
      messageVi: err.messageVi,
      messageEn: err.messageEn,
    },
    { status: err.status },
  );
}
