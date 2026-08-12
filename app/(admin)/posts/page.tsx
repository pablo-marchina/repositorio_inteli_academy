import Link from "next/link";
import { PostCarouselPreview } from "@/components/PostCarouselPreview";
import { RunPipelineButton } from "@/components/RunPipelineButton";
import { requireAdmin } from "@/lib/auth";
import { signPublicAsset } from "@/lib/crypto";

function statusClass(status: string) {
  if (status === "published" || status === "approved" || status === "in_figma") return "badge success";
  if (status === "failed") return "badge failed";
  return "badge";
}

type SelectedArticle = {
  id: string;
  title: string;
  sourceName: string;
  sourceUrl: string;
};

export default async function PostsPage() {
  const { supabase } = await requireAdmin();
  const [legacyPosts, studioProjects] = await Promise.all([
    supabase
      .from("posts")
      .select("id,title,caption,status,scheduled_for,published_at,last_error,review_report,post_slides(position)")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("content_projects")
      .select("id,name,content_type,status,published_permalink,published_at,last_error,created_at,content_versions(id)")
      .order("created_at", { ascending: false })
      .limit(30)
  ]);
  const posts = legacyPosts.data ?? [];
  const projects = studioProjects.data ?? [];

  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">Histórico e fila</span>
          <h1>Publicações</h1>
          <p>O Content Studio concentra os posts criados com referência real do Instagram, versões e revisão no Figma. A automação semanal antiga continua separada abaixo.</p>
        </div>
        <div className="post-actions">
          <Link className="button" href="/create">Criar conteúdo</Link>
          <Link className="button secondary" href="/articles">Artigos</Link>
          <RunPipelineButton stage="publish" label="Publicar vencidos" />
        </div>
      </header>

      <section className="section">
        <div className="section-heading">
          <div><span className="eyebrow">Content Studio</span><h2>Projetos com revisão no Figma</h2></div>
        </div>
        <div className="grid two">
          {projects.map((project: {
            id: string;
            name: string;
            content_type: string;
            status: string;
            published_permalink: string | null;
            published_at: string | null;
            last_error: string | null;
            created_at: string;
            content_versions: Array<{ id: string }> | null;
          }) => (
            <article className="card" key={project.id}>
              <div className="post-meta">
                <span className={statusClass(project.status)}>{project.status}</span>
                <span className="badge">{project.content_type}</span>
                <span className="badge">{project.content_versions?.length ?? 0} versão(ões)</span>
              </div>
              <h3>{project.name}</h3>
              <p>Criado em {new Date(project.created_at).toLocaleString("pt-BR")}{project.published_at ? ` · publicado em ${new Date(project.published_at).toLocaleString("pt-BR")}` : ""}</p>
              {project.last_error ? <p className="feedback error">{project.last_error}</p> : null}
              <div className="post-actions">
                <Link className="button secondary" href={`/studio/${project.id}`}>Abrir projeto</Link>
                {project.published_permalink ? <a className="button secondary" href={project.published_permalink} target="_blank" rel="noreferrer">Ver no Instagram ↗</a> : null}
              </div>
            </article>
          ))}
          {!projects.length ? <article className="card empty">Nenhum projeto manual ainda. Use “Criar conteúdo” para começar.</article> : null}
        </div>
      </section>

      <section className="section">
        <div className="section-heading"><div><span className="eyebrow">Automação legada</span><h2>Posts semanais</h2></div></div>
        <div className="grid two">
          {posts.map((post: {
            id: string;
            title: string;
            caption: string;
            status: string;
            scheduled_for: string | null;
            published_at: string | null;
            last_error: string | null;
            review_report: unknown;
            post_slides: Array<{ position: number }> | null;
          }) => {
            const slides = [...(post.post_slides ?? [])]
              .sort((a, b) => a.position - b.position)
              .map((slide) => {
                const signature = signPublicAsset(`${post.id}:${slide.position}`);
                return {
                  position: slide.position,
                  url: `/api/render/${post.id}/${slide.position}?sig=${encodeURIComponent(signature)}`
                };
              });
            const report = (post.review_report ?? {}) as { selectedArticles?: SelectedArticle[]; selectionMode?: string };
            const selectedArticles = Array.isArray(report.selectedArticles) ? report.selectedArticles : [];

            return (
              <article className="card post-card" key={post.id}>
                <div className="post-cover">
                  <span className="badge" style={{ width: "fit-content", color: "white", background: "rgba(255,255,255,.18)" }}>Inteli Academy</span>
                  <h3>{post.title}</h3>
                </div>
                <div className="post-details">
                  <div className="post-meta">
                    <span className={statusClass(post.status)}>{post.status}</span>
                    <span className="badge">{slides.length} slides</span>
                    {report.selectionMode === "manual" ? <span className="badge">seleção manual</span> : null}
                    {post.scheduled_for ? <span className="badge">{new Date(post.scheduled_for).toLocaleString("pt-BR")}</span> : null}
                  </div>
                  <p>{post.caption.slice(0, 220)}{post.caption.length > 220 ? "…" : ""}</p>
                  {selectedArticles.length ? (
                    <div>
                      <strong style={{ display: "block", marginBottom: 9 }}>Fontes usadas</strong>
                      <div className="post-meta">
                        {selectedArticles.map((article) => (
                          <a className="badge" href={article.sourceUrl} target="_blank" rel="noreferrer" title={article.title} key={article.id}>
                            {article.sourceName} ↗
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {post.last_error ? <p className="feedback error">{post.last_error}</p> : null}
                  {slides.length ? <div className="post-actions"><PostCarouselPreview title={post.title} slides={slides} /></div> : null}
                </div>
              </article>
            );
          })}
          {!posts.length ? <article className="card empty">Ainda não há posts da automação semanal.</article> : null}
        </div>
      </section>
    </>
  );
}
