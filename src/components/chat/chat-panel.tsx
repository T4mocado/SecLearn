"use client";

import { useCallback, useEffect, useRef, useState, startTransition } from "react";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { SendHorizonal, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { clearDraft, loadDraft, saveDraft, type DraftMessage } from "@/lib/draft";
import { cn } from "@/lib/utils";

type ConversationSummary = {
  id: string;
  title: string | null;
  updatedAt: string;
};

async function readSse(
  res: Response,
  onToken: (token: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  if (!res.body) return { ok: false, error: "No stream" };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let error: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const lines = part.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        const parsed = JSON.parse(data) as { token?: string; message?: string };
        if (event === "token" && parsed.token) onToken(parsed.token);
        if (event === "error") error = parsed.message || "Stream error";
      } catch {
        // ignore malformed chunk
      }
    }
  }
  return { ok: !error, error };
}

export function ChatPanel() {
  const t = useTranslations("chat");
  const tNav = useTranslations("nav");
  const locale = useLocale();
  const { data: session, status } = useSession();
  const [messages, setMessages] = useState<DraftMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<{ remaining: number; limit: number } | null>(null);
  const [showLimit, setShowLimit] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const migratedRef = useRef(false);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const refreshQuota = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/guest/quota");
      if (!res.ok) return;
      const data = (await res.json()) as { remaining: number; limit: number };
      setQuota({ remaining: data.remaining, limit: data.limit });
    } catch {
      // ignore
    }
  }, []);

  const refreshConversations = useCallback(async () => {
    if (!session?.user) return;
    try {
      const res = await fetch("/api/chat/conversations");
      if (!res.ok) return;
      const data = (await res.json()) as { conversations: ConversationSummary[] };
      setConversations(data.conversations);
    } catch {
      // ignore
    }
  }, [session?.user]);

  useEffect(() => {
    if (status === "unauthenticated") {
      startTransition(() => setMessages(loadDraft()));
      void refreshQuota();
    }
  }, [status, refreshQuota]);

  useEffect(() => {
    if (status !== "authenticated" || migratedRef.current) return;
    migratedRef.current = true;
    const draft = loadDraft();
    void (async () => {
      if (draft.length) {
        try {
          const res = await fetch("/api/chat/conversations/migrate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: draft, locale }),
          });
          if (res.ok) {
            const data = (await res.json()) as {
              conversation: { id: string; messages: DraftMessage[] };
            };
            clearDraft();
            setActiveId(data.conversation.id);
            setMessages(
              data.conversation.messages.map((m) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
              })),
            );
          }
        } catch {
          // keep draft on failure
        }
      }
      await refreshConversations();
      await refreshQuota();
    })();
  }, [status, locale, refreshConversations, refreshQuota]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streaming]);

  useEffect(() => {
    if (status === "unauthenticated") saveDraft(messages);
  }, [messages, status]);

  const loadConversation = async (id: string) => {
    setError(null);
    setActiveId(id);
    const res = await fetch(`/api/chat/conversations/${id}`);
    if (!res.ok) {
      setError(t("error"));
      return;
    }
    const data = (await res.json()) as {
      conversation: { messages: Array<{ role: string; content: string }> };
    };
    setMessages(
      data.conversation.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    );
  };

  const newChat = async () => {
    setError(null);
    abortRef.current?.abort();
    if (session?.user) {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      if (res.ok) {
        const data = (await res.json()) as { conversation: ConversationSummary };
        setActiveId(data.conversation.id);
        setMessages([]);
        await refreshConversations();
        return;
      }
    }
    setActiveId(null);
    setMessages([]);
    clearDraft();
  };

  const deleteConversation = async (id: string) => {
    await fetch(`/api/chat/conversations/${id}`, { method: "DELETE" });
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
    await refreshConversations();
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || streaming) return;
    setError(null);
    setInput("");

    if (!session?.user && quota && quota.remaining <= 0) {
      setShowLimit(true);
      return;
    }

    const history = messages;
    const nextMessages: DraftMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setStreaming(true);

    let conversationId = activeId;
    try {
      if (session?.user && !conversationId) {
        const created = await fetch("/api/chat/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale, title: content.slice(0, 60) }),
        });
        if (!created.ok) throw new Error("create failed");
        const data = (await created.json()) as { conversation: { id: string } };
        conversationId = data.conversation.id;
        setActiveId(conversationId);
      }

      const controller = new AbortController();
      abortRef.current = controller;
      const url = session?.user
        ? `/api/chat/conversations/${conversationId}/messages`
        : "/api/chat/guest/messages";

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          content,
          locale,
          history: session?.user ? undefined : history,
        }),
      });

      if (res.status === 403) {
        const body = (await res.json().catch(() => ({}))) as { code?: string };
        if (body.code === "GUEST_LIMIT") {
          setShowLimit(true);
          setMessages(history);
          setStreaming(false);
          await refreshQuota();
          return;
        }
      }
      if (!res.ok) throw new Error("send failed");

      let assistant = "";
      setMessages([...nextMessages, { role: "assistant", content: "" }]);
      const result = await readSse(res, (token) => {
        assistant += token;
        setMessages([...nextMessages, { role: "assistant", content: assistant }]);
      });
      if (!result.ok) {
        setError(result.error || t("error"));
      }
      if (!assistant.trim()) {
        setMessages([
          ...nextMessages,
          {
            role: "assistant",
            content:
              locale === "vi"
                ? "Xin lỗi, mình chưa tạo được câu trả lời. Vui lòng thử lại."
                : "Sorry, no answer was generated. Please try again.",
          },
        ]);
      }
      await refreshQuota();
      await refreshConversations();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(t("error"));
        setMessages(history);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const suggestions = [t("suggestions.1"), t("suggestions.2"), t("suggestions.3")];

  return (
    <div className="flex min-h-0 flex-1">
      {session?.user && (
        <div className="hidden w-56 shrink-0 flex-col border-r border-[var(--border)] bg-white/50 p-3 lg:flex">
          <Button className="mb-3 w-full" variant="secondary" onClick={() => void newChat()}>
            <Plus className="h-4 w-4" />
            {t("new")}
          </Button>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            {t("history")}
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {conversations.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "group flex items-center gap-1 rounded-lg px-2 py-2 text-sm",
                  activeId === c.id ? "bg-[var(--chat-user)]" : "hover:bg-[var(--sidebar)]",
                )}
              >
                <button className="min-w-0 flex-1 truncate text-left" onClick={() => void loadConversation(c.id)}>
                  {c.title || t("new")}
                </button>
                <button
                  className="opacity-0 group-hover:opacity-100"
                  onClick={() => void deleteConversation(c.id)}
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" className="lg:hidden" onClick={() => void newChat()}>
              <Plus className="h-4 w-4" />
              {t("new")}
            </Button>
            {!session?.user && quota && (
              <span className="rounded-full bg-[var(--chat-user)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
                {t("guestBadge", { remaining: quota.remaining, limit: quota.limit })}
              </span>
            )}
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto px-4 pb-36 pt-2">
          {messages.length === 0 ? (
            <div className="msg-enter flex flex-1 flex-col items-center justify-center text-center">
              <h1 className="text-4xl font-semibold tracking-tight text-[var(--accent)] md:text-5xl">
                {t("emptyTitle")}
              </h1>
              <p className="mt-3 max-w-md text-[var(--text-muted)]">{t("emptyBody")}</p>
              <div className="mt-8 flex w-full max-w-xl flex-col gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-left text-sm transition hover:border-[var(--accent)]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, idx) => (
              <div
                key={`${idx}-${m.role}`}
                className={cn(
                  "msg-enter max-w-[92%] rounded-2xl px-4 py-3 text-sm shadow-sm",
                  m.role === "user"
                    ? "ml-auto bg-[var(--chat-user)]"
                    : "mr-auto border border-[var(--border)] bg-[var(--chat-assistant)]",
                )}
              >
                <div className="prose-chat">{m.content || (streaming && idx === messages.length - 1 ? "" : "")}</div>
                {streaming && idx === messages.length - 1 && m.role === "assistant" && !m.content && (
                  <div className="flex gap-1 py-1">
                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                  </div>
                )}
              </div>
            ))
          )}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#eef6f4] via-[#eef6f4cc] to-transparent px-4 pb-4 pt-10">
          <form
            className="pointer-events-auto mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-[var(--border)] bg-white p-2 shadow-sm"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("placeholder")}
              className="min-h-[48px] flex-1 resize-none border-0 shadow-none focus-visible:ring-0"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              disabled={streaming}
            />
            <Button type="submit" size="icon" disabled={streaming || !input.trim()} aria-label={t("send")}>
              <SendHorizonal className="h-4 w-4" />
            </Button>
          </form>
          {streaming && (
            <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-[var(--text-muted)]">{t("streaming")}</p>
          )}
        </div>
      </div>

      {showLimit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">{t("limitTitle")}</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">{t("limitBody")}</p>
            <div className="mt-5 flex gap-2">
              <Button asChild className="flex-1">
                <Link href={`/${locale}/login`}>{tNav("login")}</Link>
              </Button>
              <Button asChild variant="outline" className="flex-1">
                <Link href={`/${locale}/register`}>{tNav("register")}</Link>
              </Button>
            </div>
            <Button variant="ghost" className="mt-2 w-full" onClick={() => setShowLimit(false)}>
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
