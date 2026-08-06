"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/ArticleSelector.module.css";

type ArticleInsight = {
  relevanceScore: number;
  category: string;
  rationale: string;
};

type ArticleOption = {
  id: string;
  title: string;
  summary: string;
  canonicalUrl: string;
  sourceName: string;
  sourceQuality: number;
  contentType: string;
  publishedAt: string;
  popularity: {
    points: number;
    comments: number;
    mentions: number;
  };
  insight: ArticleInsight | null;
};

const MIN_ARTICLES = 3;
const MAX_ARTICLES = 12;

function popularityScore(article: ArticleOption) {
  return article.popularity.points + article.popularity.comments * 1.5 + article.popularity.mentions * 3;
}

export function ArticleSelector({ articles }: { articles: ArticleOption[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [contentType, setContentType] = useState("all");
  const [sort, setSort] = useState("relevance");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const contentTypes = useMemo(
    () => [...new Set(articles.map((article) => article.contentType))].sort(),
    [articles]
  );

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
    const result = articles.filter((article) => {
      const matchesType = contentType === "all" || article.contentType === contentType;
      const matchesSearch =
        !normalizedSearch ||
        `${article.title} ${article.summary} ${article.sourceName} ${article.insight?.category ?? ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(normalizedSearch);
      return matchesType && matchesSearch;
    });
    return [...result].sort((a, b) => {
      if (sort === "newest") return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      if (sort === "quality") return b.sourceQuality - a.sourceQuality;
      if (sort === "popularity") return popularityScore(b) - popularityScore(a);
      return (b.insight?.relevanceScore ?? 0) - (a.insight?.relevanceScore ?? 0);
    });
  }, [articles, contentType, search, sort]);

  function toggle(articleId: string) {
    setMessage("");
    setSelected((current) => {
      if (current.includes(articleId)) return current.filter((id) => id !== articleId);
      if (current.length >= MAX_ARTICLES) {
        setMessage(`Você pode selecionar no máximo ${MAX_ARTICLES} artigos.`);
        return current;
      }
      return [...current, articleId];
    });
  }

  function selectVisible() {
    setSelected((current) => {
      const merged = [...new Set([...current, ...filtered.map((article) => article.id)])];
      if (merged.length > MAX_ARTICLES) {
        setMessage(`Foram selecionados os primeiros ${MAX_ARTICLES} artigos disponíveis.`);
      } else {
        setMessage("");
      }
      return merged.slice(0, MAX_ARTICLES);
    });
  }

  async function generate() {
    if (selected.length < MIN_ARTICLES) {
      setMessage(`Selecione pelo menos ${MIN_ARTICLES} artigos.`);
      return;
    }
    setPending(true);
    setMessage("");
    const response = await fetch("/api/pipeline/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: "generate", articleIds: selected })
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "Falha ao gerar a publicação.");
      setPending(false);
      return;
    }
    router.push("/posts");
    router.refresh();
  }

  return (
    <div className={styles.wrapper}>
      <section className={styles.controls}>
        <div className="field">
          <label htmlFor="article-search">Buscar artigos</label>
          <input
            id="article-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Título, assunto, categoria ou fonte"
          />
        </div>
        <div className="field">
          <label htmlFor="article-type">Tipo de conteúdo</label>
          <select id="article-type" value={contentType} onChange={(event) => setContentType(event.target.value)}>
            <option value="all">Todos</option>
            {contentTypes.map((type) => <option value={type} key={type}>{type}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="article-sort">Ordenar por</label>
          <select id="article-sort" value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="relevance">Relevância editorial</option>
            <option value="newest">Mais recentes</option>
            <option value="quality">Qualidade da fonte</option>
            <option value="popularity">Popularidade externa</option>
          </select>
        </div>
        <div className={styles.controlActions}>
          <button className="button secondary" type="button" onClick={selectVisible} disabled={!filtered.length}>
            Selecionar visíveis
          </button>
          <button className="button secondary" type="button" onClick={() => setSelected([])} disabled={!selected.length}>
            Limpar
          </button>
        </div>
      </section>

      <div className={styles.selectionHelp}>
        <strong>{selected.length} de {MAX_ARTICLES} selecionados</strong>
        <span>Escolha de 3 a 12 artigos. Itens sobre o mesmo fato são agrupados como fontes de uma única história.</span>
      </div>

      <section className={styles.list} aria-label="Artigos coletados">
        {filtered.map((article) => {
          const isSelected = selected.includes(article.id);
          const selectionDisabled = !isSelected && selected.length >= MAX_ARTICLES;
          return (
            <article className={`${styles.article} ${isSelected ? styles.selected : ""}`} key={article.id}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={selectionDisabled}
                  onChange={() => toggle(article.id)}
                />
                <span className={styles.checkText}>{isSelected ? "Selecionado" : "Selecionar"}</span>
              </label>

              <div className={styles.articleBody}>
                <div className={styles.meta}>
                  <span className="badge">{article.contentType}</span>
                  <span>{article.sourceName}</span>
                  <span>fonte {Math.round(article.sourceQuality * 100)}%</span>
                  <span>{new Date(article.publishedAt).toLocaleString("pt-BR")}</span>
                </div>
                <a className={styles.titleLink} href={article.canonicalUrl} target="_blank" rel="noreferrer">
                  {article.title}
                </a>
                {article.summary ? <p>{article.summary}</p> : null}
                {article.insight ? (
                  <div className={styles.insightBox}>
                    <div className={styles.insightHeader}>
                      <strong>Filtro editorial</strong>
                      <span className={styles.relevance}>{article.insight.relevanceScore.toFixed(1)}/10</span>
                      <span className="badge">{article.insight.category}</span>
                    </div>
                    {article.insight.rationale ? <span>{article.insight.rationale}</span> : null}
                  </div>
                ) : (
                  <div className={styles.pendingInsight}>Ainda não classificado pelo Gemini.</div>
                )}
                <div className={styles.signals}>
                  {article.popularity.points > 0 ? <span>{article.popularity.points} pontos</span> : null}
                  {article.popularity.comments > 0 ? <span>{article.popularity.comments} comentários</span> : null}
                  {article.popularity.mentions > 1 ? <span>{article.popularity.mentions} menções</span> : null}
                  <a href={article.canonicalUrl} target="_blank" rel="noreferrer">Ler na fonte ↗</a>
                </div>
              </div>
            </article>
          );
        })}
        {!filtered.length ? <div className="card empty">Nenhum artigo corresponde aos filtros.</div> : null}
      </section>

      <section className={styles.actionBar} aria-live="polite">
        <div>
          <strong>{selected.length} artigo(s) escolhidos</strong>
          <span>A publicação usará somente as fontes selecionadas.</span>
          {message ? <p className="feedback error">{message}</p> : null}
        </div>
        <button className="button" type="button" onClick={generate} disabled={pending || selected.length < MIN_ARTICLES}>
          {pending ? "Gerando publicação…" : "Gerar com artigos selecionados"}
        </button>
      </section>
    </div>
  );
}
