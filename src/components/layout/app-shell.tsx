"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { Menu, X, MessageSquare, BookOpen, Brain, Shield, LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
  const { data: session } = useSession();
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

  const Nav = (
    <div className="flex h-full flex-col gap-4 p-4">
      <Link href={`/${locale}`} className="text-xl font-semibold tracking-tight text-[var(--accent)]">
        {t("brand")}
      </Link>
      <nav className="flex flex-col gap-1">
        {links.map((link) => {
          const Icon = link.icon;
          const active = pathname === link.href || (link.href !== `/${locale}` && pathname.startsWith(link.href));
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors",
                active ? "bg-white text-[var(--accent)] shadow-sm" : "text-[var(--text-muted)] hover:bg-white/70",
              )}
            >
              <Icon className="h-4 w-4" />
              {link.label}
            </Link>
          );
        })}
      </nav>
      {sidebarExtra}
      <div className="mt-auto space-y-3">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={locale === "vi" ? "default" : "outline"}
            onClick={() => switchLocale("vi")}
          >
            VI
          </Button>
          <Button
            size="sm"
            variant={locale === "en" ? "default" : "outline"}
            onClick={() => switchLocale("en")}
          >
            EN
          </Button>
        </div>
        {session?.user ? (
          <div className="space-y-2 rounded-xl bg-white p-3 text-sm">
            <div className="truncate font-medium">{session.user.email}</div>
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => signOut({ callbackUrl: `/${locale}` })}
            >
              <LogOut className="h-4 w-4" />
              {t("nav.logout")}
            </Button>
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
    </div>
  );

  return (
    <div className="flex min-h-screen">
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
        <header className="flex items-center justify-between border-b border-[var(--border)] bg-white/80 px-4 py-3 backdrop-blur md:hidden">
          <button onClick={() => setOpen(true)} aria-label="Menu">
            {open ? <X /> : <Menu />}
          </button>
          <span className="font-semibold text-[var(--accent)]">{t("brand")}</span>
          <div className="w-6" />
        </header>
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
