"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { Menu, X, MessageSquare, BookOpen, Brain, Shield } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { cn } from "@/lib/utils";

export function AppShell({
  children,
  sidebarExtra,
}: {
  children: React.ReactNode;
  sidebarExtra?: React.ReactNode;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);

  const links = [
    { href: `/${locale}`, label: t("nav.chat"), icon: MessageSquare },
    { href: `/${locale}/lessons`, label: t("nav.lessons"), icon: BookOpen },
    { href: `/${locale}/on-tap`, label: t("nav.review"), icon: Brain },
  ];
  if (session?.user?.role === "admin") {
    links.push({ href: `/${locale}/admin`, label: t("nav.admin"), icon: Shield });
  }

  const switchLocale = (next: "vi" | "en") => {
    const parts = pathname.split("/");
    parts[1] = next;
    router.push(parts.join("/") || `/${next}`);
  };

  const authControls = (
    <div className="mt-auto space-y-3">
      <div className="flex gap-2">
        <Button size="sm" variant={locale === "vi" ? "default" : "outline"} onClick={() => switchLocale("vi")}>
          VI
        </Button>
        <Button size="sm" variant={locale === "en" ? "default" : "outline"} onClick={() => switchLocale("en")}>
          EN
        </Button>
        <ThemeToggle className="ml-auto" />
      </div>
      {status === "loading" ? (
        <div className="h-12 animate-pulse rounded-xl bg-[var(--surface)]/70" />
      ) : session?.user ? (
        <div className="flex items-center gap-3 rounded-xl bg-[var(--surface)] p-3">
          <UserMenu align="start" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{session.user.name || session.user.email}</div>
            <div className="truncate text-xs text-[var(--text-muted)]">
              {session.user.role === "admin" ? t("nav.admin") : session.user.email}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Button asChild>
            <Link href={`/${locale}/login`}>{t("nav.login")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/${locale}/register`}>{t("nav.register")}</Link>
          </Button>
        </div>
      )}
    </div>
  );

  const Nav = (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4">
      <Link href={`/${locale}`} className="text-xl font-semibold tracking-tight text-[var(--accent)]">
        {t("brand")}
      </Link>
      <nav className="flex flex-col gap-1">
        {links.map((link) => {
          const Icon = link.icon;
          const active =
            pathname === link.href || (link.href !== `/${locale}` && pathname.startsWith(link.href));
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors",
                active ? "bg-[var(--surface)] text-[var(--accent)] shadow-sm" : "text-[var(--text-muted)] hover:bg-[var(--surface)]/70",
              )}
            >
              <Icon className="h-4 w-4" />
              {link.label}
            </Link>
          );
        })}
      </nav>
      {sidebarExtra}
      {authControls}
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-64 shrink-0 border-r border-[var(--border)] bg-[var(--sidebar)]/80 md:block">
        {Nav}
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} aria-label="Close" />
          <aside className="relative z-50 h-full w-72 bg-[var(--sidebar)] shadow-xl">{Nav}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)]/80 px-4 py-3 backdrop-blur md:hidden">
          <button onClick={() => setOpen(true)} aria-label="Menu" className="rounded-lg p-1 hover:bg-[var(--sidebar)]">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="font-semibold text-[var(--accent)]">{t("brand")}</span>
          <div className="flex min-w-9 items-center justify-end gap-2">
            <ThemeToggle />
            {session?.user ? (
              <UserMenu />
            ) : status !== "loading" ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/${locale}/login`}>{t("nav.login")}</Link>
              </Button>
            ) : (
              <div className="h-9 w-9 animate-pulse rounded-full bg-[var(--sidebar)]" />
            )}
          </div>
        </header>
        {/* Compact desktop account strip — keeps chat full-height while exposing avatar */}
        {session?.user ? (
          <div className="hidden items-center justify-end border-b border-[var(--border)]/70 bg-[var(--surface)]/50 px-4 py-1.5 md:flex">
            <UserMenu />
          </div>
        ) : null}
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
