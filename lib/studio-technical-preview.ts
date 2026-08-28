import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import ffmpegPath from "ffmpeg-static";
import { downloadDriveAsset } from "@/lib/google-drive";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StructuredStudioPayload, StudioVideoTrack } from "@/lib/studio-artifact";
import type { DriveAsset } from "@/lib/types";

const PREVIEW_BUCKET = "studio-renders";
const PREVIEW_WIDTH = 360;
const PREVIEW_HEIGHT = 640;
const PREVIEW_FPS = 24;

function executable() {
  if (!ffmpegPath) throw new Error("ffmpeg-static não disponibilizou um binário para o preview técnico.");
  return ffmpegPath;
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-12000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg falhou ao gerar preview técnico (${code}): ${stderr.slice(-5000)}`));
    });
  });
}

function assetExtension(asset: DriveAsset) {
  const existing = extname(asset.name);
  if (existing) return existing;
  if (asset.mimeType.includes("quicktime")) return ".mov";
  if (asset.mimeType.startsWith("video/")) return ".mp4";
  if (asset.mimeType === "image/jpeg") return ".jpg";
  if (asset.mimeType === "image/png") return ".png";
  if (asset.mimeType === "image/webp") return ".webp";
  return ".bin";
}

async function ensureBucket() {
  const admin = createAdminClient();
  const existing = await admin.storage.getBucket(PREVIEW_BUCKET);
  if (!existing.data) {
    const created = await admin.storage.createBucket(PREVIEW_BUCKET, { public: true });
    if (created.error && !/already exists/i.test(created.error.message)) throw created.error;
  } else if (!existing.data.public) {
    const updated = await admin.storage.updateBucket(PREVIEW_BUCKET, { public: true });
    if (updated.error) throw updated.error;
  }
}

function previewFingerprint(payload: StructuredStudioPayload) {
  const timeline = payload.artifact?.videoTimeline;
  if (!timeline) return "missing";
  const material = timeline.tracks
    .filter((track) => track.role === "footage")
    .map((track) => ({
      id: track.id,
      assetId: track.assetId,
      kind: track.kind,
      startFrame: track.startFrame,
      durationInFrames: track.durationInFrames,
      sourceStartFrame: track.sourceStartFrame,
      sourceEndFrame: track.sourceEndFrame,
      crop: track.crop,
      transition: track.transition
    }));
  return crypto.createHash("sha256").update(JSON.stringify({ fps: timeline.fps, material })).digest("hex");
}

function videoFilter(track: StudioVideoTrack, index: number, timelineFps: number, label: string) {
  const duration = Math.max(.05, track.durationInFrames / timelineFps);
  const crop = track.crop ?? { focalX: .5, focalY: .5, endFocalX: .5, endFocalY: .5, zoom: 1 };
  const startX = Math.min(1, Math.max(0, crop.focalX));
  const startY = Math.min(1, Math.max(0, crop.focalY));
  const endX = Math.min(1, Math.max(0, crop.endFocalX ?? crop.focalX));
  const endY = Math.min(1, Math.max(0, crop.endFocalY ?? crop.focalY));
  const dx = endX - startX;
  const dy = endY - startY;
  const zoom = Math.max(1, crop.zoom || 1);
  const targetRatio = PREVIEW_WIDTH / PREVIEW_HEIGHT;
  const scaledWidth = `if(gt(a,${targetRatio.toFixed(6)}),trunc(${PREVIEW_HEIGHT}*a*${zoom.toFixed(4)}/2)*2,trunc(${PREVIEW_WIDTH}*${zoom.toFixed(4)}/2)*2)`;
  const scaledHeight = `if(gt(a,${targetRatio.toFixed(6)}),trunc(${PREVIEW_HEIGHT}*${zoom.toFixed(4)}/2)*2,trunc(${PREVIEW_WIDTH}/a*${zoom.toFixed(4)}/2)*2)`;
  const x = `(iw-${PREVIEW_WIDTH})*(${startX.toFixed(5)}+${dx.toFixed(5)}*t/${duration.toFixed(5)})`;
  const y = `(ih-${PREVIEW_HEIGHT})*(${startY.toFixed(5)}+${dy.toFixed(5)}*t/${duration.toFixed(5)})`;
  return `[${index}:v]setpts=PTS-STARTPTS,scale='${scaledWidth}':'${scaledHeight}',crop=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:'${x}':'${y}',fps=${PREVIEW_FPS},setsar=1,format=yuv420p[${label}]`;
}

export type StudioTechnicalPreview = {
  publicUrl: string;
  storagePath: string;
  byteSize: number;
  durationSeconds: number;
  cacheHit: boolean;
  fingerprint: string;
};

export async function renderTechnicalStudioPreview(input: {
  projectId: string;
  versionId: string;
  payload: StructuredStudioPayload;
  driveAssets: DriveAsset[];
}): Promise<StudioTechnicalPreview> {
  const timeline = input.payload.artifact?.videoTimeline;
  if (input.payload.contentType !== "reel" || !timeline) throw new Error("Esta versão não possui uma timeline de Reel.");
  const footage = timeline.tracks
    .filter((track) => track.role === "footage" && track.assetId)
    .sort((a, b) => a.startFrame - b.startFrame);
  if (!footage.length) throw new Error("A timeline não possui shots visuais para pré-visualização.");

  await ensureBucket();
  const fingerprint = previewFingerprint(input.payload);
  const fileName = `${fingerprint.slice(0, 24)}.mp4`;
  const folder = `previews/${input.projectId}/${input.versionId}`;
  const storagePath = `${folder}/${fileName}`;
  const admin = createAdminClient();
  const listed = await admin.storage.from(PREVIEW_BUCKET).list(folder, { search: fileName, limit: 5 });
  if (!listed.error && listed.data?.some((item) => item.name === fileName)) {
    const publicUrl = admin.storage.from(PREVIEW_BUCKET).getPublicUrl(storagePath).data.publicUrl;
    return {
      publicUrl,
      storagePath,
      byteSize: Number(listed.data.find((item) => item.name === fileName)?.metadata?.size ?? 0),
      durationSeconds: timeline.durationInFrames / timeline.fps,
      cacheHit: true,
      fingerprint
    };
  }

  const byId = new Map(input.driveAssets.map((asset) => [asset.id, asset]));
  const neededIds = [...new Set(footage.map((track) => track.assetId!).filter(Boolean))];
  const dir = await mkdtemp(join(tmpdir(), "academy-technical-preview-"));
  try {
    const local = new Map<string, string>();
    let cursor = 0;
    async function worker() {
      while (cursor < neededIds.length) {
        const id = neededIds[cursor++];
        const asset = byId.get(id);
        if (!asset) throw new Error(`Asset ${id} não existe mais no projeto.`);
        const downloaded = await downloadDriveAsset(id);
        const file = join(dir, `${id.replace(/[^a-zA-Z0-9_-]/g, "_")}${assetExtension(asset)}`);
        await writeFile(file, downloaded.bytes);
        local.set(id, file);
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, neededIds.length) }, () => worker()));

    const output = join(dir, "technical-preview.mp4");
    const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];
    footage.forEach((track) => {
      const file = local.get(track.assetId!)!;
      const duration = Math.max(.05, track.durationInFrames / timeline.fps);
      if (track.kind === "image") {
        args.push("-loop", "1", "-framerate", String(PREVIEW_FPS), "-t", duration.toFixed(4), "-i", file);
      } else {
        const sourceStart = Math.max(0, (track.sourceStartFrame ?? 0) / timeline.fps);
        args.push("-ss", sourceStart.toFixed(4), "-t", duration.toFixed(4), "-i", file);
      }
    });

    const filters = footage.map((track, index) => videoFilter(track, index, timeline.fps, `shot${index}`));
    if (footage.length === 1) filters.push("[shot0]null[vout]");
    else filters.push(`${footage.map((_, index) => `[shot${index}]`).join("")}concat=n=${footage.length}:v=1:a=0[vout]`);

    const total = timeline.durationInFrames / timeline.fps;
    args.push(
      "-filter_complex", filters.join(";"),
      "-map", "[vout]",
      "-an",
      "-r", String(PREVIEW_FPS),
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "27",
      "-maxrate", "1200k",
      "-bufsize", "2400k",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-t", total.toFixed(4),
      output
    );
    await runFfmpeg(args);

    const bytes = await readFile(output);
    const uploaded = await admin.storage.from(PREVIEW_BUCKET).upload(storagePath, bytes, {
      contentType: "video/mp4",
      cacheControl: "86400",
      upsert: true
    });
    if (uploaded.error) throw uploaded.error;
    const publicUrl = admin.storage.from(PREVIEW_BUCKET).getPublicUrl(storagePath).data.publicUrl;
    return {
      publicUrl,
      storagePath,
      byteSize: bytes.byteLength,
      durationSeconds: total,
      cacheHit: false,
      fingerprint
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
