import { InstagramConnectionCard } from "@/components/InstagramConnectionCard";
import { InviteUserForm } from "@/components/InviteUserForm";
import { ScheduleForm } from "@/components/ScheduleForm";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";

export default async function SettingsPage() {
  const { supabase } = await requireAdmin();
  const config = env();
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
          <h2>Modelos e filtro de fontes</h2>
          <p>A coleta percorre todos os feeds válidos do catálogo. Depois da deduplicação, um modelo rápido classifica os candidatos e o modelo editorial de maior qualidade cria e revisa o post.</p>
          <div className="list section">
            <div className="list-row">
              <div><h3>Modelo editorial</h3><p>Geração, correção, revisão factual e revisão de estilo.</p></div>
              <span className={config.GEMINI_API_KEY ? "badge success" : "badge failed"}>{config.GEMINI_POST_MODEL}</span>
            </div>
            <div className="list-row">
              <div><h3>Modelo de filtragem</h3><p>Classificação de relevância e categoria em alto volume.</p></div>
              <span className={config.GEMINI_API_KEY ? "badge success" : "badge failed"}>{config.GEMINI_FILTER_MODEL}</span>
            </div>
            <div className="list-row">
              <div><h3>Catálogo de feeds</h3><p>Todos os endereços válidos encontrados são consultados; não existe limite de 16 feeds.</p></div>
              <span className={config.COMMUNITY_FEED_DISCOVERY ? "badge success" : "badge"}>{config.COMMUNITY_FEED_DISCOVERY ? "catálogo completo" : "desativado"}</span>
            </div>
            <div className="list-row">
              <div><h3>Classificação por execução</h3><p>Após pré-filtros objetivos de recência, tema e qualidade.</p></div>
              <span className="badge">até {config.MAX_ARTICLES_TO_CLASSIFY}</span>
            </div>
            <div className="list-row">
              <div><h3>Corte de relevância</h3><p>Artigos abaixo da nota não entram no ranking automático.</p></div>
              <span className="badge">{config.MIN_ARTICLE_RELEVANCE.toFixed(1)}/10</span>
            </div>
          </div>
          <div className="code-note">Essas opções são controladas pelas variáveis de ambiente da Vercel e nenhum segredo é exibido.</div>
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
          <p>O GitHub Actions chama o endpoint de cron a cada hora. Ele executa a coleta e filtragem quando vencidas, além das etapas de geração, publicação e métricas conforme o agendamento.</p>
          <div className="code-note">Configure APP_URL e CRON_SECRET nos secrets do GitHub.</div>
        </article>
      </section>
    </>
  );
}
