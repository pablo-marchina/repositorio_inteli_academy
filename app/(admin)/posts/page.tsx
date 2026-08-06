import Link from "next/link";
import { PostCarouselPreview } from "@/components/PostCarouselPreview";
import { RunPipelineButton } from "@/components/RunPipelineButton";
import { requireAdmin } from "@/lib/auth";
import { signPublicAsset } from "@/lib/crypto";

function statusClass(status: string) {
  if (status === "published" || status === "approved") return "badge success";
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
  const { data: posts } = await supabase
    .from("posts")
    .select("id,title,caption,status,scheduled_for,published_at,last_error,review_report,post_slides(position)")
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">Histórico e fila</span>
          <h1>Publicações</h1>
          <p>
            A automação escolhe as histórias pelo ranking. Para controlar uma geração manual, abra a seleção de artigos e escolha exatamente quais fontes serão usadas.
          </p>
        </div>
        <div className="post-actions">
          <Link className="button secondary" href="/articles">Selecionar artigos</Link>
          <RunPipelineButton stage="publish" label="Publicar vencidos" />
        </div>
      </header>

      <section className="grid two">
        {(posts ?? []).map((post: {
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
                        <a
                          className="badge"
                          href={article.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          title={article.title}
                          key={article.id}
                        >
                          {article.sourceName} ↗
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
                {post.last_error ? <p className="feedback error">{post.last_error}</p> : null}
                {slides.length ? (
                  <div className="post-actions">
                    <PostCarouselPreview title={post.title} slides={slides} />
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
        {!posts?.length ? <article className="card empty">Ainda não há posts. Colete histórias e selecione os artigos da primeira publicação.</article> : null}
      </section>
    </>
  );
}
