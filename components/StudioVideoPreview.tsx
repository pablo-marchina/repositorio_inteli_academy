"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DriveAsset, StudioPayload } from "@/lib/types";
import type { StudioBrandReport, StudioVideoTimeline, StudioFigmaVideoLayout } from "@/lib/studio-artifact";
import type { StudioRenderedReel } from "@/lib/studio-render-types";

type TechnicalPreview = {
  publicUrl: string;
  playbackUrl: string;
  storagePath: string;
  byteSize: number;
  durationSeconds: number;
  cacheHit: boolean;
  fingerprint: string;
};

export function StudioVideoPreview({ payload, timeline, driveAssets, figmaLayout, projectId, versionId, referenceMediaUrl, initialRenderQa, initialRenderedReel }: {
  payload: StudioPayload;
  timeline: StudioVideoTimeline;
  driveAssets: DriveAsset[];
  figmaLayout?: StudioFigmaVideoLayout;
  projectId?: string;
  versionId?: string;
  referenceMediaUrl?: string | null;
  initialRenderQa?: StudioBrandReport;
  initialRenderedReel?: StudioRenderedReel;
}) {
  void payload;
  void driveAssets;
  const router = useRouter();
  const timelineKey = JSON.stringify(timeline.tracks.filter((track) => track.role === "footage").map((track) => ({
    id: track.id,
    assetId: track.assetId,
    startFrame: track.startFrame,
    durationInFrames: track.durationInFrames,
    sourceStartFrame: track.sourceStartFrame,
    sourceEndFrame: track.sourceEndFrame,
    crop: track.crop
  })));
  const lastPreparedTimelineRef = useRef("");
  const finalRenderTimelineRef = useRef("");
  const [renderedReel, setRenderedReel] = useState(initialRenderedReel);
  const [qa, setQa] = useState(initialRenderQa);
  const [state, setState] = useState<"idle" | "rendering" | "done" | "error">(initialRenderedReel ? "done" : "idle");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<TechnicalPreview | null>(null);
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [previewError, setPreviewError] = useState("");
  const [previewPlaybackError, setPreviewPlaybackError] = useState("");
  const [matchState, setMatchState] = useState<"idle" | "matching" | "done" | "error">("idle");
  const [matchMessage, setMatchMessage] = useState("");

  const loadTechnicalPreview = useCallback(async () => {
    if (!projectId || !versionId) return;
    setPreviewState("loading");
    setPreviewError("");
    setPreviewPlaybackError("");
    try {
      const response = await fetch(`/api/studio/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/technical-preview`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao gerar preview técnico.");
      if (!body.preview?.playbackUrl) throw new Error("O servidor gerou o MP4, mas não retornou uma URL de reprodução interna.");
      setPreview(body.preview as TechnicalPreview);
      setPreviewState("done");
    } catch (reason) {
      setPreviewError(String(reason));
      setPreviewState("error");
    }
  }, [projectId, versionId]);

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
    if (!projectId || !versionId || lastPreparedTimelineRef.current === timelineKey) return;
    lastPreparedTimelineRef.current = timelineKey;
    let cancelled = false;
    void (async () => {
      setMatchState("matching");
      setMatchMessage("Comparando frames reais da referência com os takes selecionados…");
      try {
        const response = await fetch(`/api/studio/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/reference-rematch`, { method: "POST" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Falha ao alinhar visualmente à referência.");
        if (cancelled) return;
        if (body.result?.changed) {
          const similarity = Number(body.result?.styleMatch?.averageSimilarity ?? 0);
          setMatchMessage(`Timeline remapeada por frames (${Math.round(similarity * 100)}% de similaridade visual média). Atualizando…`);
          lastPreparedTimelineRef.current = "";
          window.location.reload();
          return;
        }
        setMatchState("done");
        setMatchMessage(body.result?.styleMatch?.averageSimilarity !== undefined
          ? `Matching visual aplicado · ${Math.round(Number(body.result.styleMatch.averageSimilarity) * 100)}% de similaridade média.`
          : "Matching visual da referência verificado.");
      } catch (reason) {
        if (cancelled) return;
        setMatchState("error");
        setMatchMessage(`Matching visual não pôde ser atualizado: ${String(reason)}`);
      }
      if (!cancelled) await loadTechnicalPreview();
    })();
    return () => { cancelled = true; };
  }, [loadTechnicalPreview, projectId, timelineKey, versionId]);

  useEffect(() => {
    if (!figmaLayout || initialRenderedReel || matchState !== "done" || finalRenderTimelineRef.current === timelineKey) return;
    finalRenderTimelineRef.current = timelineKey;
    void renderFinal();
  }, [figmaLayout, initialRenderedReel, matchState, renderFinal, timelineKey]);

  return <div style={{ display: "grid", gap: 18 }}>
    {renderedReel ? <div style={{ display: "grid", gap: 8 }}>
      <strong>MP4 final · exatamente o arquivo liberado para publicação</strong>
      <video key={renderedReel.sha256} src={renderedReel.publicUrl} controls playsInline style={{ maxWidth: 360, width: "100%", borderRadius: 18, background: "#0a0a0a", aspectRatio: `${timeline.width}/${timeline.height}` }} />
      <span style={{ fontSize: 12, opacity: .68 }}>{(renderedReel.byteSize / 1024 / 1024).toFixed(1)} MB · {renderedReel.durationSeconds.toFixed(1)}s · SHA {renderedReel.sha256.slice(0, 12)}</span>
    </div> : null}

    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <strong>Comparação visual · referência × montagem</strong>
        <span style={{ fontSize: 12, opacity: .68 }}>{matchState === "matching" ? "Alinhando estrutura visual…" : matchState === "error" ? "Matching com aviso" : "Estrutura verificada"}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 360px))", gap: 14, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Referência selecionada</span>
          {referenceMediaUrl ? <video src={referenceMediaUrl} controls playsInline preload="metadata" style={{ width: "100%", borderRadius: 18, background: "#0a0a0a", aspectRatio: `${timeline.width}/${timeline.height}`, objectFit: "cover" }} /> : <div style={{ minHeight: 240, borderRadius: 18, background: "#0a0a0a", display: "grid", placeItems: "center", padding: 18, textAlign: "center", fontSize: 13 }}>URL da mídia de referência indisponível nesta versão.</div>}
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Montagem gerada · preview MP4 único</span>
          {preview ? <>
            <video
              key={preview.fingerprint}
              src={preview.playbackUrl}
              controls
              playsInline
              preload="metadata"
              onCanPlay={() => setPreviewPlaybackError("")}
              onError={() => setPreviewPlaybackError("O navegador recebeu o MP4, mas não conseguiu reproduzi-lo. Use “Abrir MP4 técnico” abaixo para inspecionar a resposta diretamente.")}
              style={{ width: "100%", borderRadius: 18, background: "#0a0a0a", aspectRatio: `${timeline.width}/${timeline.height}`, objectFit: "cover" }}
            />
            <a href={preview.playbackUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Abrir MP4 técnico</a>
          </> : <div style={{ minHeight: 240, borderRadius: 18, background: "#0a0a0a", display: "grid", placeItems: "center", padding: 18, textAlign: "center", fontSize: 13 }}>{previewState === "loading" || matchState === "matching" ? "Preparando um único MP4 browser-safe com todos os shots…" : previewState === "error" ? previewError : "Preparando preview…"}</div>}
          {preview ? <span style={{ fontSize: 12, opacity: .62 }}>{(preview.byteSize / 1024 / 1024).toFixed(1)} MB · {preview.durationSeconds.toFixed(1)}s · {preview.cacheHit ? "cache" : "gerado agora"}</span> : null}
          {previewPlaybackError ? <div style={{ fontSize: 12, padding: "8px 10px", border: "1px solid rgba(220,80,80,.45)", borderRadius: 8 }}>{previewPlaybackError}</div> : null}
          {previewState === "error" ? <button type="button" onClick={() => void loadTechnicalPreview()}>Tentar preview novamente</button> : null}
        </div>
      </div>
      <span style={{ fontSize: 12, opacity: .68 }}>{matchMessage}</span>
      <span style={{ fontSize: 12, opacity: .62 }}>O preview técnico é servido pela própria aplicação com suporte a byte ranges. Ele preserva ordem, cortes, duração e crop da timeline; render/export continuam usando os originais.</span>
    </div>

    {!figmaLayout ? <div style={{ fontSize: 13, padding: "10px 12px", border: "1px solid rgba(240,180,60,.35)", borderRadius: 10 }}><strong>Preview pré-Figma.</strong> Montagem, crop e timing são reais. Elementos gráficos finais da marca só entram após sincronizar o frame no Figma.</div> : null}
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
