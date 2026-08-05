import { InstagramConnectionCard } from "@/components/InstagramConnectionCard";
import { InviteUserForm } from "@/components/InviteUserForm";
import { ScheduleForm } from "@/components/ScheduleForm";
import { requireAdmin } from "@/lib/auth";

export default async function SettingsPage() {
  const { supabase } = await requireAdmin();
  const [account, settings, users] = await Promise.all([
    supabase.from("instagram_accounts").select("username,account_type,token_expires_at").eq("is_active", true).order("connected_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("app_settings").select("timezone,publish_weekday,publish_hour,generation_lead_hours,auto_publish").eq("id", true).single(),
    supabase.from("profiles").select("id,email,created_at").order("created_at")
  ]);

  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">Administração</span>
          <h1>Configurações</h1>
          <p>Todos os usuários convidados são administradores. O Instagram e o agendamento podem ser alterados sem mudanças no código.</p>
        </div>
      </header>
      <section className="settings-stack">
        <article className="card">
          <h2>Instagram</h2>
          <InstagramConnectionCard account={account.data ?? null} />
        </article>
        <article className="card">
          <h2>Agendamento</h2>
          {settings.data ? <ScheduleForm initial={settings.data} /> : <p className="feedback error">Execute a migration inicial do Supabase.</p>}
        </article>
        <article className="card">
          <h2>Administradores</h2>
          <InviteUserForm />
          <div className="list section">
            {(users.data ?? []).map((user: { id: string; email: string; created_at: string }) => <div className="list-row" key={user.id}><div><h3>{user.email}</h3><p>Administrador desde {new Date(user.created_at).toLocaleDateString("pt-BR")}</p></div><span className="badge success">admin</span></div>)}
          </div>
        </article>
        <article className="card">
          <h2>Automação externa</h2>
          <p>O GitHub Actions chama o endpoint de cron a cada hora. Ele só executa as etapas que estiverem vencidas, respeitando o agendamento acima.</p>
          <div className="code-note">Configure APP_URL e CRON_SECRET nos secrets do GitHub.</div>
        </article>
      </section>
    </>
  );
}
