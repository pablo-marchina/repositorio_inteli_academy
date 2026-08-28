import { z } from "zod";
import { env } from "@/lib/env";
import { downloadDriveAsset } from "@/lib/google-drive";
import type { DriveAsset, InstagramReferencePost } from "@/lib/types";

const MAX_INLINE_VIDEO_BYTES = 18_000_000;

export type ReelReferenceTemporalAnalysis = {
  analysisMode: "video" | "cached" | "unavailable";
  durationSeconds: number;
  averageShotSeconds: number;
  rhythm: "slow" | "medium" | "fast" | "mixed";
  shots: Array<{
    startSeconds: number;
    endSeconds: number;
    motion: "low" | "medium" | "high";
    energy: "low" | "medium" | "high";
    transition: string;
    focalX: number;
    focalY: number;
  }>;
  beatSeconds: number[];
  textCues: Array<{ startSeconds: number; endSeconds: number; density: "light" | "medium" | "heavy"; placement: string }>;
};

export type FootageAnalysis = {
  assetId: string;
  durationSeconds: number;
  width: number | null;
  height: number | null;
  analysisMode: "video" | "metadata-fallback";
  cameraMovement: string;
  bestSegments: Array<{
    startSeconds: number;
    endSeconds: number;
    score: number;
    focalX: number;
    focalY: number;
    motion: "low" | "medium" | "high";
    reason: string;
  }>;
};

export type ReelEditingShot = {
  id: string;
  assetId: string;
  timelineStartSeconds: number;
  sourceInSeconds: number;
  sourceOutSeconds: number;
  durationSeconds: number;
  crop: { focalX: number; focalY: number; zoom: number };
  transition: "cut" | "dissolve";
  reason: string;
};

export type ReelEditingPlan = {
  targetDurationSeconds: number;
  reference: ReelReferenceTemporalAnalysis | null;
  footage: FootageAnalysis[];
  shots: ReelEditingShot[];
  musicAssetId?: string;
  sourceAudio: boolean;
  beatSeconds: number[];
};

const temporalSchema = z.object({
  durationSeconds: z.number().min(1).max(180),
  averageShotSeconds: z.number().min(0.2).max(20),
  rhythm: z.enum(["slow", "medium", "fast", "mixed"]),
  shots: z.array(z.object({
    startSeconds: z.number().min(0),
    endSeconds: z.number().min(0),
    motion: z.enum(["low", "medium", "high"]),
    energy: z.enum(["low", "medium", "high"]),
    transition: z.string().max(80),
    focalX: z.number().min(0).max(1).default(0.5),
    focalY: z.number().min(0).max(1).default(0.5)
  })).min(1).max(40),
  beatSeconds: z.array(z.number().min(0).max(180)).max(120).default([]),
  textCues: z.array(z.object({ startSeconds: z.number().min(0), endSeconds: z.number().min(0), density: z.enum(["light", "medium", "heavy"]), placement: z.string().max(120) })).max(24).default([])
});

const footageSchema = z.object({
  cameraMovement: z.string().max(160),
  bestSegments: z.array(z.object({
    startSeconds: z.number().min(0),
    endSeconds: z.number().min(0),
    score: z.number().min(0).max(100),
    focalX: z.number().min(0).max(1),
    focalY: z.number().min(0).max(1),
    motion: z.enum(["low", "medium", "high"]),
    reason: z.string().max(220)
  })).min(1).max(8)
});

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function mediaDuration(asset: DriveAsset) {
  return Math.max(0, Number(asset.durationMillis ?? 0) / 1000);
}

async function geminiVideoJson<T>(bytes: Uint8Array, mimeType: string, prompt: string, schema: z.ZodType<T>): Promise<T | null> {
  const config = env();
  if (!config.GEMINI_API_KEY || bytes.byteLength > MAX_INLINE_VIDEO_BYTES) return null;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.GEMINI_POST_MODEL)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": config.GEMINI_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType, data: Buffer.from(bytes).toString("base64") } }] }],
      generationConfig: { responseMimeType: "application/json" }
    }),
    cache: "no-store"
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const raw = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!raw) return null;
  try { return schema.parse(JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim())); } catch { return null; }
}

function normalizeReference(value: z.infer<typeof temporalSchema>): ReelReferenceTemporalAnalysis {
  const duration = value.durationSeconds;
  const shots = value.shots
    .map((shot) => ({ ...shot, startSeconds: clamp(shot.startSeconds, 0, duration), endSeconds: clamp(shot.endSeconds, 0, duration) }))
    .filter((shot) => shot.endSeconds - shot.startSeconds >= 0.2)
    .sort((a, b) => a.startSeconds - b.startSeconds);
  return {
    analysisMode: "video",
    durationSeconds: duration,
    averageShotSeconds: shots.length ? shots.reduce((sum, shot) => sum + shot.endSeconds - shot.startSeconds, 0) / shots.length : value.averageShotSeconds,
    rhythm: value.rhythm,
    shots,
    beatSeconds: [...new Set(value.beatSeconds.filter((second) => second >= 0 && second <= duration))].sort((a, b) => a - b),
    textCues: value.textCues.filter((cue) => cue.endSeconds > cue.startSeconds && cue.startSeconds <= duration)
  };
}

export async function analyzeInstagramReelReference(reference: InstagramReferencePost): Promise<ReelReferenceTemporalAnalysis | null> {
  const cachedTemporal = reference.visualAnalysis?.temporal;
  if (cachedTemporal && typeof cachedTemporal === "object") {
    const parsed = temporalSchema.safeParse(cachedTemporal);
    if (parsed.success) return { ...normalizeReference(parsed.data), analysisMode: "cached" };
  }
  const isVideo = reference.mediaType === "VIDEO" || reference.mediaProductType === "REELS" || reference.mediaProductType === "REEL";
  if (!isVideo || !reference.mediaUrl) return null;
  const response = await fetch(reference.mediaUrl, { cache: "no-store" });
  if (!response.ok) return null;
  const size = Number(response.headers.get("content-length") ?? 0);
  if (size > MAX_INLINE_VIDEO_BYTES) return null;
  const mimeType = response.headers.get("content-type")?.split(";")[0] || "video/mp4";
  if (!mimeType.startsWith("video/")) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  const analysis = await geminiVideoJson(bytes, mimeType,
    "Analise temporalmente este Reel REAL da Inteli Academy como referência de edição, sem identificar pessoas. Retorne JSON com duração, cortes/shot boundaries, ritmo, movimento, energia, tipo de transição, ponto focal normalizado x/y de cada shot, batidas ou acentos audíveis aproximados e janelas de texto. Seja específico em segundos; o objetivo é reproduzir a linguagem de montagem, não copiar conteúdo.",
    temporalSchema);
  return analysis ? normalizeReference(analysis) : null;
}

function fallbackSegments(asset: DriveAsset): FootageAnalysis {
  const duration = Math.max(1, mediaDuration(asset));
  const segmentLength = clamp(duration / 5, 0.8, 2.2);
  const starts = duration <= segmentLength + 0.1 ? [0] : [0.08, 0.38, 0.68].map((ratio) => clamp(duration * ratio, 0, Math.max(0, duration - segmentLength)));
  return {
    assetId: asset.id,
    durationSeconds: duration,
    width: asset.width ?? null,
    height: asset.height ?? null,
    analysisMode: "metadata-fallback",
    cameraMovement: "não analisado visualmente",
    bestSegments: starts.map((start, index) => ({ startSeconds: start, endSeconds: Math.min(duration, start + segmentLength), score: 70 - index * 3, focalX: 0.5, focalY: 0.5, motion: "medium" as const, reason: "fallback limitado pela duração real do arquivo" }))
  };
}

async function analyzeOneFootage(asset: DriveAsset): Promise<FootageAnalysis> {
  const duration = mediaDuration(asset);
  if (!duration) return fallbackSegments(asset);
  const declaredSize = Number(asset.size ?? 0);
  if (declaredSize > MAX_INLINE_VIDEO_BYTES) return fallbackSegments(asset);
  try {
    const { bytes } = await downloadDriveAsset(asset.id);
    const analysis = await geminiVideoJson(bytes, asset.mimeType,
      `Analise este vídeo bruto para edição de um Reel vertical 9:16. A duração real fornecida pelo Drive é ${duration.toFixed(3)}s. Não identifique pessoas. Escolha de 2 a 6 melhores segmentos com ação/movimento/composição forte, score 0-100, ponto focal x/y normalizado para smart crop, nível de movimento e motivo. Nenhum endSeconds pode ultrapassar ${duration.toFixed(3)}. Retorne apenas JSON.`,
      footageSchema);
    if (!analysis) return fallbackSegments(asset);
    const bestSegments = analysis.bestSegments
      .map((segment) => ({ ...segment, startSeconds: clamp(segment.startSeconds, 0, duration), endSeconds: clamp(segment.endSeconds, 0, duration) }))
      .filter((segment) => segment.endSeconds - segment.startSeconds >= 0.35)
      .sort((a, b) => b.score - a.score);
    if (!bestSegments.length) return fallbackSegments(asset);
    return { assetId: asset.id, durationSeconds: duration, width: asset.width ?? null, height: asset.height ?? null, analysisMode: "video", cameraMovement: analysis.cameraMovement, bestSegments };
  } catch {
    return fallbackSegments(asset);
  }
}

export async function analyzeDriveFootage(assets: DriveAsset[]) {
  const videos = assets.filter((asset) => asset.mimeType.startsWith("video/"));
  const results: FootageAnalysis[] = new Array(videos.length);
  let cursor = 0;
  async function worker() {
    while (cursor < videos.length) {
      const index = cursor++;
      results[index] = await analyzeOneFootage(videos[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, videos.length) }, () => worker()));
  return results;
}

function referenceDurationPattern(reference: ReelReferenceTemporalAnalysis | null) {
  if (!reference?.shots.length) return [];
  return reference.shots.map((shot) => clamp(shot.endSeconds - shot.startSeconds, 0.55, 3.2));
}

export function buildReelEditingPlan(input: {
  assets: DriveAsset[];
  footage: FootageAnalysis[];
  reference: ReelReferenceTemporalAnalysis | null;
}): ReelEditingPlan {
  const videos = input.assets.filter((asset) => asset.mimeType.startsWith("video/"));
  if (!videos.length) throw new Error("Reel requer pelo menos um vídeo.");
  const audio = input.assets.find((asset) => asset.mimeType.startsWith("audio/"));
  const target = clamp(input.reference?.durationSeconds ?? Math.max(12, Math.min(22, videos.length * 1.6)), 8, 30);
  const pattern = referenceDurationPattern(input.reference);
  const desiredCount = clamp(pattern.length || Math.round(target / 1.25), 6, 12);
  const rawDurations = Array.from({ length: desiredCount }, (_, index) => pattern[index % Math.max(1, pattern.length)] ?? [0.85, 1.15, 0.72, 1.35, 1.0, 1.55][index % 6]);
  const scale = target / rawDurations.reduce((sum, value) => sum + value, 0);
  const durations = rawDurations.map((value) => clamp(value * scale, 0.6, 3.2));
  const analyses = input.footage.length ? input.footage : videos.map(fallbackSegments);
  const shots: ReelEditingShot[] = [];
  let timelineStart = 0;
  for (let index = 0; index < desiredCount; index += 1) {
    const analysis = analyses[index % analyses.length];
    const segment = analysis.bestSegments[Math.floor(index / analyses.length) % analysis.bestSegments.length] ?? analysis.bestSegments[0];
    const duration = Math.min(durations[index], Math.max(0.6, analysis.durationSeconds));
    const maxStart = Math.max(0, analysis.durationSeconds - duration);
    const sourceIn = clamp(segment.startSeconds, 0, maxStart);
    const sourceOut = Math.min(analysis.durationSeconds, sourceIn + duration);
    const actualDuration = sourceOut - sourceIn;
    shots.push({
      id: `shot-${index + 1}`,
      assetId: analysis.assetId,
      timelineStartSeconds: timelineStart,
      sourceInSeconds: sourceIn,
      sourceOutSeconds: sourceOut,
      durationSeconds: actualDuration,
      crop: { focalX: clamp(segment.focalX, 0.08, 0.92), focalY: clamp(segment.focalY, 0.08, 0.92), zoom: analysis.width && analysis.height && analysis.width > analysis.height ? 1.08 : 1 },
      transition: index === 0 ? "cut" : segment.motion === "low" && index % 4 === 0 ? "dissolve" : "cut",
      reason: segment.reason
    });
    timelineStart += actualDuration;
  }
  const beatSeconds = input.reference?.beatSeconds?.filter((beat) => beat <= timelineStart) ?? [];
  return {
    targetDurationSeconds: timelineStart,
    reference: input.reference,
    footage: analyses,
    shots,
    musicAssetId: audio?.id,
    sourceAudio: !audio,
    beatSeconds: beatSeconds.length ? beatSeconds : Array.from({ length: Math.floor(timelineStart / 0.75) }, (_, index) => Number(((index + 1) * 0.75).toFixed(2)))
  };
}

export async function analyzeAndPlanReel(assets: DriveAsset[], references: InstagramReferencePost[]) {
  const selectedReel = references.find((reference) => reference.mediaType === "VIDEO" || reference.mediaProductType === "REELS" || reference.mediaProductType === "REEL");
  const [reference, footage] = await Promise.all([
    selectedReel ? analyzeInstagramReelReference(selectedReel) : Promise.resolve(null),
    analyzeDriveFootage(assets)
  ]);
  if (selectedReel && !reference) throw new Error("A referência de Reel selecionada não pôde ser analisada temporalmente. Sincronize novamente o Instagram ou escolha outra referência; o sistema não vai fingir fidelidade sem ler o vídeo.");
  return buildReelEditingPlan({ assets, footage, reference });
}
