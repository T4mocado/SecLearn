"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { LogOut, Shield, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function initials(name?: string | null, email?: string | null) {
  const source = (name || email || "?").trim();
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function UserMenu({
  className,
  align = "end",
}: {
  className?: string;
  align?: "start" | "center" | "end";
}) {
  const { data: session, status } = useSession();
  const t = useTranslations("nav");
  const locale = useLocale();

  if (status === "loading") {
    return (
      <div
        className={cn(
          "h-9 w-9 animate-pulse rounded-full border border-[var(--border)] bg-[var(--sidebar)]",
          className,
        )}
        aria-hidden
      />
    );
  }

  if (!session?.user) return null;

  const user = session.user;
  const isAdmin = user.role === "admin";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("account")}
          className={cn(
            "inline-flex items-center justify-center rounded-full outline-none ring-offset-2 transition",
            "hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
            className,
          )}
        >
          <Avatar className="h-9 w-9">
            <AvatarFallback>{initials(user.name, user.email)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-[var(--text)]">
              {user.name || user.email}
            </span>
            {user.name ? (
              <span className="truncate text-xs text-[var(--text-muted)]">{user.email}</span>
            ) : null}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/${locale}`}>
            <User className="h-4 w-4" />
            {t("profile")}
          </Link>
        </DropdownMenuItem>
        {isAdmin ? (
          <DropdownMenuItem asChild>
            <Link href={`/${locale}/admin`}>
              <Shield className="h-4 w-4" />
              {t("admin")}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void signOut({ callbackUrl: `/${locale}` });
          }}
        >
          <LogOut className="h-4 w-4" />
          {t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
