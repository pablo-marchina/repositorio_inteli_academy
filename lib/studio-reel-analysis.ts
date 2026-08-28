import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ffmpegPath from "ffmpeg-static";
import { z } from "zod";
import { decryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { downloadDriveAsset } from "@/lib/google-drive";
import { analyzeReelTemporalLocally, type LocalTemporalAnalysis } from "@/lib/local-reel-temporal-fallback";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DriveAsset, InstagramReferencePost } from "@/lib/types";

const MAX_INLINE_MEDIA_BYTES = 18_000_000;
const MAX_MEDIA_DOWNLOAD_BYTES = 120_000_000;
const TARGET_VIDEO_ANALYSIS_BYTES = 10_000_000;
const MAX_REFERENCE_SHOTS = 40;
const STILL_ANALYSIS_DURATION_SECONDS = 180;
const SEMANTIC_ANALYSIS_VERSION = 3;

export type ReelShotType = "establishing" | "speaker" | "interaction" | "audience" | "detail" | "brand" | "movement" | "closing" | "other";
export type ReelFraming = "wide" | "medium" | "close" | "detail" | "other";
export type ReelSceneType = "room" | "corridor" | "stage" | "table" | "exterior" | "brand" | "people" | "detail" | "other";

type SemanticShot = {
  shotType: ReelShotType;
  framing: ReelFraming;
  sceneType: ReelSceneType;
  subject: string;
};

export type ReelReferenceTemporalAnalysis = {
  analysisMode: "video" | "cached" | "temporal-fallback" | "unavailable";
  semanticVersion: number;
  semanticAvailable: boolean;
  durationSeconds: number;
  averageShotSeconds: number;
  rhythm: "slow" | "medium" | "fast" | "mixed";
  shots: Array<SemanticShot & {
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
  analysisMode: "video" | "image" | "local-video" | "metadata-fallback";
  cameraMovement: string;
  bestSegments: Array<SemanticShot & {
    startSeconds: number;
    endSeconds: number;
    score: number;
    focalX: number;
    focalY: number;
    endFocalX: number;
    endFocalY: number;
    motion: "low" | "medium" | "high";
    energy: "low" | "medium" | "high";
    reason: string;
  }>;
};

export type MusicBeatAnalysis = {
  assetId: string;
  durationSeconds: number;
  bpm: number | null;
  beatSeconds: number[];
  analysisMode: "audio";
};

export type ReelEditingShot = {
  id: string;
  assetId: string;
  timelineStartSeconds: number;
  sourceInSeconds: number;
  sourceOutSeconds: number;
  durationSeconds: number;
  crop: { focalX: number; focalY: number; endFocalX: number; endFocalY: number; zoom: number };
  transition: "cut" | "dissolve" | "whip" | "zoom" | "blur" | "push";
  transitionDurationSeconds?: number;
  semantic: SemanticShot & { motion: "low" | "medium" | "high"; energy: "low" | "medium" | "high" };
  referenceSemantic?: SemanticShot & { motion: "low" | "medium" | "high"; energy: "low" | "medium" | "high" };
  reason: string;
};

export type ReelEditingPlan = {
  targetDurationSeconds: number;
  reference: ReelReferenceTemporalAnalysis | null;
  footage: FootageAnalysis[];
  shots: ReelEditingShot[];
  musicAssetId?: string;
  musicAnalysis: MusicBeatAnalysis | null;
  musicSelectionReason?: string;
  musicSelectionMode?: "user-selected" | "ai-selected" | "none";
  sourceAudio: boolean;
  beatSeconds: number[];
  beatSource: "music" | "reference" | "synthetic";
  analysisSummary: {
    semanticVersion: number;
    totalVisuals: number;
    visuallyAnalyzed: number;
    fallbackVisuals: number;
    coverage: number;
  };
};

const shotTypeSchema = z.enum(["establishing", "speaker", "interaction", "audience", "detail", "brand", "movement", "closing", "other"]);
const framingSchema = z.enum(["wide", "medium", "close", "detail", "other"]);
const sceneTypeSchema = z.enum(["room", "corridor", "stage", "table", "exterior", "brand", "people", "detail", "other"]);

const temporalSchema = z.object({
  semanticVersion: z.number().int().min(SEMANTIC_ANALYSIS_VERSION).default(SEMANTIC_ANALYSIS_VERSION),
  semanticAvailable: z.boolean().default(true),
  durationSeconds: z.number().min(1).max(180),
  averageShotSeconds: z.number().min(.2).max(20),
  rhythm: z.enum(["slow", "medium", "fast", "mixed"]),
  shots: z.array(z.object({
    startSeconds: z.number().min(0),
    endSeconds: z.number().min(0),
    motion: z.enum(["low", "medium", "high"]),
    energy: z.enum(["low", "medium", "high"]),
    transition: z.string().max(80),
    focalX: z.number().min(0).max(1).default(.5),
    focalY: z.number().min(0).max(1).default(.5),
    shotType: shotTypeSchema,
    framing: framingSchema,
    sceneType: sceneTypeSchema,
    subject: z.string().min(1).max(120)
  })).min(1).max(MAX_REFERENCE_SHOTS),
  beatSeconds: z.array(z.number().min(0).max(180)).max(400).default([]),
  textCues: z.array(z.object({
    startSeconds: z.number().min(0),
    endSeconds: z.number().min(0),
    density: z.enum(["light", "medium", "heavy"]),
    placement: z.string().max(120)
  })).max(80).default([])
});

const footageSchema = z.object({
  cameraMovement: z.string().max(160),
  bestSegments: z.array(z.object({
    startSeconds: z.number().min(0),
    endSeconds: z.number().min(0),
    score: z.number().min(0).max(100),
    focalX: z.number().min(0).max(1),
    focalY: z.number().min(0).max(1),
    endFocalX: z.number().min(0).max(1).optional(),
    endFocalY: z.number().min(0).max(1).optional(),
    motion: z.enum(["low", "medium", "high"]),
    energy: z.enum(["low", "medium", "high"]),
    shotType: shotTypeSchema,
    framing: framingSchema,
    sceneType: sceneTypeSchema,
    subject: z.string().min(1).max(120),
    reason: z.string().max(220)
  })).min(1).max(8)
});

const musicSchema = z.object({
  durationSeconds: z.number().min(1).max(900),
  bpm: z.number().min(30).max(260).nullable().default(null),
  beatSeconds: z.array(z.number().min(0).max(900)).min(3).max(1200)
});

const musicChoiceSchema = z.object({
  assetId: z.string().min(1),
  reason: z.string().min(1).max(220)
});

async function geminiTextJson<T>(prompt: string, schema: z.ZodType<T>): Promise<T | null> {
  const config = env();
  if (!config.GEMINI_API_KEY) return null;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.GEMINI_POST_MODEL)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": config.GEMINI_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000)
    });
    if (!response.ok) return null;
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const raw = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!raw) return null;
    return schema.parse(JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim()));
  } catch (error) {
    console.warn("[reel-analysis] automatic music selection failed; using deterministic fallback", { error: String(error) });
    return null;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function mediaDuration(asset: DriveAsset) {
  return Math.max(0, Number(asset.durationMillis ?? 0) / 1000);
}

function isVideoAsset(asset: DriveAsset) {
  return asset.mimeType.startsWith("video/");
}

function isImageAsset(asset: DriveAsset) {
  return asset.mimeType.startsWith("image/");
}

function isVisualAsset(asset: DriveAsset) {
  return isVideoAsset(asset) || isImageAsset(asset);
}

function isReelReference(reference: InstagramReferencePost) {
  return reference.mediaType === "VIDEO" || reference.mediaProductType === "REELS" || reference.mediaProductType === "REEL";
}

function ffmpegExecutable() {
  if (!ffmpegPath) throw new Error("ffmpeg-static não disponibilizou um binário para analisar o Reel.");
  return ffmpegPath;
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegExecutable(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-10000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg falhou ao preparar mídia (${code}): ${stderr.slice(-4000)}`));
    });
  });
}

function proxyArgs(input: string, output: string, attempt: { scale: number; fps: number; bitrate: string; maxrate: string; bufsize: string }, includeAudio: boolean) {
  return [
    "-y", "-i", input,
    "-map", "0:v:0",
    "-vf", `scale=${attempt.scale}:-2:flags=lanczos,fps=${attempt.fps}`,
    "-c:v", "libx264", "-preset", "veryfast",
    "-b:v", attempt.bitrate, "-maxrate", attempt.maxrate, "-bufsize", attempt.bufsize,
    "-pix_fmt", "yuv420p",
    ...(includeAudio ? ["-map", "0:a?", "-c:a", "aac", "-b:a", "48k", "-ac", "1"] : ["-an"]),
    "-movflags", "+faststart", output
  ];
}

async function prepareVideoForAnalysis(bytes: Uint8Array, mimeType: string, prefix: string, includeAudio = false) {
  if (bytes.byteLength > MAX_MEDIA_DOWNLOAD_BYTES) return null;
  if (bytes.byteLength <= TARGET_VIDEO_ANALYSIS_BYTES && mimeType === "video/mp4") {
    return { bytes, mimeType, transcoded: false };
  }

  const dir = await mkdtemp(join(tmpdir(), prefix));
  const input = join(dir, "input-video");
  const output = join(dir, "analysis.mp4");
  try {
    await writeFile(input, bytes);
    const attempts = [
      { scale: 480, fps: 10, bitrate: "420k", maxrate: "520k", bufsize: "1040k" },
      { scale: 360, fps: 8, bitrate: "260k", maxrate: "320k", bufsize: "640k" }
    ];
    for (const attempt of attempts) {
      const audioModes = includeAudio ? [true, false] : [false];
      for (const withAudio of audioModes) {
        try {
          await runFfmpeg(proxyArgs(input, output, attempt, withAudio));
          const compact = new Uint8Array(await readFile(output));
          if (compact.byteLength <= MAX_INLINE_MEDIA_BYTES) {
            if (includeAudio && !withAudio) {
              console.warn("[reel-analysis] proxy generated without audio because the source audio codec is unsupported");
            }
            return { bytes: compact, mimeType: "video/mp4", transcoded: true };
          }
        } catch (error) {
          if (!includeAudio || !withAudio) throw error;
          console.warn("[reel-analysis] proxy with audio failed; retrying video-only", { error: String(error) });
        }
      }
    }
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function geminiMediaJson<T>(bytes: Uint8Array, mimeType: string, prompt: string, schema: z.ZodType<T>): Promise<T | null> {
  const config = env();
  if (!config.GEMINI_API_KEY || bytes.byteLength > MAX_INLINE_MEDIA_BYTES) return null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.GEMINI_POST_MODEL)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": config.GEMINI_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType, data: Buffer.from(bytes).toString("base64") } }] }],
        generationConfig: { responseMimeType: "application/json" }
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(22_000)
    });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 800);
      console.warn("[reel-analysis] Gemini media analysis failed", { status: response.status, attempt: attempt + 1, body });
      if (attempt === 0 && (response.status === 429 || response.status >= 500)) continue;
      return null;
    }
    const payload = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const raw = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!raw) return null;
    try {
      return schema.parse(JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim()));
    } catch (error) {
      console.warn("[reel-analysis] Gemini returned invalid Reel JSON", { attempt: attempt + 1, error: String(error) });
      if (attempt === 0) continue;
      return null;
    }
  }
  return null;
}

async function refreshReferenceMediaUrl(reference: InstagramReferencePost) {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("instagram_accounts")
      .select("access_token_encrypted")
      .eq("is_active", true)
      .order("connected_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data?.access_token_encrypted) return reference.mediaUrl;

    const values = env();
    const token = decryptSecret(String(data.access_token_encrypted));
    const url = new URL(`https://graph.instagram.com/${values.META_GRAPH_VERSION}/${encodeURIComponent(reference.id)}`);
    url.searchParams.set("fields", "media_url,thumbnail_url,media_type,media_product_type");
    url.searchParams.set("access_token", token);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return reference.mediaUrl;
    const payload = (await response.json()) as { media_url?: string; thumbnail_url?: string; media_type?: string; media_product_type?: string };
    if (!payload.media_url) return reference.mediaUrl;

    reference.mediaUrl = payload.media_url;
    if (payload.thumbnail_url) reference.thumbnailUrl = payload.thumbnail_url;
    await admin.from("instagram_reference_posts").update({
      media_url: payload.media_url,
      thumbnail_url: payload.thumbnail_url ?? reference.thumbnailUrl ?? null,
      media_type: payload.media_type ?? reference.mediaType,
      media_product_type: payload.media_product_type ?? reference.mediaProductType,
      synced_at: new Date().toISOString()
    }).eq("id", reference.id);
    return payload.media_url;
  } catch {
    return reference.mediaUrl;
  }
}

async function fetchReferenceVideo(reference: InstagramReferencePost) {
  async function attempt(url: string | null | undefined) {
    if (!url) return null;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const declaredSize = Number(response.headers.get("content-length") ?? 0);
    if (declaredSize > MAX_MEDIA_DOWNLOAD_BYTES) return null;
    const mimeType = response.headers.get("content-type")?.split(";")[0] || "video/mp4";
    if (!mimeType.startsWith("video/")) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_MEDIA_DOWNLOAD_BYTES) return null;
    return { bytes, mimeType };
  }

  const cached = await attempt(reference.mediaUrl);
  if (cached) return { ...cached, refreshed: false };
  const refreshedUrl = await refreshReferenceMediaUrl(reference);
  const refreshed = await attempt(refreshedUrl);
  return refreshed ? { ...refreshed, refreshed: true } : null;
}

function normalizeReference(value: z.infer<typeof temporalSchema>): ReelReferenceTemporalAnalysis {
  const duration = value.durationSeconds;
  const shots = value.shots
    .map((shot) => ({ ...shot, startSeconds: clamp(shot.startSeconds, 0, duration), endSeconds: clamp(shot.endSeconds, 0, duration) }))
    .filter((shot) => shot.endSeconds - shot.startSeconds >= .15)
    .sort((a, b) => a.startSeconds - b.startSeconds);
  return {
    analysisMode: "video",
    semanticVersion: value.semanticVersion,
    semanticAvailable: value.semanticAvailable,
    durationSeconds: duration,
    averageShotSeconds: shots.length ? shots.reduce((sum, shot) => sum + shot.endSeconds - shot.startSeconds, 0) / shots.length : value.averageShotSeconds,
    rhythm: value.rhythm,
    shots,
    beatSeconds: [...new Set(value.beatSeconds.filter((second) => second > .05 && second <= duration))].sort((a, b) => a - b),
    textCues: value.textCues.filter((cue) => cue.endSeconds > cue.startSeconds && cue.startSeconds <= duration)
  };
}

function referenceFromLocalTemporal(value: LocalTemporalAnalysis): ReelReferenceTemporalAnalysis {
  return {
    analysisMode: "temporal-fallback",
    semanticVersion: SEMANTIC_ANALYSIS_VERSION,
    semanticAvailable: false,
    durationSeconds: value.durationSeconds,
    averageShotSeconds: value.averageShotSeconds,
    rhythm: value.rhythm,
    shots: value.shots.map((shot) => ({
      ...shot,
      shotType: "other" as const,
      framing: "other" as const,
      sceneType: "other" as const,
      subject: "função semântica indisponível; corte detectado localmente"
    })),
    beatSeconds: value.beatSeconds,
    textCues: []
  };
}

export async function analyzeInstagramReelReference(reference: InstagramReferencePost): Promise<ReelReferenceTemporalAnalysis | null> {
  const cachedTemporal = reference.visualAnalysis?.temporal;
  if (cachedTemporal && typeof cachedTemporal === "object") {
    const parsed = temporalSchema.safeParse(cachedTemporal);
    if (parsed.success && parsed.data.semanticVersion >= SEMANTIC_ANALYSIS_VERSION) {
      return { ...normalizeReference(parsed.data), analysisMode: "cached" };
    }
  }

  const isVideo = reference.mediaType === "VIDEO" || reference.mediaProductType === "REELS" || reference.mediaProductType === "REEL";
  if (!isVideo) return null;
  const downloaded = await fetchReferenceVideo(reference);
  if (!downloaded) return null;
  const prepared = await prepareVideoForAnalysis(downloaded.bytes, downloaded.mimeType, "academy-reel-reference-", true);
  if (!prepared) return null;

  console.info("[reel-reference] semantic media prepared", {
    mediaId: reference.id,
    originalBytes: downloaded.bytes.byteLength,
    analysisBytes: prepared.bytes.byteLength,
    refreshedUrl: downloaded.refreshed,
    transcoded: prepared.transcoded
  });

  const analysis = await geminiMediaJson(
    prepared.bytes,
    prepared.mimeType,
    `Analise temporal E VISUALMENTE este Reel real da Inteli Academy como referência de edição, sem identificar pessoas. Retorne semanticVersion=${SEMANTIC_ANALYSIS_VERSION}, semanticAvailable=true, duração total e TODOS os shots/cortes percebidos. Para cada shot informe boundaries em segundos, motion, energy, transition, focalX/focalY e também shotType (establishing|speaker|interaction|audience|detail|brand|movement|closing|other), framing (wide|medium|close|detail|other), sceneType (room|corridor|stage|table|exterior|brand|people|detail|other) e subject curto descrevendo apenas o papel visual da cena, sem nomes. Preserve a quantidade real de shots e a ordem narrativa. Retorne também beats/acentos audíveis aproximados e textCues somente quando texto editorial realmente aparece na imagem. O objetivo é reproduzir a linguagem audiovisual e a função de cada corte, não copiar o conteúdo.`,
    temporalSchema
  );
  if (analysis) return normalizeReference(analysis);

  console.warn("[reel-reference] semantic Gemini analysis unavailable; using deterministic temporal scene analysis");
  const local = await analyzeReelTemporalLocally(prepared.bytes);
  return local ? referenceFromLocalTemporal(local) : null;
}

function fallbackSegments(asset: DriveAsset): FootageAnalysis {
  if (isImageAsset(asset)) {
    return {
      assetId: asset.id,
      durationSeconds: STILL_ANALYSIS_DURATION_SECONDS,
      width: asset.width ?? null,
      height: asset.height ?? null,
      analysisMode: "metadata-fallback",
      cameraMovement: "still image",
      bestSegments: [{
        startSeconds: 0,
        endSeconds: STILL_ANALYSIS_DURATION_SECONDS,
        score: 30,
        focalX: .5,
        focalY: .5,
        endFocalX: .5,
        endFocalY: .5,
        motion: "low",
        energy: "low",
        shotType: "other",
        framing: "other",
        sceneType: "other",
        subject: "imagem não analisada visualmente",
        reason: "fallback por metadados; composição visual desconhecida"
      }]
    };
  }

  const duration = Math.max(1, mediaDuration(asset));
  const segmentLength = clamp(duration / 5, .5, 4.5);
  const starts = duration <= segmentLength + .1 ? [0] : [.08, .38, .68].map((ratio) => clamp(duration * ratio, 0, Math.max(0, duration - segmentLength)));
  return {
    assetId: asset.id,
    durationSeconds: duration,
    width: asset.width ?? null,
    height: asset.height ?? null,
    analysisMode: "metadata-fallback",
    cameraMovement: "não analisado visualmente",
    bestSegments: starts.map((start, index) => ({
      startSeconds: start,
      endSeconds: Math.min(duration, start + segmentLength),
      score: 30 - index * 2,
      focalX: .5,
      focalY: .5,
      endFocalX: .5,
      endFocalY: .5,
      motion: "medium" as const,
      energy: "low" as const,
      shotType: "other" as const,
      framing: "other" as const,
      sceneType: "other" as const,
      subject: "vídeo não analisado visualmente",
      reason: "fallback por metadados; conteúdo visual desconhecido"
    }))
  };
}

function localFootageAnalysis(asset: DriveAsset, duration: number, value: LocalTemporalAnalysis): FootageAnalysis {
  const sourceShots = value.shots.length ? value.shots : [{
    startSeconds: 0,
    endSeconds: duration,
    motion: "low" as const,
    energy: "low" as const,
    transition: "cut",
    focalX: .5,
    focalY: .5
  }];
  const bestSegments = sourceShots
    .map((shot, index) => ({
      startSeconds: clamp(shot.startSeconds, 0, duration),
      endSeconds: clamp(shot.endSeconds, 0, duration),
      score: Math.max(48, 62 - index * 2),
      focalX: .5,
      focalY: .5,
      endFocalX: .5,
      endFocalY: .5,
      motion: shot.motion,
      energy: shot.energy,
      shotType: "other" as const,
      framing: "other" as const,
      sceneType: "other" as const,
      subject: "segmento visual detectado localmente",
      reason: "segmento detectado diretamente nos pixels por FFmpeg; classificação semântica indisponível"
    }))
    .filter((segment) => segment.endSeconds - segment.startSeconds >= .2)
    .slice(0, 6);

  return {
    assetId: asset.id,
    durationSeconds: duration,
    width: asset.width ?? null,
    height: asset.height ?? null,
    analysisMode: "local-video",
    cameraMovement: `detecção visual local FFmpeg (${value.rhythm}); sem classificação semântica`,
    bestSegments: bestSegments.length ? bestSegments : [{
      startSeconds: 0,
      endSeconds: duration,
      score: 50,
      focalX: .5,
      focalY: .5,
      endFocalX: .5,
      endFocalY: .5,
      motion: "low",
      energy: "low",
      shotType: "other",
      framing: "other",
      sceneType: "other",
      subject: "take analisado localmente",
      reason: "pixels analisados localmente; sem semântica remota"
    }]
  };
}

async function analyzeOneFootage(asset: DriveAsset): Promise<FootageAnalysis> {
  const image = isImageAsset(asset);
  const duration = image ? STILL_ANALYSIS_DURATION_SECONDS : mediaDuration(asset);
  if ((!image && !duration) || Number(asset.size ?? 0) > MAX_MEDIA_DOWNLOAD_BYTES) return fallbackSegments(asset);

  try {
    const { bytes } = await downloadDriveAsset(asset.id);
    if (bytes.byteLength > MAX_MEDIA_DOWNLOAD_BYTES) return fallbackSegments(asset);

    let analysisBytes: Uint8Array<ArrayBufferLike> = bytes;
    let analysisMimeType = asset.mimeType;
    if (!image) {
      const prepared = await prepareVideoForAnalysis(bytes, asset.mimeType, "academy-reel-footage-", false);
      if (!prepared) return fallbackSegments(asset);
      analysisBytes = prepared.bytes;
      analysisMimeType = prepared.mimeType;
      console.info("[reel-footage] visual proxy prepared", {
        assetId: asset.id,
        originalBytes: bytes.byteLength,
        analysisBytes: prepared.bytes.byteLength,
        transcoded: prepared.transcoded
      });
    } else if (bytes.byteLength > MAX_INLINE_MEDIA_BYTES) {
      return fallbackSegments(asset);
    }

    const prompt = image
      ? `Analise esta FOTO para uso como shot em um Reel 9:16. Não identifique pessoas. Retorne cameraMovement="still image" e exatamente 1 bestSegment com startSeconds=0, endSeconds=${STILL_ANALYSIS_DURATION_SECONDS}, score 0-100, focalX/focalY no assunto visual mais importante, endFocalX/endFocalY iguais ou levemente deslocados se um pan sutil melhorar a composição, motion="low", energy, shotType, framing, sceneType, subject curto e reason. Avalie composição, nitidez, ação sugerida, presença de marca/ambiente e área vazia.`
      : `Analise visualmente este VÍDEO BRUTO para edição de Reel 9:16. A duração real é ${duration.toFixed(3)}s. Não identifique pessoas. Escolha 2–6 melhores segmentos e, para cada um, retorne startSeconds/endSeconds, score 0-100, focalX/focalY inicial e endFocalX/endFocalY final para acompanhar o assunto, motion, energy, shotType (establishing|speaker|interaction|audience|detail|brand|movement|closing|other), framing (wide|medium|close|detail|other), sceneType (room|corridor|stage|table|exterior|brand|people|detail|other), subject curto e reason. Premie ação legível, rostos/gestos bem enquadrados sem identificar ninguém, branding visível, mudança de escala e composição forte; penalize costas sem contexto, teto/chão, câmera perdida, duplicidade visual e planos gerais estáticos sem sujeito. Nenhum endSeconds pode ultrapassar ${duration.toFixed(3)}.`;
    const analysis = await geminiMediaJson(analysisBytes, analysisMimeType, prompt, footageSchema);
    if (!analysis) {
      if (!image) {
        const local = await analyzeReelTemporalLocally(analysisBytes);
        if (local) {
          console.warn("[reel-footage] Gemini semantic analysis unavailable; using local visual scene analysis", { assetId: asset.id, shots: local.shots.length });
          return localFootageAnalysis(asset, duration, local);
        }
      }
      return fallbackSegments(asset);
    }

    const bestSegments = analysis.bestSegments
      .map((segment) => ({
        ...segment,
        startSeconds: image ? 0 : clamp(segment.startSeconds, 0, duration),
        endSeconds: image ? STILL_ANALYSIS_DURATION_SECONDS : clamp(segment.endSeconds, 0, duration),
        focalX: clamp(segment.focalX, 0, 1),
        focalY: clamp(segment.focalY, 0, 1),
        endFocalX: clamp(segment.endFocalX ?? segment.focalX, 0, 1),
        endFocalY: clamp(segment.endFocalY ?? segment.focalY, 0, 1),
        motion: image ? "low" as const : segment.motion
      }))
      .filter((segment) => image || segment.endSeconds - segment.startSeconds >= .2)
      .sort((a, b) => b.score - a.score);
    if (!bestSegments.length) return fallbackSegments(asset);

    return {
      assetId: asset.id,
      durationSeconds: duration,
      width: asset.width ?? null,
      height: asset.height ?? null,
      analysisMode: image ? "image" : "video",
      cameraMovement: analysis.cameraMovement,
      bestSegments
    };
  } catch (error) {
    console.warn("[reel-footage] visual analysis failed; preserving explicit fallback", { assetId: asset.id, error: String(error) });
    return fallbackSegments(asset);
  }
}

export async function analyzeDriveFootage(assets: DriveAsset[]) {
  const visuals = assets.filter(isVisualAsset);
  const results: FootageAnalysis[] = new Array(visuals.length);
  let cursor = 0;
  async function worker() {
    while (cursor < visuals.length) {
      const index = cursor++;
      results[index] = await analyzeOneFootage(visuals[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, visuals.length) }, () => worker()));
  return results;
}

async function prepareAudioForAnalysis(bytes: Uint8Array, mimeType: string, prefix: string) {
  if (bytes.byteLength > MAX_MEDIA_DOWNLOAD_BYTES) return null;
  if (bytes.byteLength <= MAX_INLINE_MEDIA_BYTES) return { bytes, mimeType };
  const dir = await mkdtemp(join(tmpdir(), prefix));
  const input = join(dir, "input-audio");
  const output = join(dir, "analysis.m4a");
  try {
    await writeFile(input, bytes);
    await runFfmpeg([
      "-y", "-i", input, "-vn", "-c:a", "aac", "-b:a", "64k", "-ac", "1",
      "-movflags", "+faststart", output
    ]);
    const compact = new Uint8Array(await readFile(output));
    return compact.byteLength <= MAX_INLINE_MEDIA_BYTES ? { bytes: compact, mimeType: "audio/mp4" } : null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function analyzeMusicAsset(asset: DriveAsset): Promise<MusicBeatAnalysis | null> {
  const durationFromDrive = mediaDuration(asset);
  if (!asset.mimeType.startsWith("audio/") || Number(asset.size ?? 0) > MAX_MEDIA_DOWNLOAD_BYTES) return null;
  try {
    const { bytes } = await downloadDriveAsset(asset.id);
    const prepared = await prepareAudioForAnalysis(bytes, asset.mimeType, `academy-music-${asset.id.slice(0, 8)}-`);
    if (!prepared) return null;
    const analysis = await geminiMediaJson(
      prepared.bytes,
      prepared.mimeType,
      `Analise esta faixa de áudio apenas para edição temporal. A duração informada pelo Drive é ${durationFromDrive ? `${durationFromDrive.toFixed(3)}s` : "desconhecida"}. Retorne duração, BPM aproximado e timestamps em segundos dos beats/acentos fortes úteis para cortes. Não transcreva letra nem fala.`,
      musicSchema
    );
    if (!analysis) return null;
    const duration = durationFromDrive || analysis.durationSeconds;
    const beatSeconds = [...new Set(analysis.beatSeconds.filter((beat) => beat > .05 && beat < duration - .02).map((beat) => Number(beat.toFixed(3))))].sort((a, b) => a - b);
    if (beatSeconds.length < 3) return null;
    return { assetId: asset.id, durationSeconds: duration, bpm: analysis.bpm, beatSeconds, analysisMode: "audio" };
  } catch {
    return null;
  }
}


async function chooseAutomaticMusic(input: {
  candidates: DriveAsset[];
  context?: string;
  reference: ReelReferenceTemporalAnalysis | null;
}) {
  const candidates = input.candidates
    .filter((asset) => asset.mimeType.startsWith("audio/") && Number(asset.size ?? 0) <= MAX_MEDIA_DOWNLOAD_BYTES)
    .slice(0, 12);
  if (!candidates.length) return null;
  const referenceSummary = input.reference
    ? `ritmo=${input.reference.rhythm}; duração=${input.reference.durationSeconds.toFixed(1)}s; média por shot=${input.reference.averageShotSeconds.toFixed(2)}s`
    : "sem Reel específico; prefira uma faixa moderna, energética e adequada a conteúdo institucional/social";
  const candidateSummary = candidates.map((asset) => ({
    id: asset.id,
    name: asset.name,
    path: asset.path?.join("/") ?? "",
    modifiedTime: asset.modifiedTime ?? null
  }));
  const choice = await geminiTextJson(
    `Você é o music director de um editor de Reel. Escolha UMA faixa autorizada do catálogo do Google Drive para servir como trilha. Não invente IDs. Não cite letras. Contexto editorial: ${(input.context ?? "").slice(0, 1800) || "não informado"}. Referência: ${referenceSummary}. Dê preferência a nomes/metadados que indiquem energia, ritmo e uso compatível com social video; evite arquivos que pareçam voz, entrevista, podcast ou gravação bruta. Candidatas: ${JSON.stringify(candidateSummary)}. Retorne assetId e reason curto em português.`,
    musicChoiceSchema
  );
  const selected = choice ? candidates.find((asset) => asset.id === choice.assetId) : null;
  if (selected) return { asset: selected, reason: choice!.reason, mode: "ai-selected" as const };
  const fallback = candidates.find((asset) => !/(voice|voz|speech|fala|interview|entrevista|podcast|meeting|reuniao)/i.test(`${asset.name} ${asset.path?.join("/") ?? ""}`)) ?? candidates[0];
  return { asset: fallback, reason: "Seleção automática por catálogo autorizado; metadados insuficientes para a escolha semântica completa.", mode: "ai-selected" as const };
}
function referenceDurationPattern(reference: ReelReferenceTemporalAnalysis | null) {
  if (!reference?.shots.length) return [];
  return reference.shots.map((shot) => clamp(shot.endSeconds - shot.startSeconds, .15, 30));
}

function rhythmGrid(target: number, music: MusicBeatAnalysis | null) {
  const musicBeats = music?.beatSeconds.filter((beat) => beat > .05 && beat < target - .02) ?? [];
  if (musicBeats.length >= 3) return { beats: musicBeats, source: "music" as const };
  return { beats: [] as number[], source: "synthetic" as const };
}

function normalizeDurations(raw: number[], target: number) {
  if (!raw.length) return [target];
  const total = raw.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return Array.from({ length: raw.length }, () => target / raw.length);
  const scaled = raw.map((value) => Math.max(.12, value * target / total));
  const scaledTotal = scaled.reduce((sum, value) => sum + value, 0);
  scaled[scaled.length - 1] += target - scaledTotal;
  return scaled;
}

function snapDurationsToBeats(raw: number[], target: number, beats: number[]) {
  const desired = normalizeDurations(raw, target);
  if (!beats.length || desired.length <= 1) return desired;
  const durations: number[] = [];
  let cursor = 0;
  const minimum = Math.max(.12, Math.min(...desired) * .45);
  for (let index = 0; index < desired.length - 1; index += 1) {
    const remaining = desired.length - index - 1;
    const ideal = cursor + desired[index];
    const minBoundary = cursor + minimum;
    const maxBoundary = Math.max(minBoundary, target - remaining * minimum);
    const candidates = beats.filter((beat) => beat >= minBoundary && beat <= maxBoundary).sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal));
    const nearest = candidates[0];
    const tolerance = Math.max(.12, Math.min(.42, desired[index] * .3));
    const boundary = nearest !== undefined && Math.abs(nearest - ideal) <= tolerance ? nearest : clamp(ideal, minBoundary, maxBoundary);
    durations.push(Math.max(.12, boundary - cursor));
    cursor = boundary;
  }
  durations.push(Math.max(.12, target - cursor));
  const total = durations.reduce((sum, value) => sum + value, 0);
  durations[durations.length - 1] += target - total;
  return durations;
}

function fallbackTargetDuration(visualCount: number) {
  return clamp(visualCount * 1.5, 6, 60);
}

function fallbackShotCount(target: number, visualCount: number) {
  const average = visualCount > 12 ? 1 : visualCount > 6 ? 1.25 : 1.6;
  return clamp(Math.round(target / average), 1, MAX_REFERENCE_SHOTS);
}

function transitionForBoundary(
  reference: ReelReferenceTemporalAnalysis | null,
  index: number,
  previous: ReelEditingShot["semantic"] | undefined,
  current: FootageAnalysis["bestSegments"][number]
): { type: ReelEditingShot["transition"]; duration: number } {
  if (index === 0) return { type: "cut", duration: 0 };
  const value = reference?.shots[Math.max(0, index - 1)]?.transition?.toLowerCase() ?? "";
  if (/whip|swish|slide/.test(value)) return { type: "whip", duration: .16 };
  if (/zoom/.test(value)) return { type: "zoom", duration: .2 };
  if (/blur/.test(value)) return { type: "blur", duration: .18 };
  if (/push|wipe/.test(value)) return { type: "push", duration: .2 };
  if (/dissolve|fade|cross/.test(value)) return { type: "dissolve", duration: .24 };
  if (reference) return { type: "cut", duration: 0 };

  const motionJump = previous?.motion === "high" || current.motion === "high";
  const scaleJump = previous && previous.framing !== current.framing && [previous.framing, current.framing].some((framing) => framing === "close" || framing === "detail");
  const energyJump = previous && previous.energy !== current.energy;
  if (motionJump && index % 3 === 1) return { type: "whip", duration: .14 };
  if (scaleJump && index % 3 === 2) return { type: "zoom", duration: .18 };
  if (energyJump && index % 4 === 0) return { type: "push", duration: .18 };
  if (index % 7 === 0) return { type: "blur", duration: .16 };
  if (index % 5 === 0) return { type: "dissolve", duration: .2 };
  return { type: "cut", duration: 0 };
}

function semanticKey(value: SemanticShot) {
  return `${value.shotType}:${value.framing}:${value.sceneType}`;
}

function candidateScore(input: {
  segment: FootageAnalysis["bestSegments"][number];
  analysis: FootageAnalysis;
  referenceShot?: ReelReferenceTemporalAnalysis["shots"][number];
  usedAssets: Map<string, number>;
  usedSemantic: Map<string, number>;
  usedScenes: Map<ReelSceneType, number>;
  requestedDuration: number;
}) {
  const { segment, analysis, referenceShot } = input;
  let score = segment.score;
  if (analysis.analysisMode === "metadata-fallback") score -= 80;
  if (analysis.analysisMode === "local-video") score -= 6;
  if (referenceShot && analysis.analysisMode !== "local-video") {
    if (segment.shotType === referenceShot.shotType) score += 22;
    else if (segment.shotType === "other" || referenceShot.shotType === "other") score -= 2;
    else score -= 8;
    if (segment.framing === referenceShot.framing) score += 12;
    if (segment.motion === referenceShot.motion) score += 7;
    if (segment.energy === referenceShot.energy) score += 6;
    if (segment.sceneType === referenceShot.sceneType) score += 3;
  }
  score -= (input.usedAssets.get(analysis.assetId) ?? 0) * 28;
  score -= (input.usedSemantic.get(semanticKey(segment)) ?? 0) * 12;
  score -= (input.usedScenes.get(segment.sceneType) ?? 0) * 5;
  const available = segment.endSeconds - segment.startSeconds;
  if (available + .05 < input.requestedDuration) score -= Math.min(14, (input.requestedDuration - available) * 4);
  return score;
}

export function buildReelEditingPlan(input: {
  assets: DriveAsset[];
  footage: FootageAnalysis[];
  reference: ReelReferenceTemporalAnalysis | null;
  music?: MusicBeatAnalysis | null;
  musicSelectionReason?: string;
  musicSelectionMode?: "user-selected" | "ai-selected" | "none";
}): ReelEditingPlan {
  const visuals = input.assets.filter(isVisualAsset);
  const videos = visuals.filter(isVideoAsset);
  if (!visuals.length) throw new Error("Reel requer pelo menos um vídeo ou uma imagem.");

  const audio = input.assets.find((asset) => asset.mimeType.startsWith("audio/"));
  if (!videos.length && !audio) throw new Error("Um Reel composto somente por imagens precisa de uma faixa de áudio selecionada.");

  const target = input.reference ? clamp(input.reference.durationSeconds, 1, 180) : fallbackTargetDuration(visuals.length);
  const pattern = referenceDurationPattern(input.reference);
  const desiredCount = input.reference?.shots.length ? clamp(input.reference.shots.length, 1, MAX_REFERENCE_SHOTS) : fallbackShotCount(target, visuals.length);
  const fallbackPattern = [.85, 1.15, .72, 1.35, 1, 1.55, .64, 1.22];
  const rawDurations = Array.from({ length: desiredCount }, (_, index) => pattern[index] ?? fallbackPattern[index % fallbackPattern.length]);
  const grid = rhythmGrid(target, input.music ?? null);
  const durations = grid.source === "music" ? snapDurationsToBeats(rawDurations, target, grid.beats) : normalizeDurations(rawDurations, target);

  const analyses = input.footage.length ? input.footage : visuals.map(fallbackSegments);
  const byAsset = new Map(input.assets.map((asset) => [asset.id, asset]));
  const visuallyAnalyzed = analyses.filter((analysis) => analysis.analysisMode !== "metadata-fallback");
  const candidateAnalyses = visuallyAnalyzed.length ? visuallyAnalyzed : analyses;
  if (input.reference && visuallyAnalyzed.length < Math.min(desiredCount, visuals.length)) {
    throw new Error(`A referência possui ${desiredCount} shots, mas apenas ${visuallyAnalyzed.length}/${visuals.length} mídias tiveram análise visual real ou local. A geração foi interrompida para não produzir uma montagem arbitrária por metadados.`);
  }

  const candidates = candidateAnalyses.flatMap((analysis) => analysis.bestSegments.map((segment) => ({ analysis, segment })));
  if (!candidates.length) throw new Error("Nenhum visual válido ficou disponível para montar o Reel.");

  const usedAssets = new Map<string, number>();
  const usedSemantic = new Map<string, number>();
  const usedScenes = new Map<ReelSceneType, number>();
  const shots: ReelEditingShot[] = [];
  let timelineStart = 0;

  for (let index = 0; index < desiredCount; index += 1) {
    const requestedDuration = Math.max(.12, durations[index]);
    const referenceShot = input.reference?.semanticAvailable === false ? undefined : input.reference?.shots[index];
    const ranked = [...candidates].sort((a, b) => candidateScore({ ...b, referenceShot, usedAssets, usedSemantic, usedScenes, requestedDuration }) - candidateScore({ ...a, referenceShot, usedAssets, usedSemantic, usedScenes, requestedDuration }));
    const candidate = ranked[0];
    if (!candidate) continue;
    const { analysis, segment } = candidate;
    const asset = byAsset.get(analysis.assetId);
    if (!asset) continue;
    const image = isImageAsset(asset);
    const duration = image ? requestedDuration : Math.min(requestedDuration, Math.max(.12, analysis.durationSeconds));
    const maxStart = image ? 0 : Math.max(0, analysis.durationSeconds - duration);
    const segmentMid = (segment.startSeconds + segment.endSeconds) / 2;
    const sourceIn = image ? 0 : clamp(segmentMid - duration / 2, 0, maxStart);
    const sourceOut = image ? duration : Math.min(analysis.durationSeconds, sourceIn + duration);
    const actualDuration = image ? duration : sourceOut - sourceIn;
    if (actualDuration <= .05) continue;

    const stillPan = image && Math.abs(segment.endFocalX - segment.focalX) < .01 && Math.abs(segment.endFocalY - segment.focalY) < .01;
    const transition = transitionForBoundary(input.reference, index, shots.at(-1)?.semantic, segment);
    const transitionDuration = Math.min(transition.duration, Math.max(0, actualDuration * .22), Math.max(0, (shots.at(-1)?.durationSeconds ?? actualDuration) * .22));
    const shotTimelineStart = Math.max(0, timelineStart - transitionDuration);
    shots.push({
      id: `shot-${shots.length + 1}`,
      assetId: analysis.assetId,
      timelineStartSeconds: shotTimelineStart,
      sourceInSeconds: sourceIn,
      sourceOutSeconds: sourceOut,
      durationSeconds: actualDuration,
      crop: {
        focalX: clamp(segment.focalX, .05, .95),
        focalY: clamp(segment.focalY, .05, .95),
        endFocalX: clamp(stillPan ? segment.focalX + .015 : segment.endFocalX, .05, .95),
        endFocalY: clamp(stillPan ? segment.focalY - .01 : segment.endFocalY, .05, .95),
        zoom: image ? 1.04 : analysis.width && analysis.height && analysis.width > analysis.height ? 1.08 : 1
      },
      transition: transition.type,
      transitionDurationSeconds: transitionDuration,
      semantic: { shotType: segment.shotType, framing: segment.framing, sceneType: segment.sceneType, subject: segment.subject, motion: segment.motion, energy: segment.energy },
      ...(referenceShot ? { referenceSemantic: { shotType: referenceShot.shotType, framing: referenceShot.framing, sceneType: referenceShot.sceneType, subject: referenceShot.subject, motion: referenceShot.motion, energy: referenceShot.energy } } : {}),
      reason: `${segment.reason} · visual=${analysis.analysisMode} · função=${segment.shotType}/${segment.framing}/${segment.sceneType} · score ${segment.score.toFixed(0)}/100 · shot ${index + 1}/${desiredCount}${referenceShot ? ` alinhado a ${referenceShot.shotType}/${referenceShot.framing}` : input.reference ? " seguindo a cadência temporal da referência" : " com diversidade visual"}`
    });
    timelineStart = shotTimelineStart + actualDuration;
    usedAssets.set(analysis.assetId, (usedAssets.get(analysis.assetId) ?? 0) + 1);
    usedSemantic.set(semanticKey(segment), (usedSemantic.get(semanticKey(segment)) ?? 0) + 1);
    usedScenes.set(segment.sceneType, (usedScenes.get(segment.sceneType) ?? 0) + 1);
  }

  if (!shots.length) throw new Error("A montagem não produziu nenhum shot executável.");
  const fallbackVisuals = analyses.filter((analysis) => analysis.analysisMode === "metadata-fallback").length;
  const coverage = analyses.length ? visuallyAnalyzed.length / analyses.length : 0;
  return {
    targetDurationSeconds: timelineStart,
    reference: input.reference,
    footage: analyses,
    shots,
    musicAssetId: audio?.id,
    musicAnalysis: input.music ?? null,
    musicSelectionReason: input.musicSelectionReason,
    musicSelectionMode: input.musicSelectionMode ?? (audio ? "user-selected" : "none"),
    sourceAudio: !audio && videos.length > 0,
    beatSeconds: grid.beats.filter((beat) => beat <= timelineStart + .05),
    beatSource: grid.source,
    analysisSummary: {
      semanticVersion: SEMANTIC_ANALYSIS_VERSION,
      totalVisuals: analyses.length,
      visuallyAnalyzed: visuallyAnalyzed.length,
      fallbackVisuals,
      coverage
    }
  };
}

export async function analyzeAndPlanReel(
  assets: DriveAsset[],
  references: InstagramReferencePost[],
  options: { musicCandidates?: DriveAsset[]; context?: string } = {}
) {
  const selectedReel = references.find((reference) => isReelReference(reference));
  const explicitMusic = assets.find((asset) => asset.mimeType.startsWith("audio/"));
  const [reference, footage] = await Promise.all([
    selectedReel ? analyzeInstagramReelReference(selectedReel) : Promise.resolve(null),
    analyzeDriveFootage(assets)
  ]);
  if (selectedReel && !reference) {
    throw new Error("A referência de Reel não pôde ser analisada nem semanticamente pelo Gemini nem temporalmente pelo FFmpeg local. Verifique se a mídia do Instagram ainda está acessível.");
  }

  let musicAsset = explicitMusic ?? null;
  let musicSelectionReason = explicitMusic ? "Faixa fornecida explicitamente junto das mídias do projeto." : undefined;
  let musicSelectionMode: ReelEditingPlan["musicSelectionMode"] = explicitMusic ? "user-selected" : "none";
  if (!musicAsset && options.musicCandidates?.length) {
    const selected = await chooseAutomaticMusic({ candidates: options.musicCandidates, context: options.context, reference });
    if (selected) {
      musicAsset = selected.asset;
      musicSelectionReason = selected.reason;
      musicSelectionMode = selected.mode;
    }
  }

  const music = musicAsset ? await analyzeMusicAsset(musicAsset) : null;
  if (musicAsset && !music) {
    console.warn("[reel-analysis] selected music could not be beat-analyzed; falling back to source audio", { assetId: musicAsset.id });
    musicAsset = null;
    musicSelectionReason = "A faixa escolhida não passou pela análise temporal; o Reel preserva o áudio natural em vez de fingir sincronização musical.";
    musicSelectionMode = "none";
  }

  const effectiveAssets = musicAsset && !assets.some((asset) => asset.id === musicAsset!.id) ? [...assets, musicAsset] : assets;
  const visuals = assets.filter(isVisualAsset);
  const visuallyAnalyzed = footage.filter((analysis) => analysis.analysisMode !== "metadata-fallback").length;
  const minimumCoverage = visuals.length <= 4 ? 1 : visuals.length <= 8 ? .75 : .67;
  if (visuals.length && visuallyAnalyzed / visuals.length < minimumCoverage) {
    throw new Error(`Só ${visuallyAnalyzed}/${visuals.length} mídias tiveram análise visual real/local. O mínimo seguro para esta geração é ${Math.ceil(visuals.length * minimumCoverage)}. O Reel não será montado usando apenas metadados genéricos.`);
  }

  return buildReelEditingPlan({
    assets: effectiveAssets,
    footage,
    reference,
    music,
    musicSelectionReason,
    musicSelectionMode
  });
}
