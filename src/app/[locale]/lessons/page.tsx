"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type LessonItem = {
  id: string;
  slug: string;
  title: string;
  summary: string;
};

export default function LessonsPage() {
  const t = useTranslations("lessons");
  const locale = useLocale();
  const [lessons, setLessons] = useState<LessonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/lessons?locale=${locale}`);
        if (!res.ok) throw new Error("fail");
        const data = (await res.json()) as { lessons: LessonItem[] };
        setLessons(data.lessons);
      } catch {
        setError("error");
      } finally {
        setLoading(false);
      }
    })();
  }, [locale]);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4 md:p-8">
        <h1 className="text-3xl font-semibold text-[var(--accent)]">{t("title")}</h1>
        {loading && <p className="text-[var(--text-muted)]">{t("loading")}</p>}
        {error && <p className="text-[var(--danger)]">{t("empty")}</p>}
        {!loading && !lessons.length && <p className="text-[var(--text-muted)]">{t("empty")}</p>}
        <div className="space-y-3">
          {lessons.map((lesson) => (
            <Card key={lesson.id} className="space-y-2">
              <Link href={`/${locale}/lessons/${lesson.slug}`} className="text-lg font-medium hover:text-[var(--accent)]">
                {lesson.title}
              </Link>
              <p className="text-sm text-[var(--text-muted)]">{lesson.summary}</p>
              <Button asChild size="sm" variant="outline">
                <Link href={`/${locale}/on-tap`}>{t("reviewCta")}</Link>
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
