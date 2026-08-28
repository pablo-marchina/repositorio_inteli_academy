import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ffmpegPath from "ffmpeg-static";
import { apiAdmin } from "@/lib/api-auth";
import { downloadDriveAsset } from "@/lib/google-drive";

export const runtime = "nodejs";
export const maxDuration = 120;

function ffmpegExecutable() {
  if (!ffmpegPath) throw new Error("ffmpeg-static não disponibilizou um binário para o preview do vídeo.");
  return ffmpegPath;
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegExecutable(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-12000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg falhou ao gerar proxy browser-safe (${code}): ${stderr.slice(-5000)}`));
    });
  });
}

function boundedNumber(value: string | null, fallback: number, min: number, max: number) {
  const parsed = value === null ? NaN : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

async function browserSafeVideo(bytes: Uint8Array, startSeconds: number, durationSeconds: number) {
  const dir = await mkdtemp(join(tmpdir(), "academy-browser-preview-"));
  const input = join(dir, "input-video");
  const output = join(dir, "preview.mp4");
  const startedAt = Date.now();
  try {
    await writeFile(input, bytes);
    await runFfmpeg([
      "-y",
      "-hide_banner",
      "-loglevel", "error",
      "-ss", startSeconds.toFixed(3),
      "-i", input,
      "-t", durationSeconds.toFixed(3),
      "-map", "0:v:0",
      "-vf", "scale=360:-2:flags=fast_bilinear,fps=15",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "31",
      "-pix_fmt", "yuv420p",
      "-g", "15",
      "-keyint_min", "15",
      "-sc_threshold", "0",
      "-an",
      "-movflags", "+faststart",
      output
    ]);

    const proxy = new Uint8Array(await readFile(output));
    console.info("[drive-preview] generated shot proxy", {
      inputBytes: bytes.byteLength,
      outputBytes: proxy.byteLength,
      startSeconds,
      durationSeconds,
      elapsedMs: Date.now() - startedAt
    });
    return proxy;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function GET(request: Request, context: { params: Promise<{ fileId: string }> }) {
  if (!(await apiAdmin())) return new Response("Unauthorized", { status: 401 });
  try {
    const { fileId } = await context.params;
    const { asset, bytes } = await downloadDriveAsset(fileId);
    const search = new URL(request.url).searchParams;
    const browserSafe = search.get("browser") === "1";

    if (browserSafe && asset.mimeType.startsWith("video/")) {
      const startSeconds = boundedNumber(search.get("start"), 0, 0, 600);
      // Browser previews are inspection proxies, not export media. Keep them short so
      // 4K/60 HEVC iPhone takes never require transcoding the entire source on Vercel.
      const requestedDuration = boundedNumber(search.get("duration"), 12, 0.1, 30);
      const durationSeconds = Math.min(30, requestedDuration + 0.2);
      const proxy = await browserSafeVideo(bytes, startSeconds, durationSeconds);
      return new Response(proxy, {
        headers: {
          "content-type": "video/mp4",
          "content-length": String(proxy.byteLength),
          "content-disposition": "inline",
          "cache-control": "private, max-age=86400, immutable",
          "x-academy-preview-proxy": "shot-h264",
          "x-academy-preview-start": startSeconds.toFixed(3),
          "x-academy-preview-duration": durationSeconds.toFixed(3)
        }
      });
    }

    return new Response(bytes, {
      headers: {
        "content-type": asset.mimeType,
        "content-length": String(bytes.byteLength),
        "content-disposition": "inline",
        "cache-control": "private, max-age=300"
      }
    });
  } catch (error) {
    console.error("[drive-preview] failed", error);
    return new Response(String(error), { status: 500 });
  }
}
