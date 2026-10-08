"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type QuizItem = {
  id: string;
  titleVi: string | null;
  titleEn: string | null;
  questionCount: number;
  createdAt: string;
};

type AttemptItem = {
  id: string;
  score: number;
  completedAt: string;
  quiz: { id: string; titleVi: string | null; titleEn: string | null };
};

export default function OnTapPage() {
  const t = useTranslations("review");
  const tNav = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [attempts, setAttempts] = useState<AttemptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [qRes, aRes] = await Promise.all([
        fetch("/api/quizzes/mine"),
        fetch("/api/quizzes/attempts/me"),
      ]);
      if (!qRes.ok || !aRes.ok) throw new Error("fail");
      const qData = (await qRes.json()) as { quizzes: QuizItem[] };
      const aData = (await aRes.json()) as { attempts: AttemptItem[] };
      setQuizzes(qData.quizzes);
      setAttempts(aData.attempts);
    } catch {
      setError("error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") void load();
    if (status === "unauthenticated") setLoading(false);
  }, [status]);

  const createQuiz = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/quizzes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      if (!res.ok) throw new Error("fail");
      const data = (await res.json()) as { quiz: { id: string } };
      router.push(`/${locale}/on-tap/${data.quiz.id}`);
    } catch {
      setError("error");
      setCreating(false);
    }
  };

  const titleOf = (q: { titleVi: string | null; titleEn: string | null }) =>
    (locale === "vi" ? q.titleVi : q.titleEn) || q.titleVi || q.titleEn || "Quiz";

  if (status === "unauthenticated") {
    return (
      <AppShell>
        <div className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-3xl font-semibold text-[var(--accent)]">{t("title")}</h1>
          <p className="text-[var(--text-muted)]">{t("needAuth")}</p>
          <Button asChild>
            <Link href={`/${locale}/login`}>{tNav("login")}</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold text-[var(--accent)]">{t("title")}</h1>
          <Button onClick={() => void createQuiz()} disabled={creating || !session}>
            {creating ? t("creating") : t("create")}
          </Button>
        </div>
        {loading && <p className="text-[var(--text-muted)]">...</p>}
        {error && <p className="text-[var(--danger)]">{error}</p>}
        {!loading && !quizzes.length && <p className="text-[var(--text-muted)]">{t("empty")}</p>}
        <div className="space-y-3">
          {quizzes.map((quiz) => (
            <Card key={quiz.id} className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{titleOf(quiz)}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {t("questions", { count: quiz.questionCount })} ·{" "}
                  {new Date(quiz.createdAt).toLocaleString(locale)}
                </div>
              </div>
              <Button asChild size="sm">
                <Link href={`/${locale}/on-tap/${quiz.id}`}>{t("start")}</Link>
              </Button>
            </Card>
          ))}
        </div>
        {!!attempts.length && (
          <div className="space-y-3">
            <h2 className="text-lg font-medium">{t("history")}</h2>
            {attempts.map((a) => (
              <Card key={a.id} className="text-sm">
                <div className="font-medium">{titleOf(a.quiz)}</div>
                <div className="text-[var(--text-muted)]">
                  {t("score", { score: a.score })} · {new Date(a.completedAt).toLocaleString(locale)}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
