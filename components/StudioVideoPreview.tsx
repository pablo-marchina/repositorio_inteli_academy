"use client";

import { Player } from "@remotion/player";
import { AcademyVideoComposition } from "@/remotion/AcademyVideoComposition";
import type { DriveAsset, StudioPayload } from "@/lib/types";
import type { StudioVideoTimeline, StudioFigmaVideoLayout } from "@/lib/studio-artifact";

export function StudioVideoPreview({ payload, timeline, driveAssets, figmaLayout, projectId, versionId }: {
  payload: StudioPayload;
  timeline: StudioVideoTimeline;
  driveAssets: DriveAsset[];
  figmaLayout?: StudioFigmaVideoLayout;
  projectId?: string;
  versionId?: string;
}) {
  const usedIds = [...new Set(timeline.tracks.flatMap((track) => track.assetId ? [track.assetId] : []))];
  const assetUrls = Object.fromEntries(usedIds.map((id) => [id, `/api/drive/preview/${encodeURIComponent(id)}`]));
  const roleUrls = (role: string) => !figmaLayout || !projectId || !versionId ? [] : (figmaLayout.roles?.[role] ?? []).map((_, index) => `/api/studio/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/figma-layer?role=${encodeURIComponent(role)}&index=${index}`);
  const brandLayerUrls = { background: roleUrls("background"), decoration: roleUrls("decoration"), logo: roleUrls("logo") };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ maxWidth: 360, width: "100%", overflow: "hidden", borderRadius: 18, background: "#0a0a0a" }}>
        <Player
          component={AcademyVideoComposition}
          inputProps={{ payload, timeline, assetUrls, figmaLayout, brandLayerUrls }}
          durationInFrames={timeline.durationInFrames}
          compositionWidth={timeline.width}
          compositionHeight={timeline.height}
          fps={timeline.fps}
          controls
          style={{ width: "100%", aspectRatio: `${timeline.width}/${timeline.height}` }}
        />
      </div>
      {!figmaLayout ? <div style={{ fontSize: 13, padding: "10px 12px", border: "1px solid rgba(240,180,60,.35)", borderRadius: 10 }}><strong>Preview pré-Figma.</strong> A montagem, crop e timing são reais, mas a identidade visual ainda não é considerada aprovada até o plugin devolver o layout/brand assets do Figma.</div> : null}
      <div style={{ display: "grid", gap: 8 }}>
        {timeline.tracks.slice().sort((a, b) => b.zIndex - a.zIndex).map((track) => (
          <div key={track.id} style={{ display: "grid", gridTemplateColumns: "minmax(150px, 240px) 1fr auto", gap: 12, alignItems: "center", padding: "10px 12px", border: "1px solid rgba(127,127,127,.24)", borderRadius: 10 }}>
            <strong>{track.name}</strong>
            <div style={{ height: 8, borderRadius: 99, background: "rgba(127,127,127,.16)", overflow: "hidden" }}>
              <div style={{ marginLeft: `${(track.startFrame / timeline.durationInFrames) * 100}%`, width: `${(track.durationInFrames / timeline.durationInFrames) * 100}%`, maxWidth: "100%", height: "100%", borderRadius: 99, background: "currentColor", opacity: .55 }} />
            </div>
            <span style={{ opacity: .7, fontSize: 12 }}>{(track.startFrame / timeline.fps).toFixed(1)}s · {(track.durationInFrames / timeline.fps).toFixed(1)}s{track.sourceStartFrame !== undefined ? ` · src ${(track.sourceStartFrame / timeline.fps).toFixed(1)}s` : ""}</span>
          </div>
        ))}
      </div>
      {timeline.executionSummary ? <div style={{ fontSize: 13, opacity: .75 }}><strong>Execução validada:</strong> {timeline.executionSummary}</div> : null}
    </div>
  );
}
