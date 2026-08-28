import type { StructuredStudioPayload, StudioVideoTimeline, StudioVideoTrack } from "@/lib/studio-artifact";
import type { DriveAsset } from "@/lib/types";

export type NleTarget = "davinci" | "premiere" | "final-cut" | "avid" | "universal";

export type PortableMedia = {
  asset: DriveAsset;
  relativePath: string;
  downloadUrl: string;
};

export type PortableGraphic = {
  nodeId: string;
  role: string;
  name: string;
  relativePath: string;
};

export function parseNleTarget(value: string | null): NleTarget {
  if (value === "davinci" || value === "premiere" || value === "final-cut" || value === "avid" || value === "universal") return value;
  return "davinci";
}

function timelineOf(payload: StructuredStudioPayload) {
  const timeline = payload.artifact?.videoTimeline;
  if (!timeline) throw new Error("Esta versão não possui timeline de vídeo.");
  return timeline;
}

function xml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function portablePath(value: string) {
  return value.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function roundedFps(fps: number) {
  return Math.max(1, Math.round(fps));
}

function frameDuration(fps: number) {
  if (Math.abs(fps - 29.97) < .02) return "1001/30000s";
  if (Math.abs(fps - 59.94) < .02) return "1001/60000s";
  if (Math.abs(fps - 23.976) < .02) return "1001/24000s";
  return `1/${roundedFps(fps)}s`;
}

function rationalSeconds(frames: number, fps: number) {
  if (Math.abs(fps - 29.97) < .02) return `${Math.round(frames) * 1001}/30000s`;
  if (Math.abs(fps - 59.94) < .02) return `${Math.round(frames) * 1001}/60000s`;
  if (Math.abs(fps - 23.976) < .02) return `${Math.round(frames) * 1001}/24000s`;
  return `${Math.round(frames)}/${roundedFps(fps)}s`;
}

function timecode(frames: number, fps: number) {
  const rate = roundedFps(fps);
  let value = Math.max(0, Math.round(frames));
  const ff = value % rate;
  value = Math.floor(value / rate);
  const ss = value % 60;
  value = Math.floor(value / 60);
  const mm = value % 60;
  const hh = Math.floor(value / 60);
  return [hh, mm, ss, ff].map((part) => String(part).padStart(2, "0")).join(":");
}

function footageTracks(timeline: StudioVideoTimeline) {
  return timeline.tracks
    .filter((track) => track.role === "footage" && track.assetId)
    .sort((a, b) => a.startFrame - b.startFrame);
}

function mediaMaps(media: PortableMedia[]) {
  return {
    byId: new Map(media.map((item) => [item.asset.id, item])),
    fileId: new Map(media.map((item, index) => [item.asset.id, `file-${index + 1}`]))
  };
}

function graphicPath(track: StudioVideoTrack, graphics: PortableGraphic[]) {
  if (track.figmaNodeId) {
    const exact = graphics.find((item) => item.nodeId === track.figmaNodeId);
    if (exact) return exact.relativePath;
  }
  return graphics.find((item) => item.role === String(track.role))?.relativePath ?? null;
}

function musicCue(payload: StructuredStudioPayload) {
  return payload.artifact?.reelPlan?.musicDirection ?? null;
}

export function serializePremiereXml(input: {
  payload: StructuredStudioPayload;
  projectName: string;
  media: PortableMedia[];
  graphics: PortableGraphic[];
}) {
  const timeline = timelineOf(input.payload);
  const fps = roundedFps(timeline.fps);
  const { byId, fileId } = mediaMaps(input.media);
  const footage = footageTracks(timeline);
  const clips = footage.flatMap((track, index) => {
    const item = byId.get(track.assetId!);
    if (!item) return [];
    const sourceIn = track.sourceStartFrame ?? 0;
    const sourceOut = track.sourceEndFrame ?? sourceIn + track.durationInFrames;
    const id = `clipitem-v-${index + 1}`;
    const fid = fileId.get(item.asset.id)!;
    return [`<clipitem id="${id}"><name>${xml(item.asset.name)}</name><duration>${Math.max(sourceOut, track.durationInFrames)}</duration><rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate><start>${track.startFrame}</start><end>${track.startFrame + track.durationInFrames}</end><in>${sourceIn}</in><out>${sourceOut}</out><file id="${fid}"><name>${xml(item.asset.name)}</name><pathurl>file://localhost/${xml(portablePath(item.relativePath))}</pathurl><rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate></file><comments><mastercomment1>${xml(`Academy transition=${track.transition ?? "cut"}; durationFrames=${track.transitionDurationInFrames ?? 0}`)}</mastercomment1></comments></clipitem>`];
  }).join("");

  const audioClips = footage.flatMap((track, index) => {
    const item = byId.get(track.assetId!);
    if (!item || item.asset.mimeType.startsWith("image/")) return [];
    const sourceIn = track.sourceStartFrame ?? 0;
    const sourceOut = track.sourceEndFrame ?? sourceIn + track.durationInFrames;
    const fid = fileId.get(item.asset.id)!;
    return [`<clipitem id="clipitem-a-${index + 1}"><name>${xml(item.asset.name)} · audio</name><duration>${Math.max(sourceOut, track.durationInFrames)}</duration><rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate><start>${track.startFrame}</start><end>${track.startFrame + track.durationInFrames}</end><in>${sourceIn}</in><out>${sourceOut}</out><file id="${fid}"/><filter><effect><name>Audio Levels</name><effectid>audiolevels</effectid><effectcategory>audiolevels</effectcategory><effecttype>audiolevels</effecttype><mediatype>audio</mediatype><parameter><parameterid>level</parameterid><name>Level</name><valuemin>0</valuemin><valuemax>3.98109</valuemax><value>${Math.max(0, track.volume ?? .72)}</value></parameter></effect></filter></clipitem>`];
  }).join("");

  const graphicClips = timeline.tracks.filter((track) => track.kind === "graphic").flatMap((track, index) => {
    const path = graphicPath(track, input.graphics);
    if (!path) return [];
    return [`<clipitem id="graphic-${index + 1}"><name>${xml(track.name)}</name><duration>${track.durationInFrames}</duration><rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate><start>${track.startFrame}</start><end>${track.startFrame + track.durationInFrames}</end><in>0</in><out>${track.durationInFrames}</out><file id="graphic-file-${index + 1}"><name>${xml(track.name)}</name><pathurl>file://localhost/${xml(portablePath(path))}</pathurl><rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate></file></clipitem>`];
  }).join("");

  const cue = musicCue(input.payload);
  const marker = cue ? `<marker><name>${xml(`MUSIC · ${cue.artist} — ${cue.title}`)}</name><comment>${xml(`Use ${cue.section}; start ${cue.startOffsetSeconds}s; ${cue.bpm} BPM; search: ${cue.searchQuery}`)}</comment><in>0</in><out>-1</out></marker>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?><xmeml version="5"><sequence id="academy-sequence"><name>${xml(input.projectName)}</name><duration>${timeline.durationInFrames}</duration><rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>${marker}<media><video><format><samplecharacteristics><width>${timeline.width}</width><height>${timeline.height}</height><pixelaspectratio>square</pixelaspectratio><rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate></samplecharacteristics></format><track>${clips}</track>${graphicClips ? `<track>${graphicClips}</track>` : ""}</video><audio><track>${audioClips}</track></audio></media></sequence></xmeml>`;
}

export function serializeFinalCutXml(input: {
  payload: StructuredStudioPayload;
  projectName: string;
  media: PortableMedia[];
  graphics: PortableGraphic[];
}) {
  const timeline = timelineOf(input.payload);
  const formatId = "format-1";
  const mediaResources = input.media.map((item, index) => `<asset id="asset-${index + 1}" name="${xml(item.asset.name)}" src="file://${xml(portablePath(item.relativePath))}" start="0s" hasVideo="1" hasAudio="${item.asset.mimeType.startsWith("image/") ? "0" : "1"}"/>`).join("");
  const graphicResources = input.graphics.map((item, index) => `<asset id="graphic-${index + 1}" name="${xml(item.name)}" src="file://${xml(portablePath(item.relativePath))}" start="0s" hasVideo="1" hasAudio="0"/>`).join("");
  const mediaRef = new Map(input.media.map((item, index) => [item.asset.id, `asset-${index + 1}`]));
  const graphicRef = new Map(input.graphics.map((item, index) => [item.nodeId, `graphic-${index + 1}`]));
  const graphicRoleRef = new Map<string, string>();
  input.graphics.forEach((item, index) => { if (!graphicRoleRef.has(item.role)) graphicRoleRef.set(item.role, `graphic-${index + 1}`); });

  const spine = footageTracks(timeline).flatMap((track) => {
    const ref = mediaRef.get(track.assetId!);
    if (!ref) return [];
    return [`<asset-clip name="${xml(track.name)}" ref="${ref}" offset="${rationalSeconds(track.startFrame, timeline.fps)}" start="${rationalSeconds(track.sourceStartFrame ?? 0, timeline.fps)}" duration="${rationalSeconds(track.durationInFrames, timeline.fps)}"><note>${xml(`Academy transition=${track.transition ?? "cut"}; durationFrames=${track.transitionDurationInFrames ?? 0}`)}</note></asset-clip>`];
  }).join("");

  const connected = timeline.tracks.filter((track) => track.kind === "graphic").flatMap((track, index) => {
    const ref = (track.figmaNodeId ? graphicRef.get(track.figmaNodeId) : undefined) ?? graphicRoleRef.get(String(track.role));
    if (!ref) return [];
    return [`<asset-clip lane="${index + 1}" name="${xml(track.name)}" ref="${ref}" offset="${rationalSeconds(track.startFrame, timeline.fps)}" start="0s" duration="${rationalSeconds(track.durationInFrames, timeline.fps)}"/>`];
  }).join("");

  const cue = musicCue(input.payload);
  const marker = cue ? `<marker start="0s" value="${xml(`MUSIC · ${cue.artist} — ${cue.title} · ${cue.section} · ${cue.bpm} BPM`) }" note="${xml(cue.searchQuery)}"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?><fcpxml version="1.10"><resources><format id="${formatId}" name="Inteli Academy Vertical" frameDuration="${frameDuration(timeline.fps)}" width="${timeline.width}" height="${timeline.height}"/>${mediaResources}${graphicResources}</resources><library><event name="Inteli Academy"><project name="${xml(input.projectName)}"><sequence format="${formatId}" duration="${rationalSeconds(timeline.durationInFrames, timeline.fps)}" tcStart="0s" tcFormat="NDF"><spine>${spine}${connected}${marker}</spine></sequence></project></event></library></fcpxml>`;
}

export function serializeEdl(input: { payload: StructuredStudioPayload; media: PortableMedia[] }) {
  const timeline = timelineOf(input.payload);
  const byId = new Map(input.media.map((item) => [item.asset.id, item]));
  const lines = ["TITLE: INTELI ACADEMY AI EDIT", "FCM: NON-DROP FRAME", ""];
  footageTracks(timeline).forEach((track, index) => {
    const item = byId.get(track.assetId!);
    const sourceIn = track.sourceStartFrame ?? 0;
    const sourceOut = track.sourceEndFrame ?? sourceIn + track.durationInFrames;
    const recordIn = track.startFrame;
    const recordOut = track.startFrame + track.durationInFrames;
    const reel = `AX${String(index + 1).padStart(2, "0")}`.slice(0, 8);
    lines.push(`${String(index + 1).padStart(3, "0")}  ${reel.padEnd(8)} V     C        ${timecode(sourceIn, timeline.fps)} ${timecode(sourceOut, timeline.fps)} ${timecode(recordIn, timeline.fps)} ${timecode(recordOut, timeline.fps)}`);
    lines.push(`* FROM CLIP NAME: ${item?.asset.name ?? track.name}`);
    if (track.transition && track.transition !== "cut") lines.push(`* ACADEMY TRANSITION: ${track.transition} ${track.transitionDurationInFrames ?? 0} frames`);
    lines.push("");
  });
  const cue = musicCue(input.payload);
  if (cue) lines.push(`* MUSIC CUE: ${cue.artist} — ${cue.title} | ${cue.section} | ${cue.bpm} BPM | ${cue.searchQuery}`);
  return lines.join("\n");
}

export function serializeAvidAle(input: { payload: StructuredStudioPayload; media: PortableMedia[] }) {
  const timeline = timelineOf(input.payload);
  const byId = new Map(input.media.map((item) => [item.asset.id, item]));
  const rows = footageTracks(timeline).map((track) => {
    const item = byId.get(track.assetId!);
    const sourceIn = track.sourceStartFrame ?? 0;
    const sourceOut = track.sourceEndFrame ?? sourceIn + track.durationInFrames;
    return [item?.asset.name ?? track.name, "Academy", timecode(sourceIn, timeline.fps), timecode(sourceOut, timeline.fps), timecode(track.durationInFrames, timeline.fps), "V", track.assetId ?? ""].join("\t");
  });
  return [
    "Heading",
    `FIELD_DELIM\tTABS`,
    `VIDEO_FORMAT\t${timeline.height >= timeline.width ? "CUSTOM_VERTICAL" : "CUSTOM"}`,
    `FPS\t${timeline.fps}`,
    "",
    "Column",
    "Name\tTape\tStart\tEnd\tDuration\tTracks\tAcademy Asset ID",
    "Data",
    ...rows
  ].join("\n");
}

export function serializeUniversalManifest(input: {
  payload: StructuredStudioPayload;
  projectId: string;
  projectName: string;
  versionNumber: number;
  figmaFileKey?: string | null;
  frameId?: string | null;
  media: PortableMedia[];
  graphics: PortableGraphic[];
}) {
  const timeline = timelineOf(input.payload);
  return {
    schema: "inteli-academy-universal-edit/v2",
    sourceOfTruth: "academy-universal-timeline",
    project: { id: input.projectId, name: input.projectName, version: input.versionNumber, contentType: input.payload.contentType },
    timeline: {
      schemaVersion: timeline.schemaVersion,
      width: timeline.width,
      height: timeline.height,
      fps: timeline.fps,
      durationInFrames: timeline.durationInFrames,
      beatFrames: timeline.beatFrames ?? [],
      sourceAudio: timeline.sourceAudio,
      executionSummary: timeline.executionSummary ?? null,
      tracks: timeline.tracks
    },
    musicCue: musicCue(input.payload),
    media: input.media.map((item) => ({ id: item.asset.id, name: item.asset.name, mimeType: item.asset.mimeType, relativePath: item.relativePath, downloadUrl: item.downloadUrl })),
    figma: { fileKey: input.figmaFileKey ?? null, frameId: input.frameId ?? null, graphics: input.graphics },
    interchange: {
      preferred: "DaVinci Resolve / OpenTimelineIO",
      adapters: {
        davinci: { files: ["content.otio", "academy-resolve-bridge.py"], fidelity: "highest" },
        premiere: { files: ["premiere.xml", "content.otio", "project.edl"], fidelity: "high" },
        finalCut: { files: ["final-cut.fcpxml", "content.otio"], fidelity: "high" },
        avid: { files: ["project.edl", "avid.ale", "content.otio"], fidelity: "interchange" },
        generic: { files: ["content.otio", "project.edl", "project-manifest.json"], fidelity: "portable" },
        afterEffects: { files: ["separate Academy After Effects adapter"], fidelity: "adapter" }
      }
    },
    compatibilityPolicy: {
      invariant: "clip timing, source in/out, layer order, text/music/Figma metadata and source identity must survive export",
      nativeEffects: "map to the closest editor-native effect when possible; otherwise preserve timing and Academy metadata without changing the edit",
      unresolvedMusic: "the AI-selected song is a cue until a licensed source is relinked; never fabricate or silently replace it"
    }
  };
}

export function mediaDownloadScript() {
  return `#!/usr/bin/env python3\nimport json, pathlib, urllib.request\nROOT = pathlib.Path(__file__).resolve().parent\ndata = json.loads((ROOT / "project-manifest.json").read_text(encoding="utf-8"))\nfor media in data.get("media", []):\n    target = ROOT / media["relativePath"]\n    target.parent.mkdir(parents=True, exist_ok=True)\n    if target.exists() and target.stat().st_size > 0:\n        continue\n    print("[Inteli Academy] Download:", media["name"])\n    urllib.request.urlretrieve(media["downloadUrl"], target)\nprint("[Inteli Academy] Media ready.")\n`;
}

export function nleReadme(target: NleTarget, versionNumber: number) {
  const instructions: Record<NleTarget, string> = {
    davinci: "Preferred path: open DaVinci Resolve and run OPEN-IN-DAVINCI.bat (Windows) or python3 academy-resolve-bridge.py. You can also import content.otio manually.",
    premiere: "Run DOWNLOAD-MEDIA.py, then in Adobe Premiere Pro import premiere.xml. content.otio and project.edl are included as interchange fallbacks.",
    "final-cut": "Run DOWNLOAD-MEDIA.py, then import final-cut.fcpxml in Final Cut Pro. content.otio is included as a portable reference.",
    avid: "Run DOWNLOAD-MEDIA.py. Import project.edl as the sequence and avid.ale for clip metadata. content.otio and the manifest preserve richer Academy metadata. Native AAF is not fabricated because AAF requires an editor-specific binary writer/conformer.",
    universal: "Run DOWNLOAD-MEDIA.py, then choose the format your editor supports: content.otio, premiere.xml, final-cut.fcpxml, project.edl or avid.ale. DaVinci users can run the included bridge."
  };
  return `INTELI ACADEMY — UNIVERSAL EDIT PACKAGE · V${versionNumber}\n\nSOURCE OF TRUTH\nThe MP4 is only a render. project-manifest.json + the Academy timeline are the editorial source of truth. Cuts, source in/out, layer timing, music cue, Figma bindings and transition intent are independent of any single editor.\n\nTARGET\n${target}\n\nIMPORT\n${instructions[target]}\n\nPORTABILITY\nAll editor files use relative media/ and figma/ paths. Media is not duplicated into the server-generated archive; DOWNLOAD-MEDIA.py retrieves the authorized sources into media/. Figma graphics that were available at export time are packaged in figma/.\n\nMUSIC\nThe AI chooses the music independently. If the track is not yet backed by a licensed source, title, artist, section, BPM, start offset and search query remain as an editable cue in the manifest/OTIO markers. Relink the licensed audio in the editor or publishing catalog.\n\nEFFECTS\nEditor-specific effects cannot be losslessly represented by one universal format. The adapters preserve exact cut timing and Academy transition/effect metadata, then map to native effects where the target format supports it.\n`;
}
