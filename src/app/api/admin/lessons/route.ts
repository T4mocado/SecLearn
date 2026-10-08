import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, jsonError } from "@/lib/session";
import { lessonUpsertSchema } from "@/lib/validations";

export async function GET() {
  const authz = await requireAdmin();
  if (authz.error) return authz.error;

  const lessons = await prisma.lesson.findMany({
    orderBy: { order: "asc" },
    include: { translations: true },
  });
  return NextResponse.json({ lessons });
}

export async function POST(req: Request) {
  const authz = await requireAdmin();
  if (authz.error) return authz.error;

  try {
    const body = await req.json();
    const parsed = lessonUpsertSchema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid lesson (VI+EN required)", 400, "VALIDATION");

    const existing = await prisma.lesson.findUnique({ where: { slug: parsed.data.slug } });
    if (existing) return jsonError("Slug already exists", 409, "EXISTS");

    const lesson = await prisma.lesson.create({
      data: {
        slug: parsed.data.slug,
        order: parsed.data.order ?? 0,
        published: parsed.data.published ?? false,
        translations: {
          create: [
            { locale: "vi", ...parsed.data.vi },
            { locale: "en", ...parsed.data.en },
          ],
        },
      },
      include: { translations: true },
    });
    return NextResponse.json({ lesson }, { status: 201 });
  } catch {
    return jsonError("Create failed", 500, "SERVER");
  }
}
