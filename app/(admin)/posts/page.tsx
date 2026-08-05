import { RunPipelineButton } from "@/components/RunPipelineButton";
import { requireAdmin } from "@/lib/auth";
import { signPublicAsset } from "@/lib/crypto";

function statusClass(status: string) {
  if (status === "published" || status === "approved") return "badge success";
  if (status === "failed") return "badge failed";
  return "badge";
}

export default async function PostsPage() {
  const { supabase } = await requireAdmin();
  const { data: posts } = await supabase
    .from("posts")
    .select("id,title,caption,status,scheduled_for,published_at,last_error,post_slides(position,content)")
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">Histórico e fila</span>
          <h1>Publicações</h1>
          <p>Cada post passa por revisão factual, editorial, visual e técnica antes da aprovação automática.</p>
        </div>
        <div className="post-actions">
          <RunPipelineButton stage="generate" label="Gerar semana" />
          <RunPipelineButton stage="publish" label="Publicar vencidos" />
        </div>
      </header>

      <section className="grid two">
        {(posts ?? []).map((post: { id: string; title: string; caption: string; status: string; scheduled_for: string | null; published_at: string | null; last_error: string | null; post_slides: Array<{ position: number; content: unknown }> | null }) => {
          const first = [...(post.post_slides ?? [])].sort((a, b) => a.position - b.position)[0];
          const sig = first ? signPublicAsset(`${post.id}:${first.position}`) : "";
          return (
            <article className="card post-card" key={post.id}>
              <div className="post-cover">
                <span className="badge" style={{ width: "fit-content", color: "white", background: "rgba(255,255,255,.18)" }}>Inteli Academy</span>
                <h3>{post.title}</h3>
              </div>
              <div className="post-details">
                <div className="post-meta">
                  <span className={statusClass(post.status)}>{post.status}</span>
                  <span className="badge">{post.post_slides?.length ?? 0} slides</span>
                  {post.scheduled_for ? <span className="badge">{new Date(post.scheduled_for).toLocaleString("pt-BR")}</span> : null}
                </div>
                <p>{post.caption.slice(0, 220)}{post.caption.length > 220 ? "…" : ""}</p>
                {post.last_error ? <p className="feedback error">{post.last_error}</p> : null}
                {first ? <div className="post-actions"><a className="button secondary" target="_blank" rel="noreferrer" href={`/api/render/${post.id}/${first.position}?sig=${encodeURIComponent(sig)}`}>Ver capa renderizada</a></div> : null}
              </div>
            </article>
          );
        })}
        {!posts?.length ? <article className="card empty">Ainda não há posts. Colete histórias e gere a primeira semana.</article> : null}
      </section>
    </>
  );
}
