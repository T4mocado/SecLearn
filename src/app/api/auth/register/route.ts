import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validations";
import { jsonError } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid registration data", 400, "VALIDATION");
    }

    const email = parsed.data.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return jsonError("Email already registered", 409, "EMAIL_EXISTS");
    }

    const passwordHash = await hash(parsed.data.password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: parsed.data.name,
        preferredLocale: parsed.data.preferredLocale ?? "vi",
        role: "learner",
      },
      select: { id: true, email: true, role: true, preferredLocale: true, name: true },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch {
    return jsonError("Registration failed", 500, "SERVER");
  }
}
