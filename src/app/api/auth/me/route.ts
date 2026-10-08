import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/session";

export async function GET() {
  const result = await requireUser();
  if (result.error) return result.error;
  const { user } = result;
  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    preferredLocale: user.preferredLocale,
  });
}

export async function PATCH() {
  return jsonError("Use admin or profile settings later", 405);
}
