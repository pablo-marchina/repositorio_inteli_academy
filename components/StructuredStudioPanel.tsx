"use client";

import { useMemo, useState } from "react";
import styles from "@/components/ContentWorkbench.module.css";
import { StudioVideoPreview } from "@/components/StudioVideoPreview";
import type { StructuredStudioPayload, StudioBrandReport } from "@/lib/studio-artifact";
import { effectiveBrandContext, effectivePostArchetype } from "@/lib/studio-post-archetype";
import { asRenderedStudioPayload } from "@/lib/studio-render-types";
import type { DriveAsset } from "@/lib/types";

type StructuredVersion = { id: string; version_number: number; payload: StructuredStudioPayload; status: string; figma_frame_ids: string[] };

function Score({ title, report }: { title: string; report: StudioBrandReport }) {
  return <div style={{ border: "1px solid rgba(127,127,127,.24)", borderRadius: 12, padding: 14, display: "grid", gap: 8 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><strong>{title}</strong><strong>{Math.round(report.score)}/100</strong></div>
    {report.checks.map((check) => <div key={check.id} style={{ fontSize: 13, opacity: check.passed ? .72 : 1 }}><strong>{check.passed ? "✓" : "⚠"} {check.label}</strong> — {check.detail}</div>)}
    {report.issues?.length ? <div style={{ fontSize: 13 }}><strong>Pontos encontrados:</strong> {report.issues.join(" · ")}</div> : null}
    {report.corrections?.length ? <div style={{ fontSize: 13 }}><strong>Correções:</strong> {report.corrections.join(" · ")}</div> : null}
  </div>;
}

function BrandStatus({ payload }: { payload: StructuredStudioPayload }) {
  const archetype = effectivePostArchetype(payload);
  const brand = effectiveBrandContext(payload);
  const partner = brand.partnerName;
  const partnerStatus = brand.partnerLogoStatus;
  return <div style={{ border: "1px solid rgba(127,127,127,.2)", borderRadius: 12, padding: 12, fontSize: 13, display: "flex", gap: 18, flexWrap: "wrap" }}>
    <span><strong>Arquétipo:</strong> {archetype}</span>
    <span><strong>Marca principal:</strong> {brand.primaryBrandName}</span>
    {partner ? <span><strong>Parceiro:</strong> {partner}</span> : null}
    <span><strong>Logo do parceiro:</strong> {partnerStatus === "ready" ? "resolvida" : partnerStatus === "missing" ? "pendente — aprovação bloqueada" : "não necessária"}</span>
  </div>;
}

export function StructuredStudioPanel({ projectId, driveAssets, versions, initialVersionId, referenceMediaUrl }: { projectId: string; driveAssets: DriveAsset[]; versions: StructuredVersion[]; initialVersionId?: string | null; referenceMediaUrl?: string | null }) {
  const candidates = versions.filter((version) => Boolean(version.payload.artifact));
  const [versionId, setVersionId] = useState(initialVersionId && candidates.some((version) => version.id === initialVersionId) ? initialVersionId : candidates[0]?.id ?? "");
  const selected = useMemo(() => candidates.find((version) => version.id === versionId) ?? candidates[0], [candidates, versionId]);
  if (!selected?.payload.artifact) return null;
  const renderedPayload = asRenderedStudioPayload(selected.payload);
  const artifact = renderedPayload.artifact!;
  const exportBase = `/api/studio/${projectId}/versions/${selected.id}/export`;
  const nleBase = `/api/studio/${projectId}/versions/${selected.id}/nle`;
  const afterEffectsUrl = `/api/studio/${projectId}/versions/${selected.id}/after-effects`;

  return <section className={styles.card} style={{ marginBottom: 20 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <div><span className="eyebrow">Structured Design</span><h2 style={{ marginTop: 6 }}>Fidelidade + editabilidade</h2></div>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>Versão <select value={selected.id} onChange={(event) => setVersionId(event.target.value)}>{candidates.map((version) => <option key={version.id} value={version.id}>V{version.version_number} · {version.status}</option>)}</select></label>
    </div>
    <p>Scene Graph canônico + Figma como fonte visual. Arquétipo editorial, estrutura da referência e identidade de marca são avaliados separadamente; para Reels, timeline, MP4 final e QA visual também são gates independentes.</p>
    <BrandStatus payload={selected.payload} />
    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
      <Score title="Brand linter estrutural" report={artifact.brandAudit} />
      {artifact.reelQuality ? <Score title="QA de timeline executável" report={artifact.reelQuality} /> : null}
      {artifact.visualBrandReview ? <Score title="Crítico visual · template Figma × resultado" report={artifact.visualBrandReview} /> : null}
      {artifact.renderQa ? <Score title="Crítico visual · MP4 final" report={artifact.renderQa} /> : null}
    </div>
    <div style={{ marginTop: 14, fontSize: 13, opacity: .78 }}><strong>Origem dos frames:</strong> {artifact.sceneGraph.frames.map((frame) => frame.sourceFigmaFrameId ? `base humana ${frame.sourceFigmaFrameId}` : frame.figmaTemplateNodeId ? `template descoberto ${frame.figmaTemplateNodeId}` : `resolver: ${frame.preferredTemplateNames[0]}`).join(" · ")}</div>
    {artifact.videoTimeline ? <div style={{ marginTop: 22, display: "grid", gap: 14 }}>
      <div><h3>Edição de vídeo por IA · timeline universal</h3><p>A IA escolhe takes, ritmo, música e transições. O MP4 é apenas um render da timeline canônica: footage, áudio, texto, logo, mascote e grafismos permanecem independentes e podem ser exportados para diferentes editores por adapters.</p></div>
      {artifact.reelPlan?.musicDirection ? <div style={{ fontSize: 13, padding: 12, border: "1px solid rgba(127,127,127,.2)", borderRadius: 12 }}><strong>Trilha escolhida pela IA:</strong> {artifact.reelPlan.musicDirection.artist} — {artifact.reelPlan.musicDirection.title} · {artifact.reelPlan.musicDirection.section} · {artifact.reelPlan.musicDirection.bpm} BPM · fonte licenciada deve ser relinkada no editor/publicação.</div> : artifact.reelPlan?.musicAssetId ? <div style={{ fontSize: 13, padding: 12, border: "1px solid rgba(127,127,127,.2)", borderRadius: 12 }}><strong>Trilha legada:</strong> {driveAssets.find((asset) => asset.id === artifact.reelPlan?.musicAssetId)?.name ?? "áudio do projeto"}</div> : null}
      <StudioVideoPreview payload={selected.payload} timeline={artifact.videoTimeline} driveAssets={driveAssets} figmaLayout={artifact.figmaVideoLayout} projectId={projectId} versionId={selected.id} referenceMediaUrl={referenceMediaUrl} initialRenderQa={artifact.renderQa} initialRenderedReel={artifact.renderedReel} />
      <div style={{ border: "1px solid rgba(127,127,127,.2)", borderRadius: 12, padding: 14, display: "grid", gap: 10 }}>
        <div><strong>Exportar projeto editável</strong><p style={{ margin: "4px 0 0", fontSize: 13, opacity: .76 }}>DaVinci Resolve é a integração preferida, mas todos os exports partem da mesma timeline universal. Quando um efeito não existe no formato-alvo, o timing e os metadados da intenção permanecem preservados.</p></div>
        <div className={styles.actions}>
          <a className={styles.primary} href={`${nleBase}?target=davinci`}>★ DaVinci Resolve</a>
          <a className={styles.secondary} href={`${nleBase}?target=premiere`}>Adobe Premiere Pro</a>
          <a className={styles.secondary} href={`${nleBase}?target=final-cut`}>Final Cut Pro</a>
          <a className={styles.secondary} href={`${nleBase}?target=avid`}>Avid Media Composer</a>
          {selected.figma_frame_ids.length ? <a className={styles.secondary} href={afterEffectsUrl}>After Effects</a> : null}
          <a className={styles.secondary} href={`${nleBase}?target=universal`}>Pacote universal · todos os formatos</a>
          <a className={styles.secondary} href={`${exportBase}?format=otio`}>OpenTimelineIO bruto</a>
          <a className={styles.secondary} href={`${exportBase}?format=manifest`}>Manifest da timeline</a>
        </div>
      </div>
      {!selected.figma_frame_ids.length ? <p style={{ fontSize: 13, opacity: .72 }}>Os pacotes de edição já podem ser exportados. Sincronizar com o Figma depois aumenta a fidelidade dos layers de logo, mascote/robô e grafismos, mas não é mais um bloqueio para exportar a timeline.</p> : null}
    </div> : null}
  </section>;
}
