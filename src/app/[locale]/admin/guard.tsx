import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";

export async function requireAdminPage(locale: string) {
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/login`);
  // The token's role may be up to a few minutes old; the database decides, as in requireAdmin.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, disabledAt: true },
  });
  if (!user || user.disabledAt) redirect(`/${locale}/login`);
  if (!can(user.role, "admin:access")) redirect(`/${locale}`);
  return session;
}
