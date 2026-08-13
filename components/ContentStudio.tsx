"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/ContentStudio.module.css";
import type { DriveAsset, StudioContentType } from "@/lib/types";

type Article = { id: string; title: string; summary: string; source_name: string; published_at: string };
type Reference = {
  id: string;
  media_type: string;
  media_product_type: string | null;
  caption: string;
  permalink: string;
  media_url: string | null;
  thumbnail_url: string | null;
  media_timestamp: string;
};

const formats: Array<{ id: StudioContentType; title: string; description: string }> = [
  { id: "single", title: "Post único", description: "Uma peça 1080×1350 para o feed." },
  { id: "carousel", title: "Carrossel", description: "De 2 a 10 peças com progressão narrativa." },
  { id: "reel", title: "Reel", description: "Vídeo selecionado do Drive + direção, capa e legenda." },
  { id: "story", title: "Story", description: "Uma peça vertical 1080×1920." }
];

export function ContentStudio({
  articles,
  initialReferences,
  driveConnected
}: {
  articles: Article[];
  initialReferences: Reference[];
  driveConnected: boolean;
}) {
  const router = useRouter();
  const [contentType, setContentType] = useState<StudioContentType>("carousel");
  const [selectedArticles, setSelectedArticles] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [userContext, setUserContext] = useState("");
  const [references, setReferences] = useState(initialReferences);
  const [selectedReferences, setSelectedReferences] = useState<string[]>([]);
  const [useDrive, setUseDrive] = useState(false);
  const [driveAssets, setDriveAssets] = useState<DriveAsset[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [syncingInstagram, setSyncingInstagram] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const filteredArticles = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    if (!needle) return articles;
    return articles.filter((article) => `${article.title} ${article.summary} ${article.source_name}`.toLocaleLowerCase("pt-BR").includes(needle));
  }, [articles, query]);

  const compatibleAssets = useMemo(
    () => driveAssets.filter((asset) => contentType === "reel" ? asset.mimeType.startsWith("video/") : asset.mimeType.startsWith("image/")),
    [driveAssets, contentType]
  );

  function toggleArticle(id: string) {
    setSelectedArticles((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 12 ? [...current, id] : current);
  }

  function toggleReference(id: string) {
    setSelectedReferences((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 8 ? [...current, id] : current);
  }

  async function syncReferences() {
    setSyncingInstagram(true);
    setError("");
    try {
      const sync = await fetch("/api/instagram/references", { method: "POST" });
      const syncBody = await sync.json();
      if (!sync.ok) throw new Error(syncBody.error ?? "Falha ao sincronizar Instagram.");
      const response = await fetch("/api/instagram/references", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao ler referências.");
      setReferences(body.references ?? []);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSyncingInstagram(false);
    }
  }

  async function enableDrive(checked: boolean) {
    setUseDrive(checked);
    setSelectedAssets([]);
    if (!checked || driveAssets.length || !driveConnected) return;
    setLoadingDrive(true);
    setError("");
    try {
      const response = await fetch("/api/drive/files", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao carregar o Drive.");
      setDriveAssets(body.assets ?? []);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoadingDrive(false);
    }
  }

  function toggleAsset(id: string) {
    setSelectedAssets((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 12 ? [...current, id] : current);
  }

  async function generate() {
    setError("");
    if (useDrive && !selectedAssets.length) return setError("O uso do Drive está habilitado; escolha pelo menos uma mídia.");
    if (contentType === "reel" && !selectedAssets.some((id) => driveAssets.find((asset) => asset.id === id)?.mimeType.startsWith("video/"))) {
      return setError("Reel requer um vídeo selecionado do Drive.");
    }
    setGenerating(true);
    try {
      const response = await fetch("/api/studio/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contentType,
          articleIds: selectedArticles,
          userContext,
          instagramReferenceMediaIds: selectedReferences,
          useDrive,
          driveAssetIds: selectedAssets
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao gerar conteúdo.");
      router.push(`/studio/${body.result.projectId}`);
      router.refresh();
    } catch (reason) {
      setError(String(reason));
      setGenerating(false);
    }
  }

  return (
    <div className={styles.studio}>
      <section className={styles.section}>
        <h2>1. Tipo de conteúdo</h2>
        <p>O formato controla proporção, número de peças, geração e publicação.</p>
        <div className={styles.formatGrid}>
          {formats.map((format) => (
            <button key={format.id} type="button" className={`${styles.format} ${contentType === format.id ? styles.formatActive : ""}`} onClick={() => { setContentType(format.id); setSelectedAssets([]); }}>
              <strong>{format.title}</strong><span>{format.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.toolbar}><div><h2>2. Artigos <small>(opcional)</small></h2><p>Selecione artigos quando quiser fundamentar fatos, números ou uma pauta específica. Sem artigos, a geração usa o contexto informado e evita criar alegações factuais externas sem fonte.</p></div><span className={styles.count}>{selectedArticles.length}/12 selecionados</span></div>
        <input className={styles.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar artigos por título, resumo ou fonte" />
        <div className={styles.articleList}>
          {filteredArticles.map((article) => (
            <label className={styles.article} key={article.id}>
              <input type="checkbox" checked={selectedArticles.includes(article.id)} onChange={() => toggleArticle(article.id)} />
              <div><h3>{article.title}</h3><p>{article.summary}</p></div>
              <span className={styles.meta}>{article.source_name}<br />{new Date(article.published_at).toLocaleDateString("pt-BR")}</span>
            </label>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2>3. Contexto específico <small>(opcional)</small></h2>
        <p>Objetivo, mensagem obrigatória, público, CTA, restrições ou qualquer orientação que só vale para este post.</p>
        <textarea className={styles.textarea} value={userContext} onChange={(event) => setUserContext(event.target.value)} placeholder="Ex.: destacar que o evento é aberto para membros, evitar linguagem promocional, CTA para inscrição…" />
      </section>

      <section className={styles.section}>
        <div className={styles.toolbar}>
          <div><h2>4. Posts reais do Instagram como referência <small>(opcional)</small></h2><p>Você pode escolher vários posts. Eles formam juntos a referência visual/editorial prioritária; o sistema combina os padrões compatíveis entre eles.</p></div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span className={styles.count}>{selectedReferences.length}/8 selecionados</span>
            <button className={styles.secondary} type="button" disabled={syncingInstagram} onClick={syncReferences}>{syncingInstagram ? "Sincronizando…" : "Sincronizar @inteli.academy"}</button>
          </div>
        </div>
        <div className={styles.referenceGrid}>
          <button type="button" className={`${styles.reference} ${selectedReferences.length === 0 ? styles.referenceActive : ""}`} onClick={() => setSelectedReferences([])}>
            <div className={styles.referenceImage} /><div className={styles.referenceBody}><strong>Sem referências específicas</strong><span>Usar o histórico real completo + Social Media como principal fonte visual do Figma.</span></div>
          </button>
          {references.map((reference) => {
            const image = reference.thumbnail_url ?? reference.media_url;
            const active = selectedReferences.includes(reference.id);
            return <button type="button" key={reference.id} className={`${styles.reference} ${active ? styles.referenceActive : ""}`} onClick={() => toggleReference(reference.id)} aria-pressed={active}>
              <div className={styles.referenceImage} style={image ? { backgroundImage: `url(${JSON.stringify(image).slice(1, -1)})` } : undefined} />
              <div className={styles.referenceBody}><strong>{active ? "✓ " : ""}{reference.media_product_type ?? reference.media_type} · {new Date(reference.media_timestamp).toLocaleDateString("pt-BR")}</strong><span>{reference.caption || "Sem legenda"}</span></div>
            </button>;
          })}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.toolbar}><div><h2>5. Mídia do Drive <small>(opcional)</small></h2><p>O sistema só pode usar os arquivos que você selecionar.</p></div>
          <label className={styles.driveToggle}><input type="checkbox" checked={useDrive} disabled={!driveConnected} onChange={(event) => enableDrive(event.target.checked)} /> Usar Drive</label>
        </div>
        {!driveConnected ? <p><a href="/api/drive/connect">Conecte o Google Drive em Configurações</a> para habilitar a biblioteca.</p> : null}
        {loadingDrive ? <p>Carregando biblioteca de mídia…</p> : null}
        {useDrive && !loadingDrive ? <>
          <span className={styles.count}>{selectedAssets.length}/12 selecionados · mostrando {contentType === "reel" ? "vídeos" : "imagens"} compatíveis</span>
          <div className={styles.mediaGrid}>{compatibleAssets.map((asset) => (
            <button type="button" key={asset.id} className={`${styles.media} ${selectedAssets.includes(asset.id) ? styles.mediaActive : ""}`} onClick={() => toggleAsset(asset.id)}>
              <div className={styles.mediaThumb} style={asset.mimeType.startsWith("image/") ? { backgroundImage: `url(/api/drive/preview/${encodeURIComponent(asset.id)})` } : undefined}>{asset.mimeType.startsWith("video/") ? "▶ vídeo" : ""}</div>
              <div className={styles.mediaBody}><strong title={asset.name}>{asset.name}</strong><span>{asset.path?.join(" / ") || "raiz"}</span></div>
            </button>
          ))}</div>
        </> : null}
      </section>

      <div className={styles.footer}>
        <div><strong>Pronto para gerar a V1</strong><div className={styles.count}>{selectedArticles.length} artigo(s) · {selectedReferences.length ? `${selectedReferences.length} referência(s) específica(s)` : "histórico geral"} · {selectedAssets.length} mídia(s) do Drive</div>{error ? <div className={styles.feedback}>{error}</div> : null}</div>
        <button className={styles.primary} type="button" disabled={generating} onClick={generate}>{generating ? "Gerando…" : "Gerar versão visual"}</button>
      </div>
    </div>
  );
}
