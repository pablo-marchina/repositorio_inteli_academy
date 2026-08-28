"use client";

import { useMemo, useState } from "react";
import styles from "@/components/ContentWorkbench.module.css";
import { StudioVideoPreview } from "@/components/StudioVideoPreview";
import type { StructuredStudioPayload, StudioBrandReport } from "@/lib/studio-artifact";
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

export function StructuredStudioPanel({ projectId, driveAssets, versions, initialVersionId }: { projectId: string; driveAssets: DriveAsset[]; versions: StructuredVersion[]; initialVersionId?: string | null }) {
  const candidates = versions.filter((version) => Boolean(version.payload.artifact));
  const [versionId, setVersionId] = useState(initialVersionId && candidates.some((version) => version.id === initialVersionId) ? initialVersionId : candidates[0]?.id ?? "");
  const selected = useMemo(() => candidates.find((version) => version.id === versionId) ?? candidates[0], [candidates, versionId]);
  if (!selected?.payload.artifact) return null;
  const renderedPayload = asRenderedStudioPayload(selected.payload);
  const artifact = renderedPayload.artifact!;
  const exportBase = `/api/studio/${projectId}/versions/${selected.id}/export`;
  const afterEffectsUrl = `/api/studio/${projectId}/versions/${selected.id}/after-effects`;

  return <section className={styles.card} style={{ marginBottom: 20 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <div><span className="eyebrow">Structured Design</span><h2 style={{ marginTop: 6 }}>Fidelidade + editabilidade</h2></div>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>Versão <select value={selected.id} onChange={(event) => setVersionId(event.target.value)}>{candidates.map((version) => <option key={version.id} value={version.id}>V{version.version_number} · {version.status}</option>)}</select></label>
    </div>
    <p>Scene Graph canônico + Figma como fonte visual. Para Reels, timeline, MP4 final e QA visual são gates independentes.</p>
    <div style={{ display: "grid", gap: 12 }}>
      <Score title="Brand linter estrutural" report={artifact.brandAudit} />
      {artifact.reelQuality ? <Score title="QA de timeline executável" report={artifact.reelQuality} /> : null}
      {artifact.visualBrandReview ? <Score title="Crítico visual · template Figma × resultado" report={artifact.visualBrandReview} /> : null}
      {artifact.renderQa ? <Score title="Crítico visual · MP4 final" report={artifact.renderQa} /> : null}
    </div>
    <div style={{ marginTop: 14, fontSize: 13, opacity: .78 }}><strong>Origem dos frames:</strong> {artifact.sceneGraph.frames.map((frame) => frame.sourceFigmaFrameId ? `base humana ${frame.sourceFigmaFrameId}` : frame.figmaTemplateNodeId ? `template ${frame.figmaTemplateNodeId}` : frame.preferredTemplateNames[0]).join(" · ")}</div>
    {artifact.videoTimeline ? <div style={{ marginTop: 22, display: "grid", gap: 14 }}>
      <div><h3>Timeline de vídeo editável</h3><p>Footage, áudio, texto e gráficos são tracks independentes. Após o Figma, o servidor codifica o MP4 final e o QA analisa frames extraídos desse arquivo — o mesmo URL usado na publicação.</p></div>
      <StudioVideoPreview payload={selected.payload} timeline={artifact.videoTimeline} driveAssets={driveAssets} figmaLayout={artifact.figmaVideoLayout} projectId={projectId} versionId={selected.id} initialRenderQa={artifact.renderQa} initialRenderedReel={artifact.renderedReel} />
      <div className={styles.actions}>
        {selected.figma_frame_ids.length ? <a className={styles.primary} href={afterEffectsUrl}>Baixar projeto editável · After Effects</a> : null}
        <a className={styles.secondary} href={`${exportBase}?format=otio`}>Baixar OTIO</a>
        <a className={styles.secondary} href={`${exportBase}?format=manifest`}>Baixar manifest</a>
      </div>
      {!selected.figma_frame_ids.length ? <p style={{ fontSize: 13, opacity: .72 }}>O render final, o export nativo e o QA visual aparecem depois que a versão passa pelo Figma.</p> : null}
    </div> : null}
  </section>;
}
