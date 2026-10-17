import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// How long a token's role and disabled state are trusted before they are read again.
const TOKEN_RECHECK_MS = 5 * 60 * 1000;

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(128),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/vi/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || user.disabledAt) return null;
        const ok = await compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          preferredLocale: user.preferredLocale,
          emailVerified: null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.email = user.email;
        token.name = user.name;
        token.role = user.role;
        token.preferredLocale = user.preferredLocale;
        token.checkedAt = Date.now();
        return token;
      }
      // A demoted or disabled user keeps the old token until it is read again; null ends the session.
      if (!token.checkedAt || Date.now() - token.checkedAt > TOKEN_RECHECK_MS) {
        const current = await prisma.user.findUnique({
          where: { id: token.id },
          select: { role: true, disabledAt: true },
        });
        if (!current || current.disabledAt) return null;
        token.role = current.role;
        token.checkedAt = Date.now();
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.email = typeof token.email === "string" ? token.email : "";
      session.user.name = typeof token.name === "string" ? token.name : null;
      session.user.role = token.role;
      session.user.preferredLocale = token.preferredLocale;
      return session;
    },
  },
  trustHost: true,
});
