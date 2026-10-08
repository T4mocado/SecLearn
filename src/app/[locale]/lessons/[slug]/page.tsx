"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";

type LessonDetail = {
  title: string;
  summary: string;
  content: string;
  usedFallback?: boolean;
};

export default function LessonDetailPage() {
  const t = useTranslations("lessons");
  const locale = useLocale();
  const params = useParams<{ slug: string }>();
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/lessons/${params.slug}?locale=${locale}`);
        if (!res.ok) throw new Error("fail");
        const data = (await res.json()) as { lesson: LessonDetail };
        setLesson(data.lesson);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [params.slug, locale]);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4 md:p-8">
        {loading && <p>{t("loading")}</p>}
        {error && <p className="text-[var(--danger)]">{t("empty")}</p>}
        {lesson && (
          <>
            <h1 className="text-3xl font-semibold text-[var(--accent)]">{lesson.title}</h1>
            <p className="text-[var(--text-muted)]">{lesson.summary}</p>
            <article className="prose-chat rounded-2xl border border-[var(--border)] bg-white p-5">
              {lesson.content}
            </article>
            <Button asChild>
              <Link href={`/${locale}/on-tap`}>{t("reviewCta")}</Link>
            </Button>
          </>
        )}
      </div>
    </AppShell>
  );
}
