"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: "learner" | "admin";
  disabledAt: string | null;
};

export default function AdminUsersPage() {
  const t = useTranslations("admin");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/admin/users");
    if (!res.ok) {
      setError("error");
      return;
    }
    const data = (await res.json()) as { users: UserRow[] };
    setUsers(data.users);
  };

  useEffect(() => {
    void load();
  }, []);

  const patch = async (id: string, body: Record<string, unknown>) => {
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 md:p-8">
      <h1 className="text-2xl font-semibold text-[var(--accent)]">{t("users")}</h1>
      {error && <p className="text-[var(--danger)]">{error}</p>}
      <div className="space-y-2">
        {users.map((u) => (
          <Card key={u.id} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-medium">{u.email}</div>
              <div className="text-xs text-[var(--text-muted)]">
                {t("role")}: {u.role}
                {u.disabledAt ? ` · ${t("disabled")}` : ""}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void patch(u.id, { role: u.role === "admin" ? "learner" : "admin" })}
              >
                Toggle role
              </Button>
              <Button
                size="sm"
                variant={u.disabledAt ? "secondary" : "danger"}
                onClick={() => void patch(u.id, { disabled: !u.disabledAt })}
              >
                {u.disabledAt ? "Enable" : t("disabled")}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
