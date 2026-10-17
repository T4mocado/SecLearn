import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, jsonError } from "@/lib/session";
import { userPatchError } from "@/lib/permissions";
import { adminUserPatchSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  preferredLocale: true,
  disabledAt: true,
} as const;

class PatchRefused extends Error {}

/**
 * Checks the patch against permissions.userPatchError and applies it in one serializable transaction,
 * so two admins demoting each other at once cannot leave the site without an active admin.
 */
async function patchUser(
  actorId: string,
  id: string,
  patch: { role?: "learner" | "admin"; disabled?: boolean; preferredLocale?: "vi" | "en" },
) {
  return prisma.$transaction(
    async (tx) => {
      const target = await tx.user.findUnique({
        where: { id },
        select: { id: true, role: true, disabledAt: true },
      });
      if (!target) return null;
      const activeAdminCount = await tx.user.count({ where: { role: "admin", disabledAt: null } });
      const refusal = userPatchError(actorId, target, patch, activeAdminCount);
      if (refusal) throw new PatchRefused(refusal);
      return tx.user.update({
        where: { id },
        data: {
          role: patch.role,
          preferredLocale: patch.preferredLocale,
          disabledAt:
            patch.disabled === undefined
              ? undefined
              : patch.disabled
                ? new Date()
                : null,
        },
        select: userSelect,
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function respond(actorId: string, id: string, patch: Parameters<typeof patchUser>[2]) {
  try {
    const user = await patchUser(actorId, id, patch);
    if (!user) return jsonError("Not found", 404, "NOT_FOUND");
    return NextResponse.json({ user });
  } catch (err) {
    if (err instanceof PatchRefused) return jsonError(err.message, 400, "VALIDATION");
    return jsonError("Update failed", 500, "SERVER");
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const authz = await requireAdmin();
  if (authz.error) return authz.error;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid patch", 400, "VALIDATION");
  }
  const parsed = adminUserPatchSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid patch", 400, "VALIDATION");
  // The UI hides these buttons on your own row; userPatchError also stops it via the API.
  return respond(authz.user.id, id, parsed.data);
}

export async function DELETE(_req: Request, { params }: Params) {
  const authz = await requireAdmin();
  if (authz.error) return authz.error;
  const { id } = await params;
  return respond(authz.user.id, id, { disabled: true });
}
