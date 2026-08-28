"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { Player, type PlayerRef } from "@remotion/player";
import { AcademyVideoComposition } from "@/remotion/AcademyVideoComposition";
import type { DriveAsset, StudioPayload } from "@/lib/types";
import type { StudioBrandReport, StudioVideoTimeline, StudioFigmaVideoLayout } from "@/lib/studio-artifact";

function delay(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

export function StudioVideoPreview({ payload, timeline, driveAssets, figmaLayout, projectId, versionId, initialRenderQa }: {
  payload: StudioPayload;
  timeline: StudioVideoTimeline;
  driveAssets: DriveAsset[];
  figmaLayout?: StudioFigmaVideoLayout;
  projectId?: string;
  versionId?: string;
  initialRenderQa?: StudioBrandReport;
}) {
  const usedIds = [...new Set(timeline.tracks.flatMap((track) => track.assetId ? [track.assetId] : []))];
  const assetUrls = Object.fromEntries(usedIds.map((id) => [id, `/api/drive/preview/${encodeURIComponent(id)}`]));
  const roleUrls = (role: string) => !figmaLayout || !projectId || !versionId ? [] : (figmaLayout.roles?.[role] ?? []).map((_, index) => `/api/studio/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/figma-layer?role=${encodeURIComponent(role)}&index=${index}`);
  const brandLayerUrls = { background: roleUrls("background"), decoration: roleUrls("decoration"), logo: roleUrls("logo") };
  const playerRef = useRef<PlayerRef>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const [qa, setQa] = useState(initialRenderQa);
  const [qaState, setQaState] = useState<"idle" | "running" | "done" | "error">(initialRenderQa ? "done" : "idle");
  const [qaError, setQaError] = useState("");

  const runQa = useCallback(async () => {
    if (!figmaLayout || !projectId || !versionId || !captureRef.current || qaState === "running") return;
    setQaState("running");
    setQaError("");
    try {
      playerRef.current?.pause();
      const sampleFrames = [0.04, 0.24, 0.48, 0.72, 0.93].map((ratio) => Math.max(0, Math.min(timeline.durationInFrames - 1, Math.round(timeline.durationInFrames * ratio))));
      const frames: string[] = [];
      for (const target of sampleFrames) {
        playerRef.current?.seekTo(target);
        await delay(260);
        const canvas = await html2canvas(captureRef.current, { useCORS: true, allowTaint: false, backgroundColor: "#0a0a0a", logging: false, scale: .72 });
        frames.push(canvas.toDataURL("image/jpeg", .78));
      }
      const response = await fetch(`/api/studio/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/render-qa`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ frames }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha no QA visual.");
      setQa(body.report as StudioBrandReport);
      setQaState("done");
      playerRef.current?.seekTo(0);
    } catch (error) {
      setQaError(String(error));
      setQaState("error");
    }
  }, [figmaLayout, projectId, qaState, timeline.durationInFrames, versionId]);

  useEffect(() => {
    if (!figmaLayout || initialRenderQa || startedRef.current) return;
    startedRef.current = true;
    void runQa();
  }, [figmaLayout, initialRenderQa, runQa]);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div ref={captureRef} style={{ maxWidth: 360, width: "100%", overflow: "hidden", borderRadius: 18, background: "#0a0a0a" }}>
        <Player ref={playerRef} component={AcademyVideoComposition} inputProps={{ payload, timeline, assetUrls, figmaLayout, brandLayerUrls }} durationInFrames={timeline.durationInFrames} compositionWidth={timeline.width} compositionHeight={timeline.height} fps={timeline.fps} controls={qaState !== "running"} style={{ width: "100%", aspectRatio: `${timeline.width}/${timeline.height}` }} />
      </div>
      {!figmaLayout ? <div style={{ fontSize: 13, padding: "10px 12px", border: "1px solid rgba(240,180,60,.35)", borderRadius: 10 }}><strong>Preview pré-Figma.</strong> A montagem, crop e timing são reais, mas a identidade visual ainda não é considerada aprovada até o plugin devolver layout e assets do Figma.</div> : null}
      {figmaLayout ? <div style={{ fontSize: 13, padding: "10px 12px", border: "1px solid rgba(127,127,127,.24)", borderRadius: 10 }}>
        <strong>QA do render real:</strong> {qaState === "running" ? "capturando 5 frames do Player e revisando…" : qa ? `${Math.round(qa.score)}/100 · ${qa.passed ? "aprovado" : "requer revisão"}` : qaState === "error" ? `falhou: ${qaError}` : "pendente"}
        {qa?.issues?.length ? <div style={{ marginTop: 6 }}>{qa.issues.join(" · ")}</div> : null}
        {qaState === "error" || (qa && !qa.passed) ? <button type="button" onClick={() => void runQa()} style={{ marginTop: 8 }}>Executar QA novamente</button> : null}
      </div> : null}
      <div style={{ display: "grid", gap: 8 }}>
        {timeline.tracks.slice().sort((a, b) => b.zIndex - a.zIndex).map((track) => (
          <div key={track.id} style={{ display: "grid", gridTemplateColumns: "minmax(150px, 240px) 1fr auto", gap: 12, alignItems: "center", padding: "10px 12px", border: "1px solid rgba(127,127,127,.24)", borderRadius: 10 }}>
            <strong>{track.name}</strong>
            <div style={{ height: 8, borderRadius: 99, background: "rgba(127,127,127,.16)", overflow: "hidden" }}><div style={{ marginLeft: `${(track.startFrame / timeline.durationInFrames) * 100}%`, width: `${(track.durationInFrames / timeline.durationInFrames) * 100}%`, maxWidth: "100%", height: "100%", borderRadius: 99, background: "currentColor", opacity: .55 }} /></div>
            <span style={{ opacity: .7, fontSize: 12 }}>{(track.startFrame / timeline.fps).toFixed(1)}s · {(track.durationInFrames / timeline.fps).toFixed(1)}s{track.sourceStartFrame !== undefined ? ` · src ${(track.sourceStartFrame / timeline.fps).toFixed(1)}s` : ""}</span>
          </div>
        ))}
      </div>
      {timeline.executionSummary ? <div style={{ fontSize: 13, opacity: .75 }}><strong>Execução validada:</strong> {timeline.executionSummary}</div> : null}
    </div>
  );
}
