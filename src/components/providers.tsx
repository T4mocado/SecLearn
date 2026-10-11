"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { useTheme } from "@/lib/theme";

export function Providers({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <SessionProvider>
      {children}
      <Toaster richColors position="top-center" theme={theme ?? "light"} />
    </SessionProvider>
  );
}
