import { getCurrentFigmaNodes, getCurrentFigmaRenderUrls } from "@/lib/figma";
import { fetchInstagramPermalink, publishCarousel, publishReel, publishSingleImage, publishStory } from "@/lib/instagram";
import { createAdminClient } from "@/lib/supabase/admin";
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
    const account = await activeInstagramAccount();
    const currentFigmaImages = await getCurrentFigmaRenderUrls(frameIds, "png");
    let published: { id: string };
    if (payload.contentType === "single") published = await publishSingleImage(account, currentFigmaImages[0], payload.caption);
    else if (payload.contentType === "carousel") published = await publishCarousel(account, currentFigmaImages, payload.caption);
    else if (payload.contentType === "story") published = await publishStory(account, currentFigmaImages[0], false);
    else {
      const artifact = payload.artifact;
      if (!artifact?.reelQuality?.passed) throw new Error("O Reel não passou pelos gates estruturais da timeline.");
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
