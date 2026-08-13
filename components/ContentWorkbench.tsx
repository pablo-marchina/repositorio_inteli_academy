"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/ContentWorkbench.module.css";
import type { DriveAsset, StudioFrame, StudioPayload } from "@/lib/types";

type Version = {
  id: string;
  version_number: number;
  parent_version_id: string | null;
  change_request: string;
  payload: StudioPayload;
  status: string;
  figma_frame_ids: string[];
  created_at: string;
};

type Project = {
  id: string;
  name: string;
  content_type: string;
  status: string;
  selected_version_id: string | null;
  figma_file_key: string | null;
  figma_frame_ids: string[];
  published_permalink: string | null;
  last_error: string | null;
  drive_assets: DriveAsset[];
};

type Provenance = {
  articles: Array<{ id: string; title: string; source_name: string; canonical_url: string }>;
  references: Array<{ id: string; permalink: string; caption: string }>;
  userContext: string;
};

function statusClass(status: string) {
  if (status === "published" || status === "in_figma") return `${styles.status} ${styles.success}`;
  if (status === "figma_queued" || status === "publishing") return `${styles.status} ${styles.warning}`;
  return styles.status;
}

function FramePreview({ frame, payload, project }: { frame: StudioFrame; payload: StudioPayload; project: Project }) {
  const vertical = payload.contentType === "story" || payload.contentType === "reel";
  const cta = frame.template === "cta";
  const asset = frame.mediaAssetId ? project.drive_assets.find((item) => item.id === frame.mediaAssetId) : null;
  return (
    <div className={`${styles.frame} ${vertical ? styles.frameVertical : ""} ${cta ? styles.frameCta : ""}`}>
      <div className={styles.orbA} /><div className={styles.orbB} />
      <span className={styles.logo}>IA</span><span className={styles.index}>{String(frame.position).padStart(2, "0")} / {String(payload.frames.length).padStart(2, "0")}</span>
      {frame.eyebrow ? <div className={styles.eyebrow}>{frame.eyebrow}</div> : null}
      {frame.template === "stat" && frame.stat ? <div className={styles.stat}>{frame.stat}</div> : <h4>{frame.title}</h4>}
      {frame.statLabel ? <h4>{frame.statLabel}</h4> : null}
      {asset?.mimeType.startsWith("image/") ? <div className={styles.media} style={{ backgroundImage: `url(/api/drive/preview/${encodeURIComponent(asset.id)})` }} /> : null}
      {frame.body ? <p>{frame.body}</p> : null}
      {frame.bullets?.length ? <ul>{frame.bullets.map((bullet, index) => <li key={`${index}-${bullet}`}>{bullet}</li>)}</ul> : null}
      {payload.contentType === "reel" && payload.primaryDriveAssetId ? <p><strong>▶ Vídeo do Drive selecionado</strong></p> : null}
      <div className={styles.rule} />
    </div>
  );
}

export function ContentWorkbench({ project, versions, provenance }: { project: Project; versions: Version[]; provenance: Provenance }) {
  const router = useRouter();
  const initial = project.selected_version_id ?? versions[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState(initial);
  const [changeRequest, setChangeRequest] = useState("");
  const [busy, setBusy] = useState<"revise" | "figma" | "publish" | "">("");
  const [error, setError] = useState("");
  const selected = useMemo(() => versions.find((version) => version.id === selectedId) ?? versions[0], [versions, selectedId]);

  async function revise() {
    if (!selected || !changeRequest.trim()) return;
    setBusy("revise"); setError("");
    try {
      const response = await fetch(`/api/studio/${project.id}/versions`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseVersionId: selected.id, changeRequest })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao gerar nova versão.");
      setSelectedId(body.result.versionId);
      setChangeRequest("");
      router.refresh();
    } catch (reason) { setError(String(reason)); } finally { setBusy(""); }
  }

  async function sendToFigma() {
    if (!selected) return;
    setBusy("figma"); setError("");
    try {
      const response = await fetch(`/api/studio/${project.id}/figma`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ versionId: selected.id })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao enfileirar para o Figma.");
      router.refresh();
    } catch (reason) { setError(String(reason)); } finally { setBusy(""); }
  }

  async function publish() {
    if (!window.confirm("Aprovar o estado ATUAL dos frames no Figma e publicar agora no Instagram? Esta ação publica de verdade.")) return;
    setBusy("publish"); setError("");
    try {
      const response = await fetch(`/api/studio/${project.id}/publish`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao publicar.");
      router.refresh();
    } catch (reason) { setError(String(reason)); } finally { setBusy(""); }
  }

  if (!selected) return <p>Nenhuma versão gerada.</p>;
  const figmaUrl = project.figma_file_key && project.figma_frame_ids?.[0]
    ? `https://www.figma.com/design/${project.figma_file_key}/ID-Academy?node-id=${project.figma_frame_ids[0].replace(":", "-")}`
    : project.figma_file_key ? `https://www.figma.com/design/${project.figma_file_key}/ID-Academy` : null;

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        {versions.map((version) => <button key={version.id} type="button" className={`${styles.version} ${selected.id === version.id ? styles.versionActive : ""}`} onClick={() => setSelectedId(version.id)}>
          <strong><span>V{version.version_number}</span><span className={statusClass(version.status)}>{version.status}</span></strong>
          <span>{version.change_request || "Versão gerada"}</span>
          <span>{new Date(version.created_at).toLocaleString("pt-BR")}</span>
        </button>)}
      </aside>

      <div className={styles.panel}>
        <section className={styles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div><h2>V{selected.version_number} · {selected.payload.title}</h2><span className={statusClass(project.status)}>Projeto: {project.status}</span></div>
            <button className={styles.secondary} type="button" onClick={() => router.refresh()}>Atualizar status</button>
          </div>
          <div className={styles.previewRow}>{selected.payload.frames.map((frame) => <FramePreview key={frame.position} frame={frame} payload={selected.payload} project={project} />)}</div>
        </section>

        <section className={styles.card}>
          <h3>Legenda</h3><div className={styles.caption}>{selected.payload.caption}</div>
        </section>

        {project.status !== "published" ? <section className={styles.card}>
          <h3>Pedir alterações e gerar outra versão</h3>
          <p>Descreva mudanças visuais ou editoriais. A versão atual nunca é sobrescrita; a próxima será criada separadamente.</p>
          <textarea className={styles.textarea} value={changeRequest} onChange={(event) => setChangeRequest(event.target.value)} placeholder="Ex.: deixe a capa mais minimalista, use a segunda imagem do Drive na página 3, reduza o texto e aproxime a composição dos posts de referência…" />
          <div className={styles.actions}><button className={styles.primary} type="button" onClick={revise} disabled={busy !== "" || !changeRequest.trim()}>{busy === "revise" ? "Gerando V nova…" : `Gerar a partir da V${selected.version_number}`}</button></div>
        </section> : null}

        <section className={styles.card}>
          <h3>Figma → revisão → publicação</h3>
          {project.status === "generated" || project.status === "draft" ? <div className={styles.figmaBox}><strong>Escolha a versão que merece ir ao Figma</strong><p>Só esta versão será enfileirada. As demais ficam aqui para comparação e histórico.</p><div className={styles.actions}><button className={styles.primary} type="button" disabled={busy !== ""} onClick={sendToFigma}>{busy === "figma" ? "Enviando…" : `Enviar V${selected.version_number} ao Figma`}</button></div></div> : null}
          {project.status === "figma_queued" ? <div className={styles.figmaBox}><strong>Aguardando o plugin do Figma</strong><p>Abra o plugin “Inteli Academy Content Bridge” no arquivo ID Academy e importe a próxima versão. Depois volte e atualize o status.</p>{figmaUrl ? <a href={figmaUrl} target="_blank" rel="noreferrer">Abrir arquivo do Figma ↗</a> : null}</div> : null}
          {project.status === "in_figma" || project.status === "failed" ? <div className={styles.figmaBox}><strong>Versão editável está no Figma</strong><p>Faça qualquer ajuste manual necessário. Ao aprovar, a plataforma buscará novamente os node IDs atuais e renderizará o estado final antes de publicar.</p>{figmaUrl ? <a href={figmaUrl} target="_blank" rel="noreferrer">Abrir frames no Figma ↗</a> : null}<div className={styles.actions}><button className={styles.danger} type="button" disabled={busy !== ""} onClick={publish}>{busy === "publish" ? "Lendo Figma e publicando…" : "Aprovar Figma e publicar no Instagram"}</button></div></div> : null}
          {project.status === "published" ? <div className={styles.figmaBox}><strong>Publicado</strong><p>A versão final do Figma foi usada no momento da publicação.</p>{project.published_permalink ? <a href={project.published_permalink} target="_blank" rel="noreferrer">Ver publicação no Instagram ↗</a> : null}</div> : null}
          {project.last_error ? <div className={styles.error}>{project.last_error}</div> : null}{error ? <div className={styles.error}>{error}</div> : null}
        </section>

        <section className={styles.card}>
          <h3>Rastreabilidade</h3>
          <div className={styles.provenance}>
            <div><strong>Artigos:</strong> {provenance.articles.length ? provenance.articles.map((article) => article.title).join(" · ") : "não utilizados"}</div>
            <div><strong>Contexto específico:</strong> {provenance.userContext || "não informado"}</div>
            <div><strong>Referências do Instagram:</strong> {provenance.references.length ? provenance.references.map((reference, index) => <span key={reference.id}>{index ? " · " : ""}<a href={reference.permalink} target="_blank" rel="noreferrer">post {index + 1} ↗</a></span>) : "histórico geral"}</div>
            <div><strong>Referência visual do Figma:</strong> Social Media é a principal para conteúdo social; as demais páginas auditadas complementam a identidade.</div>
            <div><strong>Drive:</strong> {project.drive_assets.length ? project.drive_assets.map((asset) => asset.name).join(" · ") : "não utilizado"}</div>
            <div><strong>Versões:</strong> {versions.length} preservada(s)</div>
            <div><strong>Frames Figma:</strong> {project.figma_frame_ids?.length ? project.figma_frame_ids.join(", ") : "ainda não importados"}</div>
          </div>
        </section>
      </div>
    </div>
  );
}
