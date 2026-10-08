"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Option = { id: string; text: string };
type Question = { id: string; prompt: string; options: Option[] };

export default function QuizTakePage() {
  const t = useTranslations("review");
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [title, setTitle] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [score, setScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/quizzes/${params.id}`);
        if (!res.ok) throw new Error("fail");
        const data = (await res.json()) as {
          quiz: {
            titleVi: string | null;
            titleEn: string | null;
            questions: Array<{ id: string; prompt: string; options: Option[] }>;
          };
        };
        setTitle((locale === "vi" ? data.quiz.titleVi : data.quiz.titleEn) || data.quiz.titleVi || "Quiz");
        setQuestions(
          data.quiz.questions.map((q) => ({
            id: q.id,
            prompt: q.prompt,
            options: Array.isArray(q.options) ? q.options : [],
          })),
        );
      } catch {
        setError("error");
      } finally {
        setLoading(false);
      }
    })();
  }, [params.id, locale]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/quizzes/${params.id}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, mode: "review" }),
      });
      if (!res.ok) throw new Error("fail");
      const data = (await res.json()) as { attempt: { score: number } };
      setScore(data.attempt.score);
    } catch {
      setError("error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4 md:p-8">
        <button className="text-sm text-[var(--accent)]" onClick={() => router.push(`/${locale}/on-tap`)}>
          ← {t("title")}
        </button>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {loading && <p>...</p>}
        {error && <p className="text-[var(--danger)]">{error}</p>}
        {score !== null && (
          <Card className="border-[var(--accent)] bg-[var(--chat-user)] text-lg font-medium">
            {t("score", { score })}
          </Card>
        )}
        <div className="space-y-4">
          {questions.map((q, idx) => (
            <Card key={q.id} className="space-y-3">
              <div className="font-medium">
                {idx + 1}. {q.prompt}
              </div>
              <div className="space-y-2">
                {q.options.map((opt) => (
                  <label
                    key={opt.id}
                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)]"
                  >
                    <input
                      type="radio"
                      name={q.id}
                      value={opt.id}
                      disabled={score !== null}
                      checked={answers[q.id] === opt.id}
                      onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))}
                    />
                    {opt.text}
                  </label>
                ))}
              </div>
            </Card>
          ))}
        </div>
        {score === null && !!questions.length && (
          <Button onClick={() => void submit()} disabled={submitting || Object.keys(answers).length < questions.length}>
            {submitting ? "..." : t("submit")}
          </Button>
        )}
      </div>
    </AppShell>
  );
}
