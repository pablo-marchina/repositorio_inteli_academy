"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/ContentStudio.module.css";
import { MAX_STUDIO_ARTICLES, MAX_STUDIO_DRIVE_ASSETS, MAX_STUDIO_REFERENCES } from "@/lib/studio-limits";
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
  { id: "reel", title: "Reel", description: "Montagem com vídeos e fotos; duração, densidade e quantidade de cortes seguem a referência selecionada." },
  { id: "story", title: "Story", description: "Uma peça vertical 1080×1920." }
];

export function ContentStudio({ articles, initialReferences, driveConnected }: { articles: Article[]; initialReferences: Reference[]; driveConnected: boolean }) {
  const router = useRouter();
  const [contentType, setContentType] = useState<StudioContentType>("carousel");
  const [selectedArticles, setSelectedArticles] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [userContext, setUserContext] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [partnerLogoAssetId, setPartnerLogoAssetId] = useState("");
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
    () => driveAssets.filter((asset) => contentType === "reel"
      ? asset.mimeType.startsWith("video/") || asset.mimeType.startsWith("image/")
      : asset.mimeType.startsWith("image/")),
    [driveAssets, contentType]
  );
  const logoAssets = useMemo(() => driveAssets.filter((asset) => asset.mimeType.startsWith("image/")), [driveAssets]);

  const selectedVideoCount = selectedAssets.filter((id) => driveAssets.find((asset) => asset.id === id)?.mimeType.startsWith("video/")).length;
  const selectedImageCount = selectedAssets.filter((id) => driveAssets.find((asset) => asset.id === id)?.mimeType.startsWith("image/")).length;
  const selectedVisualCount = selectedVideoCount + selectedImageCount;
  const selectedPartnerLogo = logoAssets.find((asset) => asset.id === partnerLogoAssetId);

  function toggleArticle(id: string) {
    setSelectedArticles((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < MAX_STUDIO_ARTICLES ? [...current, id] : current);
  }

  function toggleReference(id: string) {
    setSelectedReferences((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < MAX_STUDIO_REFERENCES ? [...current, id] : current);
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

  async function loadDriveLibrary() {
    if (driveAssets.length || !driveConnected) return;
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

  async function enableDrive(checked: boolean) {
    setUseDrive(checked);
    setSelectedAssets([]);
    if (checked) await loadDriveLibrary();
  }

  function toggleAsset(id: string) {
    setSelectedAssets((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= MAX_STUDIO_DRIVE_ASSETS) return current;
      return [...current, id];
    });
  }

  async function generate() {
    setError("");
    if (useDrive && !selectedAssets.length) return setError("O uso do Drive está habilitado; escolha pelo menos uma mídia editorial.");
    if (contentType === "reel" && !selectedVisualCount) return setError("Reel requer pelo menos um vídeo ou uma imagem selecionada do Drive.");
    if (contentType === "reel" && !selectedVideoCount) return setError("Reel requer pelo menos um vídeo; as fotos selecionadas entram como shots complementares da montagem.");
    if (partnerLogoAssetId && !partnerName.trim()) return setError("Informe o nome do parceiro associado à logo selecionada.");
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
          driveAssetIds: selectedAssets,
          partnerName: partnerName.trim() || undefined,
          partnerLogoAssetId: partnerLogoAssetId || undefined
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
        <div className={styles.formatGrid}>{formats.map((format) => (
          <button key={format.id} type="button" className={`${styles.format} ${contentType === format.id ? styles.formatActive : ""}`} onClick={() => { setContentType(format.id); setSelectedAssets([]); }}>
            <strong>{format.title}</strong><span>{format.description}</span>
          </button>
        ))}</div>
      </section>

      <section className={styles.section}>
        <div className={styles.toolbar}><div><h2>2. Artigos <small>(opcional)</small></h2><p>Selecione artigos quando quiser fundamentar fatos, números ou uma pauta específica. Sem artigos, a geração usa o contexto informado e evita criar alegações factuais externas sem fonte.</p></div><span className={styles.count}>{selectedArticles.length}/{MAX_STUDIO_ARTICLES} selecionados</span></div>
        <input className={styles.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar artigos por título, resumo ou fonte" />
        <div className={styles.articleList}>{filteredArticles.map((article) => (
          <label className={styles.article} key={article.id}>
            <input type="checkbox" checked={selectedArticles.includes(article.id)} onChange={() => toggleArticle(article.id)} />
            <div><h3>{article.title}</h3><p>{article.summary}</p></div>
            <span className={styles.meta}>{article.source_name}<br />{new Date(article.published_at).toLocaleDateString("pt-BR")}</span>
          </label>
        ))}</div>
      </section>

      <section className={styles.section}>
        <h2>3. Contexto específico <small>(opcional)</small></h2>
        <p>Objetivo, mensagem obrigatória, público, CTA, restrições ou qualquer orientação que só vale para este post.</p>
        <textarea className={styles.textarea} value={userContext} onChange={(event) => setUserContext(event.target.value)} placeholder="Ex.: destacar que o evento é aberto para membros, evitar linguagem promocional, CTA para inscrição…" />
      </section>

      <section className={styles.section}>
        <h2>4. Marca parceira <small>(opcional)</small></h2>
        <p>Para visitas, cases, parcerias e eventos com empresas, informe a organização e selecione uma logo oficial já autorizada no Drive. A logo é tratada como asset de marca e nunca entra no pool de fotos/shots do conteúdo.</p>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(260px, 1fr)", gap: 12 }}>
          <input className={styles.search} value={partnerName} onChange={(event) => { setPartnerName(event.target.value); if (!event.target.value.trim()) setPartnerLogoAssetId(""); }} placeholder="Nome do parceiro, ex.: Empresa X" />
          {driveConnected ? <select className={styles.search} value={partnerLogoAssetId} onFocus={() => void loadDriveLibrary()} onChange={(event) => setPartnerLogoAssetId(event.target.value)}>
            <option value="">Sem logo selecionada</option>
            {logoAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          </select> : <a href="/api/drive/connect">Conecte o Google Drive para selecionar uma logo oficial</a>}
        </div>
        {driveConnected && !driveAssets.length ? <button className={styles.secondary} type="button" disabled={loadingDrive} onClick={() => void loadDriveLibrary()}>{loadingDrive ? "Carregando…" : "Carregar imagens do Drive"}</button> : null}
        {selectedPartnerLogo ? <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}><img src={`/api/drive/preview/${encodeURIComponent(selectedPartnerLogo.id)}`} alt="Logo parceira selecionada" style={{ width: 72, height: 48, objectFit: "contain", borderRadius: 8, background: "white" }} /><span className={styles.count}>Asset de marca: {selectedPartnerLogo.name} · não será usado como footage</span></div> : partnerName.trim() ? <p className={styles.count}>Sem logo autorizada: a versão pode ser gerada para revisão, mas a aprovação final ficará bloqueada até a marca ser resolvida.</p> : null}
      </section>

      <section className={styles.section}>
        <div className={styles.toolbar}>
          <div><h2>5. Posts reais do Instagram como referência <small>(opcional)</small></h2><p>Ao escolher um Reel, o sistema lê timing, composição, mudanças entre cortes e, quando disponível, função narrativa. A referência define a estrutura; o Figma e os assets autorizados definem a identidade.</p></div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><span className={styles.count}>{selectedReferences.length}/{MAX_STUDIO_REFERENCES} selecionados</span><button className={styles.secondary} type="button" disabled={syncingInstagram} onClick={syncReferences}>{syncingInstagram ? "Sincronizando…" : "Sincronizar @inteli.academy"}</button></div>
        </div>
        <div className={styles.referenceGrid}>
          <button type="button" className={`${styles.reference} ${selectedReferences.length === 0 ? styles.referenceActive : ""}`} onClick={() => setSelectedReferences([])}><div className={styles.referenceImage} /><div className={styles.referenceBody}><strong>Sem referências específicas</strong><span>Usar o histórico real completo + design system descoberto no Figma.</span></div></button>
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
        <div className={styles.toolbar}><div><h2>6. Mídia editorial do Drive <small>(opcional)</small></h2><p>{contentType === "reel" ? `Selecione até ${MAX_STUDIO_DRIVE_ASSETS} vídeos/fotos de conteúdo. A IA escolhe livremente a trilha musical fora do Drive, define o trecho/BPM e usa essa direção para montar os cortes. Logos selecionadas acima ficam fora deste pool.` : `O sistema só pode usar os arquivos editoriais que você selecionar, até ${MAX_STUDIO_DRIVE_ASSETS} mídias por geração.`}</p></div><label className={styles.driveToggle}><input type="checkbox" checked={useDrive} disabled={!driveConnected} onChange={(event) => void enableDrive(event.target.checked)} /> Usar Drive</label></div>
        {!driveConnected ? <p><a href="/api/drive/connect">Conecte o Google Drive em Configurações</a> para habilitar a biblioteca.</p> : null}
        {loadingDrive ? <p>Carregando biblioteca de mídia…</p> : null}
        {useDrive && !loadingDrive ? <>
          <span className={styles.count}>{selectedAssets.length}/{MAX_STUDIO_DRIVE_ASSETS} selecionados · {contentType === "reel" ? `${selectedVideoCount} vídeo(s) · ${selectedImageCount} foto(s) · trilha escolhida livremente pela IA` : "imagens"}</span>
          <div className={styles.mediaGrid}>{compatibleAssets.filter((asset) => asset.id !== partnerLogoAssetId).map((asset) => {
            const isVideo = asset.mimeType.startsWith("video/");
            const isImage = asset.mimeType.startsWith("image/");
            const duration = asset.durationMillis ? `${(asset.durationMillis / 1000).toFixed(1)}s` : "";
            return <button type="button" key={asset.id} className={`${styles.media} ${selectedAssets.includes(asset.id) ? styles.mediaActive : ""}`} onClick={() => toggleAsset(asset.id)}>
              <div className={styles.mediaThumb} style={isImage ? { backgroundImage: `url(/api/drive/preview/${encodeURIComponent(asset.id)})` } : undefined}>{isVideo ? "▶ vídeo" : ""}</div>
              <div className={styles.mediaBody}><strong title={asset.name}>{asset.name}</strong><span>{[asset.path?.join(" / ") || "raiz", isImage ? "foto" : duration].filter(Boolean).join(" · ")}</span></div>
            </button>;
          })}</div>
        </> : null}
      </section>

      <div className={styles.footer}>
        <div><strong>Pronto para gerar a V1</strong><div className={styles.count}>{selectedArticles.length} artigo(s) · {selectedReferences.length ? `${selectedReferences.length} referência(s) específica(s)` : "histórico geral"} · {selectedAssets.length} mídia(s) editorial(is){partnerLogoAssetId ? " · 1 logo de parceiro" : ""}</div>{error ? <div className={styles.feedback}>{error}</div> : null}</div>
        <button className={styles.primary} type="button" disabled={generating} onClick={generate}>{generating ? "Analisando mídia e gerando…" : "Gerar versão visual"}</button>
      </div>
    </div>
  );
}
