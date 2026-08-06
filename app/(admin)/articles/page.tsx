import { ArticleSelector } from "@/components/ArticleSelector";
import { RunPipelineButton } from "@/components/RunPipelineButton";
import { requireAdmin } from "@/lib/auth";

const DAY = 86_400_000;

export default async function ArticlesPage() {
  const { supabase } = await requireAdmin();
  const since = new Date(Date.now() - 14 * DAY).toISOString();
  const { data: articles } = await supabase
    .from("articles")
    .select("id,title,summary,canonical_url,source_name,source_quality,content_type,published_at,popularity")
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(240);

  const options = (articles ?? []).map((article: {
    id: string;
    title: string;
    summary: string;
    canonical_url: string;
    source_name: string;
    source_quality: number | string;
    content_type: string;
    published_at: string;
    popularity: Record<string, number> | null;
  }) => ({
    id: article.id,
    title: article.title,
    summary: article.summary,
    canonicalUrl: article.canonical_url,
    sourceName: article.source_name,
    sourceQuality: Number(article.source_quality),
    contentType: article.content_type,
    publishedAt: article.published_at,
    popularity: {
      points: Number(article.popularity?.points ?? 0),
      comments: Number(article.popularity?.comments ?? 0),
      mentions: Number(article.popularity?.mentions ?? 0)
    }
  }));

  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">Fontes e seleção manual</span>
          <h1>Artigos coletados</h1>
          <p>
            Cada título leva diretamente à página original. Para uma publicação manual, selecione de três a doze artigos; a geração automática continua escolhendo pelo ranking do sistema.
          </p>
        </div>
        <RunPipelineButton stage="collect" label="Atualizar coleta" />
      </header>

      {options.length ? (
        <ArticleSelector articles={options} />
      ) : (
        <article className="card empty">
          Nenhum artigo recente foi coletado. Clique em Atualizar coleta e tente novamente.
        </article>
      )}
    </>
  );
}
