import { parseSources, type MessageSource } from "@/lib/sources";

export type DraftMessage = {
  role: "user" | "assistant";
  content: string;
  /** Assistant only. `null`/absent = no record (older message); `[]` = answered without retrieved chunks. */
  sources?: MessageSource[] | null;
};

const KEY = "seclearn_guest_draft_v1";

export function loadDraft(): DraftMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DraftMessage[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-40)
      .map((m) => ({
        role: m.role,
        content: m.content,
        sources: m.role === "assistant" ? parseSources(m.sources) : undefined,
      }));
  } catch {
    return [];
  }
}

export function saveDraft(messages: DraftMessage[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(messages.slice(-40)));
  } catch {
    // Quota exceeded: keep the conversation, drop the stored chunk text.
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify(messages.slice(-40).map((m) => ({ role: m.role, content: m.content }))),
      );
    } catch {}
  }
}

export function clearDraft() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
