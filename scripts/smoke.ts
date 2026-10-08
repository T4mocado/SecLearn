/**
 * Smoke tests against a running SecLearn server (mock LLM/embed).
 * Usage: BASE_URL=http://127.0.0.1:3847 npx tsx scripts/smoke.ts
 */

const BASE = process.env.BASE_URL || "http://127.0.0.1:3847";

async function req(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text.slice(0, 200);
  }
  return { res, json };
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log("Smoke against", BASE);

  const lessons = await req("/api/lessons?locale=vi");
  assert(lessons.res.ok, "lessons failed");
  assert(Array.isArray((lessons.json as { lessons: unknown[] }).lessons), "lessons shape");

  const email = `learner_${Date.now()}@example.com`;
  const password = "testpass123";
  const reg = await req("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: "Smoke", preferredLocale: "vi" }),
  });
  assert(reg.res.status === 201, `register failed: ${reg.res.status}`);

  // Guest quota + message (no cookie jar persistence across undici by default — still exercises endpoint)
  const quota = await req("/api/chat/guest/quota");
  assert(quota.res.ok, "guest quota failed");

  const guestMsg = await req("/api/chat/guest/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: "What is phishing?", locale: "en", history: [] }),
  });
  assert(guestMsg.res.ok, `guest chat failed: ${guestMsg.res.status}`);
  assert(
    String(guestMsg.res.headers.get("content-type") || "").includes("text/event-stream"),
    "guest chat not SSE",
  );

  console.log("OK: lessons, register, guest quota, guest SSE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
