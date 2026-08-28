import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, Video, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { StudioPayload } from "@/lib/types";
import type { StudioFigmaVideoLayout, StudioVideoTimeline, StudioVideoTrack } from "@/lib/studio-artifact";

export type AcademyVideoCompositionProps = {
  payload: StudioPayload;
  timeline: StudioVideoTimeline;
  assetUrls: Record<string, string>;
  figmaLayout?: StudioFigmaVideoLayout;
  brandLayerUrls?: Record<string, string[]>;
};

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function layoutItems(layout: StudioFigmaVideoLayout | undefined, role: string) { return layout?.roles?.[role] ?? []; }

function entrance(frame: number, fps: number, duration: number) {
  const enter = spring({ frame: Math.max(0, frame), fps, config: { damping: 18, stiffness: 160 } });
  const exitStart = Math.max(0, duration - Math.round(.18 * fps));
  const exit = interpolate(frame, [exitStart, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return { opacity: interpolate(enter, [0, 1], [0, 1]) * exit, transform: `translateY(${interpolate(enter, [0, 1], [24, 0])}px)` };
}

function FigmaRole({ role, urls, layout, animate = false, duration = 1 }: { role: string; urls: string[]; layout?: StudioFigmaVideoLayout; animate?: boolean; duration?: number }) {
  const { width, height, fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const items = layoutItems(layout, role);
  const animation = animate ? entrance(frame, fps, duration) : {};
  return <div style={{ position: "absolute", inset: 0, pointerEvents: "none", ...animation }}>
    {urls.map((url, index) => {
      const item = items[index];
      if (!item?.box || !layout?.frameBox?.width || !layout.frameBox.height) return null;
      return <Img key={`${role}-${index}`} src={url} style={{ position: "absolute", left: item.box.x / layout.frameBox.width * width, top: item.box.y / layout.frameBox.height * height, width: item.box.width / layout.frameBox.width * width, height: item.box.height / layout.frameBox.height * height, objectFit: "contain" }} />;
    })}
  </div>;
}

function FallbackText({ track, text, layout, role }: { track: StudioVideoTrack; text: string; layout?: StudioFigmaVideoLayout; role: string }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const item = layoutItems(layout, role)[0];
  const box = item?.box && layout?.frameBox?.width && layout.frameBox.height
    ? { left: item.box.x / layout.frameBox.width * width, top: item.box.y / layout.frameBox.height * height, width: item.box.width / layout.frameBox.width * width, height: item.box.height / layout.frameBox.height * height }
    : role === "headline"
      ? { left: width * .08, top: height * .58, width: width * .84, height: height * .24 }
      : role === "eyebrow"
        ? { left: width * .08, top: height * .52, width: width * .84, height: height * .08 }
        : { left: width * .08, top: height * .72, width: width * .84, height: height * .14 };
  const style = item?.style;
  const fontSize = style?.fontSize ? style.fontSize / (layout?.frameBox?.width || width) * width : role === "headline" ? 82 : role === "eyebrow" ? 28 : 34;
  return <div style={{ position: "absolute", ...box, color: "white", fontFamily: style?.fontFamily ? `${style.fontFamily}, sans-serif` : "Figtree, Inter, sans-serif", fontSize, fontWeight: style?.fontWeight ?? (role === "headline" ? 800 : 600), lineHeight: style?.lineHeightPx && style.fontSize ? style.lineHeightPx / style.fontSize : 1.08, textAlign: style?.textAlignHorizontal === "CENTER" ? "center" : style?.textAlignHorizontal === "RIGHT" ? "right" : "left", overflow: "hidden", ...entrance(frame, fps, track.durationInFrames) }}>{text}</div>;
}

export function AcademyVideoComposition({ payload, timeline, assetUrls, figmaLayout, brandLayerUrls = {} }: AcademyVideoCompositionProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const data = payload.frames[0];
  const footage = timeline.tracks.filter((track) => track.role === "footage" && track.assetId);
  const music = timeline.tracks.find((track) => track.role === "music" && track.assetId);
  const textTracks = timeline.tracks.filter((track) => track.kind === "text");

  return <AbsoluteFill style={{ backgroundColor: "#0a0a0a", color: "white", overflow: "hidden" }}>
    {figmaLayout && (brandLayerUrls.background ?? []).length ? <FigmaRole role="background" urls={brandLayerUrls.background ?? []} layout={figmaLayout} /> : null}

    {footage.map((track) => {
      const src = track.assetId ? assetUrls[track.assetId] : undefined;
      if (!src) return null;
      const crop = track.crop ?? { focalX: .5, focalY: .5, endFocalX: .5, endFocalY: .5, zoom: 1 };
      const local = frame - track.startFrame;
      const lastLocalFrame = Math.max(1, track.durationInFrames - 1);
      const focalX = interpolate(local, [0, lastLocalFrame], [crop.focalX, crop.endFocalX ?? crop.focalX], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      const focalY = interpolate(local, [0, lastLocalFrame], [crop.focalY, crop.endFocalY ?? crop.focalY], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      const fadeFrames = track.transition === "dissolve" ? Math.max(1, Math.round(.12 * fps)) : 1;
      const opacity = track.transition === "dissolve"
        ? interpolate(local, [0, fadeFrames, Math.max(fadeFrames, track.durationInFrames - fadeFrames), track.durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
        : 1;
      return <Sequence key={track.id} from={track.startFrame} durationInFrames={track.durationInFrames}>
        <Video src={src} startFrom={track.sourceStartFrame ?? 0} muted={music ? true : Boolean(track.muted)} volume={music ? 0 : track.volume ?? .72} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${clamp(focalX, 0, 1) * 100}% ${clamp(focalY, 0, 1) * 100}%`, transform: `scale(${crop.zoom || 1})`, opacity }} />
      </Sequence>;
    })}

    {music?.assetId && assetUrls[music.assetId] ? <Sequence from={music.startFrame} durationInFrames={music.durationInFrames}><Audio src={assetUrls[music.assetId]} startFrom={music.sourceStartFrame ?? 0} volume={music.volume ?? .6} /></Sequence> : null}

    {figmaLayout ? <>
      <FigmaRole role="decoration" urls={brandLayerUrls.decoration ?? []} layout={figmaLayout} />
      <FigmaRole role="logo" urls={brandLayerUrls.logo ?? []} layout={figmaLayout} />
    </> : null}

    {textTracks.map((track) => {
      const role = String(track.role);
      const text = track.role === "headline" ? data.title : track.role === "eyebrow" ? data.eyebrow : track.role === "body" ? data.body : track.text;
      if (!text) return null;
      const exactUrls = brandLayerUrls[role] ?? [];
      return <Sequence key={track.id} from={track.startFrame} durationInFrames={track.durationInFrames}>
        {figmaLayout && exactUrls.length ? <FigmaRole role={role} urls={exactUrls} layout={figmaLayout} animate duration={track.durationInFrames} /> : <FallbackText track={{ ...track, startFrame: 0 }} text={text} layout={figmaLayout} role={role} />}
      </Sequence>;
    })}
  </AbsoluteFill>;
}
