import { AppShell } from "@/components/layout/app-shell";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminPage } from "./guard";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AdminLayout({ children, params }: Props) {
  const { locale } = await params;
  await requireAdminPage(locale);

  return <AppShell sidebarExtra={<AdminNav />}>{children}</AppShell>;
}
