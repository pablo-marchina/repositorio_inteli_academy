import { InstagramConnectionCard } from "@/components/InstagramConnectionCard";
import { InviteUserForm } from "@/components/InviteUserForm";
import { ScheduleForm } from "@/components/ScheduleForm";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { instagramIntegrationSummary } from "@/lib/instagram";

type SettingsSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SettingsPage({ searchParams }: { searchParams: SettingsSearchParams }) {
  const { supabase } = await requireAdmin();
  const config = env();
  const params = await searchParams;
  const instagramError = typeof params.instagram_error === "string" ? params.instagram_error : null;
  const instagramConnected = params.instagram === "connected";
  const instagramConfig = instagramIntegrationSummary();
  const [account, settings, users, drive] = await Promise.all([
    supabase.from("instagram_accounts").select("username,account_type,token_expires_at").eq("is_active", true).order("connected_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("app_settings").select("timezone,publish_weekday,publish_hour,generation_lead_hours,auto_publish").eq("id", true).single(),
    supabase.from("profiles").select("id,email,created_at").order("created_at"),
    supabase.from("drive_connections").select("google_email,root_folder_id,is_active,token_expires_at,connected_at").eq("id", true).maybeSingle()
  ]);

  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">Administração</span>
          <h1>Configurações</h1>
          <p>Todos os usuários convidados são administradores. Instagram, Drive, Figma e agendamento ficam centralizados aqui.</p>
        </div>
      </header>
      <section className="settings-stack">
        <article className="card">
          <h2>Instagram</h2>
          {instagramConnected ? <p className="feedback success">Instagram conectado com sucesso.</p> : null}
          {instagramError ? <p className="feedback error"><strong>Falha ao conectar:</strong> {instagramError}</p> : null}
          <InstagramConnectionCard account={account.data ?? null} />
          <div className="list section">
            <div className="list-row">
              <div><h3>Credenciais OAuth</h3><p>Use o Instagram App ID e o Instagram App Secret do produto Instagram no Meta App Dashboard.</p></div>
              <span className={instagramConfig.configured ? "badge success" : "badge failed"}>{instagramConfig.configured ? instagramConfig.credentialSource : "não configurado"}</span>
            </div>
            <div className="list-row">
              <div><h3>Business Login</h3><p>Login direto do Instagram com opção de autenticação pela conta Facebook/Meta habilitada.</p></div>
              <span className="badge">{instagramConfig.businessLoginUrlConfigured ? "embed URL configurada" : "URL gerada pelo app"}</span>
            </div>
            <div className="list-row">
              <div><h3>Graph API</h3><p>{instagramConfig.scopes.join(" · ")}</p></div>
              <span className="badge">{instagramConfig.graphVersion}</span>
            </div>
          </div>
          <div className="code-note">
            Callback OAuth exato para cadastrar no Meta App Dashboard:<br />
            <code>{instagramConfig.callbackUrl}</code>
            {instagramConfig.appIdTail ? <><br />App ID configurado termina em <code>{instagramConfig.appIdTail}</code>.</> : null}
          </div>
          <div className="code-note">A conta precisa ser Business ou Creator. Para testes com Standard Access, use uma conta profissional que você gerencia e que esteja adicionada ao app; para contas externas, o app precisa do acesso correspondente aprovado pela Meta.</div>
        </article>

        <article className="card">
          <h2>Google Drive · biblioteca de mídia</h2>
          {drive.data?.is_active ? (
            <div className="list section">
              <div className="list-row">
                <div><h3>{drive.data.google_email || "Conta Google conectada"}</h3><p>Pasta raiz: {drive.data.root_folder_id}</p></div>
                <span className="badge success">conectado</span>
              </div>
              <div className="list-row">
                <div><h3>Acesso somente leitura</h3><p>A plataforma lista imagens e vídeos recursivamente; nenhum arquivo do Drive é alterado.</p></div>
                <a className="badge" href="/api/drive/connect">Reconectar</a>
              </div>
            </div>
          ) : (
            <div className="section">
              <p>Conecte a conta Google que tem acesso à pasta de mídia da Inteli Academy. O Content Studio só usa arquivos escolhidos explicitamente em cada geração.</p>
              <a className="button" href="/api/drive/connect">Conectar Google Drive</a>
            </div>
          )}
          <div className="code-note">Pasta configurada: {config.GOOGLE_DRIVE_ROOT_FOLDER_ID}. Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET na Vercel para habilitar o OAuth.</div>
        </article>

        <article className="card">
          <h2>Figma · revisão final</h2>
          <div className="list section">
            <div className="list-row">
              <div><h3>ID Academy</h3><p>Arquivo {config.FIGMA_FILE_KEY}; outputs entram em “{config.FIGMA_OUTPUT_PAGE_NAME}”.</p></div>
              <span className={config.FIGMA_ACCESS_TOKEN ? "badge success" : "badge failed"}>{config.FIGMA_ACCESS_TOKEN ? "leitura/export configurada" : "falta token"}</span>
            </div>
            <div className="list-row">
              <div><h3>Content Bridge</h3><p>O plugin interno importa apenas a versão escolhida como frames editáveis e devolve os node IDs para a plataforma.</p></div>
              <span className={config.FIGMA_PLUGIN_SECRET ? "badge success" : "badge failed"}>{config.FIGMA_PLUGIN_SECRET ? "bridge configurado" : "falta segredo"}</span>
            </div>
          </div>
          <div className="code-note">Instale o plugin local a partir de figma-plugin/manifest.json e configure nele a URL desta aplicação + o mesmo FIGMA_PLUGIN_SECRET. O token FIGMA_ACCESS_TOKEN permanece somente no servidor.</div>
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
              <div><h3>Modelo editorial</h3><p>Geração, variações, análise da referência real, correção e revisão.</p></div>
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
          <div className="code-note">Configure APP_URL e CRON_SECRET nos secrets do GitHub. O fluxo manual do Content Studio só publica após aprovação explícita.</div>
        </article>
      </section>
    </>
  );
}
