import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ffmpegPath from "ffmpeg-static";

const REEL_REFERENCE_PROMPT_MARKER = "Analise temporalmente este Reel REAL";
const MAX_LOCAL_REFERENCE_BYTES = 24_000_000;
const MAX_REFERENCE_SHOTS = 40;

type GeminiRequestPayload = {
  contents?: Array<{
    parts?: Array<{
      text?: string;
      inlineData?: { mimeType?: string; data?: string };
    }>;
  }>;
};

type TemporalShot = {
  startSeconds: number;
  endSeconds: number;
  motion: "low" | "medium" | "high";
  energy: "low" | "medium" | "high";
  transition: string;
  focalX: number;
  focalY: number;
};

export type LocalTemporalAnalysis = {
  durationSeconds: number;
  averageShotSeconds: number;
  rhythm: "slow" | "medium" | "fast" | "mixed";
  shots: TemporalShot[];
  beatSeconds: number[];
  textCues: Array<{ startSeconds: number; endSeconds: number; density: "light" | "medium" | "heavy"; placement: string }>;
};

function executable() {
  if (!ffmpegPath) throw new Error("ffmpeg-static não disponibilizou um binário para o fallback temporal.");
  return ffmpegPath;
}

function runFfmpegCapture(args: string[]) {
  return new Promise<{ code: number; stderr: string }>((resolve, reject) => {
    const child = spawn(executable(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 500_000) stderr = stderr.slice(-500_000);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, stderr }));
  });
}

function parseDuration(stderr: string) {
  const match = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const total = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(total) && total > 0 ? total : null;
}

function parseSceneTimes(stderr: string, duration: number) {
  const values: number[] = [];
  const matcher = /pts_time:([\d.]+)/g;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(stderr))) {
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value <= .08 || value >= duration - .08) continue;
    values.push(value);
  }
  const sorted = [...new Set(values.map((value) => Number(value.toFixed(3))))].sort((a, b) => a - b);
  const deduped: number[] = [];
  for (const value of sorted) {
    if (!deduped.length || value - deduped[deduped.length - 1] >= .12) deduped.push(value);
  }
  return deduped;
}

function rhythmForDurations(durations: number[]): LocalTemporalAnalysis["rhythm"] {
  const average = durations.reduce((sum, value) => sum + value, 0) / Math.max(1, durations.length);
  const variance = durations.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) / Math.max(1, durations.length);
  const coefficient = average > 0 ? Math.sqrt(variance) / average : 0;
  if (coefficient >= .48 && durations.length >= 4) return "mixed";
  if (average <= .9) return "fast";
  if (average >= 2.2) return "slow";
  return "medium";
}

function shotEnergy(duration: number): TemporalShot["energy"] {
  if (duration <= .75) return "high";
  if (duration <= 1.8) return "medium";
  return "low";
}

function buildAnalysis(duration: number, cuts: number[]): LocalTemporalAnalysis {
  const boundaries = [0, ...cuts.slice(0, MAX_REFERENCE_SHOTS - 1), duration];
  const shots: TemporalShot[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const startSeconds = boundaries[index];
    const endSeconds = boundaries[index + 1];
    const shotDuration = endSeconds - startSeconds;
    if (shotDuration < .1) continue;
    shots.push({
      startSeconds: Number(startSeconds.toFixed(3)),
      endSeconds: Number(endSeconds.toFixed(3)),
      motion: shotDuration <= .7 ? "high" : shotDuration <= 1.8 ? "medium" : "low",
      energy: shotEnergy(shotDuration),
      transition: "cut",
      focalX: .5,
      focalY: .5
    });
  }
  if (!shots.length) {
    shots.push({ startSeconds: 0, endSeconds: duration, motion: "low", energy: "low", transition: "cut", focalX: .5, focalY: .5 });
  }
  const durations = shots.map((shot) => shot.endSeconds - shot.startSeconds);
  return {
    durationSeconds: Number(duration.toFixed(3)),
    averageShotSeconds: Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(3)),
    rhythm: rhythmForDurations(durations),
    shots,
    // Scene boundaries are useful rhythmic accents for the existing planner. They
    // preserve the reference's edit cadence without pretending to be audio beats.
    beatSeconds: shots.slice(1).map((shot) => shot.startSeconds),
    textCues: []
  };
}

async function detectScenes(bytes: Buffer) {
  const dir = await mkdtemp(join(tmpdir(), "academy-local-reel-"));
  const input = join(dir, "reference.mp4");
  try {
    await writeFile(input, bytes);
    const thresholds = [.34, .27, .21, .16];
    let best: { duration: number; cuts: number[] } | null = null;

    for (const threshold of thresholds) {
      const result = await runFfmpegCapture([
        "-hide_banner",
        "-i", input,
        "-vf", `select='gt(scene,${threshold})',showinfo`,
        "-an",
        "-f", "null",
        "-"
      ]);
      const duration = parseDuration(result.stderr);
      if (!duration) continue;
      const cuts = parseSceneTimes(result.stderr, duration);
      best = { duration, cuts };
      if (cuts.length > 0 && cuts.length < MAX_REFERENCE_SHOTS) break;
    }

    if (!best) return null;
    return buildAnalysis(best.duration, best.cuts);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Direct deterministic temporal analysis used by Studio after remote Gemini
 * analysis returns no usable result. This path has no dependency on fetch or a
 * specific remote HTTP status.
 */
export async function analyzeReelTemporalLocally(bytes: Uint8Array | Buffer) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (!buffer.length || buffer.length > MAX_LOCAL_REFERENCE_BYTES) return null;
  try {
    const analysis = await detectScenes(buffer);
    if (!analysis) {
      console.error("[reel-reference] direct local FFmpeg temporal analysis produced no result");
      return null;
    }
    console.warn("[reel-reference] using direct deterministic FFmpeg scene analysis", {
      durationSeconds: analysis.durationSeconds,
      shots: analysis.shots.length
    });
    return analysis;
  } catch (error) {
    console.error("[reel-reference] direct local FFmpeg temporal analysis failed", error);
    return null;
  }
}

function parseReferenceRequest(init?: Parameters<typeof fetch>[1]) {
  if (typeof init?.body !== "string") return null;
  let payload: GeminiRequestPayload;
  try {
    payload = JSON.parse(init.body) as GeminiRequestPayload;
  } catch {
    return null;
  }
  const parts = payload.contents?.flatMap((content) => content.parts ?? []) ?? [];
  const prompt = parts.map((part) => part.text ?? "").join("\n");
  if (!prompt.includes(REEL_REFERENCE_PROMPT_MARKER)) return null;
  const inline = parts.find((part) => part.inlineData)?.inlineData;
  if (!inline?.data || !inline.mimeType?.startsWith("video/")) return null;
  const bytes = Buffer.from(inline.data, "base64");
  if (!bytes.length || bytes.length > MAX_LOCAL_REFERENCE_BYTES) return null;
  return bytes;
}

/**
 * Produces a Gemini-compatible success response for Reel temporal analysis when
 * remote models are unavailable. This remains narrowly scoped to the Instagram
 * Reel temporal-analysis prompt; all other Gemini calls keep normal semantics.
 */
export async function localReelTemporalFallbackResponse(init?: Parameters<typeof fetch>[1]) {
  const bytes = parseReferenceRequest(init);
  if (!bytes) return null;
  const analysis = await analyzeReelTemporalLocally(bytes);
  if (!analysis) return null;
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(analysis) }] } }]
  }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-academy-temporal-fallback": "ffmpeg-scene-detection"
    }
  });
}
