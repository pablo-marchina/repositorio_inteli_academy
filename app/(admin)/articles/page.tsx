import { ArticleSelector } from "@/components/ArticleSelector";
import { RunPipelineButton } from "@/components/RunPipelineButton";
import { requireAdmin } from "@/lib/auth";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseInsight(value: unknown) {
  const insight = asRecord(asRecord(value).insight);
  const relevanceScore = Number(insight.relevanceScore);
  if (!Number.isFinite(relevanceScore)) return null;
  return {
    relevanceScore,
    category: String(insight.category ?? "Outros"),
    rationale: String(insight.rationale ?? "")
  };
}

export default async function ArticlesPage() {
  const { supabase } = await requireAdmin();
  const { data: articles } = await supabase
    .from("articles")
    .select("id,title,summary,canonical_url,source_name,source_quality,content_type,published_at,popularity,raw")
    .order("published_at", { ascending: false })
    .limit(500);

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
    raw: unknown;
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
    },
    insight: parseInsight(article.raw)
  }));

  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">Coleta ampla e filtro editorial</span>
          <h1>Artigos coletados</h1>
          <p>
            O sistema percorre todos os feeds válidos encontrados no catálogo, combina as fontes fixas e o Hacker News, remove duplicatas e então classifica os candidatos mais fortes por relevância. Cada título abre a fonte original.
          </p>
        </div>
        <RunPipelineButton stage="collect" label="Coletar e filtrar" />
      </header>

      {options.length ? (
        <ArticleSelector articles={options} />
      ) : (
        <article className="card empty">
          Nenhum artigo foi coletado. Clique em Coletar e filtrar e tente novamente.
        </article>
      )}
    </>
  );
}
