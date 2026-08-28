import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ffmpegPath from "ffmpeg-static";
import { z } from "zod";
import { decryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { downloadDriveAsset } from "@/lib/google-drive";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DriveAsset, InstagramReferencePost } from "@/lib/types";

const MAX_INLINE_MEDIA_BYTES = 18_000_000;
const MAX_REFERENCE_DOWNLOAD_BYTES = 120_000_000;
const TARGET_REFERENCE_ANALYSIS_BYTES = 10_000_000;
const MAX_REFERENCE_SHOTS = 40;
const STILL_ANALYSIS_DURATION_SECONDS = 180;

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
  analysisMode: "video" | "image" | "metadata-fallback";
  cameraMovement: string;
  bestSegments: Array<{
    startSeconds: number;
    endSeconds: number;
    score: number;
    focalX: number;
    focalY: number;
    endFocalX: number;
    endFocalY: number;
    motion: "low" | "medium" | "high";
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
  transition: "cut" | "dissolve";
  reason: string;
};

export type ReelEditingPlan = {
  targetDurationSeconds: number;
  reference: ReelReferenceTemporalAnalysis | null;
  footage: FootageAnalysis[];
  shots: ReelEditingShot[];
  musicAssetId?: string;
  musicAnalysis: MusicBeatAnalysis | null;
  sourceAudio: boolean;
  beatSeconds: number[];
  beatSource: "music" | "reference" | "synthetic";
};

const temporalSchema = z.object({
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
    focalY: z.number().min(0).max(1).default(.5)
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
    reason: z.string().max(220)
  })).min(1).max(8)
});

const musicSchema = z.object({
  durationSeconds: z.number().min(1).max(900),
  bpm: z.number().min(30).max(260).nullable().default(null),
  beatSeconds: z.array(z.number().min(0).max(900)).min(3).max(1200)
});

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

function ffmpegExecutable() {
  if (!ffmpegPath) throw new Error("ffmpeg-static não disponibilizou um binário para analisar a referência do Reel.");
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
      else reject(new Error(`FFmpeg falhou ao preparar referência (${code}): ${stderr.slice(-4000)}`));
    });
  });
}

async function refreshReferenceMediaUrl(reference: InstagramReferencePost) {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("instagram_accounts")
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

    const payload = (await response.json()) as {
      media_url?: string;
      thumbnail_url?: string;
      media_type?: string;
      media_product_type?: string;
    };
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
    if (declaredSize > MAX_REFERENCE_DOWNLOAD_BYTES) return null;
    const mimeType = response.headers.get("content-type")?.split(";")[0] || "video/mp4";
    if (!mimeType.startsWith("video/")) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_REFERENCE_DOWNLOAD_BYTES) return null;
    return { bytes, mimeType };
  }

  const cached = await attempt(reference.mediaUrl);
  if (cached) return { ...cached, refreshed: false };
  const refreshedUrl = await refreshReferenceMediaUrl(reference);
  const refreshed = await attempt(refreshedUrl);
  return refreshed ? { ...refreshed, refreshed: true } : null;
}

async function prepareReferenceVideo(bytes: Uint8Array, mimeType: string) {
  if (bytes.byteLength <= TARGET_REFERENCE_ANALYSIS_BYTES && mimeType === "video/mp4") {
    return { bytes, mimeType, transcoded: false };
  }

  const dir = await mkdtemp(join(tmpdir(), "academy-reel-reference-"));
  const input = join(dir, "input-video");
  const output = join(dir, "analysis.mp4");
  try {
    await writeFile(input, bytes);
    await runFfmpeg([
      "-y",
      "-i", input,
      "-map", "0:v:0",
      "-map", "0:a?",
      "-vf", "scale=480:-2:flags=lanczos,fps=10",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-b:v", "420k",
      "-maxrate", "520k",
      "-bufsize", "1040k",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "48k",
      "-ac", "1",
      "-movflags", "+faststart",
      output
    ]);
    let compact = new Uint8Array(await readFile(output));
    if (compact.byteLength > MAX_INLINE_MEDIA_BYTES) {
      await runFfmpeg([
        "-y",
        "-i", input,
        "-map", "0:v:0",
        "-map", "0:a?",
        "-vf", "scale=360:-2:flags=lanczos,fps=8",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-b:v", "260k",
        "-maxrate", "320k",
        "-bufsize", "640k",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "40k",
        "-ac", "1",
        "-movflags", "+faststart",
        output
      ]);
      compact = new Uint8Array(await readFile(output));
    }
    if (compact.byteLength > MAX_INLINE_MEDIA_BYTES) return null;
    return { bytes: compact, mimeType: "video/mp4", transcoded: true };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function geminiMediaJson<T>(bytes: Uint8Array, mimeType: string, prompt: string, schema: z.ZodType<T>): Promise<T | null> {
  const config = env();
  if (!config.GEMINI_API_KEY || bytes.byteLength > MAX_INLINE_MEDIA_BYTES) return null;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.GEMINI_POST_MODEL)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": config.GEMINI_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [{ text: prompt }, { inlineData: { mimeType, data: Buffer.from(bytes).toString("base64") } }]
      }],
      generationConfig: { responseMimeType: "application/json" }
    }),
    cache: "no-store"
  });
  if (!response.ok) {
    console.warn("[reel-analysis] Gemini media analysis failed", {
      status: response.status,
      body: (await response.text()).slice(0, 800)
    });
    return null;
  }
  const payload = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const raw = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!raw) return null;
  try {
    return schema.parse(JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim()));
  } catch {
    return null;
  }
}

function normalizeReference(value: z.infer<typeof temporalSchema>): ReelReferenceTemporalAnalysis {
  const duration = value.durationSeconds;
  const shots = value.shots
    .map((shot) => ({
      ...shot,
      startSeconds: clamp(shot.startSeconds, 0, duration),
      endSeconds: clamp(shot.endSeconds, 0, duration)
    }))
    .filter((shot) => shot.endSeconds - shot.startSeconds >= .15)
    .sort((a, b) => a.startSeconds - b.startSeconds);
  return {
    analysisMode: "video",
    durationSeconds: duration,
    averageShotSeconds: shots.length
      ? shots.reduce((sum, shot) => sum + shot.endSeconds - shot.startSeconds, 0) / shots.length
      : value.averageShotSeconds,
    rhythm: value.rhythm,
    shots,
    beatSeconds: [...new Set(value.beatSeconds.filter((second) => second > .05 && second <= duration))].sort((a, b) => a - b),
    textCues: value.textCues.filter((cue) => cue.endSeconds > cue.startSeconds && cue.startSeconds <= duration)
  };
}

export async function analyzeInstagramReelReference(reference: InstagramReferencePost): Promise<ReelReferenceTemporalAnalysis | null> {
  const cachedTemporal = reference.visualAnalysis?.temporal;
  if (cachedTemporal && typeof cachedTemporal === "object") {
    const parsed = temporalSchema.safeParse(cachedTemporal);
    if (parsed.success) return { ...normalizeReference(parsed.data), analysisMode: "cached" };
  }

  const isVideo = reference.mediaType === "VIDEO"
    || reference.mediaProductType === "REELS"
    || reference.mediaProductType === "REEL";
  if (!isVideo) return null;

  const downloaded = await fetchReferenceVideo(reference);
  if (!downloaded) return null;
  const prepared = await prepareReferenceVideo(downloaded.bytes, downloaded.mimeType);
  if (!prepared) return null;

  console.info("[reel-reference] temporal media prepared", {
    mediaId: reference.id,
    originalBytes: downloaded.bytes.byteLength,
    analysisBytes: prepared.bytes.byteLength,
    refreshedUrl: downloaded.refreshed,
    transcoded: prepared.transcoded
  });

  const analysis = await geminiMediaJson(
    prepared.bytes,
    prepared.mimeType,
    "Analise temporalmente este Reel REAL da Inteli Academy como referência de edição, sem identificar pessoas. Retorne JSON com a duração total e TODOS os shots/cortes percebidos, preservando a quantidade real de shots, seus boundaries em segundos, ritmo, movimento, energia, transições, ponto focal x/y normalizado, batidas ou acentos audíveis aproximados e janelas de texto. Não compacte uma referência com muitos cortes em uma faixa arbitrária. O objetivo é reproduzir a linguagem temporal da montagem, não copiar o conteúdo.",
    temporalSchema
  );
  return analysis ? normalizeReference(analysis) : null;
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
        score: 68,
        focalX: .5,
        focalY: .5,
        endFocalX: .5,
        endFocalY: .5,
        motion: "low",
        reason: "foto disponível como still; focal point central por fallback"
      }]
    };
  }

  const duration = Math.max(1, mediaDuration(asset));
  const segmentLength = clamp(duration / 5, .5, 4.5);
  const starts = duration <= segmentLength + .1
    ? [0]
    : [.08, .38, .68].map((ratio) => clamp(duration * ratio, 0, Math.max(0, duration - segmentLength)));
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
      score: 70 - index * 3,
      focalX: .5,
      focalY: .5,
      endFocalX: .5,
      endFocalY: .5,
      motion: "medium" as const,
      reason: "fallback limitado pela duração real do arquivo"
    }))
  };
}

async function analyzeOneFootage(asset: DriveAsset): Promise<FootageAnalysis> {
  const image = isImageAsset(asset);
  const duration = image ? STILL_ANALYSIS_DURATION_SECONDS : mediaDuration(asset);
  if ((!image && !duration) || Number(asset.size ?? 0) > MAX_INLINE_MEDIA_BYTES) return fallbackSegments(asset);

  try {
    const { bytes } = await downloadDriveAsset(asset.id);
    const prompt = image
      ? `Analise esta FOTO para uso como shot em um Reel 9:16. Não identifique pessoas. Retorne cameraMovement como "still image" e exatamente 1 bestSegment com startSeconds=0 e endSeconds=${STILL_ANALYSIS_DURATION_SECONDS}, score 0-100, focalX/focalY normalizados no assunto visual mais importante, endFocalX/endFocalY iguais ou levemente deslocados apenas se um pan sutil melhorar a composição, motion="low" e um motivo curto. Avalie composição, nitidez, ação sugerida, presença de marca/ambiente e quantidade de área vazia.`
      : `Analise este vídeo bruto para edição de Reel 9:16. A duração real do Drive é ${duration.toFixed(3)}s. Não identifique pessoas. Escolha 2–6 melhores segmentos com ação/movimento/composição forte, score 0-100, ponto focal INICIAL focalX/focalY e ponto focal FINAL endFocalX/endFocalY normalizados para acompanhar o assunto durante o segmento, nível de movimento e motivo. Nenhum endSeconds pode ultrapassar ${duration.toFixed(3)}.`;
    const analysis = await geminiMediaJson(bytes, asset.mimeType, prompt, footageSchema);
    if (!analysis) return fallbackSegments(asset);

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
  } catch {
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
  await Promise.all(Array.from({ length: Math.min(3, visuals.length) }, () => worker()));
  return results;
}

async function analyzeMusicAsset(asset: DriveAsset): Promise<MusicBeatAnalysis | null> {
  const durationFromDrive = mediaDuration(asset);
  if (!asset.mimeType.startsWith("audio/") || Number(asset.size ?? 0) > MAX_INLINE_MEDIA_BYTES) return null;
  try {
    const { bytes } = await downloadDriveAsset(asset.id);
    const analysis = await geminiMediaJson(
      bytes,
      asset.mimeType,
      `Analise esta faixa de áudio apenas para edição temporal. A duração informada pelo Drive é ${durationFromDrive ? `${durationFromDrive.toFixed(3)}s` : "desconhecida"}. Retorne a duração, BPM aproximado e uma lista de timestamps em segundos dos beats/acentos fortes mais úteis para cortes de vídeo. Não transcreva letra nem conteúdo falado.`,
      musicSchema
    );
    if (!analysis) return null;
    const duration = durationFromDrive || analysis.durationSeconds;
    const beatSeconds = [...new Set(
      analysis.beatSeconds
        .filter((beat) => beat > .05 && beat < duration - .02)
        .map((beat) => Number(beat.toFixed(3)))
    )].sort((a, b) => a - b);
    if (beatSeconds.length < 3) return null;
    return { assetId: asset.id, durationSeconds: duration, bpm: analysis.bpm, beatSeconds, analysisMode: "audio" };
  } catch {
    return null;
  }
}

function referenceDurationPattern(reference: ReelReferenceTemporalAnalysis | null) {
  if (!reference?.shots.length) return [];
  return reference.shots.map((shot) => clamp(shot.endSeconds - shot.startSeconds, .15, 30));
}

function rhythmGrid(target: number, reference: ReelReferenceTemporalAnalysis | null, music: MusicBeatAnalysis | null) {
  const musicBeats = music?.beatSeconds.filter((beat) => beat > .05 && beat < target - .02) ?? [];
  if (musicBeats.length >= 3) return { beats: musicBeats, source: "music" as const };
  const referenceBeats = reference?.beatSeconds.filter((beat) => beat > .05 && beat < target - .02) ?? [];
  if (referenceBeats.length >= 3) return { beats: referenceBeats, source: "reference" as const };
  const step = reference?.averageShotSeconds
    ? clamp(reference.averageShotSeconds, .25, 4)
    : reference?.rhythm === "fast" ? .55 : reference?.rhythm === "slow" ? 1.4 : .85;
  return {
    beats: Array.from({ length: Math.floor(target / step) }, (_, index) => Number(((index + 1) * step).toFixed(3)))
      .filter((beat) => beat < target - .02),
    source: "synthetic" as const
  };
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
    const candidates = beats
      .filter((beat) => beat >= minBoundary && beat <= maxBoundary)
      .sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal));
    const nearest = candidates[0];
    const tolerance = Math.max(.12, Math.min(.42, desired[index] * .3));
    const boundary = nearest !== undefined && Math.abs(nearest - ideal) <= tolerance
      ? nearest
      : clamp(ideal, minBoundary, maxBoundary);
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

function transitionForReference(reference: ReelReferenceTemporalAnalysis | null, index: number): "cut" | "dissolve" {
  const value = reference?.shots[index]?.transition?.toLowerCase() ?? "";
  return /dissolve|fade|cross/.test(value) ? "dissolve" : "cut";
}

export function buildReelEditingPlan(input: {
  assets: DriveAsset[];
  footage: FootageAnalysis[];
  reference: ReelReferenceTemporalAnalysis | null;
  music?: MusicBeatAnalysis | null;
}): ReelEditingPlan {
  const visuals = input.assets.filter(isVisualAsset);
  const videos = visuals.filter(isVideoAsset);
  if (!visuals.length) throw new Error("Reel requer pelo menos um vídeo ou uma imagem.");

  const audio = input.assets.find((asset) => asset.mimeType.startsWith("audio/"));
  if (!videos.length && !audio) {
    throw new Error("Um Reel composto somente por imagens precisa de uma faixa de áudio selecionada.");
  }

  const target = input.reference
    ? clamp(input.reference.durationSeconds, 1, 180)
    : fallbackTargetDuration(visuals.length);
  const pattern = referenceDurationPattern(input.reference);
  const desiredCount = input.reference?.shots.length
    ? clamp(input.reference.shots.length, 1, MAX_REFERENCE_SHOTS)
    : fallbackShotCount(target, visuals.length);
  const fallbackPattern = [.85, 1.15, .72, 1.35, 1, 1.55, .64, 1.22];
  const rawDurations = Array.from({ length: desiredCount }, (_, index) =>
    pattern[index] ?? fallbackPattern[index % fallbackPattern.length]
  );
  const grid = rhythmGrid(target, input.reference, input.music ?? null);
  const durations = grid.source === "music"
    ? snapDurationsToBeats(rawDurations, target, grid.beats)
    : normalizeDurations(rawDurations, target);

  const analyses = input.footage.length ? input.footage : visuals.map(fallbackSegments);
  const byAsset = new Map(input.assets.map((asset) => [asset.id, asset]));
  const allCandidates = analyses
    .flatMap((analysis) => analysis.bestSegments.map((segment) => ({ analysis, segment })))
    .sort((a, b) => {
      const scoreDiff = b.segment.score - a.segment.score;
      if (scoreDiff) return scoreDiff;
      if (a.analysis.analysisMode !== b.analysis.analysisMode) {
        if (a.analysis.analysisMode === "video") return -1;
        if (b.analysis.analysisMode === "video") return 1;
      }
      return (b.segment.endSeconds - b.segment.startSeconds) - (a.segment.endSeconds - a.segment.startSeconds);
    });

  const selectedCandidates: typeof allCandidates = [];
  const seenAssets = new Set<string>();
  for (const candidate of allCandidates) {
    if (seenAssets.has(candidate.analysis.assetId)) continue;
    selectedCandidates.push(candidate);
    seenAssets.add(candidate.analysis.assetId);
    if (selectedCandidates.length >= desiredCount) break;
  }

  if (selectedCandidates.length < desiredCount) {
    for (const candidate of allCandidates) {
      if (selectedCandidates.includes(candidate)) continue;
      selectedCandidates.push(candidate);
      if (selectedCandidates.length >= desiredCount) break;
    }
  }

  if (!selectedCandidates.length) throw new Error("Nenhum visual válido ficou disponível para montar o Reel.");

  const shots: ReelEditingShot[] = [];
  let timelineStart = 0;
  for (let index = 0; index < desiredCount; index += 1) {
    const candidate = selectedCandidates[index % selectedCandidates.length];
    const { analysis, segment } = candidate;
    const asset = byAsset.get(analysis.assetId);
    if (!asset) continue;
    const image = isImageAsset(asset);
    const requestedDuration = Math.max(.12, durations[index]);
    const duration = image
      ? requestedDuration
      : Math.min(requestedDuration, Math.max(.12, analysis.durationSeconds));
    const maxStart = image ? 0 : Math.max(0, analysis.durationSeconds - duration);
    const sourceIn = image ? 0 : clamp(segment.startSeconds, 0, maxStart);
    const sourceOut = image ? duration : Math.min(analysis.durationSeconds, sourceIn + duration);
    const actualDuration = image ? duration : sourceOut - sourceIn;
    if (actualDuration <= .05) continue;

    const stillPan = image && Math.abs(segment.endFocalX - segment.focalX) < .01 && Math.abs(segment.endFocalY - segment.focalY) < .01;
    shots.push({
      id: `shot-${shots.length + 1}`,
      assetId: analysis.assetId,
      timelineStartSeconds: timelineStart,
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
      transition: transitionForReference(input.reference, index),
      reason: `${segment.reason} · score ${segment.score.toFixed(0)}/100 · ${image ? "foto" : "vídeo"} selecionado do pool global · shot ${index + 1}/${desiredCount}${input.reference ? " derivado da estrutura da referência" : " estimado dinamicamente"}`
    });
    timelineStart += actualDuration;
  }

  if (!shots.length) throw new Error("A montagem não produziu nenhum shot executável.");
  const effectiveBeats = grid.beats.filter((beat) => beat <= timelineStart + .05);
  return {
    targetDurationSeconds: timelineStart,
    reference: input.reference,
    footage: analyses,
    shots,
    musicAssetId: audio?.id,
    musicAnalysis: input.music ?? null,
    sourceAudio: !audio && videos.length > 0,
    beatSeconds: effectiveBeats,
    beatSource: grid.source
  };
}

export async function analyzeAndPlanReel(assets: DriveAsset[], references: InstagramReferencePost[]) {
  const selectedReel = references.find((reference) =>
    reference.mediaType === "VIDEO"
    || reference.mediaProductType === "REELS"
    || reference.mediaProductType === "REEL"
  );
  const musicAsset = assets.find((asset) => asset.mimeType.startsWith("audio/"));
  const [reference, footage, music] = await Promise.all([
    selectedReel ? analyzeInstagramReelReference(selectedReel) : Promise.resolve(null),
    analyzeDriveFootage(assets),
    musicAsset ? analyzeMusicAsset(musicAsset) : Promise.resolve(null)
  ]);
  if (selectedReel && !reference) {
    throw new Error("A referência de Reel selecionada não pôde ser analisada temporalmente mesmo após atualizar a mídia e gerar um proxy leve para análise. Tente novamente ou escolha outra referência.");
  }
  if (musicAsset && !music) {
    throw new Error("A faixa de áudio selecionada não pôde ser analisada para detectar beats. Escolha outra faixa ou gere sem música dedicada; o sistema não vai fingir edição no beat.");
  }
  return buildReelEditingPlan({ assets, footage, reference, music });
}
