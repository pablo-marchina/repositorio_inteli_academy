import type { DriveAsset, StudioFrame, StudioPayload } from "@/lib/types";

export type StudioSemanticRole = "eyebrow" | "headline" | "body" | "stat" | "statLabel" | "bullets" | "media" | "logo" | "pagination" | "decoration" | "background";

export type StudioSceneNode = {
  id: string;
  role: StudioSemanticRole;
  kind: "text" | "image" | "video" | "component" | "vector" | "shape" | "group";
  editable: true;
  lockedByBrand: boolean;
  text?: string;
  assetId?: string;
  source: "figma-template" | "drive" | "generated-content" | "figma-base-version";
};

export type StudioSceneFrame = {
  id: string;
  position: number;
  width: number;
  height: number;
  archetype: StudioFrame["template"];
  sourcePageName: "Social Media";
  preferredTemplateNames: string[];
  sourceFigmaFrameId?: string;
  figmaTemplateNodeId?: string;
  figmaOutputFrameId?: string;
  changedRoles: StudioSemanticRole[];
  nodes: StudioSceneNode[];
};

export type StudioBrandReport = {
  score: number;
  passed: boolean;
  source: "structural" | "visual-critic";
  checks: Array<{ id: string; label: string; passed: boolean; severity: "error" | "warning" | "info"; detail: string }>;
  reviewedAt?: string;
  issues?: string[];
  corrections?: string[];
};

export type StudioVideoTrack = {
  id: string;
  name: string;
  kind: "video" | "audio" | "text" | "image" | "graphic";
  role: StudioSemanticRole | "footage" | "music" | "voice" | "sfx";
  startFrame: number;
  durationInFrames: number;
  zIndex: number;
  editable: true;
  assetId?: string;
  text?: string;
  figmaNodeId?: string;
};

export type StudioVideoTimeline = {
  schemaVersion: 1;
  engine: "remotion";
  interchange: "opentimelineio";
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  tracks: StudioVideoTrack[];
};

export type StudioArtifact = {
  schemaVersion: 2;
  editability: "structured";
  renderer: "figma-template-clone";
  sceneGraph: {
    schemaVersion: 2;
    sourceOfTruth: "structured-design";
    designSystemPage: "Social Media";
    frames: StudioSceneFrame[];
  };
  brandAudit: StudioBrandReport;
  visualBrandReview?: StudioBrandReport;
  videoTimeline?: StudioVideoTimeline;
};

export type StructuredStudioPayload = StudioPayload & { artifact?: StudioArtifact };

const TEMPLATE_HINTS: Record<StudioFrame["template"], string[]> = {
  cover: ["capa", "novidades", "hackathon", "case", "tractian", "nova diretoria"],
  editorial: ["introdução", "analogia", "exemplo", "quando utilizar", "resumo"],
  stat: ["resumo", "diferenças", "novidades", "acompanhamento"],
  quote: ["analogia", "exemplo", "academy week"],
  photo: ["case", "hackathon", "tractian", "nova diretoria", "post parceria"],
  cta: ["fim", "academy week", "agenda"]
};

const ALL_EDITABLE_ROLES: StudioSemanticRole[] = ["eyebrow", "headline", "body", "stat", "statLabel", "bullets", "media"];

function stableNodeId(position: number, role: StudioSemanticRole) {
  return `frame-${position}-${role}`;
}

function comparable(value: unknown) {
  return JSON.stringify(value ?? null);
}

function changedRoles(current: StudioFrame | undefined, next: StudioFrame) {
  if (!current) return [...ALL_EDITABLE_ROLES];
  const roles: StudioSemanticRole[] = [];
  if (current.eyebrow !== next.eyebrow) roles.push("eyebrow");
  if (current.title !== next.title) roles.push("headline");
  if (current.body !== next.body) roles.push("body");
  if (current.stat !== next.stat) roles.push("stat");
  if (current.statLabel !== next.statLabel) roles.push("statLabel");
  if (comparable(current.bullets) !== comparable(next.bullets)) roles.push("bullets");
  if (current.mediaAssetId !== next.mediaAssetId || current.mediaFit !== next.mediaFit) roles.push("media");
  return roles;
}

function sceneNodes(frame: StudioFrame, source: StudioSceneNode["source"]): StudioSceneNode[] {
  const nodes: StudioSceneNode[] = [
    { id: stableNodeId(frame.position, "background"), role: "background", kind: "shape", editable: true, lockedByBrand: true, source: "figma-template" },
    { id: stableNodeId(frame.position, "logo"), role: "logo", kind: "component", editable: true, lockedByBrand: true, source: "figma-template" },
    { id: stableNodeId(frame.position, "decoration"), role: "decoration", kind: "group", editable: true, lockedByBrand: true, source: "figma-template" },
    { id: stableNodeId(frame.position, "pagination"), role: "pagination", kind: "text", editable: true, lockedByBrand: true, source: "figma-template" },
    { id: stableNodeId(frame.position, "headline"), role: "headline", kind: "text", editable: true, lockedByBrand: false, text: frame.title, source }
  ];
  if (frame.eyebrow) nodes.push({ id: stableNodeId(frame.position, "eyebrow"), role: "eyebrow", kind: "text", editable: true, lockedByBrand: false, text: frame.eyebrow, source });
  if (frame.body) nodes.push({ id: stableNodeId(frame.position, "body"), role: "body", kind: "text", editable: true, lockedByBrand: false, text: frame.body, source });
  if (frame.stat) nodes.push({ id: stableNodeId(frame.position, "stat"), role: "stat", kind: "text", editable: true, lockedByBrand: false, text: frame.stat, source });
  if (frame.statLabel) nodes.push({ id: stableNodeId(frame.position, "statLabel"), role: "statLabel", kind: "text", editable: true, lockedByBrand: false, text: frame.statLabel, source });
  if (frame.bullets?.length) nodes.push({ id: stableNodeId(frame.position, "bullets"), role: "bullets", kind: "text", editable: true, lockedByBrand: false, text: frame.bullets.join("\n"), source });
  if (frame.mediaAssetId) nodes.push({ id: stableNodeId(frame.position, "media"), role: "media", kind: "image", editable: true, lockedByBrand: false, assetId: frame.mediaAssetId, source: "drive" });
  return nodes;
}

function structuralBrandAudit(payload: StudioPayload, frames: StudioSceneFrame[]): StudioBrandReport {
  const checks: StudioBrandReport["checks"] = [];
  checks.push({ id: "figma-source", label: "Identidade nasce do Figma real", passed: frames.every((frame) => frame.sourcePageName === "Social Media"), severity: "error", detail: "Cada frame deve clonar um frame editável real da página Social Media ou uma versão Figma já editada." });
  checks.push({ id: "structured-editability", label: "Elementos permanecem editáveis", passed: frames.every((frame) => frame.nodes.every((node) => node.editable)), severity: "error", detail: "Texto, mídia, vetores e grupos são mantidos como objetos estruturados; o post inteiro não é rasterizado." });
  checks.push({ id: "mobile-density", label: "Densidade adequada para mobile", passed: payload.frames.every((frame) => frame.title.length <= 100 && (frame.body?.length ?? 0) <= 360 && (frame.bullets?.length ?? 0) <= 4), severity: "warning", detail: "Limites de título, corpo e bullets preservam leitura em tela pequena." });
  checks.push({ id: "brand-locked-elements", label: "Elementos de marca protegidos", passed: frames.every((frame) => frame.nodes.some((node) => node.role === "logo" && node.lockedByBrand)), severity: "error", detail: "Logo, fundo e decoração vêm do template Figma e não são recriados pela IA." });
  const failures = checks.filter((check) => !check.passed);
  const score = Math.max(0, 100 - failures.reduce((sum, check) => sum + (check.severity === "error" ? 25 : check.severity === "warning" ? 10 : 2), 0));
  return { score, passed: failures.every((check) => check.severity !== "error") && score >= 80, checks, source: "structural" };
}

function buildVideoTimeline(payload: StudioPayload, driveAssets: DriveAsset[]): StudioVideoTimeline | undefined {
  if (payload.contentType !== "reel") return undefined;
  const frame = payload.frames[0];
  const fps = 30;
  const durationInFrames = 12 * fps;
  const tracks: StudioVideoTrack[] = [];
  const video = driveAssets.find((asset) => asset.id === payload.primaryDriveAssetId && asset.mimeType.startsWith("video/"));
  if (video) tracks.push({ id: "video-footage", name: `V1 · Footage · ${video.name}`, kind: "video", role: "footage", startFrame: 0, durationInFrames, zIndex: 0, editable: true, assetId: video.id });
  tracks.push({ id: "graphic-brand", name: "V2 · Brand graphics", kind: "graphic", role: "decoration", startFrame: 0, durationInFrames, zIndex: 10, editable: true });
  if (frame.eyebrow) tracks.push({ id: "text-eyebrow", name: "V3 · Eyebrow", kind: "text", role: "eyebrow", startFrame: 6, durationInFrames: durationInFrames - 6, zIndex: 20, editable: true, text: frame.eyebrow });
  tracks.push({ id: "text-headline", name: "V4 · Headline", kind: "text", role: "headline", startFrame: 12, durationInFrames: durationInFrames - 12, zIndex: 30, editable: true, text: frame.title });
  if (frame.body) tracks.push({ id: "text-body", name: "V5 · Body", kind: "text", role: "body", startFrame: 30, durationInFrames: durationInFrames - 30, zIndex: 40, editable: true, text: frame.body });
  tracks.push({ id: "graphic-logo", name: "V6 · Academy logo", kind: "graphic", role: "logo", startFrame: 0, durationInFrames, zIndex: 50, editable: true });
  return { schemaVersion: 1, engine: "remotion", interchange: "opentimelineio", fps, width: 1080, height: 1920, durationInFrames, tracks };
}

export function compileStudioArtifact(payload: StudioPayload, options: {
  driveAssets?: DriveAsset[];
  previousPayload?: StudioPayload;
  baseFigmaFrameIds?: string[];
  visualBrandReview?: StudioBrandReport;
} = {}): StructuredStudioPayload {
  const vertical = payload.contentType === "story" || payload.contentType === "reel";
  const frames = payload.frames.map((frame, index): StudioSceneFrame => {
    const current = options.previousPayload?.frames.find((candidate) => candidate.position === frame.position);
    const sourceFigmaFrameId = options.baseFigmaFrameIds?.[index];
    return {
      id: `scene-frame-${frame.position}`,
      position: frame.position,
      width: 1080,
      height: vertical ? 1920 : 1350,
      archetype: frame.template,
      sourcePageName: "Social Media",
      preferredTemplateNames: vertical ? ["instagram story", ...TEMPLATE_HINTS[frame.template]] : TEMPLATE_HINTS[frame.template],
      sourceFigmaFrameId,
      changedRoles: changedRoles(current, frame),
      nodes: sceneNodes(frame, sourceFigmaFrameId ? "figma-base-version" : "generated-content")
    };
  });
  const artifact: StudioArtifact = {
    schemaVersion: 2,
    editability: "structured",
    renderer: "figma-template-clone",
    sceneGraph: { schemaVersion: 2, sourceOfTruth: "structured-design", designSystemPage: "Social Media", frames },
    brandAudit: structuralBrandAudit(payload, frames),
    visualBrandReview: options.visualBrandReview,
    videoTimeline: buildVideoTimeline(payload, options.driveAssets ?? [])
  };
  return { ...payload, artifact };
}

export function getStudioArtifact(payload: unknown): StudioArtifact | null {
  if (!payload || typeof payload !== "object") return null;
  const artifact = (payload as { artifact?: StudioArtifact }).artifact;
  return artifact?.schemaVersion === 2 ? artifact : null;
}

export function attachFigmaBindings(payload: StructuredStudioPayload, frameIds: string[], templateNodeIds: string[]) {
  const artifact = payload.artifact;
  if (!artifact) return payload;
  return {
    ...payload,
    artifact: {
      ...artifact,
      sceneGraph: {
        ...artifact.sceneGraph,
        frames: artifact.sceneGraph.frames.map((frame, index) => ({
          ...frame,
          figmaOutputFrameId: frameIds[index] ?? frame.figmaOutputFrameId,
          figmaTemplateNodeId: templateNodeIds[index] ?? frame.figmaTemplateNodeId
        }))
      }
    }
  } satisfies StructuredStudioPayload;
}

export function toOtioJson(payload: StructuredStudioPayload, projectName: string) {
  const timeline = payload.artifact?.videoTimeline;
  if (!timeline) throw new Error("Esta versão não possui timeline de vídeo.");
  const children = timeline.tracks.map((track) => ({
    OTIO_SCHEMA: "Track.1",
    name: track.name,
    kind: track.kind === "audio" ? "Audio" : "Video",
    metadata: { academy: { id: track.id, role: track.role, editable: true, zIndex: track.zIndex, text: track.text ?? null, assetId: track.assetId ?? null, figmaNodeId: track.figmaNodeId ?? null } },
    children: [{
      OTIO_SCHEMA: "Clip.2",
      name: track.name,
      metadata: { academy: { role: track.role, editable: true, text: track.text ?? null, assetId: track.assetId ?? null } },
      source_range: {
        OTIO_SCHEMA: "TimeRange.1",
        start_time: { OTIO_SCHEMA: "RationalTime.1", value: 0, rate: timeline.fps },
        duration: { OTIO_SCHEMA: "RationalTime.1", value: track.durationInFrames, rate: timeline.fps }
      },
      media_reference: track.assetId ? {
        OTIO_SCHEMA: "ExternalReference.1",
        target_url: `academy-drive://${track.assetId}`,
        metadata: { academy: { assetId: track.assetId } }
      } : { OTIO_SCHEMA: "MissingReference.1", metadata: { academy: { generatedLayer: true, role: track.role, text: track.text ?? null } } }
    }]
  }));
  return {
    OTIO_SCHEMA: "Timeline.1",
    name: projectName,
    metadata: { academy: { sceneGraphVersion: payload.artifact?.sceneGraph.schemaVersion ?? null, engine: "remotion", editable: true } },
    tracks: { OTIO_SCHEMA: "Stack.1", name: "tracks", children }
  };
}
