import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { localeSchema } from "@/lib/validations";
import { jsonError } from "@/lib/session";

type Params = { params: Promise<{ slug: string }> };

export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const localeParsed = localeSchema.safeParse(searchParams.get("locale") || "vi");
  const locale = localeParsed.success ? localeParsed.data : "vi";

  const lesson = await prisma.lesson.findFirst({
    where: { slug, published: true },
    include: { translations: true },
  });
  if (!lesson) return jsonError("Lesson not found", 404, "NOT_FOUND");

  const preferred = lesson.translations.find((t) => t.locale === locale);
  const fallback = lesson.translations.find((t) => t.locale === "vi") || lesson.translations[0];
  const t = preferred || fallback;
  if (!t) return jsonError("Lesson translation missing", 404, "NOT_FOUND");

  return NextResponse.json({
    lesson: {
      id: lesson.id,
      slug: lesson.slug,
      order: lesson.order,
      title: t.title,
      summary: t.summary,
      content: t.content,
      locale: t.locale,
      usedFallback: !preferred,
    },
  });
}
