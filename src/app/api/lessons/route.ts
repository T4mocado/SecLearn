import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { localeSchema } from "@/lib/validations";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const localeParsed = localeSchema.safeParse(searchParams.get("locale") || "vi");
  const locale = localeParsed.success ? localeParsed.data : "vi";

  const lessons = await prisma.lesson.findMany({
    where: { published: true },
    orderBy: { order: "asc" },
    include: { translations: true },
  });

  const items = lessons.map((lesson) => {
    const preferred = lesson.translations.find((t) => t.locale === locale);
    const fallback = lesson.translations.find((t) => t.locale === "vi") || lesson.translations[0];
    const t = preferred || fallback;
    return {
      id: lesson.id,
      slug: lesson.slug,
      order: lesson.order,
      title: t?.title ?? lesson.slug,
      summary: t?.summary ?? "",
      locale: t?.locale ?? locale,
    };
  });

  return NextResponse.json({ lessons: items });
}
