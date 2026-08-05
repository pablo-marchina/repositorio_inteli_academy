import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { getOptionalUser } from "@/lib/auth";

export default async function LoginPage() {
  if (await getOptionalUser()) redirect("/dashboard");
  return (
    <main className="login-page">
      <section className="login-hero">
        <div className="logo-lockup"><span className="logo-mark inverse">IA</span><span>Inteli Academy</span></div>
        <div className="login-copy">
          <h1>As histórias de IA que merecem ser compartilhadas.</h1>
          <p>Coleta, seleção, revisão, publicação e aprendizado por engajamento em uma única redação automática.</p>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <span className="eyebrow">Acesso restrito</span>
          <h2>Painel editorial</h2>
          <p>Entre com uma conta convidada para administrar a aplicação.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
