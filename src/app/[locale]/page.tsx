import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { ChatPanel } from "@/components/chat/chat-panel";

type Props = { params: Promise<{ locale: string }> };

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <AppShell>
      <ChatPanel />
    </AppShell>
  );
}
