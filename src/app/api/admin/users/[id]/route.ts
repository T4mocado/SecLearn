import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, jsonError } from "@/lib/session";
import { adminUserPatchSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const authz = await requireAdmin();
  if (authz.error) return authz.error;
  const { id } = await params;

  try {
    const body = await req.json();
    const parsed = adminUserPatchSchema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid patch", 400, "VALIDATION");

    if (id === authz.user.id && parsed.data.disabled) {
      return jsonError("Cannot disable yourself", 400, "VALIDATION");
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        role: parsed.data.role,
        preferredLocale: parsed.data.preferredLocale,
        disabledAt:
          parsed.data.disabled === undefined
            ? undefined
            : parsed.data.disabled
              ? new Date()
              : null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        preferredLocale: true,
        disabledAt: true,
      },
    });
    return NextResponse.json({ user });
  } catch {
    return jsonError("Update failed", 500, "SERVER");
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const authz = await requireAdmin();
  if (authz.error) return authz.error;
  const { id } = await params;

  if (id === authz.user.id) {
    return jsonError("Cannot disable yourself", 400, "VALIDATION");
  }

  const user = await prisma.user.update({
    where: { id },
    data: { disabledAt: new Date() },
    select: { id: true, disabledAt: true },
  });
  return NextResponse.json({ user });
}
