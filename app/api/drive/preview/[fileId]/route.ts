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

async function browserSafeVideo(bytes: Uint8Array) {
  const dir = await mkdtemp(join(tmpdir(), "academy-browser-preview-"));
  const input = join(dir, "input-video");
  const output = join(dir, "preview.mp4");
  try {
    await writeFile(input, bytes);
    const common = [
      "-y",
      "-i", input,
      "-map", "0:v:0",
      "-vf", "scale=540:-2:flags=lanczos,fps=24",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "27",
      "-maxrate", "1400k",
      "-bufsize", "2800k",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart"
    ];

    try {
      await runFfmpeg([
        ...common.slice(0, 5),
        "-map", "0:a:0?",
        ...common.slice(5),
        "-c:a", "aac",
        "-b:a", "96k",
        "-ac", "2",
        output
      ]);
    } catch (audioError) {
      console.warn("[drive-preview] browser proxy audio failed; retrying video-only", { error: String(audioError) });
      await runFfmpeg([
        ...common,
        "-an",
        output
      ]);
    }

    return new Uint8Array(await readFile(output));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function GET(request: Request, context: { params: Promise<{ fileId: string }> }) {
  if (!(await apiAdmin())) return new Response("Unauthorized", { status: 401 });
  try {
    const { fileId } = await context.params;
    const { asset, bytes } = await downloadDriveAsset(fileId);
    const browserSafe = new URL(request.url).searchParams.get("browser") === "1";

    if (browserSafe && asset.mimeType.startsWith("video/")) {
      const proxy = await browserSafeVideo(bytes);
      return new Response(proxy, {
        headers: {
          "content-type": "video/mp4",
          "content-length": String(proxy.byteLength),
          "content-disposition": "inline",
          "cache-control": "private, max-age=3600",
          "x-academy-preview-proxy": "h264-aac"
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
