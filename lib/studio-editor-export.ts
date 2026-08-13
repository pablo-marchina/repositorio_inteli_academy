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
      source_range: timeRange(0, track.durationInFrames, timeline.fps),
      metadata: { academy: { id: track.id, role: track.role, editable: true, text: track.text ?? null, zIndex: track.zIndex, figmaNodeId: track.figmaNodeId ?? null } },
      media_reference: track.assetId ? {
        OTIO_SCHEMA: "ExternalReference.1",
        target_url: input.assetUrl(track.assetId),
        metadata: { academy: { assetId: track.assetId } }
      } : {
        OTIO_SCHEMA: "MissingReference.1",
        metadata: { academy: { generatedLayer: true, role: track.role, text: track.text ?? null, note: "Reconstrua esta camada como texto/gráfico nativo usando o manifest Academy." } }
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
    metadata: { academy: { schemaVersion: 1, sceneGraphVersion: input.payload.artifact?.sceneGraph.schemaVersion ?? null, engine: "remotion", editable: true, width: timeline.width, height: timeline.height, fps: timeline.fps } },
    tracks: { OTIO_SCHEMA: "Stack.1", name: "Academy Tracks", children: tracks, metadata: {} }
  };
}

function manifestTrack(track: StudioVideoTrack, fps: number, assets: DriveAsset[], assetUrl: (assetId: string) => string) {
  const asset = track.assetId ? assets.find((item) => item.id === track.assetId) : null;
  return {
    ...track,
    startSeconds: track.startFrame / fps,
    durationSeconds: track.durationInFrames / fps,
    source: asset ? { id: asset.id, name: asset.name, mimeType: asset.mimeType, url: assetUrl(asset.id) } : null,
    nativeEditIntent: track.kind === "text"
      ? "Create a native editable text/title layer using the text field."
      : track.kind === "graphic"
        ? "Keep as a separate graphic layer; use Figma bindings for the exact editable source."
        : "Keep as an independent media layer."
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
    schema: "inteli-academy-editor-project/v1",
    project: { id: input.projectId, name: input.projectName, version: input.versionNumber, contentType: input.payload.contentType },
    editability: {
      sourceOfTruth: "structured-design",
      figmaFileKey: input.figmaFileKey ?? null,
      figmaSourcePage: artifact.sceneGraph.designSystemPage,
      notes: [
        "Textos devem permanecer como títulos/text layers nativos no editor.",
        "Mídias devem permanecer em faixas independentes.",
        "Os node IDs do Figma apontam para a versão visual editável exata quando disponíveis.",
        "OTIO preserva a estrutura editorial e metadata; efeitos nativos específicos de cada editor podem exigir um adapter próprio."
      ]
    },
    sceneGraph: artifact.sceneGraph,
    brandAudit: artifact.brandAudit,
    visualBrandReview: artifact.visualBrandReview ?? null,
    remotion: artifact.videoTimeline ? {
      compositionId: "AcademyVideoComposition",
      timeline: { ...artifact.videoTimeline, tracks: artifact.videoTimeline.tracks.map((track) => manifestTrack(track, artifact.videoTimeline!.fps, input.driveAssets, input.assetUrl)) }
    } : null,
    payload: { title: input.payload.title, caption: input.payload.caption, frames: input.payload.frames, factualClaims: input.payload.factualClaims }
  };
}
