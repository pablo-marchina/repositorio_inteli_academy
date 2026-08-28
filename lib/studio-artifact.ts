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
  const checks: StudioBrandReport["checks"] = [
    { id: "figma-source", label: "Identidade nasce do Figma real", passed: frames.every((frame) => frame.sourcePageName === "Social Media"), severity: "error", detail: "Cada frame aponta para a biblioteca Social Media e deve ser clonado/associado pelo plugin antes da aprovação visual." },
    { id: "structured-editability", label: "Elementos permanecem editáveis", passed: frames.every((frame) => frame.nodes.every((node) => node.editable)), severity: "error", detail: "Texto, mídia, vetores e grupos são objetos estruturados; a peça inteira não vira uma imagem opaca." },
    { id: "mobile-density", label: "Densidade adequada para mobile", passed: payload.frames.every((frame) => frame.title.length <= 100 && (frame.body?.length ?? 0) <= 360 && (frame.bullets?.length ?? 0) <= 4), severity: "warning", detail: "Limites de título, corpo e bullets preservam leitura em tela pequena." },
    { id: "brand-locked-elements", label: "Elementos de marca protegidos", passed: frames.every((frame) => frame.nodes.some((node) => node.role === "logo" && node.lockedByBrand)), severity: "error", detail: "Logo, fundo e decoração são papéis protegidos e não podem ser redesenhados livremente pela IA." }
  ];
  if (payload.contentType === "reel") {
    checks.push({ id: "render-qa-required", label: "Reel só pode ser aprovado após QA do render", passed: false, severity: "warning", detail: "O score estrutural não substitui inspeção dos frames realmente renderizados. O QA do MP4 precisa rodar depois do Figma." });
  }
  const failures = checks.filter((check) => !check.passed);
  const score = Math.max(0, 100 - failures.reduce((sum, check) => sum + (check.severity === "error" ? 25 : check.severity === "warning" ? 10 : 2), 0));
  return { score, passed: failures.every((check) => check.severity !== "error") && score >= 80 && payload.contentType !== "reel", checks, source: "structural" };
}

function fallbackPlan(assets: DriveAsset[]) {
  const visuals = assets.filter((asset) => asset.mimeType.startsWith("video/") || asset.mimeType.startsWith("image/"));
  const footage: FootageAnalysis[] = visuals.map((asset) => {
    const isImage = asset.mimeType.startsWith("image/");
    const duration = isImage ? 180 : Math.max(1, Number(asset.durationMillis ?? 1000) / 1000);
    return {
      assetId: asset.id,
      durationSeconds: duration,
      width: asset.width ?? null,
      height: asset.height ?? null,
      analysisMode: "metadata-fallback",
      cameraMovement: isImage ? "still image" : "fallback",
      bestSegments: [{
        startSeconds: 0,
        endSeconds: isImage ? duration : Math.min(duration, 2),
        score: 20,
        focalX: .5,
        focalY: .5,
        endFocalX: isImage ? .515 : .5,
        endFocalY: isImage ? .49 : .5,
        motion: isImage ? "low" : "medium",
        energy: "low",
        shotType: "other",
        framing: "other",
        sceneType: "other",
        subject: "mídia não analisada visualmente",
        reason: "fallback por metadados"
      }]
    };
  });
  return buildReelEditingPlan({ assets, footage, reference: null, music: null });
}

function cueWindow(plan: ReelEditingPlan, index: number, fps: number, durationInFrames: number) {
  const cue = plan.reference?.textCues[index];
  if (!cue) return null;
  const startFrame = Math.max(0, Math.min(durationInFrames - 1, Math.round(cue.startSeconds * fps)));
  const endFrame = Math.max(startFrame + 1, Math.min(durationInFrames, Math.round(cue.endSeconds * fps)));
  return { startFrame, durationInFrames: endFrame - startFrame };
}

function buildVideoTimeline(payload: StudioPayload, driveAssets: DriveAsset[], suppliedPlan?: ReelEditingPlan): StudioVideoTimeline | undefined {
  if (payload.contentType !== "reel") return undefined;
  const frame = payload.frames[0];
  const fps = 30;
  const plan = suppliedPlan ?? fallbackPlan(driveAssets);
  const byId = new Map(driveAssets.map((asset) => [asset.id, asset]));
  const tracks: StudioVideoTrack[] = plan.shots.map((shot, index) => {
    const asset = byId.get(shot.assetId);
    const image = asset?.mimeType.startsWith("image/") ?? false;
    return {
      id: `visual-footage-${index + 1}`,
      name: `V1.${index + 1} · ${image ? "Foto" : "Footage"} · ${asset?.name ?? shot.assetId}`,
      kind: image ? "image" : "video",
      role: "footage",
      startFrame: Math.round(shot.timelineStartSeconds * fps),
      durationInFrames: Math.max(1, Math.round(shot.durationSeconds * fps)),
      ...(image ? {} : {
        sourceStartFrame: Math.max(0, Math.round(shot.sourceInSeconds * fps)),
        sourceEndFrame: Math.max(1, Math.round(shot.sourceOutSeconds * fps))
      }),
      crop: shot.crop,
      transition: shot.transition,
      zIndex: 0,
      editable: true,
      assetId: shot.assetId,
      muted: image ? true : Boolean(plan.musicAssetId),
      volume: image || plan.musicAssetId ? 0 : .72
    } satisfies StudioVideoTrack;
  });

  const durationInFrames = Math.max(
    1,
    tracks.reduce((max, track) => Math.max(max, track.startFrame + track.durationInFrames), Math.round(plan.targetDurationSeconds * fps))
  );

  tracks.push({ id: "graphic-brand", name: "V2 · Brand graphics · Figma", kind: "graphic", role: "decoration", startFrame: 0, durationInFrames, zIndex: 10, editable: true });

  if (plan.reference) {
    const headlineWindow = cueWindow(plan, 0, fps, durationInFrames);
    const bodyWindow = cueWindow(plan, 1, fps, durationInFrames);
    const eyebrowWindow = cueWindow(plan, 2, fps, durationInFrames);
    if (headlineWindow) tracks.push({ id: "text-headline", name: "V4 · Headline", kind: "text", role: "headline", ...headlineWindow, zIndex: 30, editable: true, text: frame.title });
    if (bodyWindow && frame.body) tracks.push({ id: "text-body", name: "V5 · Body", kind: "text", role: "body", ...bodyWindow, zIndex: 40, editable: true, text: frame.body });
    if (eyebrowWindow && frame.eyebrow) tracks.push({ id: "text-eyebrow", name: "V3 · Eyebrow", kind: "text", role: "eyebrow", ...eyebrowWindow, zIndex: 20, editable: true, text: frame.eyebrow });
  } else {
    if (frame.eyebrow) tracks.push({ id: "text-eyebrow", name: "V3 · Eyebrow", kind: "text", role: "eyebrow", startFrame: Math.min(durationInFrames - 1, Math.round(.28 * fps)), durationInFrames: Math.min(Math.round(1.45 * fps), durationInFrames), zIndex: 20, editable: true, text: frame.eyebrow });
    tracks.push({ id: "text-headline", name: "V4 · Headline", kind: "text", role: "headline", startFrame: Math.min(durationInFrames - 1, Math.round(.48 * fps)), durationInFrames: Math.min(Math.round(2.25 * fps), durationInFrames), zIndex: 30, editable: true, text: frame.title });
    if (frame.body && durationInFrames > 90) {
      const bodyDuration = Math.min(Math.round(1.9 * fps), durationInFrames);
      tracks.push({ id: "text-body", name: "V5 · Contexto final", kind: "text", role: "body", startFrame: Math.max(0, durationInFrames - bodyDuration - Math.round(.5 * fps)), durationInFrames: bodyDuration, zIndex: 40, editable: true, text: frame.body });
    }
  }

  tracks.push({ id: "graphic-logo", name: "V6 · Academy logo · Figma", kind: "graphic", role: "logo", startFrame: 0, durationInFrames, zIndex: 50, editable: true });
  if (plan.musicAssetId) {
    tracks.push({ id: "audio-music", name: `A1 · Música · ${byId.get(plan.musicAssetId)?.name ?? plan.musicAssetId}`, kind: "audio", role: "music", startFrame: 0, durationInFrames, sourceStartFrame: 0, zIndex: -10, editable: true, assetId: plan.musicAssetId, volume: .6 });
  }

  const used = [...new Set(plan.shots.map((shot) => shot.assetId))].map((id) => byId.get(id)).filter(Boolean) as DriveAsset[];
  const videoCount = used.filter((asset) => asset.mimeType.startsWith("video/")).length;
  const imageCount = used.filter((asset) => asset.mimeType.startsWith("image/")).length;
  const audioLabel = plan.musicAssetId ? "música dedicada analisada" : "áudio natural dos takes; sem alegação de beat-match com a referência";
  const structureLabel = plan.reference
    ? `${plan.reference.shots.length} shots ${plan.reference.semanticAvailable === false ? "temporais" : "semânticos"} herdados da referência`
    : `${plan.shots.length} shots estimados dinamicamente`;
  const coverage = `${Math.round((plan.analysisSummary?.coverage ?? 0) * 100)}% da mídia analisada visualmente`;
  const localCount = plan.footage.filter((analysis) => analysis.analysisMode === "local-video").length;
  const analysisLabel = localCount ? `${localCount} mídia(s) com análise local FFmpeg; semântica remota indisponível nesses casos` : "semântica visual remota disponível para a mídia usada";
  const executionSummary = `${structureLabel} · ${videoCount} vídeo(s) · ${imageCount} foto(s) · ${(durationInFrames / fps).toFixed(2)}s · ${audioLabel} · ${coverage} · ${analysisLabel}`;
  return {
    schemaVersion: 2,
    engine: "remotion",
    interchange: "opentimelineio",
    fps,
    width: 1080,
    height: 1920,
    durationInFrames,
    tracks,
    beatFrames: plan.beatSource === "music" ? plan.beatSeconds.map((beat) => Math.round(beat * fps)).filter((beat) => beat < durationInFrames) : [],
    sourceAudio: plan.sourceAudio,
    executionSummary
  };
}

function semanticMatchRatio(plan: ReelEditingPlan): number | null {
  if (!plan.reference?.shots.length) return 1;
  if (plan.reference.semanticAvailable === false) return null;
  const byAsset = new Map(plan.footage.map((analysis) => [analysis.assetId, analysis]));
  if (plan.shots.some((shot) => byAsset.get(shot.assetId)?.analysisMode === "local-video")) return null;
  const scores = plan.shots.map((shot, index) => {
    const reference = plan.reference?.shots[index];
    if (!reference || !shot.semantic) return 0;
    let score = 0;
    if (shot.semantic.shotType === reference.shotType) score += .5;
    if (shot.semantic.framing === reference.framing) score += .2;
    if (shot.semantic.motion === reference.motion) score += .15;
    if (shot.semantic.energy === reference.energy) score += .1;
    if (shot.semantic.sceneType === reference.sceneType) score += .05;
    return score;
  });
  return scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 0;
}

function reelTimelineQuality(payload: StudioPayload, timeline: StudioVideoTimeline | undefined, plan: ReelEditingPlan | undefined, assets: DriveAsset[]): StudioBrandReport | undefined {
  if (payload.contentType !== "reel" || !timeline || !plan) return undefined;
  const footage = timeline.tracks.filter((track) => track.role === "footage");
  const visuals = assets.filter((asset) => asset.mimeType.startsWith("video/") || asset.mimeType.startsWith("image/"));
  const usedAssets = new Set(footage.flatMap((track) => track.assetId ? [track.assetId] : []));
  const usedAnalysis = plan.footage.filter((analysis) => usedAssets.has(analysis.assetId));
  const selectedFallbacks = usedAnalysis.filter((analysis) => analysis.analysisMode === "metadata-fallback").length;
  const selectedLocal = usedAnalysis.filter((analysis) => analysis.analysisMode === "local-video").length;
  const visuallyAnalyzedUsed = usedAnalysis.filter((analysis) => analysis.analysisMode !== "metadata-fallback").length;
  const analysisCoverage = plan.analysisSummary?.coverage ?? (plan.footage.length ? plan.footage.filter((analysis) => analysis.analysisMode !== "metadata-fallback").length / plan.footage.length : 0);

  const boundsOk = footage.every((track) => {
    if (!track.assetId) return false;
    const asset = assets.find((candidate) => candidate.id === track.assetId);
    if (!asset) return false;
    if (track.kind === "image" || asset.mimeType.startsWith("image/")) return track.durationInFrames > 0;
    const sourceDurationFrames = Math.round((Number(asset.durationMillis ?? 0) / 1000) * timeline.fps);
    return Boolean(sourceDurationFrames)
      && (track.sourceStartFrame ?? 0) >= 0
      && (track.sourceEndFrame ?? 0) <= sourceDurationFrames + 1;
  });

  const durations = footage.map((track) => track.durationInFrames);
  const variation = new Set(durations.map((value) => Math.round(value / 5) * 5)).size;
  const textFrames = timeline.tracks.filter((track) => track.kind === "text").reduce((sum, track) => sum + track.durationInFrames, 0);
  const expectedTextFrames = plan.reference?.textCues.reduce((sum, cue) => sum + Math.max(0, Math.round((cue.endSeconds - cue.startSeconds) * timeline.fps)), 0) ?? null;
  const focalTracking = footage.every((track) => track.crop
    && Number.isFinite(track.crop.focalX)
    && Number.isFinite(track.crop.focalY)
    && Number.isFinite(track.crop.endFocalX ?? track.crop.focalX)
    && Number.isFinite(track.crop.endFocalY ?? track.crop.focalY));

  const beatFrames = timeline.beatFrames ?? [];
  const cutFrames = footage.slice(1).map((track) => track.startFrame);
  const beatTolerance = Math.max(2, Math.round(.12 * timeline.fps));
  const alignedCuts = cutFrames.filter((cut) => beatFrames.some((beat) => Math.abs(beat - cut) <= beatTolerance)).length;
  const beatAlignmentRatio = cutFrames.length ? alignedCuts / cutFrames.length : 1;
  const dedicatedMusicIsReal = !plan.musicAssetId || (plan.beatSource === "music" && plan.musicAnalysis?.assetId === plan.musicAssetId && plan.musicAnalysis.beatSeconds.length >= 3);
  const expectedShots = plan.reference?.shots.length ?? plan.shots.length;
  const shotCountMatches = footage.length === expectedShots && footage.length > 0 && footage.length <= 40;
  const sourceAudioAvailable = Boolean(plan.musicAssetId) || plan.sourceAudio;
  const semanticRatio = semanticMatchRatio(plan);
  const semanticAvailable = semanticRatio !== null;
  const semanticReferenceOk = !plan.reference || semanticRatio === null || semanticRatio >= .55;
  const referenceTextOk = !plan.reference || plan.reference.semanticAvailable === false || expectedTextFrames === null || (expectedTextFrames === 0 ? textFrames === 0 : textFrames <= expectedTextFrames * 1.35 + timeline.fps * .25);
  const visualAnalysisOk = usedAnalysis.length > 0 && selectedFallbacks === 0 && visuallyAnalyzedUsed === usedAnalysis.length && analysisCoverage >= .67;

  const checks: StudioBrandReport["checks"] = [
    {
      id: "shot-count",
      label: plan.reference ? "Quantidade de shots segue a referência" : "Quantidade de shots foi estimada dinamicamente",
      passed: shotCountMatches,
      severity: "error",
      detail: plan.reference ? `${footage.length} shots executáveis; a referência analisada possui ${plan.reference.shots.length}.` : `${footage.length} shots executáveis, sem faixa editorial fixa de 6–12.`
    },
    {
      id: "visual-analysis-coverage",
      label: "Shots usados possuem análise visual",
      passed: visualAnalysisOk,
      severity: "error",
      detail: `${visuallyAnalyzedUsed}/${usedAnalysis.length} mídias usadas têm análise visual real/local; ${selectedLocal} via FFmpeg local; ${selectedFallbacks} fallback(s) apenas por metadados; cobertura global ${Math.round(analysisCoverage * 100)}%.`
    },
    {
      id: "semantic-reference",
      label: "Função visual dos shots segue a referência",
      passed: semanticAvailable ? semanticReferenceOk : false,
      severity: semanticAvailable ? "error" : "warning",
      detail: !plan.reference
        ? "Sem Reel específico como referência semântica."
        : semanticRatio === null
          ? "A semântica completa não pôde ser medida porque a referência ou parte da mídia foi analisada localmente por FFmpeg. A cadência temporal continua baseada nos pixels reais, sem alegar equivalência semântica."
          : `Similaridade semântica média ${(semanticRatio * 100).toFixed(0)}% considerando função do shot, enquadramento, movimento, energia e tipo de cena.`
    },
    {
      id: "asset-diversity",
      label: "Variedade de mídia",
      passed: usedAssets.size >= Math.min(3, visuals.length, footage.length),
      severity: "warning",
      detail: `${usedAssets.size}/${visuals.length} visuais selecionados usados; repetição semântica/visual é penalizada durante a seleção.`
    },
    { id: "source-bounds", label: "In/out respeitam a mídia fonte", passed: boundsOk, severity: "error", detail: "Vídeos são validados contra durationMillis do Drive; fotos são stills sem sourceOut temporal de vídeo." },
    { id: "audio", label: "Reel possui áudio", passed: sourceAudioAvailable, severity: "error", detail: plan.musicAssetId ? "Track de música dedicada." : "Áudio natural dos takes permanece ativo; ele não é tratado como se estivesse sincronizado aos beats da referência." },
    { id: "music-beats", label: "Música dedicada foi analisada de verdade", passed: dedicatedMusicIsReal, severity: "error", detail: plan.musicAssetId ? `${plan.musicAnalysis?.beatSeconds.length ?? 0} beats detectados na faixa selecionada; fonte=${plan.beatSource}.` : "Sem música dedicada; beat-alignment é desativado para não gerar falso positivo com o áudio dos takes." },
    { id: "beat-alignment", label: "Cortes acompanham a música quando existe música analisada", passed: plan.beatSource !== "music" || cutFrames.length <= 1 || beatFrames.length < 3 || beatAlignmentRatio >= .6, severity: "warning", detail: plan.beatSource === "music" ? `${alignedCuts}/${cutFrames.length} cortes internos estão a até ${(beatTolerance / timeline.fps).toFixed(2)}s de um beat da música.` : "Não há música dedicada analisada; este check não usa beats da referência para fingir sincronização do áudio final." },
    {
      id: "focal-tracking",
      label: selectedLocal ? "Crop seguro; tracking semântico parcial" : "Reframing deriva de análise visual",
      passed: selectedLocal ? false : focalTracking && selectedFallbacks === 0,
      severity: selectedLocal ? "warning" : "error",
      detail: selectedLocal
        ? `${selectedLocal} mídia(s) usada(s) vieram do fallback visual local; nesses shots o crop central é deliberadamente conservador e não é apresentado como tracking semântico.`
        : "Focais inicial/final são aceitos apenas quando a mídia usada passou por análise visual semântica real."
    },
    { id: "rhythm", label: "Ritmo respeita a referência", passed: plan.reference ? footage.length === plan.reference.shots.length : variation >= Math.min(2, footage.length), severity: "warning", detail: plan.reference ? `A duração relativa dos ${plan.reference.shots.length} shots vem do padrão real da referência.` : `${variation} durações distintas de shot na estimativa dinâmica.` },
    { id: "reference-typography", label: "Texto acompanha os cues reais quando detectáveis", passed: referenceTextOk, severity: "error", detail: plan.reference?.semanticAvailable === false ? "O fallback local não classifica texto; por segurança, nenhum textCue é inventado para a referência." : plan.reference ? `${plan.reference.textCues.length} cue(s) de texto detectado(s) na referência; ${textFrames} frames de texto executados.` : "Sem referência específica; usa janelas editoriais curtas padrão." },
    { id: "semantic-execution", label: "StyleSummary não substitui a timeline", passed: plan.shots.length === footage.length && Boolean(timeline.executionSummary), severity: "error", detail: `Plano validado contra execução: ${timeline.executionSummary}.` },
    {
      id: "reference-temporal",
      label: plan.reference?.semanticAvailable === false ? "Referência foi lida temporalmente nos pixels" : "Referência foi lida visual e temporalmente",
      passed: !plan.reference || (plan.reference.shots.length > 0 && (plan.reference.semanticVersion ?? 0) >= 2),
      severity: "error",
      detail: plan.reference ? `${plan.reference.shots.length} shots detectados; modo=${plan.reference.analysisMode}; semântica=${plan.reference.semanticAvailable === false ? "indisponível, sem falso positivo" : `v${plan.reference.semanticVersion ?? 0}`}.` : "Nenhuma referência de Reel específica foi exigida nesta geração."
    }
  ];

  const failures = checks.filter((check) => !check.passed);
  const score = Math.max(0, 100 - failures.reduce((sum, check) => sum + (check.severity === "error" ? 20 : 8), 0));
  return {
    score,
    passed: failures.every((check) => check.severity !== "error") && score >= 80,
    checks,
    source: "timeline-quality",
    issues: failures.map((check) => check.detail)
  };
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
        frames: artifact.sceneGraph.frames.map((frame, index) => ({
          ...frame,
          figmaOutputFrameId: frameIds[index] ?? frame.figmaOutputFrameId,
          figmaTemplateNodeId: templateNodeIds[index] ?? frame.figmaTemplateNodeId
        }))
      }
    }
  } satisfies StructuredStudioPayload;
}

export function attachFigmaVideoLayout(payload: StructuredStudioPayload, semanticFrames: Array<Omit<StudioFigmaVideoLayout, "synced">>) {
  const artifact = payload.artifact;
  if (!artifact || payload.contentType !== "reel" || !semanticFrames[0]) return payload;
  return {
    ...payload,
    artifact: { ...artifact, figmaVideoLayout: { ...semanticFrames[0], synced: true } }
  } satisfies StructuredStudioPayload;
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
    metadata: { academy: { id: track.id, role: track.role, editable: true, zIndex: track.zIndex, text: track.text ?? null, assetId: track.assetId ?? null, figmaNodeId: track.figmaNodeId ?? null, crop: track.crop ?? null, transition: track.transition ?? null, mediaKind: track.kind } },
    children: [{
      OTIO_SCHEMA: "Clip.2",
      name: track.name,
      metadata: { academy: { role: track.role, editable: true, text: track.text ?? null, assetId: track.assetId ?? null, crop: track.crop ?? null, mediaKind: track.kind } },
      source_range: {
        OTIO_SCHEMA: "TimeRange.1",
        start_time: { OTIO_SCHEMA: "RationalTime.1", value: track.sourceStartFrame ?? 0, rate: timeline.fps },
        duration: { OTIO_SCHEMA: "RationalTime.1", value: track.durationInFrames, rate: timeline.fps }
      },
      media_reference: track.assetId
        ? { OTIO_SCHEMA: "ExternalReference.1", target_url: `academy-drive://${track.assetId}`, metadata: { academy: { assetId: track.assetId, mediaKind: track.kind } } }
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
