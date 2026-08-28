import type { DriveAsset, StudioFrame, StudioPayload } from "@/lib/types";
import { buildReelEditingPlan, type FootageAnalysis, type ReelEditingPlan } from "@/lib/studio-reel-analysis";

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
  source: "structural" | "visual-critic" | "render-critic" | "timeline-quality";
  checks: Array<{ id: string; label: string; passed: boolean; severity: "error" | "warning" | "info"; detail: string }>;
  reviewedAt?: string;
  issues?: string[];
  corrections?: string[];
};

export type StudioVideoCrop = {
  focalX: number;
  focalY: number;
  endFocalX?: number;
  endFocalY?: number;
  zoom: number;
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
  sourceStartFrame?: number;
  sourceEndFrame?: number;
  crop?: StudioVideoCrop;
  transition?: "cut" | "dissolve";
  volume?: number;
  muted?: boolean;
};

export type StudioFigmaVideoLayout = {
  synced: true;
  frameId: string;
  frameName: string;
  frameBox?: { width: number; height: number };
  roles: Record<string, Array<{
    id: string;
    name: string;
    text?: string;
    type: string;
    box?: { x: number; y: number; width: number; height: number };
    style?: { fontFamily?: string; fontSize?: number; fontWeight?: number; textAlignHorizontal?: string; lineHeightPx?: number };
  }>>;
};

export type StudioVideoTimeline = {
  schemaVersion: 1 | 2;
  engine: "remotion";
  interchange: "opentimelineio";
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  tracks: StudioVideoTrack[];
  beatFrames?: number[];
  sourceAudio?: boolean;
  executionSummary?: string;
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
  renderQa?: StudioBrandReport;
  reelQuality?: StudioBrandReport;
  reelPlan?: ReelEditingPlan;
  figmaVideoLayout?: StudioFigmaVideoLayout;
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

function stableNodeId(position: number, role: StudioSemanticRole) { return `frame-${position}-${role}`; }
function comparable(value: unknown) { return JSON.stringify(value ?? null); }

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
  const checks: StudioBrandReport["checks"] = [
    { id: "figma-source", label: "Identidade nasce do Figma real", passed: frames.every((frame) => frame.sourcePageName === "Social Media"), severity: "error", detail: "Cada frame aponta para a biblioteca Social Media e deve ser clonado/associado pelo plugin antes da aprovação visual." },
    { id: "structured-editability", label: "Elementos permanecem editáveis", passed: frames.every((frame) => frame.nodes.every((node) => node.editable)), severity: "error", detail: "Texto, mídia, vetores e grupos são objetos estruturados; a peça inteira não vira uma imagem opaca." },
    { id: "mobile-density", label: "Densidade adequada para mobile", passed: payload.frames.every((frame) => frame.title.length <= 100 && (frame.body?.length ?? 0) <= 360 && (frame.bullets?.length ?? 0) <= 4), severity: "warning", detail: "Limites de título, corpo e bullets preservam leitura em tela pequena." },
    { id: "brand-locked-elements", label: "Elementos de marca protegidos", passed: frames.every((frame) => frame.nodes.some((node) => node.role === "logo" && node.lockedByBrand)), severity: "error", detail: "Logo, fundo e decoração são papéis protegidos e não podem ser redesenhados livremente pela IA." }
  ];
  if (payload.contentType === "reel") checks.push({ id: "render-qa-required", label: "Reel só pode ser aprovado após QA do render", passed: false, severity: "warning", detail: "O score estrutural não substitui inspeção dos frames realmente renderizados. O QA do MP4 precisa rodar depois do Figma." });
  const failures = checks.filter((check) => !check.passed);
  const score = Math.max(0, 100 - failures.reduce((sum, check) => sum + (check.severity === "error" ? 25 : check.severity === "warning" ? 10 : 2), 0));
  return { score, passed: failures.every((check) => check.severity !== "error") && score >= 80 && payload.contentType !== "reel", checks, source: "structural" };
}

function fallbackPlan(assets: DriveAsset[]) {
  const videos = assets.filter((asset) => asset.mimeType.startsWith("video/"));
  const footage: FootageAnalysis[] = videos.map((asset) => {
    const duration = Math.max(1, Number(asset.durationMillis ?? 1000) / 1000);
    return {
      assetId: asset.id,
      durationSeconds: duration,
      width: asset.width ?? null,
      height: asset.height ?? null,
      analysisMode: "metadata-fallback",
      cameraMovement: "fallback",
      bestSegments: [{ startSeconds: 0, endSeconds: Math.min(duration, 2), score: 60, focalX: .5, focalY: .5, endFocalX: .5, endFocalY: .5, motion: "medium", reason: "fallback por metadados" }]
    };
  });
  return buildReelEditingPlan({ assets, footage, reference: null, music: null });
}

function buildVideoTimeline(payload: StudioPayload, driveAssets: DriveAsset[], suppliedPlan?: ReelEditingPlan): StudioVideoTimeline | undefined {
  if (payload.contentType !== "reel") return undefined;
  const frame = payload.frames[0];
  const fps = 30;
  const plan = suppliedPlan ?? fallbackPlan(driveAssets);
  const tracks: StudioVideoTrack[] = plan.shots.map((shot, index) => ({
    id: `video-footage-${index + 1}`,
    name: `V1.${index + 1} · Footage · ${driveAssets.find((asset) => asset.id === shot.assetId)?.name ?? shot.assetId}`,
    kind: "video",
    role: "footage",
    startFrame: Math.round(shot.timelineStartSeconds * fps),
    durationInFrames: Math.max(1, Math.round(shot.durationSeconds * fps)),
    sourceStartFrame: Math.max(0, Math.round(shot.sourceInSeconds * fps)),
    sourceEndFrame: Math.max(1, Math.round(shot.sourceOutSeconds * fps)),
    crop: shot.crop,
    transition: shot.transition,
    zIndex: 0,
    editable: true,
    assetId: shot.assetId,
    muted: Boolean(plan.musicAssetId),
    volume: plan.musicAssetId ? 0 : .72
  }));
  const durationInFrames = Math.max(1, tracks.reduce((max, track) => Math.max(max, track.startFrame + track.durationInFrames), Math.round(plan.targetDurationSeconds * fps)));
  tracks.push({ id: "graphic-brand", name: "V2 · Brand graphics · Figma", kind: "graphic", role: "decoration", startFrame: 0, durationInFrames, zIndex: 10, editable: true });
  if (frame.eyebrow) tracks.push({ id: "text-eyebrow", name: "V3 · Eyebrow", kind: "text", role: "eyebrow", startFrame: Math.min(durationInFrames - 1, Math.round(.28 * fps)), durationInFrames: Math.min(Math.round(1.45 * fps), durationInFrames), zIndex: 20, editable: true, text: frame.eyebrow });
  tracks.push({ id: "text-headline", name: "V4 · Headline", kind: "text", role: "headline", startFrame: Math.min(durationInFrames - 1, Math.round(.48 * fps)), durationInFrames: Math.min(Math.round(2.25 * fps), durationInFrames), zIndex: 30, editable: true, text: frame.title });
  if (frame.body && durationInFrames > 90) {
    const bodyDuration = Math.min(Math.round(1.9 * fps), durationInFrames);
    tracks.push({ id: "text-body", name: "V5 · Contexto final", kind: "text", role: "body", startFrame: Math.max(0, durationInFrames - bodyDuration - Math.round(.5 * fps)), durationInFrames: bodyDuration, zIndex: 40, editable: true, text: frame.body });
  }
  tracks.push({ id: "graphic-logo", name: "V6 · Academy logo · Figma", kind: "graphic", role: "logo", startFrame: 0, durationInFrames, zIndex: 50, editable: true });
  if (plan.musicAssetId) tracks.push({ id: "audio-music", name: `A1 · Música · ${driveAssets.find((asset) => asset.id === plan.musicAssetId)?.name ?? plan.musicAssetId}`, kind: "audio", role: "music", startFrame: 0, durationInFrames, sourceStartFrame: 0, zIndex: -10, editable: true, assetId: plan.musicAssetId, volume: .6 });
  const beatLabel = plan.beatSource === "music" ? "beats da música" : plan.beatSource === "reference" ? "beats da referência" : "grade rítmica gerada";
  const executionSummary = `${plan.shots.length} shots · ${new Set(plan.shots.map((shot) => shot.assetId)).size} vídeos · ${(durationInFrames / fps).toFixed(2)}s · ${plan.musicAssetId ? "música dedicada" : "áudio dos takes"} · ${beatLabel} · focal tracking por shot`;
  return { schemaVersion: 2, engine: "remotion", interchange: "opentimelineio", fps, width: 1080, height: 1920, durationInFrames, tracks, beatFrames: plan.beatSeconds.map((beat) => Math.round(beat * fps)).filter((beat) => beat < durationInFrames), sourceAudio: plan.sourceAudio, executionSummary };
}

function reelTimelineQuality(payload: StudioPayload, timeline: StudioVideoTimeline | undefined, plan: ReelEditingPlan | undefined, assets: DriveAsset[]): StudioBrandReport | undefined {
  if (payload.contentType !== "reel" || !timeline || !plan) return undefined;
  const footage = timeline.tracks.filter((track) => track.role === "footage");
  const videos = assets.filter((asset) => asset.mimeType.startsWith("video/"));
  const usedAssets = new Set(footage.flatMap((track) => track.assetId ? [track.assetId] : []));
  const boundsOk = footage.every((track) => {
    if (!track.assetId) return false;
    const asset = assets.find((candidate) => candidate.id === track.assetId);
    const sourceDurationFrames = Math.round((Number(asset?.durationMillis ?? 0) / 1000) * timeline.fps);
    return Boolean(sourceDurationFrames) && (track.sourceStartFrame ?? 0) >= 0 && (track.sourceEndFrame ?? 0) <= sourceDurationFrames + 1;
  });
  const durations = footage.map((track) => track.durationInFrames);
  const variation = new Set(durations.map((value) => Math.round(value / 5) * 5)).size;
  const textFrames = timeline.tracks.filter((track) => track.kind === "text").reduce((sum, track) => sum + track.durationInFrames, 0);
  const focalTracking = footage.every((track) => track.crop && Number.isFinite(track.crop.focalX) && Number.isFinite(track.crop.focalY) && Number.isFinite(track.crop.endFocalX ?? track.crop.focalX) && Number.isFinite(track.crop.endFocalY ?? track.crop.focalY));
  const beatFrames = timeline.beatFrames ?? [];
  const cutFrames = footage.slice(1).map((track) => track.startFrame);
  const beatTolerance = Math.max(2, Math.round(.12 * timeline.fps));
  const alignedCuts = cutFrames.filter((cut) => beatFrames.some((beat) => Math.abs(beat - cut) <= beatTolerance)).length;
  const beatAlignmentRatio = cutFrames.length ? alignedCuts / cutFrames.length : 1;
  const dedicatedMusicIsReal = !plan.musicAssetId || (plan.beatSource === "music" && plan.musicAnalysis?.assetId === plan.musicAssetId && plan.musicAnalysis.beatSeconds.length >= 3);

  const checks: StudioBrandReport["checks"] = [
    { id: "shot-count", label: "Montagem real com 6–12 shots", passed: footage.length >= 6 && footage.length <= 12, severity: "error", detail: `${footage.length} shots executáveis na timeline.` },
    { id: "asset-diversity", label: "Variedade de footage", passed: usedAssets.size >= Math.min(3, videos.length), severity: "warning", detail: `${usedAssets.size}/${videos.length} vídeos selecionados usados.` },
    { id: "source-bounds", label: "In/out respeitam a duração real", passed: boundsOk, severity: "error", detail: "Cada sourceOut é validado contra durationMillis retornado pelo Google Drive." },
    { id: "audio", label: "Reel possui áudio", passed: Boolean(plan.musicAssetId) || plan.sourceAudio, severity: "error", detail: plan.musicAssetId ? "Track de música dedicada." : "Áudio dos próprios takes permanece ativo na ausência de música." },
    { id: "music-beats", label: "Música dedicada foi analisada de verdade", passed: dedicatedMusicIsReal, severity: "error", detail: plan.musicAssetId ? `${plan.musicAnalysis?.beatSeconds.length ?? 0} beats detectados na faixa selecionada; fonte=${plan.beatSource}.` : "Sem música dedicada; a grade usa referência ou fallback rítmico." },
    { id: "beat-alignment", label: "Cortes caem na grade rítmica", passed: beatFrames.length >= 3 && beatAlignmentRatio >= .6, severity: "warning", detail: `${alignedCuts}/${cutFrames.length} cortes internos estão a até ${(beatTolerance / timeline.fps).toFixed(2)}s de um beat/acento.` },
    { id: "focal-tracking", label: "Focal tracking por shot", passed: focalTracking, severity: "error", detail: "Cada shot carrega ponto focal inicial/final para reframe 9:16 durante o movimento." },
    { id: "rhythm", label: "Ritmo variável", passed: variation >= 3, severity: "warning", detail: `${variation} durações distintas de shot após quantização.` },
    { id: "short-typography", label: "Texto não permanece no vídeo inteiro", passed: textFrames / Math.max(1, timeline.durationInFrames) <= 1.1, severity: "warning", detail: "Eyebrow/headline abrem o Reel e o body, quando existe, aparece apenas como contexto curto no final." },
    { id: "semantic-execution", label: "StyleSummary não substitui a timeline", passed: plan.shots.length === footage.length && Boolean(timeline.executionSummary), severity: "error", detail: `Plano semântico validado contra execução: ${timeline.executionSummary}.` },
    { id: "reference-temporal", label: "Referência de Reel foi lida temporalmente", passed: !plan.reference || plan.reference.shots.length > 0, severity: "error", detail: plan.reference ? `${plan.reference.shots.length} shots analisados na referência.` : "Nenhuma referência de Reel específica foi exigida nesta geração." }
  ];
  const failures = checks.filter((check) => !check.passed);
  const score = Math.max(0, 100 - failures.reduce((sum, check) => sum + (check.severity === "error" ? 20 : 8), 0));
  return { score, passed: failures.every((check) => check.severity !== "error") && score >= 80, checks, source: "timeline-quality", issues: failures.map((check) => check.detail) };
}

export function compileStudioArtifact(payload: StudioPayload, options: {
  driveAssets?: DriveAsset[];
  previousPayload?: StudioPayload;
  baseFigmaFrameIds?: string[];
  visualBrandReview?: StudioBrandReport;
  reelPlan?: ReelEditingPlan;
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
  const driveAssets = options.driveAssets ?? [];
  const plan = payload.contentType === "reel" ? options.reelPlan ?? fallbackPlan(driveAssets) : undefined;
  const timeline = buildVideoTimeline(payload, driveAssets, plan);
  const artifact: StudioArtifact = {
    schemaVersion: 2,
    editability: "structured",
    renderer: "figma-template-clone",
    sceneGraph: { schemaVersion: 2, sourceOfTruth: "structured-design", designSystemPage: "Social Media", frames },
    brandAudit: structuralBrandAudit(payload, frames),
    visualBrandReview: options.visualBrandReview,
    reelPlan: plan,
    videoTimeline: timeline,
    reelQuality: reelTimelineQuality(payload, timeline, plan, driveAssets)
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
        frames: artifact.sceneGraph.frames.map((frame, index) => ({ ...frame, figmaOutputFrameId: frameIds[index] ?? frame.figmaOutputFrameId, figmaTemplateNodeId: templateNodeIds[index] ?? frame.figmaTemplateNodeId }))
      }
    }
  } satisfies StructuredStudioPayload;
}

export function attachFigmaVideoLayout(payload: StructuredStudioPayload, semanticFrames: Array<Omit<StudioFigmaVideoLayout, "synced">>) {
  const artifact = payload.artifact;
  if (!artifact || payload.contentType !== "reel" || !semanticFrames[0]) return payload;
  return { ...payload, artifact: { ...artifact, figmaVideoLayout: { ...semanticFrames[0], synced: true } } } satisfies StructuredStudioPayload;
}

export function attachRenderQa(payload: StructuredStudioPayload, renderQa: StudioBrandReport) {
  if (!payload.artifact) return payload;
  return { ...payload, artifact: { ...payload.artifact, renderQa } } satisfies StructuredStudioPayload;
}

export function toOtioJson(payload: StructuredStudioPayload, projectName: string) {
  const timeline = payload.artifact?.videoTimeline;
  if (!timeline) throw new Error("Esta versão não possui timeline de vídeo.");
  const children = timeline.tracks.map((track) => ({
    OTIO_SCHEMA: "Track.1",
    name: track.name,
    kind: track.kind === "audio" ? "Audio" : "Video",
    metadata: { academy: { id: track.id, role: track.role, editable: true, zIndex: track.zIndex, text: track.text ?? null, assetId: track.assetId ?? null, figmaNodeId: track.figmaNodeId ?? null, crop: track.crop ?? null, transition: track.transition ?? null } },
    children: [{
      OTIO_SCHEMA: "Clip.2",
      name: track.name,
      metadata: { academy: { role: track.role, editable: true, text: track.text ?? null, assetId: track.assetId ?? null, crop: track.crop ?? null } },
      source_range: {
        OTIO_SCHEMA: "TimeRange.1",
        start_time: { OTIO_SCHEMA: "RationalTime.1", value: track.sourceStartFrame ?? 0, rate: timeline.fps },
        duration: { OTIO_SCHEMA: "RationalTime.1", value: track.durationInFrames, rate: timeline.fps }
      },
      media_reference: track.assetId
        ? { OTIO_SCHEMA: "ExternalReference.1", target_url: `academy-drive://${track.assetId}`, metadata: { academy: { assetId: track.assetId } } }
        : { OTIO_SCHEMA: "MissingReference.1", metadata: { academy: { generatedLayer: true, role: track.role, text: track.text ?? null } } }
    }]
  }));
  return {
    OTIO_SCHEMA: "Timeline.1",
    name: projectName,
    metadata: { academy: { sceneGraphVersion: payload.artifact?.sceneGraph.schemaVersion ?? null, timelineVersion: timeline.schemaVersion, engine: "remotion", editable: true, executionSummary: timeline.executionSummary ?? null } },
    tracks: { OTIO_SCHEMA: "Stack.1", name: "tracks", children }
  };
}
