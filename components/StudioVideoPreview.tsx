"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Player } from "@remotion/player";
import { AcademyVideoComposition } from "@/remotion/AcademyVideoComposition";
import type { DriveAsset, StudioPayload } from "@/lib/types";
import type { StudioBrandReport, StudioVideoTimeline, StudioFigmaVideoLayout } from "@/lib/studio-artifact";
import type { StudioRenderedReel } from "@/lib/studio-render-types";

export function StudioVideoPreview({ payload, timeline, driveAssets, figmaLayout, projectId, versionId, initialRenderQa, initialRenderedReel }: {
  payload: StudioPayload;
  timeline: StudioVideoTimeline;
  driveAssets: DriveAsset[];
  figmaLayout?: StudioFigmaVideoLayout;
  projectId?: string;
  versionId?: string;
  initialRenderQa?: StudioBrandReport;
  initialRenderedReel?: StudioRenderedReel;
}) {
  const router = useRouter();
  const usedIds = [...new Set(timeline.tracks.flatMap((track) => track.assetId ? [track.assetId] : []))];
  const assetById = new Map(driveAssets.map((asset) => [asset.id, asset]));
  const assetUrls = Object.fromEntries(usedIds.map((id) => {
    const asset = assetById.get(id);
    const browserQuery = asset?.mimeType.startsWith("video/") ? "?browser=1" : "";
    return [id, `/api/drive/preview/${encodeURIComponent(id)}${browserQuery}`];
  }));
  const roleUrls = (role: string) => !figmaLayout || !projectId || !versionId ? [] : (figmaLayout.roles?.[role] ?? []).map((_, index) => `/api/studio/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/figma-layer?role=${encodeURIComponent(role)}&index=${index}`);
  const brandLayerUrls = { background: roleUrls("background"), decoration: roleUrls("decoration"), logo: roleUrls("logo"), eyebrow: roleUrls("eyebrow"), headline: roleUrls("headline"), body: roleUrls("body") };
  const startedRef = useRef(false);
  const [renderedReel, setRenderedReel] = useState(initialRenderedReel);
  const [qa, setQa] = useState(initialRenderQa);
  const [state, setState] = useState<"idle" | "rendering" | "done" | "error">(initialRenderedReel ? "done" : "idle");
  const [error, setError] = useState("");

  const renderFinal = useCallback(async () => {
    if (!figmaLayout || !projectId || !versionId || state === "rendering") return;
    setState("rendering");
    setError("");
    try {
      const response = await fetch(`/api/studio/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/render-reel`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao renderizar Reel final.");
      setRenderedReel(body.renderedReel as StudioRenderedReel);
      setQa(body.report as StudioBrandReport);
      setState("done");
      router.refresh();
    } catch (reason) {
      setError(String(reason));
      setState("error");
    }
  }, [figmaLayout, projectId, router, state, versionId]);

  useEffect(() => {
    if (!figmaLayout || initialRenderedReel || startedRef.current) return;
    startedRef.current = true;
    void renderFinal();
  }, [figmaLayout, initialRenderedReel, renderFinal]);

  return <div style={{ display: "grid", gap: 18 }}>
    {renderedReel ? <div style={{ display: "grid", gap: 8 }}>
      <strong>MP4 final · exatamente o arquivo liberado para publicação</strong>
      <video key={renderedReel.sha256} src={renderedReel.publicUrl} controls playsInline style={{ maxWidth: 360, width: "100%", borderRadius: 18, background: "#0a0a0a", aspectRatio: `${timeline.width}/${timeline.height}` }} />
      <span style={{ fontSize: 12, opacity: .68 }}>{(renderedReel.byteSize / 1024 / 1024).toFixed(1)} MB · {renderedReel.durationSeconds.toFixed(1)}s · SHA {renderedReel.sha256.slice(0, 12)}</span>
    </div> : null}

    <div style={{ display: "grid", gap: 8 }}>
      <strong>{renderedReel ? "Timeline editável / preview técnico" : "Preview da timeline"}</strong>
      <div style={{ maxWidth: 360, width: "100%", overflow: "hidden", borderRadius: 18, background: "#0a0a0a" }}>
        <Player component={AcademyVideoComposition} inputProps={{ payload, timeline, assetUrls, figmaLayout, brandLayerUrls }} durationInFrames={timeline.durationInFrames} compositionWidth={timeline.width} compositionHeight={timeline.height} fps={timeline.fps} controls style={{ width: "100%", aspectRatio: `${timeline.width}/${timeline.height}` }} />
      </div>
      <span style={{ fontSize: 12, opacity: .62 }}>O preview usa proxies H.264/AAC compatíveis com navegador; o render/export continua usando os arquivos originais do Drive.</span>
    </div>

    {!figmaLayout ? <div style={{ fontSize: 13, padding: "10px 12px", border: "1px solid rgba(240,180,60,.35)", borderRadius: 10 }}><strong>Preview pré-Figma.</strong> Montagem, crop e timing são reais, mas a marca só é validada após sincronizar o frame no Figma.</div> : null}
    {figmaLayout ? <div style={{ fontSize: 13, padding: "10px 12px", border: "1px solid rgba(127,127,127,.24)", borderRadius: 10 }}>
      <strong>Render final + QA:</strong> {state === "rendering" ? " codificando H.264/AAC e analisando frames do MP4…" : qa ? ` ${Math.round(qa.score)}/100 · ${qa.passed ? "aprovado" : "requer revisão"}` : state === "error" ? ` falhou: ${error}` : " pendente"}
      {qa?.issues?.length ? <div style={{ marginTop: 6 }}>{qa.issues.join(" · ")}</div> : null}
      <button type="button" onClick={() => void renderFinal()} disabled={state === "rendering"} style={{ marginTop: 8 }}>{state === "rendering" ? "Renderizando…" : renderedReel ? "Renderizar novamente após alterações" : "Renderizar MP4 final"}</button>
    </div> : null}

    <div style={{ display: "grid", gap: 8 }}>{timeline.tracks.slice().sort((a, b) => b.zIndex - a.zIndex).map((track) => <div key={track.id} style={{ display: "grid", gridTemplateColumns: "minmax(150px, 240px) 1fr auto", gap: 12, alignItems: "center", padding: "10px 12px", border: "1px solid rgba(127,127,127,.24)", borderRadius: 10 }}>
      <strong>{track.name}</strong><div style={{ height: 8, borderRadius: 99, background: "rgba(127,127,127,.16)", overflow: "hidden" }}><div style={{ marginLeft: `${(track.startFrame / timeline.durationInFrames) * 100}%`, width: `${(track.durationInFrames / timeline.durationInFrames) * 100}%`, maxWidth: "100%", height: "100%", borderRadius: 99, background: "currentColor", opacity: .55 }} /></div><span style={{ opacity: .7, fontSize: 12 }}>{(track.startFrame / timeline.fps).toFixed(1)}s · {(track.durationInFrames / timeline.fps).toFixed(1)}s{track.sourceStartFrame !== undefined ? ` · src ${(track.sourceStartFrame / timeline.fps).toFixed(1)}s` : ""}</span>
    </div>)}</div>
    {timeline.executionSummary ? <div style={{ fontSize: 13, opacity: .75 }}><strong>Execução validada:</strong> {timeline.executionSummary}</div> : null}
  </div>;
}
