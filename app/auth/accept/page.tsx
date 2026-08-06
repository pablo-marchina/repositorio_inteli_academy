import { AcceptInviteForm } from "@/components/AcceptInviteForm";

export default function AcceptInvitePage() {
  return (
    <main className="login-page">
      <section className="login-hero">
        <div className="logo-lockup"><span className="logo-mark inverse">IA</span><span>Inteli Academy</span></div>
        <div className="login-copy">
          <h1>Seu acesso administrativo começa aqui.</h1>
          <p>Confirme o convite e defina sua senha para entrar na redação automática.</p>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <span className="eyebrow">Convite administrativo</span>
          <h2>Concluir cadastro</h2>
          <AcceptInviteForm />
        </div>
      </section>
    </main>
  );
}
