"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function AdminNav() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const pathname = usePathname();
  const links = [
    { href: `/${locale}/admin/users`, label: t("users") },
    { href: `/${locale}/admin/documents`, label: t("documents") },
    { href: `/${locale}/admin/lessons`, label: t("lessons") },
  ];

  return (
    <div className="space-y-1 rounded-xl bg-white p-2">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={cn(
            "block rounded-lg px-3 py-2 text-sm",
            pathname.startsWith(l.href) ? "bg-[var(--chat-user)] text-[var(--accent)]" : "hover:bg-[var(--sidebar)]",
          )}
        >
          {l.label}
        </Link>
      ))}
    </div>
  );
}
