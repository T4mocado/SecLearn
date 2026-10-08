import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export async function requireAdminPage(locale: string) {
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/login`);
  if (session.user.role !== "admin") redirect(`/${locale}`);
  return session;
}
