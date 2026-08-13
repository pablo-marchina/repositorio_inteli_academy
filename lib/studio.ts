import { z } from "zod";
import { signPublicAsset } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getCurrentFigmaRenderUrls, getCurrentFigmaSemanticState } from "@/lib/figma";
import { getDriveAsset } from "@/lib/google-drive";
import {
  fetchInstagramPermalink,
  listInstagramMedia,
  publishCarousel,
  publishReel,
  publishSingleImage,
  publishStory
} from "@/lib/instagram";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  analyzeInstagramReferenceVisual,
  generateStudioPayload,
  reviseStudioPayload,
  studioPayloadSchema,
  type StudioArticleEvidence
} from "@/lib/studio-ai";
import {
  attachFigmaBindings,
  compileStudioArtifact,
  getStudioArtifact,
  type StructuredStudioPayload
} from "@/lib/studio-artifact";
import { reviewFigmaBrandFidelity } from "@/lib/studio-brand-critic";
import type {
  DriveAsset,
  InstagramAccount,
  InstagramReferencePost,
  StudioContentType,
  StudioPayload
} from "@/lib/types";

const createSchema = z.object({
  contentType: z.enum(["single", "carousel", "reel", "story"]),
  articleIds: z.array(z.string().uuid()).max(12).default([]),
  userContext: z.string().max(6000).default(""),
  instagramReferenceMediaIds: z.array(z.string().min(1)).max(8).default([]),
  instagramReferenceMediaId: z.string().min(1).nullable().optional(),
  useDrive: z.boolean().default(false),
  driveAssetIds: z.array(z.string().min(1)).max(12).default([])
});

function asInstagramAccount(row: Record<string, unknown>): InstagramAccount {
  return {
    id: String(row.id),
    instagramUserId: String(row.instagram_user_id),
    username: String(row.username),
    accountType: row.account_type ? String(row.account_type) : null,
    accessTokenEncrypted: String(row.access_token_encrypted),
    tokenExpiresAt: row.token_expires_at ? String(row.token_expires_at) : null
  };
}

async function activeInstagramAccount() {
  const { data, error } = await createAdminClient()
    .from("instagram_accounts")
    .select("id,instagram_user_id,username,account_type,access_token_encrypted,token_expires_at")
    .eq("is_active", true)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Instagram ainda não está conectado.");
  return asInstagramAccount(data as Record<string, unknown>);
}

function mapReference(row: Record<string, unknown>): InstagramReferencePost {
  return {
    id: String(row.id),
    mediaType: String(row.media_type ?? "UNKNOWN"),
    mediaProductType: row.media_product_type ? String(row.media_product_type) : null,
    caption: String(row.caption ?? ""),
    permalink: String(row.permalink ?? ""),
    mediaUrl: row.media_url ? String(row.media_url) : null,
    thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : null,
    timestamp: String(row.media_timestamp),
    children: Array.isArray(row.children) ? (row.children as Array<Record<string, unknown>>) : [],
    visualAnalysis: row.visual_analysis && typeof row.visual_analysis === "object"
      ? (row.visual_analysis as Record<string, unknown>)
      : undefined
  };
}

export async function syncInstagramReferences() {
  const admin = createAdminClient();
  const account = await activeInstagramAccount();
  const media = await listInstagramMedia(account, 80);
  if (media.length) {
    const { error } = await admin.from("instagram_reference_posts").upsert(media.map((item) => ({
      id: item.id,
      account_id: account.id,
      media_type: item.mediaType,
      media_product_type: item.mediaProductType,
      caption: item.caption,
      permalink: item.permalink,
      media_url: item.mediaUrl,
      thumbnail_url: item.thumbnailUrl,
      media_timestamp: item.timestamp,
      children: item.children,
      synced_at: new Date().toISOString()
    })), { onConflict: "id" });
    if (error) throw error;
  }
  return { synced: media.length, username: account.username };
}

async function getReference(mediaId: string) {
  const admin = createAdminClient();
  const initial = await admin.from("instagram_reference_posts").select("*").eq("id", mediaId).maybeSingle();
  if (initial.error) throw initial.error;
  let data = initial.data;
  if (!data) {
    await syncInstagramReferences();
    const retry = await admin.from("instagram_reference_posts").select("*").eq("id", mediaId).maybeSingle();
    if (retry.error) throw retry.error;
    data = retry.data;
  }
  if (!data) throw new Error("Um dos posts de referência do Instagram não foi encontrado após sincronização.");
  const reference = mapReference(data as Record<string, unknown>);
  const visualAnalysis = await analyzeInstagramReferenceVisual(reference);
  if (visualAnalysis && (!reference.visualAnalysis || !Object.keys(reference.visualAnalysis).length)) {
    await admin.from("instagram_reference_posts").update({ visual_analysis: visualAnalysis }).eq("id", reference.id);
    reference.visualAnalysis = visualAnalysis;
  }
  return reference;
}

async function getReferences(mediaIds: string[]) {
  const unique = [...new Set(mediaIds)].slice(0, 8);
  if (!unique.length) return [] as InstagramReferencePost[];
  return Promise.all(unique.map((mediaId) => getReference(mediaId)));
}

async function historicalInstagramGuidance() {
  const { data, error } = await createAdminClient()
    .from("instagram_reference_posts")
    .select("media_type,media_product_type,caption,media_timestamp,visual_analysis")
    .order("media_timestamp", { ascending: false })
    .limit(60);
  if (error) throw error;
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (!rows.length) return "Histórico ainda não sincronizado. Preserve a identidade do Figma e priorize clareza.";
  const formats = new Map<string, number>();
  const captionLengths: number[] = [];
  const hashtags = new Map<string, number>();
  const analyzed: string[] = [];
  for (const row of rows) {
    const format = String(row.media_product_type ?? row.media_type ?? "UNKNOWN");
    formats.set(format, (formats.get(format) ?? 0) + 1);
    const caption = String(row.caption ?? "");
    captionLengths.push(caption.length);
    for (const tag of caption.match(/#[\p{L}\p{N}_]+/gu) ?? []) hashtags.set(tag.toLowerCase(), (hashtags.get(tag.toLowerCase()) ?? 0) + 1);
    if (row.visual_analysis && typeof row.visual_analysis === "object" && Object.keys(row.visual_analysis as object).length) {
      analyzed.push(JSON.stringify(row.visual_analysis));
    }
  }
  captionLengths.sort((a, b) => a - b);
  const median = captionLengths[Math.floor(captionLengths.length / 2)] ?? 0;
  const formatText = [...formats.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => `${name}:${count}`).join(", ");
  const tagText = [...hashtags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([tag, count]) => `${tag}:${count}`).join(", ");
  return `Amostra real: ${rows.length} posts recentes. Formatos: ${formatText}. Mediana de tamanho das legendas: ${median} caracteres. Hashtags recorrentes: ${tagText || "nenhuma dominante"}. Análises visuais já aprendidas: ${analyzed.slice(0, 8).join(" | ") || "ainda não há análises visuais em cache"}.`;
}

async function loadArticles(articleIds: string[]): Promise<StudioArticleEvidence[]> {
  if (!articleIds.length) return [];
  const { data, error } = await createAdminClient()
    .from("articles")
    .select("id,title,summary,canonical_url,source_name,published_at")
    .in("id", articleIds);
  if (error) throw error;
  if ((data ?? []).length !== articleIds.length) throw new Error("Um ou mais artigos selecionados não foram encontrados.");
  const byId = new Map((data ?? []).map((row: Record<string, unknown>) => [String(row.id), row]));
  return articleIds.map((id) => {
    const row = byId.get(id)!;
    return {
      id,
      title: String(row.title),
      summary: String(row.summary ?? ""),
      url: String(row.canonical_url),
      source: String(row.source_name),
      publishedAt: String(row.published_at)
    };
  });
}

async function loadDriveAssets(useDrive: boolean, driveAssetIds: string[]) {
  if (!useDrive) return [] as DriveAsset[];
  const unique = [...new Set(driveAssetIds)];
  if (!unique.length) throw new Error("Você habilitou o Drive, mas não selecionou nenhuma mídia.");
  return Promise.all(unique.map((id) => getDriveAsset(id)));
}

function assertFormatMedia(contentType: StudioContentType, assets: DriveAsset[]) {
  if (contentType === "reel" && !assets.some((asset) => asset.mimeType.startsWith("video/"))) {
    throw new Error("Para gerar um Reel, selecione pelo menos um vídeo do Drive.");
  }
  if (contentType !== "reel" && assets.some((asset) => asset.mimeType.startsWith("video/"))) {
    throw new Error("Nesta versão, vídeos do Drive são usados em Reels. Para post, carrossel ou Story selecione imagens.");
  }
}

function firstSemanticText(frame: Awaited<ReturnType<typeof getCurrentFigmaSemanticState>>[number] | undefined, role: string) {
  return frame?.roles?.[role]?.map((item) => item.text?.trim()).find(Boolean);
}

function allSemanticText(frame: Awaited<ReturnType<typeof getCurrentFigmaSemanticState>>[number] | undefined, role: string) {
  return frame?.roles?.[role]?.map((item) => item.text?.trim()).filter((value): value is string => Boolean(value)) ?? [];
}

function mergeCurrentFigmaContent(payload: StudioPayload, state: Awaited<ReturnType<typeof getCurrentFigmaSemanticState>>) {
  return {
    ...payload,
    frames: payload.frames.map((frame, index) => {
      const semantic = state[index];
      const bullets = allSemanticText(semantic, "bullets");
      return {
        ...frame,
        eyebrow: firstSemanticText(semantic, "eyebrow") ?? frame.eyebrow,
        title: firstSemanticText(semantic, "headline") ?? frame.title,
        body: firstSemanticText(semantic, "body") ?? frame.body,
        stat: firstSemanticText(semantic, "stat") ?? frame.stat,
        statLabel: firstSemanticText(semantic, "statLabel") ?? frame.statLabel,
        bullets: bullets.length ? bullets : frame.bullets
      };
    })
  } satisfies StudioPayload;
}

export async function createStudioProject(rawInput: unknown, userId: string) {
  const input = createSchema.parse(rawInput);
  const referenceIds = [...new Set([
    ...input.instagramReferenceMediaIds,
    ...(input.instagramReferenceMediaId ? [input.instagramReferenceMediaId] : [])
  ])].slice(0, 8);
  const [articles, references, driveAssets, history] = await Promise.all([
    loadArticles(input.articleIds),
    getReferences(referenceIds),
    loadDriveAssets(input.useDrive, input.driveAssetIds),
    historicalInstagramGuidance()
  ]);
  assertFormatMedia(input.contentType, driveAssets);
  const generated = await generateStudioPayload({
    contentType: input.contentType,
    articles,
    userContext: input.userContext,
    driveAssets,
    references,
    historicalInstagramGuidance: history
  });
  const payload = compileStudioArtifact(generated, { driveAssets });

  const admin = createAdminClient();
  const { data: project, error: projectError } = await admin.from("content_projects").insert({
    created_by: userId,
    name: payload.title,
    content_type: input.contentType,
    article_ids: input.articleIds,
    user_context: input.userContext,
    instagram_reference_media_id: referenceIds[0] ?? null,
    instagram_reference_media_ids: referenceIds,
    use_drive: input.useDrive,
    drive_assets: driveAssets,
    status: "generated"
  }).select("id").single();
  if (projectError) throw projectError;
  const { data: version, error: versionError } = await admin.from("content_versions").insert({
    project_id: project.id,
    version_number: 1,
    payload,
    change_request: "Versão inicial",
    status: "generated",
    created_by: userId
  }).select("id,version_number").single();
  if (versionError) throw versionError;
  return { projectId: project.id as string, versionId: version.id as string, versionNumber: 1 };
}

export async function createStudioRevision(projectId: string, baseVersionId: string, changeRequest: string, userId: string) {
  if (!changeRequest.trim()) throw new Error("Descreva a alteração visual/editorial desejada.");
  const admin = createAdminClient();
  const [{ data: project, error: projectError }, { data: base, error: baseError }] = await Promise.all([
    admin.from("content_projects").select("*").eq("id", projectId).single(),
    admin.from("content_versions").select("id,payload,version_number,figma_frame_ids").eq("id", baseVersionId).eq("project_id", projectId).single()
  ]);
  if (projectError) throw projectError;
  if (baseError) throw baseError;
  const parsedCurrent = studioPayloadSchema.passthrough().parse(base.payload) as StudioPayload;
  const baseFigmaFrameIds = Array.isArray(base.figma_frame_ids) ? base.figma_frame_ids.map(String) : [];
  let current = parsedCurrent;
  if (baseFigmaFrameIds.length) {
    try {
      const semanticState = await getCurrentFigmaSemanticState(baseFigmaFrameIds);
      current = mergeCurrentFigmaContent(parsedCurrent, semanticState);
    } catch {
      current = parsedCurrent;
    }
  }
  const articleIds = Array.isArray(project.article_ids) ? project.article_ids.map(String) : [];
  const driveAssets = Array.isArray(project.drive_assets) ? (project.drive_assets as DriveAsset[]) : [];
  const referenceIds = Array.isArray(project.instagram_reference_media_ids)
    ? project.instagram_reference_media_ids.map(String).slice(0, 8)
    : project.instagram_reference_media_id ? [String(project.instagram_reference_media_id)] : [];
  const [articles, references, history, latest] = await Promise.all([
    loadArticles(articleIds),
    getReferences(referenceIds),
    historicalInstagramGuidance(),
    admin.from("content_versions").select("version_number").eq("project_id", projectId).order("version_number", { ascending: false }).limit(1).single()
  ]);
  if (latest.error) throw latest.error;
  const revised = await reviseStudioPayload({
    current,
    changeRequest,
    articles,
    references,
    driveAssets,
    historicalInstagramGuidance: history
  });
  const compiled = compileStudioArtifact(revised, {
    driveAssets,
    previousPayload: current,
    baseFigmaFrameIds: baseFigmaFrameIds.length === revised.frames.length ? baseFigmaFrameIds : undefined
  });
  const nextVersion = Number(latest.data.version_number) + 1;
  const { data: version, error } = await admin.from("content_versions").insert({
    project_id: projectId,
    version_number: nextVersion,
    parent_version_id: baseVersionId,
    change_request: changeRequest.trim(),
    payload: compiled,
    status: "generated",
    created_by: userId
  }).select("id,version_number").single();
  if (error) throw error;
  await admin.from("content_projects").update({ name: compiled.title, status: "generated", last_error: null }).eq("id", projectId);
  return { versionId: version.id as string, versionNumber: nextVersion };
}

export async function queueStudioVersionForFigma(projectId: string, versionId: string) {
  const admin = createAdminClient();
  const [{ data: project, error: projectError }, { data: version, error: versionError }] = await Promise.all([
    admin.from("content_projects").select("id,name,content_type,drive_assets").eq("id", projectId).single(),
    admin.from("content_versions").select("id,version_number,payload").eq("id", versionId).eq("project_id", projectId).single()
  ]);
  if (projectError) throw projectError;
  if (versionError) throw versionError;
  const parsed = studioPayloadSchema.passthrough().parse(version.payload) as StudioPayload;
  const driveAssets = Array.isArray(project.drive_assets) ? (project.drive_assets as DriveAsset[]) : [];
  const payload: StructuredStudioPayload = getStudioArtifact(version.payload)
    ? (version.payload as StructuredStudioPayload)
    : compileStudioArtifact(parsed, { driveAssets });
  if (!getStudioArtifact(version.payload)) await admin.from("content_versions").update({ payload }).eq("id", versionId);

  await admin.from("content_versions").update({ status: "superseded" }).eq("project_id", projectId).neq("id", versionId);
  await admin.from("content_versions").update({ status: "figma_queued" }).eq("id", versionId);
  await admin.from("content_projects").update({
    selected_version_id: versionId,
    status: "figma_queued",
    figma_file_key: env().FIGMA_FILE_KEY,
    figma_frame_ids: [],
    figma_last_synced_at: null,
    last_error: null
  }).eq("id", projectId);
  const jobPayload = {
    projectId,
    projectName: project.name,
    versionId,
    versionNumber: version.version_number,
    contentType: project.content_type,
    outputPageName: env().FIGMA_OUTPUT_PAGE_NAME,
    driveAssets: project.drive_assets ?? [],
    payload
  };
  const { data: job, error: jobError } = await admin.from("figma_jobs").insert({
    project_id: projectId,
    version_id: versionId,
    payload: jobPayload,
    status: "queued"
  }).select("id").single();
  if (jobError) throw jobError;
  return { jobId: job.id as string, fileKey: env().FIGMA_FILE_KEY, outputPageName: env().FIGMA_OUTPUT_PAGE_NAME };
}

export async function nextFigmaJob() {
  const { data, error } = await createAdminClient()
    .from("figma_jobs")
    .select("id,project_id,version_id,payload,created_at")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function completeFigmaJob(jobId: string, frameIds: string[], templateNodeIds: string[] = []) {
  if (!frameIds.length || frameIds.length > 10) throw new Error("O plugin não retornou uma lista válida de frames.");
  const admin = createAdminClient();
  const { data: job, error } = await admin.from("figma_jobs").select("project_id,version_id,payload").eq("id", jobId).eq("status", "queued").single();
  if (error) throw error;
  const jobPayload = job.payload as { payload?: StructuredStudioPayload };
  const expected = Array.isArray(jobPayload?.payload?.frames) ? jobPayload.payload.frames.length : frameIds.length;
  if (frameIds.length !== expected) throw new Error(`O plugin retornou ${frameIds.length} frames; eram esperados ${expected}.`);
  if (templateNodeIds.length && templateNodeIds.length !== frameIds.length) throw new Error("A lista de templates do Figma não corresponde aos frames importados.");

  let versionPayload = attachFigmaBindings(jobPayload.payload ?? ({} as StructuredStudioPayload), frameIds, templateNodeIds);
  if (jobPayload.payload && templateNodeIds.length === frameIds.length) {
    try {
      const [outputRenderUrls, sourceRenderUrls] = await Promise.all([
        getCurrentFigmaRenderUrls(frameIds, "png"),
        getCurrentFigmaRenderUrls(templateNodeIds, "png")
      ]);
      const visualBrandReview = await reviewFigmaBrandFidelity({ payload: jobPayload.payload, outputRenderUrls, sourceRenderUrls });
      if (visualBrandReview && versionPayload.artifact) {
        versionPayload = { ...versionPayload, artifact: { ...versionPayload.artifact, visualBrandReview } };
      }
    } catch {
      // Brand critic is an additional quality gate. A transient critic failure must not destroy an editable Figma import.
    }
  }

  const now = new Date().toISOString();
  await Promise.all([
    admin.from("figma_jobs").update({ status: "imported", frame_ids: frameIds, imported_at: now }).eq("id", jobId),
    admin.from("content_versions").update({ status: "in_figma", figma_frame_ids: frameIds, payload: versionPayload }).eq("id", job.version_id),
    admin.from("content_projects").update({ status: "in_figma", figma_frame_ids: frameIds, figma_last_synced_at: now }).eq("id", job.project_id)
  ]);
  return { projectId: job.project_id as string, versionId: job.version_id as string, frameIds, templateNodeIds };
}

export function publicDriveMediaUrl(projectId: string, fileId: string) {
  const value = `studio-drive:${projectId}:${fileId}`;
  const signature = signPublicAsset(value);
  return `${env().NEXT_PUBLIC_APP_URL}/api/public/drive/${encodeURIComponent(fileId)}?project=${encodeURIComponent(projectId)}&sig=${encodeURIComponent(signature)}`;
}

export async function approveAndPublishStudioProject(projectId: string) {
  const admin = createAdminClient();
  const { data: project, error: projectError } = await admin.from("content_projects").select("*").eq("id", projectId).single();
  if (projectError) throw projectError;
  if (!project.selected_version_id) throw new Error("Escolha uma versão e envie-a ao Figma antes de aprovar.");
  const { data: version, error: versionError } = await admin.from("content_versions").select("id,payload,figma_frame_ids").eq("id", project.selected_version_id).single();
  if (versionError) throw versionError;
  const payload = studioPayloadSchema.passthrough().parse(version.payload) as StudioPayload;
  const frameIds = Array.isArray(version.figma_frame_ids) ? version.figma_frame_ids.map(String) : [];
  if (!frameIds.length) throw new Error("A versão escolhida ainda não foi importada pelo plugin do Figma.");

  await admin.from("content_projects").update({ status: "publishing", last_error: null }).eq("id", projectId);
  try {
    const account = await activeInstagramAccount();
    // Always re-render now. Manual edits in Figma are the source of truth for static/carousel/story publishing.
    const currentFigmaImages = await getCurrentFigmaRenderUrls(frameIds, "png");
    let published: { id: string };
    if (payload.contentType === "single") {
      published = await publishSingleImage(account, currentFigmaImages[0], payload.caption);
    } else if (payload.contentType === "carousel") {
      published = await publishCarousel(account, currentFigmaImages, payload.caption);
    } else if (payload.contentType === "story") {
      published = await publishStory(account, currentFigmaImages[0], false);
    } else {
      const driveAssets = Array.isArray(project.drive_assets) ? (project.drive_assets as DriveAsset[]) : [];
      const videoId = payload.primaryDriveAssetId;
      const video = videoId ? driveAssets.find((asset) => asset.id === videoId) : null;
      if (!video?.mimeType.startsWith("video/")) throw new Error("O Reel aprovado não possui vídeo principal válido do Drive.");
      // The structured Remotion timeline stays editable/exportable. Until a rendered motion file is explicitly approved,
      // publishing keeps the original selected footage rather than silently flattening an unreviewed animation.
      published = await publishReel(account, publicDriveMediaUrl(projectId, video.id), payload.caption);
    }
    const permalink = await fetchInstagramPermalink(account, published.id);
    const now = new Date().toISOString();
    await Promise.all([
      admin.from("content_projects").update({
        status: "published",
        published_instagram_media_id: published.id,
        published_permalink: permalink,
        published_at: now,
        figma_last_synced_at: now,
        last_error: null
      }).eq("id", projectId),
      admin.from("content_versions").update({ status: "published" }).eq("id", version.id)
    ]);
    return { mediaId: published.id, permalink, frameIds };
  } catch (error) {
    await admin.from("content_projects").update({ status: "failed", last_error: String(error) }).eq("id", projectId);
    throw error;
  }
}
