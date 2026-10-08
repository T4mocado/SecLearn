import { NextResponse } from "next/server";
import { getGuestQuota, getOrCreateGuestKey } from "@/lib/guest";

export async function GET() {
  try {
    const guestKey = await getOrCreateGuestKey();
    const quota = await getGuestQuota(guestKey);
    return NextResponse.json({
      questionCount: quota.questionCount,
      limit: quota.limit,
      remaining: quota.remaining,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load guest quota", code: "SERVER" },
      { status: 500 },
    );
  }
}
