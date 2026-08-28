import { discoverFigmaDesignSystem, getCurrentFigmaNodes, getCurrentFigmaRenderUrls, getCurrentFigmaSemanticState } from "@/lib/figma";
import { fetchInstagramPermalink, publishCarousel, publishReel, publishSingleImage, publishStory } from "@/lib/instagram";
import { createAdminClient } from "@/lib/supabase/admin";
import { effectiveBrandContext, requiresPartnerBrand } from "@/lib/studio-post-archetype";
import { asRenderedStudioPayload } from "@/lib/studio-render-types";
import type { InstagramAccount } from "@/lib/types";

function asInstagramAccount(row: Record<string, unknown>): InstagramAccount {
  return { id: String(row.id), instagramUserId: String(row.instagram_user_id), username: String(row.username), accountType: row.account_type ? String(row.account_type) : null, accessTokenEncrypted: String(row.access_token_encrypted), tokenExpiresAt: row.token_expires_at ? String(row.token_expires_at) : null };
}

async function activeInstagramAccount() {
  const { data, error } = await createAdminClient().from("instagram_accounts").select("id,instagram_user_id,username,account_type,access_token_encrypted,token_expires_at").eq("is_active", true).order("connected_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Instagram ainda não está conectado.");
  return asInstagramAccount(data as Record<string, unknown>);
}

function assertCurrentReelAnalysis(payload: ReturnType<typeof asRenderedStudioPayload>) {
  const plan = payload.artifact?.reelPlan;
  if (!plan || (plan.analysisSummary?.semanticVersion ?? 0) < 2) {
    throw new Error("Este Reel usa uma análise visual legada. Reanalise a versão antes de publicar.");
  }
  if (plan.reference && (plan.reference.semanticVersion ?? 0) < 2) {
    throw new Error("A referência deste Reel ainda não possui análise atual. Reanalise a versão antes de publicar.");
  }
  const byAsset = new Map(plan.footage.map((analysis) => [analysis.assetId, analysis]));
  if (plan.shots.some((shot) => byAsset.get(shot.assetId)?.analysisMode === "metadata-fallback")) {
    throw new Error("O Reel usa pelo menos um shot escolhido por fallback de metadados. Reanalise a mídia antes de publicar.");
  }
  if (plan.reference) {
    const styleMatch = (plan as typeof plan & { styleMatch?: { version?: number; semanticAvailable?: boolean; structureScore?: number } }).styleMatch;
    if ((styleMatch?.version ?? 0) < 2) {
      throw new Error("A estrutura visual da referência ainda não passou pelo matcher atual. Reabra/reanalise a versão antes de publicar.");
    }
    if (!styleMatch?.semanticAvailable) {
      throw new Error("A referência ainda não possui confiança semântica suficiente para aprovar função narrativa e estrutura. A versão pode ser revisada, mas não publicada como fiel à referência.");
    }
  }
}

async function assertRealBrandStructure(payload: ReturnType<typeof asRenderedStudioPayload>, frameIds: string[]) {
  const [designSystem, semanticFrames] = await Promise.all([
    discoverFigmaDesignSystem(),
    getCurrentFigmaSemanticState(frameIds)
  ]);
  if (!designSystem.pageNames.length || !designSystem.candidateFrames.length) {
    throw new Error("O Figma conectado não possui uma estrutura de design detectável. Revise o arquivo antes de publicar.");
  }

  const missingPrimary = semanticFrames.filter((frame) => !(frame.roles.primaryLogo?.length || frame.roles.logo?.length));
  if (missingPrimary.length) {
    throw new Error("A marca principal da Inteli Academy não está presente como elemento real do Figma em todos os frames. Reimporte a versão usando o design system descoberto.");
  }

  if (requiresPartnerBrand(payload)) {
    const brand = effectiveBrandContext(payload);
    const partnerVisible = semanticFrames.some((frame) => (frame.roles.partnerLogo?.length ?? 0) > 0);
    if (!partnerVisible) {
      const partner = brand.partnerName ? ` (${brand.partnerName})` : "";
      throw new Error(`A logo do parceiro${partner} não está resolvida como partnerLogo no Figma. Selecione uma logo oficial/autorizada; o sistema não pode inventar ou recortar a marca de um vídeo.`);
    }
  }
}

export async function approveAndPublishFinalStudioProject(projectId: string) {
  const admin = createAdminClient();
  const { data: project, error: projectError } = await admin.from("content_projects").select("*").eq("id", projectId).single();
  if (projectError) throw projectError;
  if (!project.selected_version_id) throw new Error("Escolha uma versão e envie-a ao Figma antes de aprovar.");
  const { data: version, error: versionError } = await admin.from("content_versions").select("id,payload,figma_frame_ids").eq("id", project.selected_version_id).single();
  if (versionError) throw versionError;
  const payload = asRenderedStudioPayload(version.payload);
  const frameIds = Array.isArray(version.figma_frame_ids) ? version.figma_frame_ids.map(String) : [];
  if (!frameIds.length) throw new Error("A versão escolhida ainda não foi importada pelo plugin do Figma.");

  await admin.from("content_projects").update({ status: "publishing", last_error: null }).eq("id", projectId);
  try {
    await assertRealBrandStructure(payload, frameIds);
    const account = await activeInstagramAccount();
    const currentFigmaImages = await getCurrentFigmaRenderUrls(frameIds, "png");
    let published: { id: string };
    if (payload.contentType === "single") published = await publishSingleImage(account, currentFigmaImages[0], payload.caption);
    else if (payload.contentType === "carousel") published = await publishCarousel(account, currentFigmaImages, payload.caption);
    else if (payload.contentType === "story") published = await publishStory(account, currentFigmaImages[0], false);
    else {
      const artifact = payload.artifact;
      assertCurrentReelAnalysis(payload);
      if (!artifact?.reelQuality?.passed) throw new Error("O Reel não passou pelos gates estruturais, visuais e semânticos da timeline.");
      if (!artifact.renderQa?.passed) throw new Error("O MP4 final ainda não passou pelo QA visual. Renderize novamente após corrigir os pontos encontrados.");
      if (!artifact.renderedReel?.publicUrl) throw new Error("O Reel ainda não possui MP4 final renderizado.");
      const currentFigma = await getCurrentFigmaNodes([frameIds[0]]);
      if (artifact.renderedReel.figmaVersion && currentFigma.version && artifact.renderedReel.figmaVersion !== currentFigma.version) throw new Error("O Figma foi alterado depois do último MP4. Renderize o Reel novamente para publicar exatamente o estado atual.");
      published = await publishReel(account, artifact.renderedReel.publicUrl, payload.caption);
    }
    const permalink = await fetchInstagramPermalink(account, published.id);
    const now = new Date().toISOString();
    await Promise.all([
      admin.from("content_projects").update({ status: "published", published_instagram_media_id: published.id, published_permalink: permalink, published_at: now, figma_last_synced_at: now, last_error: null }).eq("id", projectId),
      admin.from("content_versions").update({ status: "published" }).eq("id", version.id)
    ]);
    return { mediaId: published.id, permalink, frameIds };
  } catch (error) {
    await admin.from("content_projects").update({ status: "failed", last_error: String(error) }).eq("id", projectId);
    throw error;
  }
}
