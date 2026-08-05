import { MetricBars } from "@/components/MetricBars";
import { RunPipelineButton } from "@/components/RunPipelineButton";
import { requireAdmin } from "@/lib/auth";

function statusClass(status: string) {
  if (status === "published" || status === "approved") return "badge success";
  if (status === "failed") return "badge failed";
  return "badge";
}

export default async function DashboardPage() {
  const { supabase } = await requireAdmin();
  const [articles, clusters, posts, account, recentClusters, recentPosts, latestMetrics, weights] = await Promise.all([
    supabase.from("articles").select("id", { count: "exact", head: true }),
    supabase.from("story_clusters").select("id", { count: "exact", head: true }),
    supabase.from("posts").select("id", { count: "exact", head: true }),
    supabase.from("instagram_accounts").select("username").eq("is_active", true).limit(1).maybeSingle(),
    supabase.from("story_clusters").select("id,title,topic,score,source_count").order("score", { ascending: false }).limit(6),
    supabase.from("posts").select("id,title,status,scheduled_for,published_at").order("created_at", { ascending: false }).limit(5),
    supabase.from("post_metrics").select("views,reach,likes,comments,saved,shares,follows").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("model_weights").select("feature,weight").order("weight", { ascending: false }).limit(7)
  ]);

  const metric = latestMetrics.data;
  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">Redação automática</span>
          <h1>Visão geral</h1>
          <p>O sistema coleta sinais diariamente, seleciona histórias, revisa o conteúdo, publica e ajusta seus próprios pesos com os resultados do perfil.</p>
        </div>
        <RunPipelineButton stage="collect" label="Coletar agora" />
      </header>

      <section className="grid stats">
        <article className="card stat-card"><span>Artigos coletados</span><strong>{articles.count ?? 0}</strong></article>
        <article className="card stat-card"><span>Histórias agrupadas</span><strong>{clusters.count ?? 0}</strong></article>
        <article className="card stat-card"><span>Publicações</span><strong>{posts.count ?? 0}</strong></article>
        <article className="card stat-card"><span>Instagram ativo</span><strong style={{ fontSize: 26 }}>{account.data?.username ? `@${account.data.username}` : "Não conectado"}</strong></article>
      </section>

      <section className="grid two section">
        <article className="card">
          <h2>Histórias com maior potencial</h2>
          <div className="list">
            {(recentClusters.data ?? []).map((cluster: { id: string; title: string; topic: string; score: number | string; source_count: number }) => (
              <div className="list-row" key={cluster.id}>
                <div><h3>{cluster.title}</h3><p>{cluster.topic} · {cluster.source_count} fonte(s)</p></div>
                <span className="score">{Number(cluster.score).toFixed(1)}</span>
              </div>
            ))}
            {!recentClusters.data?.length ? <div className="empty">Execute a primeira coleta para criar o ranking.</div> : null}
          </div>
        </article>

        <article className="card">
          <h2>Fila editorial</h2>
          <div className="list">
            {(recentPosts.data ?? []).map((post: { id: string; title: string; status: string; scheduled_for: string | null }) => (
              <div className="list-row" key={post.id}>
                <div><h3>{post.title}</h3><p>{post.scheduled_for ? new Date(post.scheduled_for).toLocaleString("pt-BR") : "Sem agendamento"}</p></div>
                <span className={statusClass(post.status)}>{post.status}</span>
              </div>
            ))}
            {!recentPosts.data?.length ? <div className="empty">Nenhuma publicação foi gerada ainda.</div> : null}
          </div>
        </article>
      </section>

      <section className="grid two section">
        <article className="card">
          <h2>Últimas métricas</h2>
          {metric ? (
            <MetricBars metrics={[
              { label: "Visualizações", value: metric.views },
              { label: "Alcance", value: metric.reach },
              { label: "Compartilhamentos", value: metric.shares },
              { label: "Salvamentos", value: metric.saved },
              { label: "Comentários", value: metric.comments },
              { label: "Seguidores", value: metric.follows }
            ]} />
          ) : <div className="empty">As métricas aparecem depois da primeira publicação.</div>}
        </article>
        <article className="card">
          <h2>O que o modelo está aprendendo</h2>
          <div className="list">
            {(weights.data ?? []).map((weight: { feature: string; weight: number | string }) => (
              <div className="list-row" key={weight.feature}>
                <div><h3>{weight.feature}</h3><p>Influência atual no potencial de engajamento</p></div>
                <span className="score">{Number(weight.weight).toFixed(3)}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}
