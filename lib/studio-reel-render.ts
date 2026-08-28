import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import ffmpegPath from "ffmpeg-static";
import { downloadDriveAsset } from "@/lib/google-drive";
import { getCurrentFigmaNodes, getCurrentFigmaRenderUrls, getCurrentFigmaSemanticState } from "@/lib/figma";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewRenderedReelFrames } from "@/lib/studio-brand-critic";
import type { StudioRenderedReel } from "@/lib/studio-render-types";
import type { StructuredStudioPayload, StudioVideoTrack } from "@/lib/studio-artifact";
import type { DriveAsset } from "@/lib/types";

const RENDER_BUCKET = "studio-renders";
const WIDTH = 1080;
const HEIGHT = 1920;

function executable() {
  if (!ffmpegPath) throw new Error("ffmpeg-static não disponibilizou um binário para este runtime.");
  return ffmpegPath;
}

function runFfmpeg(args: string[], allowFailure = false) {
  return new Promise<{ ok: boolean; stderr: string }>((resolve, reject) => {
    const child = spawn(executable(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-12000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const ok = code === 0;
      if (!ok && !allowFailure) reject(new Error(`FFmpeg falhou (${code}): ${stderr.slice(-5000)}`));
      else resolve({ ok, stderr });
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
  if (asset.mimeType.startsWith("image/")) return ".img";
  if (asset.mimeType.includes("mpeg")) return ".mp3";
  if (asset.mimeType.startsWith("audio/")) return ".m4a";
  return ".bin";
}

async function hasAudio(file: string) {
  const result = await runFfmpeg(["-v", "error", "-i", file, "-map", "0:a:0", "-t", "0.02", "-f", "null", "-"], true);
  return result.ok;
}

function mediaTrackWindow(payload: StructuredStudioPayload, role: string) {
  const timeline = payload.artifact!.videoTimeline!;
  const track = timeline.tracks.find((candidate) => candidate.role === role);
  return track ? { start: track.startFrame / timeline.fps, duration: track.durationInFrames / timeline.fps } : null;
}

async function ensureBucket() {
  const admin = createAdminClient();
  const existing = await admin.storage.getBucket(RENDER_BUCKET);
  if (!existing.data) {
    const created = await admin.storage.createBucket(RENDER_BUCKET, { public: true });
    if (created.error && !/already exists/i.test(created.error.message)) throw created.error;
  } else if (!existing.data.public) {
    const updated = await admin.storage.updateBucket(RENDER_BUCKET, { public: true });
    if (updated.error) throw updated.error;
  }
}

type LayerInput = {
  role: string;
  file: string;
  x: number;
  y: number;
  width: number;
  height: number;
  start: number;
  duration: number;
};

async function downloadFigmaLayers(payload: StructuredStudioPayload, frameId: string, dir: string) {
  const [semantic] = await getCurrentFigmaSemanticState([frameId]);
  const timeline = payload.artifact!.videoTimeline!;
  const roles = ["decoration", "brandElement", "mascot", "primaryLogo", "partnerLogo", "eyebrow", "headline", "body"];
  const seenNodeIds = new Set<string>();
  const requests: Array<{
    role: string;
    id: string;
    item: (typeof semantic.roles)[string][number];
    start: number;
    duration: number;
  }> = [];

  for (const role of roles) {
    const window = ["eyebrow", "headline", "body"].includes(role)
      ? mediaTrackWindow(payload, role)
      : { start: 0, duration: timeline.durationInFrames / timeline.fps };
    if (!window) continue;
    for (const item of semantic.roles[role] ?? []) {
      if (!item.id || seenNodeIds.has(item.id) || !item.box || item.box.width < 1 || item.box.height < 1) continue;
      seenNodeIds.add(item.id);
      requests.push({ role, id: item.id, item, start: window.start, duration: window.duration });
    }
  }

  if (!requests.length) return { semantic, layers: [] as LayerInput[] };
  const urls = await getCurrentFigmaRenderUrls(requests.map((request) => request.id), "png");
  const layers: LayerInput[] = [];
  for (let index = 0; index < requests.length; index += 1) {
    const response = await fetch(urls[index], { cache: "no-store" });
    if (!response.ok) throw new Error(`Falha ao baixar layer Figma ${requests[index].role} (${response.status}).`);
    const file = join(dir, `figma-${index}-${requests[index].role}.png`);
    await writeFile(file, new Uint8Array(await response.arrayBuffer()));
    const box = requests[index].item.box!;
    const scaleX = WIDTH / Math.max(1, semantic.frameBox?.width ?? WIDTH);
    const scaleY = HEIGHT / Math.max(1, semantic.frameBox?.height ?? HEIGHT);
    layers.push({
      role: requests[index].role,
      file,
      x: box.x * scaleX,
      y: box.y * scaleY,
      width: box.width * scaleX,
      height: box.height * scaleY,
      start: requests[index].start,
      duration: requests[index].duration
    });
  }
  return { semantic, layers };
}

function visualFilter(track: StudioVideoTrack, inputIndex: number, fps: number, output: string) {
  const duration = Math.max(.001, track.durationInFrames / fps);
  const crop = track.crop ?? { focalX: .5, focalY: .5, endFocalX: .5, endFocalY: .5, zoom: 1 };
  const startX = Math.min(1, Math.max(0, crop.focalX));
  const startY = Math.min(1, Math.max(0, crop.focalY));
  const endX = Math.min(1, Math.max(0, crop.endFocalX ?? crop.focalX));
  const endY = Math.min(1, Math.max(0, crop.endFocalY ?? crop.focalY));
  const dx = endX - startX;
  const dy = endY - startY;
  const zoom = Math.max(1, crop.zoom || 1);
  const scaleWidth = `if(gt(a,0.5625),trunc(1920*a*${zoom.toFixed(4)}/2)*2,trunc(1080*${zoom.toFixed(4)}/2)*2)`;
  const scaleHeight = `if(gt(a,0.5625),trunc(1920*${zoom.toFixed(4)}/2)*2,trunc(1080/a*${zoom.toFixed(4)}/2)*2)`;
  const x = `(iw-${WIDTH})*(${startX.toFixed(5)}+${dx.toFixed(5)}*t/${duration.toFixed(5)})`;
  const y = `(ih-${HEIGHT})*(${startY.toFixed(5)}+${dy.toFixed(5)}*t/${duration.toFixed(5)})`;
  const timing = track.kind === "image"
    ? `trim=duration=${duration.toFixed(4)},setpts=PTS-STARTPTS`
    : `trim=start=${((track.sourceStartFrame ?? 0) / fps).toFixed(4)}:end=${((track.sourceEndFrame ?? ((track.sourceStartFrame ?? 0) + track.durationInFrames)) / fps).toFixed(4)},setpts=PTS-STARTPTS`;
  return `[${inputIndex}:v]${timing},scale='${scaleWidth}':'${scaleHeight}',crop=${WIDTH}:${HEIGHT}:'${x}':'${y}',fps=${fps},settb=AVTB,setsar=1,format=yuv420p[${output}]`;
}

async function renderWithFfmpeg(input: {
  payload: StructuredStudioPayload;
  driveAssets: DriveAsset[];
  frameId: string;
  dir: string;
  output: string;
}) {
  const timeline = input.payload.artifact!.videoTimeline!;
  const footage = timeline.tracks
    .filter((track) => track.role === "footage" && track.assetId)
    .sort((a, b) => a.startFrame - b.startFrame);
  if (!footage.length) throw new Error("Render final recusado: timeline não possui nenhum shot visual executável.");

  const byId = new Map(input.driveAssets.map((asset) => [asset.id, asset]));
  const local = new Map<string, string>();
  const needed = [...new Set(timeline.tracks.flatMap((track) => track.assetId ? [track.assetId] : []))];
  for (const id of needed) {
    const asset = byId.get(id);
    if (!asset) throw new Error(`Asset ${id} não existe mais no projeto.`);
    const downloaded = await downloadDriveAsset(id);
    const file = join(/* turbopackIgnore: true */ input.dir, `${id.replace(/[^a-zA-Z0-9_-]/g, "_")}${assetExtension(asset)}`);
    await writeFile(file, downloaded.bytes);
    local.set(id, file);
  }

  const { layers } = await downloadFigmaLayers(input.payload, input.frameId, input.dir);
  const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];
  const mediaInputIndices: number[] = [];
  let nextInput = 0;
  for (const track of footage) {
    mediaInputIndices.push(nextInput++);
    const file = local.get(track.assetId!)!;
    if (track.kind === "image") {
      args.push("-loop", "1", "-framerate", String(timeline.fps), "-i", file);
    } else {
      args.push("-i", file);
    }
  }

  const music = timeline.tracks.find((track) => track.role === "music" && track.assetId);
  const externalMusic = timeline.tracks.find((track) => track.role === "music" && track.musicDirection);
  let musicInput: number | null = null;
  if (music?.assetId) {
    musicInput = nextInput++;
    args.push("-stream_loop", "-1", "-i", local.get(music.assetId)!);
  }

  const layerInputIndices: number[] = [];
  for (const layer of layers) {
    layerInputIndices.push(nextInput++);
    args.push("-loop", "1", "-framerate", String(timeline.fps), "-i", layer.file);
  }

  const filters: string[] = [];
  footage.forEach((track, index) => {
    filters.push(visualFilter(track, mediaInputIndices[index], timeline.fps, `shotv${index}`));
  });
  if (footage.length === 1) {
    filters.push("[shotv0]null[vcuts]");
  } else {
    filters.push("[shotv0]null[vseq0]");
    let accumulated = footage[0].durationInFrames / timeline.fps;
    const transitionName: Record<NonNullable<StudioVideoTrack["transition"]>, string> = {
      cut: "fade",
      dissolve: "dissolve",
      whip: "slideleft",
      zoom: "zoomin",
      blur: "hblur",
      push: "smoothleft"
    };
    for (let index = 1; index < footage.length; index += 1) {
      const previous = footage[index - 1];
      const current = footage[index];
      const overlapFrames = Math.max(0, previous.startFrame + previous.durationInFrames - current.startFrame);
      const requestedFrames = Math.max(0, current.transitionDurationInFrames ?? overlapFrames);
      const transitionFrames = Math.min(overlapFrames, requestedFrames, Math.floor(previous.durationInFrames * .24), Math.floor(current.durationInFrames * .24));
      const transitionSeconds = transitionFrames / timeline.fps;
      const next = `vseq${index}`;
      if ((current.transition ?? "cut") === "cut" || transitionSeconds < .03) {
        filters.push(`[vseq${index - 1}][shotv${index}]concat=n=2:v=1:a=0[${next}]`);
        accumulated += current.durationInFrames / timeline.fps;
      } else {
        const offset = Math.max(0, accumulated - transitionSeconds);
        filters.push(`[vseq${index - 1}][shotv${index}]xfade=transition=${transitionName[current.transition ?? "dissolve"]}:duration=${transitionSeconds.toFixed(4)}:offset=${offset.toFixed(4)}[${next}]`);
        accumulated += current.durationInFrames / timeline.fps - transitionSeconds;
      }
    }
    filters.push(`[vseq${footage.length - 1}]null[vcuts]`);
  }

  const total = timeline.durationInFrames / timeline.fps;
  if (music && musicInput !== null) {
    const sourceStart = (music.sourceStartFrame ?? 0) / timeline.fps;
    filters.push(`[${musicInput}:a]atrim=start=${sourceStart.toFixed(4)}:duration=${total.toFixed(4)},asetpts=PTS-STARTPTS,aresample=48000,volume=${(music.volume ?? .6).toFixed(3)}[aout]`);
  } else {
    const audioFlags = await Promise.all(footage.map((track) => track.kind === "image" ? Promise.resolve(false) : hasAudio(local.get(track.assetId!)!)));
    if (!audioFlags.some(Boolean)) {
      if (!externalMusic?.musicDirection) throw new Error("Os visuais selecionados não fornecem áudio e não existe direção musical no plano do Reel.");
      console.warn("[reel-render] AI-selected external music is not embedded without a licensed media source", {
        title: externalMusic.musicDirection.title,
        artist: externalMusic.musicDirection.artist,
        searchQuery: externalMusic.musicDirection.searchQuery
      });
      filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${total.toFixed(4)},asetpts=PTS-STARTPTS[aout]`);
    } else {
      footage.forEach((track, index) => {
        const shotDuration = track.durationInFrames / timeline.fps;
        const sourceStart = (track.sourceStartFrame ?? 0) / timeline.fps;
        const sourceEnd = sourceStart + shotDuration;
        if (audioFlags[index]) {
          filters.push(`[${mediaInputIndices[index]}:a]atrim=start=${sourceStart.toFixed(4)}:end=${sourceEnd.toFixed(4)},asetpts=PTS-STARTPTS,aresample=48000,volume=${(track.volume ?? .72).toFixed(3)}[shota${index}]`);
        } else {
          filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${shotDuration.toFixed(4)},asetpts=PTS-STARTPTS[shota${index}]`);
        }
      });
      if (footage.length === 1) filters.push("[shota0]anull[aout]");
      else filters.push(`${footage.map((_, index) => `[shota${index}]`).join("")}concat=n=${footage.length}:v=0:a=1[aout]`);
    }
  }

  let videoLabel = "vcuts";
  layers.forEach((layer, index) => {
    const inputIndex = layerInputIndices[index];
    const prepared = `layer${index}`;
    const next = `vlay${index}`;
    const w = Math.max(1, Math.round(layer.width));
    const h = Math.max(1, Math.round(layer.height));
    const animatedBrand = ["mascot", "brandElement", "primaryLogo", "partnerLogo"].includes(layer.role);
    if (["eyebrow", "headline", "body"].includes(layer.role) || animatedBrand) {
      const fade = Math.min(animatedBrand ? .28 : .18, Math.max(.06, layer.duration / 4));
      filters.push(`[${inputIndex}:v]scale=${w}:${h},format=rgba,trim=duration=${layer.duration.toFixed(4)},setpts=PTS-STARTPTS,fade=t=in:st=0:d=${fade.toFixed(3)}:alpha=1,fade=t=out:st=${Math.max(0, layer.duration - fade).toFixed(3)}:d=${fade.toFixed(3)}:alpha=1,setpts=PTS+${layer.start.toFixed(4)}/TB[${prepared}]`);
    } else {
      filters.push(`[${inputIndex}:v]scale=${w}:${h},format=rgba,trim=duration=${total.toFixed(4)},setpts=PTS-STARTPTS[${prepared}]`);
    }
    const overlayX = layer.role === "mascot"
      ? `'if(lt(t,${(layer.start + .32).toFixed(3)}),${Math.round(layer.x + 120)}-(t-${layer.start.toFixed(3)})*375,${Math.round(layer.x)})'`
      : String(Math.round(layer.x));
    filters.push(`[${videoLabel}][${prepared}]overlay=x=${overlayX}:y=${Math.round(layer.y)}:eof_action=pass:shortest=0[${next}]`);
    videoLabel = next;
  });

  args.push(
    "-filter_complex", filters.join(";"),
    "-map", `[${videoLabel}]`,
    "-map", "[aout]",
    "-r", String(timeline.fps),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    "-t", total.toFixed(4),
    input.output
  );
  await runFfmpeg(args);
}

async function extractQaFrames(video: string, duration: number, dir: string) {
  const ratios = [.04, .24, .48, .72, .93];
  const result: string[] = [];
  for (let index = 0; index < ratios.length; index += 1) {
    const output = join(dir, `qa-${index}.jpg`);
    const time = Math.max(0, Math.min(duration - .04, duration * ratios[index]));
    await runFfmpeg(["-y", "-hide_banner", "-loglevel", "error", "-ss", time.toFixed(3), "-i", video, "-frames:v", "1", "-q:v", "3", output]);
    const bytes = await readFile(output);
    result.push(`data:image/jpeg;base64,${bytes.toString("base64")}`);
  }
  return result;
}

async function uploadRender(projectId: string, versionId: string, output: string, figmaVersion: string | null, duration: number): Promise<StudioRenderedReel> {
  await ensureBucket();
  const bytes = await readFile(output);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const storagePath = `reels/${projectId}/${versionId}/${sha256.slice(0, 20)}.mp4`;
  const admin = createAdminClient();
  const uploaded = await admin.storage.from(RENDER_BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4",
    cacheControl: "3600",
    upsert: true
  });
  if (uploaded.error) throw uploaded.error;
  const publicUrl = admin.storage.from(RENDER_BUCKET).getPublicUrl(storagePath).data.publicUrl;
  return {
    storagePath,
    publicUrl,
    renderedAt: new Date().toISOString(),
    sha256,
    byteSize: bytes.byteLength,
    durationSeconds: duration,
    figmaVersion
  };
}

export async function renderFinalStudioReel(input: {
  projectId: string;
  versionId: string;
  payload: StructuredStudioPayload;
  driveAssets: DriveAsset[];
  frameId: string;
}) {
  const timeline = input.payload.artifact?.videoTimeline;
  if (input.payload.contentType !== "reel" || !timeline || timeline.schemaVersion < 2) {
    throw new Error("Esta versão não possui timeline estruturada de Reel compatível com o renderer atual.");
  }
  if (!input.payload.artifact?.reelQuality?.passed) throw new Error("A timeline não passou pelo QA estrutural.");
  if (!input.payload.artifact.figmaVideoLayout) throw new Error("Sincronize a versão com o Figma antes do render final.");

  const nodePayload = await getCurrentFigmaNodes([input.frameId]);
  const figmaVersion = nodePayload.version ?? null;
  const dir = await mkdtemp(join(tmpdir(), "academy-reel-"));
  try {
    const output = join(dir, "final.mp4");
    await renderWithFfmpeg({
      payload: input.payload,
      driveAssets: input.driveAssets,
      frameId: input.frameId,
      dir,
      output
    });
    const duration = timeline.durationInFrames / timeline.fps;
    const qaFrames = await extractQaFrames(output, duration, dir);
    const [figmaReferenceUrl] = await getCurrentFigmaRenderUrls([input.frameId], "png");
    const report = await reviewRenderedReelFrames({ payload: input.payload, renderedFrames: qaFrames, figmaReferenceUrl });
    if (!report) throw new Error("O crítico visual não conseguiu avaliar o MP4 final.");
    const renderedReel = await uploadRender(input.projectId, input.versionId, output, figmaVersion, duration);
    return { renderedReel, report };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
