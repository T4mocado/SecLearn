/**
 * Make PDF-extracted / LLM-bound strings safe for JSON + Prisma + Postgres.
 * Lone UTF-16 surrogates from pdf-parse commonly break Prisma create().
 */
export function sanitizeTextForDb(input: string): string {
  if (!input) return "";

  let out = "";
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);

    // Null bytes — never store
    if (code === 0) continue;

    // High surrogate: keep only if followed by a low surrogate
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < input.length ? input.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += input[i]! + input[i + 1]!;
        i += 1;
      } else {
        out += "\uFFFD";
      }
      continue;
    }

    // Lone low surrogate
    if (code >= 0xdc00 && code <= 0xdfff) {
      out += "\uFFFD";
      continue;
    }

    // Strip C0/C1 controls except tab / LF / CR
    if (
      (code >= 0x01 && code <= 0x08) ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      (code >= 0x7f && code <= 0x9f)
    ) {
      continue;
    }

    out += input[i]!;
  }

  // Round-trip through JSON to prove Prisma/engine serialization will succeed
  try {
    return JSON.parse(JSON.stringify(out)) as string;
  } catch {
    // Last resort: drop anything that still can't serialize
    return [...out]
      .map((ch) => {
        const c = ch.charCodeAt(0);
        if (c >= 0xd800 && c <= 0xdfff) return "\uFFFD";
        try {
          JSON.stringify(ch);
          return ch;
        } catch {
          return "\uFFFD";
        }
      })
      .join("");
  }
}

/** True when sanitize changed the string (useful for logging). */
export function wasSanitized(original: string, sanitized: string): boolean {
  return original !== sanitized;
}
