"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { slugify } from "@/lib/utils";

type Lesson = {
  id: string;
  slug: string;
  order: number;
  published: boolean;
  translations: Array<{ locale: string; title: string; summary: string; content: string }>;
};

const emptyForm = {
  slug: "",
  order: 0,
  published: true,
  vi: { title: "", summary: "", content: "" },
  en: { title: "", summary: "", content: "" },
};

export default function AdminLessonsPage() {
  const t = useTranslations("admin");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/admin/lessons");
    if (!res.ok) return;
    const data = (await res.json()) as { lessons: Lesson[] };
    setLessons(data.lessons);
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const payload = {
      ...form,
      slug: form.slug || slugify(form.vi.title || form.en.title),
    };
    const res = await fetch(editingId ? `/api/admin/lessons/${editingId}` : "/api/admin/lessons", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setError("Save failed — VI and EN required");
      return;
    }
    setForm(emptyForm);
    setEditingId(null);
    await load();
  };

  const edit = (lesson: Lesson) => {
    const vi = lesson.translations.find((x) => x.locale === "vi");
    const en = lesson.translations.find((x) => x.locale === "en");
    setEditingId(lesson.id);
    setForm({
      slug: lesson.slug,
      order: lesson.order,
      published: lesson.published,
      vi: { title: vi?.title || "", summary: vi?.summary || "", content: vi?.content || "" },
      en: { title: en?.title || "", summary: en?.summary || "", content: en?.content || "" },
    });
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-8">
      <h1 className="text-2xl font-semibold text-[var(--accent)]">{t("lessons")}</h1>
      <Card className="space-y-3">
        <form className="space-y-3" onSubmit={save}>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Slug</Label>
              <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Order</Label>
              <Input
                type="number"
                value={form.order}
                onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => setForm({ ...form, published: e.target.checked })}
            />
            Published
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            {(["vi", "en"] as const).map((loc) => (
              <div key={loc} className="space-y-2 rounded-xl border border-[var(--border)] p-3">
                <div className="font-medium uppercase">{loc}</div>
                <Input
                  placeholder="Title"
                  value={form[loc].title}
                  onChange={(e) => setForm({ ...form, [loc]: { ...form[loc], title: e.target.value } })}
                  required
                />
                <Input
                  placeholder="Summary"
                  value={form[loc].summary}
                  onChange={(e) => setForm({ ...form, [loc]: { ...form[loc], summary: e.target.value } })}
                  required
                />
                <Textarea
                  placeholder="Content"
                  value={form[loc].content}
                  onChange={(e) => setForm({ ...form, [loc]: { ...form[loc], content: e.target.value } })}
                  required
                />
              </div>
            ))}
          </div>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit">{editingId ? t("save") : "Create"}</Button>
            {editingId && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm);
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>
      <div className="space-y-2">
        {lessons.map((lesson) => (
          <Card key={lesson.id} className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">{lesson.slug}</div>
              <div className="text-xs text-[var(--text-muted)]">
                {lesson.published ? "published" : "draft"} · order {lesson.order}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => edit(lesson)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => void fetch(`/api/admin/lessons/${lesson.id}`, { method: "DELETE" }).then(load)}
              >
                {t("delete")}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
