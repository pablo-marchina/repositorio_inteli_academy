import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import ffmpegPath from "ffmpeg-static";
import { downloadDriveAsset } from "@/lib/google-drive";
import { createAdminClient } from "@/lib/supabase/admin";
import { compileStudioArtifact, type StructuredStudioPayload, type StudioBrandReport } from "@/lib/studio-artifact";
import type { FootageAnalysis, ReelEditingPlan, ReelEditingShot } from "@/lib/studio-reel-analysis";
import type { DriveAsset, StudioPayload } from "@/lib/types";

const STYLE_MATCH_VERSION = 1;
const SIGNATURE_WIDTH = 24;
const SIGNATURE_HEIGHT = 42;
const GRID_X = 4;
const GRID_Y = 7;
const MICRO_TAIL_SECONDS = .35;

type VisualSignature = number[];

type StyleMatchMeta = {
  version: number;
  method: "local-frame-signature";
  averageSimilarity: number;
  matchedShots: number;
  referenceShots: number;
  removedMicroTail: boolean;
  matchedAt: string;
};

type StyleMatchedPlan = ReelEditingPlan & { styleMatch?: StyleMatchMeta };

type Candidate = {
  analysis: FootageAnalysis;
  segment: FootageAnalysis["bestSegments"][number];
  signature: VisualSignature;
};

function executable() {
  if (!ffmpegPath) throw new Error("ffmpeg-static não disponibilizou um binário para matching visual.");
  return ffmpegPath;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

function captureFrame(file: string, timeSeconds: number) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const args = [
      "-hide_banner", "-loglevel", "error",
      "-ss", Math.max(0, timeSeconds).toFixed(4),
      "-i", file,
      "-frames:v", "1",
      "-vf", `scale=${SIGNATURE_WIDTH}:${SIGNATURE_HEIGHT}:flags=area,format=rgb24`,
      "-pix_fmt", "rgb24",
      "-f", "rawvideo",
      "pipe:1"
    ];
    const child = spawn(executable(), args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-6000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`FFmpeg não extraiu frame para matching (${code}): ${stderr.slice(-3000)}`));
      const bytes = Buffer.concat(chunks);
      const expected = SIGNATURE_WIDTH * SIGNATURE_HEIGHT * 3;
      if (bytes.byteLength < expected) return reject(new Error("Frame de matching retornou dados incompletos."));
      resolve(new Uint8Array(bytes.subarray(0, expected)));
    });
  });
}

function signatureFromRgb(bytes: Uint8Array): VisualSignature {
  const cellW = SIGNATURE_WIDTH / GRID_X;
  const cellH = SIGNATURE_HEIGHT / GRID_Y;
  const values: number[] = [];
  const luma = new Float64Array(SIGNATURE_WIDTH * SIGNATURE_HEIGHT);
  for (let y = 0; y < SIGNATURE_HEIGHT; y += 1) {
    for (let x = 0; x < SIGNATURE_WIDTH; x += 1) {
      const offset = (y * SIGNATURE_WIDTH + x) * 3;
      const r = bytes[offset] / 255;
      const g = bytes[offset + 1] / 255;
      const b = bytes[offset + 2] / 255;
      luma[y * SIGNATURE_WIDTH + x] = r * .2126 + g * .7152 + b * .0722;
    }
  }

  for (let gy = 0; gy < GRID_Y; gy += 1) {
    for (let gx = 0; gx < GRID_X; gx += 1) {
      const x0 = Math.round(gx * cellW);
      const x1 = Math.round((gx + 1) * cellW);
      const y0 = Math.round(gy * cellH);
      const y1 = Math.round((gy + 1) * cellH);
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let edgeSum = 0;
      let count = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const offset = (y * SIGNATURE_WIDTH + x) * 3;
          rSum += bytes[offset] / 255;
          gSum += bytes[offset + 1] / 255;
          bSum += bytes[offset + 2] / 255;
          const current = luma[y * SIGNATURE_WIDTH + x];
          if (x + 1 < SIGNATURE_WIDTH) edgeSum += Math.abs(current - luma[y * SIGNATURE_WIDTH + x + 1]);
          if (y + 1 < SIGNATURE_HEIGHT) edgeSum += Math.abs(current - luma[(y + 1) * SIGNATURE_WIDTH + x]);
          count += 1;
        }
      }
      values.push(rSum / count, gSum / count, bSum / count, clamp(edgeSum / (count * 2), 0, 1));
    }
  }

  let mean = 0;
  for (const value of luma) mean += value;
  mean /= luma.length;
  let variance = 0;
  for (const value of luma) variance += (value - mean) ** 2;
  variance /= luma.length;
  values.push(mean, clamp(Math.sqrt(variance) * 2, 0, 1));
  return values;
}

async function signatureAt(file: string, timeSeconds: number) {
  return signatureFromRgb(await captureFrame(file, timeSeconds));
}

function similarity(a: VisualSignature, b: VisualSignature) {
  const length = Math.min(a.length, b.length);
  if (!length) return 0;
  let square = 0;
  for (let index = 0; index < length; index += 1) square += (a[index] - b[index]) ** 2;
  const rms = Math.sqrt(square / length);
  return clamp(1 - rms / .55, 0, 1);
}

function transition(value: string): "cut" | "dissolve" {
  return /dissolve|fade|cross/i.test(value) ? "dissolve" : "cut";
}

function styleCheck(meta: StyleMatchMeta): StudioBrandReport["checks"][number] {
  const passed = meta.averageSimilarity >= .42;
  return {
    id: "reference-visual-style",
    label: "Composição visual segue a referência",
    passed,
    severity: passed ? "warning" : "error",
    detail: `${meta.matchedShots}/${meta.referenceShots} shots foram remapeados por comparação direta de frames; similaridade visual média ${(meta.averageSimilarity * 100).toFixed(0)}%.${meta.removedMicroTail ? " O micro-shot residual no fim da referência foi removido." : ""}`
  };
}

function withStyleQuality(report: StudioBrandReport | undefined, meta: StyleMatchMeta): StudioBrandReport | undefined {
  if (!report) return report;
  const check = styleCheck(meta);
  const checks = [...report.checks.filter((item) => item.id !== check.id), check];
  const issues = [...(report.issues ?? []).filter((item) => !/similaridade visual média/i.test(item))];
  if (!check.passed) issues.push(check.detail);
  const hardFailure = checks.some((item) => !item.passed && item.severity === "error");
  const score = Math.max(0, Math.min(report.score, Math.round(55 + meta.averageSimilarity * 45)));
  return { ...report, checks, issues, score, passed: !hardFailure && score >= 80 };
}

async function downloadReferenceVideo(url: string, output: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`A mídia da referência não pôde ser baixada (${response.status}).`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("video/")) throw new Error("A referência selecionada não retornou um vídeo.");
  await writeFile(output, new Uint8Array(await response.arrayBuffer()));
}

function keepReferenceShots(plan: ReelEditingPlan) {
  const source = [...(plan.reference?.shots ?? [])];
  let removedMicroTail = false;
  while (source.length > 1) {
    const last = source[source.length - 1];
    const duration = last.endSeconds - last.startSeconds;
    if (duration >= MICRO_TAIL_SECONDS) break;
    const meaningfulSemantic = plan.reference?.semanticAvailable && ["closing", "brand"].includes(last.shotType);
    if (meaningfulSemantic) break;
    source.pop();
    removedMicroTail = true;
  }
  return { shots: source, removedMicroTail };
}

export async function rematchStudioVersionToReference(projectId: string, versionId: string) {
  const admin = createAdminClient();
  const [{ data: project, error: projectError }, { data: version, error: versionError }] = await Promise.all([
    admin.from("content_projects")
      .select("drive_assets,instagram_reference_media_id,instagram_reference_media_ids")
      .eq("id", projectId)
      .single(),
    admin.from("content_versions")
      .select("payload,figma_frame_ids")
      .eq("id", versionId)
      .eq("project_id", projectId)
      .single()
  ]);
  if (projectError) throw projectError;
  if (versionError) throw versionError;

  const payload = version.payload as StructuredStudioPayload;
  const originalPlan = payload.artifact?.reelPlan as StyleMatchedPlan | undefined;
  if (payload.contentType !== "reel" || !originalPlan?.reference?.shots.length) {
    return { changed: false, reason: "no-reference" as const };
  }
  if (originalPlan.styleMatch?.version === STYLE_MATCH_VERSION) {
    return { changed: false, reason: "already-matched" as const, styleMatch: originalPlan.styleMatch };
  }

  const referenceIds = Array.isArray(project.instagram_reference_media_ids)
    ? project.instagram_reference_media_ids.map(String)
    : [];
  const referenceId = String(project.instagram_reference_media_id ?? referenceIds[0] ?? "");
  if (!referenceId) return { changed: false, reason: "no-reference-id" as const };
  const { data: referenceRow, error: referenceError } = await admin
    .from("instagram_reference_posts")
    .select("media_url")
    .eq("id", referenceId)
    .maybeSingle();
  if (referenceError) throw referenceError;
  if (!referenceRow?.media_url) return { changed: false, reason: "reference-url-unavailable" as const };

  const driveAssets = Array.isArray(project.drive_assets) ? (project.drive_assets as DriveAsset[]) : [];
  const byAsset = new Map(driveAssets.map((asset) => [asset.id, asset]));
  const analyses = originalPlan.footage.filter((analysis) => byAsset.has(analysis.assetId) && analysis.analysisMode !== "metadata-fallback");
  if (!analyses.length) return { changed: false, reason: "no-visual-analysis" as const };

  const { shots: referenceShots, removedMicroTail } = keepReferenceShots(originalPlan);
  if (!referenceShots.length) return { changed: false, reason: "no-reference-shots" as const };

  const dir = await mkdtemp(join(tmpdir(), "academy-reference-style-"));
  try {
    const referenceFile = join(dir, "reference.mp4");
    await downloadReferenceVideo(String(referenceRow.media_url), referenceFile);

    const neededAssets = analyses.map((analysis) => byAsset.get(analysis.assetId)!).filter(Boolean);
    const local = new Map<string, string>();
    let cursor = 0;
    async function worker() {
      while (cursor < neededAssets.length) {
        const asset = neededAssets[cursor++];
        if (local.has(asset.id)) continue;
        const downloaded = await downloadDriveAsset(asset.id);
        const file = join(dir, `${asset.id.replace(/[^a-zA-Z0-9_-]/g, "_")}${assetExtension(asset)}`);
        await writeFile(file, downloaded.bytes);
        local.set(asset.id, file);
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, neededAssets.length) }, () => worker()));

    const referenceSignatures: VisualSignature[] = [];
    for (const shot of referenceShots) {
      referenceSignatures.push(await signatureAt(referenceFile, (shot.startSeconds + shot.endSeconds) / 2));
    }

    const candidates: Candidate[] = [];
    let analysisCursor = 0;
    async function signatureWorker() {
      while (analysisCursor < analyses.length) {
        const analysis = analyses[analysisCursor++];
        const file = local.get(analysis.assetId);
        if (!file) continue;
        for (const segment of analysis.bestSegments) {
          try {
            const midpoint = clamp((segment.startSeconds + segment.endSeconds) / 2, 0, Math.max(0, analysis.durationSeconds - .02));
            candidates.push({ analysis, segment, signature: await signatureAt(file, midpoint) });
          } catch (error) {
            console.warn("[reference-style] candidate signature failed", { assetId: analysis.assetId, error: String(error) });
          }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, analyses.length) }, () => signatureWorker()));
    if (!candidates.length) return { changed: false, reason: "no-signatures" as const };

    const usedAssets = new Map<string, number>();
    const selectedSignatures: VisualSignature[] = [];
    const similarities: number[] = [];
    const rematchedShots: ReelEditingShot[] = [];
    let timelineStart = 0;

    for (let index = 0; index < referenceShots.length; index += 1) {
      const referenceShot = referenceShots[index];
      const referenceSignature = referenceSignatures[index];
      const requestedDuration = Math.max(.12, referenceShot.endSeconds - referenceShot.startSeconds);
      const previousReference = index > 0 ? referenceSignatures[index - 1] : undefined;
      const previousSelected = selectedSignatures[index - 1];

      const ranked = candidates.map((candidate) => {
        const direct = similarity(candidate.signature, referenceSignature);
        const available = candidate.segment.endSeconds - candidate.segment.startSeconds;
        let score = direct * 100 + candidate.segment.score * .12;
        score -= (usedAssets.get(candidate.analysis.assetId) ?? 0) * 38;
        if (available + .04 < requestedDuration) score -= Math.min(35, (requestedDuration - available) * 8);
        if (candidate.segment.motion === referenceShot.motion) score += 5;
        if (candidate.segment.energy === referenceShot.energy) score += 4;

        if (previousReference && previousSelected) {
          const referenceDelta = 1 - similarity(previousReference, referenceSignature);
          const candidateDelta = 1 - similarity(previousSelected, candidate.signature);
          score -= Math.abs(referenceDelta - candidateDelta) * 65;
          if (referenceDelta > .11 && candidateDelta < .055) score -= 26;
        }
        for (const chosen of selectedSignatures) {
          const duplicateSimilarity = similarity(chosen, candidate.signature);
          if (duplicateSimilarity > .94) score -= (duplicateSimilarity - .94) * 300 + 18;
        }
        return { candidate, direct, score };
      }).sort((a, b) => b.score - a.score);

      const selected = ranked[0];
      if (!selected) continue;
      const { analysis, segment } = selected.candidate;
      const asset = byAsset.get(analysis.assetId);
      if (!asset) continue;
      const image = asset.mimeType.startsWith("image/");
      const duration = image ? requestedDuration : Math.min(requestedDuration, Math.max(.12, analysis.durationSeconds));
      const maxStart = image ? 0 : Math.max(0, analysis.durationSeconds - duration);
      const segmentMid = (segment.startSeconds + segment.endSeconds) / 2;
      const sourceIn = image ? 0 : clamp(segmentMid - duration / 2, 0, maxStart);
      const sourceOut = image ? duration : Math.min(analysis.durationSeconds, sourceIn + duration);
      const actualDuration = image ? duration : sourceOut - sourceIn;
      if (actualDuration <= .05) continue;

      rematchedShots.push({
        id: `shot-${rematchedShots.length + 1}`,
        assetId: analysis.assetId,
        timelineStartSeconds: timelineStart,
        sourceInSeconds: sourceIn,
        sourceOutSeconds: sourceOut,
        durationSeconds: actualDuration,
        crop: {
          focalX: clamp(segment.focalX, .05, .95),
          focalY: clamp(segment.focalY, .05, .95),
          endFocalX: clamp(segment.endFocalX, .05, .95),
          endFocalY: clamp(segment.endFocalY, .05, .95),
          zoom: image ? 1.04 : analysis.width && analysis.height && analysis.width > analysis.height ? 1.08 : 1
        },
        transition: transition(referenceShot.transition),
        semantic: {
          shotType: segment.shotType,
          framing: segment.framing,
          sceneType: segment.sceneType,
          subject: segment.subject,
          motion: segment.motion,
          energy: segment.energy
        },
        referenceSemantic: {
          shotType: referenceShot.shotType,
          framing: referenceShot.framing,
          sceneType: referenceShot.sceneType,
          subject: referenceShot.subject,
          motion: referenceShot.motion,
          energy: referenceShot.energy
        },
        reason: `${segment.reason} · matching local por pixels ${(selected.direct * 100).toFixed(0)}% · shot ${index + 1}/${referenceShots.length} alinhado à composição da referência`
      });
      timelineStart += actualDuration;
      usedAssets.set(analysis.assetId, (usedAssets.get(analysis.assetId) ?? 0) + 1);
      selectedSignatures.push(selected.candidate.signature);
      similarities.push(selected.direct);
    }

    if (!rematchedShots.length) return { changed: false, reason: "no-rematched-shots" as const };
    const averageSimilarity = similarities.reduce((sum, value) => sum + value, 0) / similarities.length;
    const meta: StyleMatchMeta = {
      version: STYLE_MATCH_VERSION,
      method: "local-frame-signature",
      averageSimilarity,
      matchedShots: rematchedShots.length,
      referenceShots: referenceShots.length,
      removedMicroTail,
      matchedAt: new Date().toISOString()
    };
    const reference = {
      ...originalPlan.reference,
      shots: referenceShots,
      durationSeconds: timelineStart,
      averageShotSeconds: timelineStart / referenceShots.length,
      beatSeconds: originalPlan.reference.beatSeconds.filter((value) => value <= timelineStart + .02),
      textCues: originalPlan.reference.textCues.filter((cue) => cue.startSeconds < timelineStart && cue.endSeconds <= timelineStart + .2)
    };
    const nextPlan: StyleMatchedPlan = {
      ...originalPlan,
      reference,
      shots: rematchedShots,
      targetDurationSeconds: timelineStart,
      beatSeconds: originalPlan.beatSeconds.filter((value) => value <= timelineStart + .02),
      styleMatch: meta
    };

    const frameIds = Array.isArray(version.figma_frame_ids) ? version.figma_frame_ids.map(String) : [];
    const compiled = compileStudioArtifact(payload as StudioPayload, {
      driveAssets,
      previousPayload: payload,
      baseFigmaFrameIds: frameIds,
      reelPlan: nextPlan
    });
    if (compiled.artifact) {
      compiled.artifact.reelQuality = withStyleQuality(compiled.artifact.reelQuality, meta);
      if (payload.artifact?.figmaVideoLayout) compiled.artifact.figmaVideoLayout = payload.artifact.figmaVideoLayout;
      if (payload.artifact?.visualBrandReview) compiled.artifact.visualBrandReview = payload.artifact.visualBrandReview;
      compiled.artifact.renderQa = undefined;
    }

    const { error: updateError } = await admin
      .from("content_versions")
      .update({ payload: compiled })
      .eq("id", versionId)
      .eq("project_id", projectId);
    if (updateError) throw updateError;

    console.info("[reference-style] rematched version", {
      projectId,
      versionId,
      shots: rematchedShots.length,
      averageSimilarity: Number(averageSimilarity.toFixed(3)),
      removedMicroTail
    });
    return { changed: true, styleMatch: meta };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
