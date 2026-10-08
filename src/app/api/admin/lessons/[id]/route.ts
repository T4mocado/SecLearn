import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, jsonError } from "@/lib/session";
import { lessonUpsertSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const authz = await requireAdmin();
  if (authz.error) return authz.error;
  const { id } = await params;
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    include: { translations: true },
  });
  if (!lesson) return jsonError("Not found", 404, "NOT_FOUND");
  return NextResponse.json({ lesson });
}

export async function PATCH(req: Request, { params }: Params) {
  const authz = await requireAdmin();
  if (authz.error) return authz.error;
  const { id } = await params;

  try {
    const body = await req.json();
    const parsed = lessonUpsertSchema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid lesson (VI+EN required)", 400, "VALIDATION");

    const lesson = await prisma.lesson.update({
      where: { id },
      data: {
        slug: parsed.data.slug,
        order: parsed.data.order,
        published: parsed.data.published,
        translations: {
          deleteMany: {},
          create: [
            { locale: "vi", ...parsed.data.vi },
            { locale: "en", ...parsed.data.en },
          ],
        },
      },
      include: { translations: true },
    });
    return NextResponse.json({ lesson });
  } catch {
    return jsonError("Update failed", 500, "SERVER");
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const authz = await requireAdmin();
  if (authz.error) return authz.error;
  const { id } = await params;
  await prisma.lesson.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
