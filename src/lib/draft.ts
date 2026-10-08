export type DraftMessage = { role: "user" | "assistant"; content: string };

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
      .slice(-40);
  } catch {
    return [];
  }
}

export function saveDraft(messages: DraftMessage[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(messages.slice(-40)));
}

export function clearDraft() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
