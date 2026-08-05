import { AppShell } from "@/components/AppShell";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  return <AppShell email={user.email ?? "Administrador"}>{children}</AppShell>;
}
