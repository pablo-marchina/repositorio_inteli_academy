"use client";

import { Player } from "@remotion/player";
import { AcademyVideoComposition } from "@/remotion/AcademyVideoComposition";
import type { DriveAsset, StudioPayload } from "@/lib/types";
import type { StudioVideoTimeline } from "@/lib/studio-artifact";

export function StudioVideoPreview({ payload, timeline, driveAssets }: {
  payload: StudioPayload;
  timeline: StudioVideoTimeline;
  driveAssets: DriveAsset[];
}) {
  const footage = timeline.tracks.find((track) => track.role === "footage");
  const asset = footage?.assetId ? driveAssets.find((item) => item.id === footage.assetId) : null;
  const videoUrl = asset ? `/api/drive/preview/${encodeURIComponent(asset.id)}` : undefined;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ maxWidth: 360, width: "100%", overflow: "hidden", borderRadius: 18, background: "#141414" }}>
        <Player
          component={AcademyVideoComposition}
          inputProps={{ payload, timeline, videoUrl }}
          durationInFrames={timeline.durationInFrames}
          compositionWidth={timeline.width}
          compositionHeight={timeline.height}
          fps={timeline.fps}
          controls
          style={{ width: "100%", aspectRatio: `${timeline.width}/${timeline.height}` }}
        />
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {timeline.tracks.slice().sort((a, b) => b.zIndex - a.zIndex).map((track) => (
          <div key={track.id} style={{ display: "grid", gridTemplateColumns: "minmax(150px, 240px) 1fr auto", gap: 12, alignItems: "center", padding: "10px 12px", border: "1px solid rgba(127,127,127,.24)", borderRadius: 10 }}>
            <strong>{track.name}</strong>
            <div style={{ height: 8, borderRadius: 99, background: "rgba(127,127,127,.16)", overflow: "hidden" }}>
              <div style={{ marginLeft: `${(track.startFrame / timeline.durationInFrames) * 100}%`, width: `${(track.durationInFrames / timeline.durationInFrames) * 100}%`, maxWidth: "100%", height: "100%", borderRadius: 99, background: "currentColor", opacity: .55 }} />
            </div>
            <span style={{ opacity: .7, fontSize: 12 }}>{(track.startFrame / timeline.fps).toFixed(1)}s · {(track.durationInFrames / timeline.fps).toFixed(1)}s</span>
          </div>
        ))}
      </div>
    </div>
  );
}
