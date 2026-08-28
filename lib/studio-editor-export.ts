import type { DriveAsset } from "@/lib/types";
import type { StructuredStudioPayload, StudioVideoTrack } from "@/lib/studio-artifact";

function rational(value: number, rate: number) {
  return { OTIO_SCHEMA: "RationalTime.1", value, rate };
}

function timeRange(start: number, duration: number, rate: number) {
  return { OTIO_SCHEMA: "TimeRange.1", start_time: rational(start, rate), duration: rational(duration, rate) };
}

export function serializeOtio(input: {
  payload: StructuredStudioPayload;
  projectName: string;
  assetUrl: (assetId: string) => string;
}) {
  const timeline = input.payload.artifact?.videoTimeline;
  if (!timeline) throw new Error("Esta versão não possui timeline de vídeo.");

  const tracks = timeline.tracks.map((track) => {
    const children: Array<Record<string, unknown>> = [];
    if (track.startFrame > 0) {
      children.push({ OTIO_SCHEMA: "Gap.1", name: "Pre-roll", source_range: timeRange(0, track.startFrame, timeline.fps), metadata: {} });
    }
    children.push({
      OTIO_SCHEMA: "Clip.2",
      name: track.name,
      source_range: timeRange(track.sourceStartFrame ?? 0, track.durationInFrames, timeline.fps),
      metadata: {
        academy: {
          id: track.id,
          role: track.role,
          kind: track.kind,
          editable: true,
          text: track.text ?? null,
          zIndex: track.zIndex,
          figmaNodeId: track.figmaNodeId ?? null,
          crop: track.crop ?? null,
          transition: track.transition ?? null,
          transitionDurationInFrames: track.transitionDurationInFrames ?? 0,
          volume: track.volume ?? null,
          muted: track.muted ?? null,
          musicDirection: track.musicDirection ?? null
        }
      },
      media_reference: track.assetId ? {
        OTIO_SCHEMA: "ExternalReference.1",
        target_url: input.assetUrl(track.assetId),
        metadata: { academy: { assetId: track.assetId } }
      } : {
        OTIO_SCHEMA: "MissingReference.1",
        metadata: { academy: { generatedLayer: true, role: track.role, text: track.text ?? null, figmaNodeId: track.figmaNodeId ?? null, musicDirection: track.musicDirection ?? null, note: "Resolve/relink this layer through the Academy universal manifest or target-specific adapter." } }
      }
    });
    return {
      OTIO_SCHEMA: "Track.1",
      name: track.name,
      kind: track.kind === "audio" ? "Audio" : "Video",
      metadata: { academy: { id: track.id, role: track.role, zIndex: track.zIndex, editable: true } },
      children
    };
  });

  return {
    OTIO_SCHEMA: "Timeline.1",
    name: input.projectName,
    global_start_time: rational(0, timeline.fps),
    metadata: {
      academy: {
        schema: "inteli-academy-universal-timeline/v2",
        timelineSchemaVersion: timeline.schemaVersion,
        sceneGraphVersion: input.payload.artifact?.sceneGraph.schemaVersion ?? null,
        sourceOfTruth: "academy-universal-timeline",
        engine: "remotion",
        editable: true,
        width: timeline.width,
        height: timeline.height,
        fps: timeline.fps,
        beatFrames: timeline.beatFrames ?? [],
        musicCue: input.payload.artifact?.reelPlan?.musicDirection ?? null
      }
    },
    tracks: { OTIO_SCHEMA: "Stack.1", name: "Academy Universal Tracks", children: tracks, metadata: {} }
  };
}

function manifestTrack(track: StudioVideoTrack, fps: number, assets: DriveAsset[], assetUrl: (assetId: string) => string) {
  const asset = track.assetId ? assets.find((item) => item.id === track.assetId) : null;
  return {
    ...track,
    startSeconds: track.startFrame / fps,
    durationSeconds: track.durationInFrames / fps,
    sourceStartSeconds: (track.sourceStartFrame ?? 0) / fps,
    sourceEndSeconds: track.sourceEndFrame === undefined ? null : track.sourceEndFrame / fps,
    source: asset ? { id: asset.id, name: asset.name, mimeType: asset.mimeType, url: assetUrl(asset.id) } : null,
    nativeEditIntent: track.kind === "text"
      ? "Create a native editable text/title layer using the text field."
      : track.kind === "graphic"
        ? "Keep as a separate graphic layer; use Figma bindings for the exact editable source."
        : track.role === "music"
          ? "Relink the licensed source described by musicDirection without changing timing or beat metadata."
          : "Keep as an independent media layer with the same source in/out and timeline position."
  };
}

export function serializeEditorManifest(input: {
  payload: StructuredStudioPayload;
  projectId: string;
  projectName: string;
  versionNumber: number;
  driveAssets: DriveAsset[];
  figmaFileKey?: string | null;
  assetUrl: (assetId: string) => string;
}) {
  const artifact = input.payload.artifact;
  if (!artifact) throw new Error("Esta versão ainda não possui artefato estruturado.");
  return {
    schema: "inteli-academy-editor-project/v2",
    project: { id: input.projectId, name: input.projectName, version: input.versionNumber, contentType: input.payload.contentType },
    editability: {
      sourceOfTruth: "academy-universal-timeline",
      preferredEditor: "DaVinci Resolve",
      supportedAdapters: ["DaVinci Resolve", "Adobe Premiere Pro", "Final Cut Pro", "Avid Media Composer", "After Effects", "OpenTimelineIO", "CMX3600 EDL"],
      figmaFileKey: input.figmaFileKey ?? null,
      figmaSourcePage: artifact.sceneGraph.designSystemPage,
      notes: [
        "O MP4 é somente um render; a timeline estruturada é a fonte editorial de verdade.",
        "Textos devem permanecer como títulos/text layers nativos no editor.",
        "Mídias devem permanecer em faixas independentes com source in/out preservados.",
        "Os node IDs do Figma apontam para a versão visual editável exata quando disponíveis.",
        "Efeitos específicos de cada editor são mapeados pelo adapter; quando não houver equivalente, timing e metadata Academy permanecem preservados.",
        "Música escolhida pela IA permanece como cue até que uma fonte licenciada seja relinkada."
      ]
    },
    sceneGraph: artifact.sceneGraph,
    brandAudit: artifact.brandAudit,
    visualBrandReview: artifact.visualBrandReview ?? null,
    musicCue: artifact.reelPlan?.musicDirection ?? null,
    remotion: artifact.videoTimeline ? {
      compositionId: "AcademyVideoComposition",
      timeline: { ...artifact.videoTimeline, tracks: artifact.videoTimeline.tracks.map((track) => manifestTrack(track, artifact.videoTimeline!.fps, input.driveAssets, input.assetUrl)) }
    } : null,
    payload: { title: input.payload.title, caption: input.payload.caption, frames: input.payload.frames, factualClaims: input.payload.factualClaims }
  };
}
