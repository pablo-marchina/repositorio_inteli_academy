import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";

export function AppShell({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/dashboard" className="logo-lockup">
          <span className="logo-mark inverse">IA</span>
          <span>AI Weekly</span>
        </Link>
        <nav className="nav" aria-label="Navegação principal">
          <Link href="/dashboard">Visão geral</Link>
          <Link href="/articles">Artigos</Link>
          <Link href="/posts">Publicações</Link>
          <Link href="/settings">Configurações</Link>
        </nav>
        <div className="sidebar-bottom">
          <span className="user-email" title={email}>{email}</span>
          <SignOutButton />
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
