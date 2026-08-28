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

function localEntrance(localFrame: number, fps: number, duration: number) {
  const enter = spring({ frame: Math.max(0, localFrame), fps, config: { damping: 18, stiffness: 150 } });
  const exitStart = Math.max(0, duration - Math.round(.22 * fps));
  const exit = interpolate(localFrame, [exitStart, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return { opacity: interpolate(enter, [0, 1], [0, 1]) * exit, transform: `translateY(${interpolate(enter, [0, 1], [34, 0])}px)` };
}

function layoutItem(layout: StudioFigmaVideoLayout | undefined, role: string) { return layout?.roles?.[role]?.[0]; }

function scaledBox(layout: StudioFigmaVideoLayout | undefined, role: string, width: number, height: number) {
  const item = layoutItem(layout, role);
  if (!item?.box || !layout?.frameBox?.width || !layout.frameBox.height) return null;
  return { left: item.box.x / layout.frameBox.width * width, top: item.box.y / layout.frameBox.height * height, width: item.box.width / layout.frameBox.width * width, height: item.box.height / layout.frameBox.height * height, item };
}

function TextTrack({ track, text, layout, role }: { track: StudioVideoTrack; text: string; layout?: StudioFigmaVideoLayout; role: string }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const local = frame - track.startFrame;
  const box = scaledBox(layout, role, width, height);
  const style = box?.item.style;
  const fallback = role === "headline" ? { left: width * .08, top: height * .58, width: width * .84, height: height * .24 } : role === "eyebrow" ? { left: width * .08, top: height * .52, width: width * .84, height: height * .08 } : { left: width * .08, top: height * .72, width: width * .84, height: height * .14 };
  const rect = box ?? fallback;
  const fontSize = style?.fontSize ? style.fontSize / (layout?.frameBox?.width || width) * width : role === "headline" ? 82 : role === "eyebrow" ? 28 : 34;
  const align = style?.textAlignHorizontal === "CENTER" ? "center" : style?.textAlignHorizontal === "RIGHT" ? "right" : "left";
  return <div style={{ position: "absolute", left: rect.left, top: rect.top, width: rect.width, minHeight: rect.height, color: "white", fontFamily: style?.fontFamily ? `${style.fontFamily}, sans-serif` : "Figtree, Inter, sans-serif", fontSize, fontWeight: style?.fontWeight ?? (role === "headline" ? 800 : 600), lineHeight: style?.lineHeightPx && style.fontSize ? style.lineHeightPx / style.fontSize : 1.08, textAlign: align as "left" | "center" | "right", overflow: "hidden", ...localEntrance(local, fps, track.durationInFrames) }}>{text}</div>;
}

function BrandRole({ role, urls, layout }: { role: string; urls: string[]; layout?: StudioFigmaVideoLayout }) {
  const { width, height } = useVideoConfig();
  const items = layout?.roles?.[role] ?? [];
  return <>{urls.map((url, index) => {
    const item = items[index];
    if (!item?.box || !layout?.frameBox?.width || !layout.frameBox.height) return null;
    const left = item.box.x / layout.frameBox.width * width;
    const top = item.box.y / layout.frameBox.height * height;
    const boxWidth = item.box.width / layout.frameBox.width * width;
    const boxHeight = item.box.height / layout.frameBox.height * height;
    return <Img key={`${role}-${index}`} src={url} style={{ position: "absolute", left, top, width: boxWidth, height: boxHeight, objectFit: "contain", pointerEvents: "none" }} />;
  })}</>;
}

export function AcademyVideoComposition({ payload, timeline, assetUrls, figmaLayout, brandLayerUrls = {} }: AcademyVideoCompositionProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const data = payload.frames[0];
  const footage = timeline.tracks.filter((track) => track.role === "footage" && track.assetId);
  const music = timeline.tracks.find((track) => track.role === "music" && track.assetId);
  const textTracks = timeline.tracks.filter((track) => track.kind === "text");

  return <AbsoluteFill style={{ backgroundColor: "#0a0a0a", color: "white", overflow: "hidden" }}>
    {footage.map((track) => {
      const src = track.assetId ? assetUrls[track.assetId] : undefined;
      if (!src) return null;
      const crop = track.crop ?? { focalX: .5, focalY: .5, zoom: 1 };
      const local = frame - track.startFrame;
      const fadeFrames = track.transition === "dissolve" ? Math.max(1, Math.round(.12 * fps)) : 1;
      const opacity = track.transition === "dissolve" ? interpolate(local, [0, fadeFrames, Math.max(fadeFrames, track.durationInFrames - fadeFrames), track.durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
      return <Sequence key={track.id} from={track.startFrame} durationInFrames={track.durationInFrames}>
        <Video src={src} startFrom={track.sourceStartFrame ?? 0} muted={music ? true : Boolean(track.muted)} volume={music ? 0 : track.volume ?? .72} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${clamp(crop.focalX, 0, 1) * 100}% ${clamp(crop.focalY, 0, 1) * 100}%`, transform: `scale(${crop.zoom || 1})`, opacity }} />
      </Sequence>;
    })}

    {music?.assetId && assetUrls[music.assetId] ? <Sequence from={music.startFrame} durationInFrames={music.durationInFrames}><Audio src={assetUrls[music.assetId]} startFrom={music.sourceStartFrame ?? 0} volume={music.volume ?? .6} /></Sequence> : null}

    {figmaLayout ? <>
      <BrandRole role="background" urls={brandLayerUrls.background ?? []} layout={figmaLayout} />
      <BrandRole role="decoration" urls={brandLayerUrls.decoration ?? []} layout={figmaLayout} />
      <BrandRole role="logo" urls={brandLayerUrls.logo ?? []} layout={figmaLayout} />
    </> : null}

    {textTracks.map((track) => {
      const text = track.role === "headline" ? data.title : track.role === "eyebrow" ? data.eyebrow : track.role === "body" ? data.body : track.text;
      if (!text) return null;
      return <Sequence key={track.id} from={track.startFrame} durationInFrames={track.durationInFrames}><TextTrack track={{ ...track, startFrame: 0 }} text={text} layout={figmaLayout} role={String(track.role)} /></Sequence>;
    })}
  </AbsoluteFill>;
}
