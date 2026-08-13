import React from "react";
import { AbsoluteFill, Sequence, spring, interpolate, useCurrentFrame, useVideoConfig, Video } from "remotion";
import type { StudioPayload } from "@/lib/types";
import type { StudioVideoTimeline } from "@/lib/studio-artifact";

export type AcademyVideoCompositionProps = {
  payload: StudioPayload;
  timeline: StudioVideoTimeline;
  videoUrl?: string;
};

function entrance(frame: number, fps: number, delay: number) {
  const progress = spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 18, stiffness: 130 } });
  return {
    opacity: interpolate(progress, [0, 1], [0, 1]),
    transform: `translateY(${interpolate(progress, [0, 1], [40, 0])}px)`
  };
}

export function AcademyVideoComposition({ payload, timeline, videoUrl }: AcademyVideoCompositionProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const data = payload.frames[0];
  const footage = timeline.tracks.find((track) => track.role === "footage");
  const headline = timeline.tracks.find((track) => track.role === "headline");
  const body = timeline.tracks.find((track) => track.role === "body");
  const eyebrow = timeline.tracks.find((track) => track.role === "eyebrow");

  return <AbsoluteFill style={{ backgroundColor: "#141414", color: "white", fontFamily: "Figtree, Inter, sans-serif", overflow: "hidden" }}>
    {videoUrl && footage ? <Sequence from={footage.startFrame} durationInFrames={footage.durationInFrames}><Video src={videoUrl} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} /></Sequence> : null}
    <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(20,20,20,.04), rgba(20,20,20,.55))" }} />
    <div style={{ position: "absolute", left: 72, top: 62, fontSize: 48, fontWeight: 800, color: "white" }}>IA</div>
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 18, background: "#2a00ff" }} />
    <div style={{ position: "absolute", left: 84, right: 84, bottom: 190 }}>
      {data.eyebrow && eyebrow ? <Sequence from={eyebrow.startFrame}><div style={{ ...entrance(frame, fps, eyebrow.startFrame), fontSize: 28, fontWeight: 750, letterSpacing: 3, color: "#d0c7ff", marginBottom: 26 }}>{data.eyebrow.toUpperCase()}</div></Sequence> : null}
      {headline ? <Sequence from={headline.startFrame}><div style={{ ...entrance(frame, fps, headline.startFrame), fontSize: data.title.length > 60 ? 72 : 94, lineHeight: .96, letterSpacing: -4, fontWeight: 850 }}>{data.title}</div></Sequence> : null}
      {data.body && body ? <Sequence from={body.startFrame}><div style={{ ...entrance(frame, fps, body.startFrame), fontSize: 34, lineHeight: 1.3, fontWeight: 520, marginTop: 28, maxWidth: 860 }}>{data.body}</div></Sequence> : null}
    </div>
  </AbsoluteFill>;
}
