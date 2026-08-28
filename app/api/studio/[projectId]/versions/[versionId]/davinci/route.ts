import { apiAdmin } from "@/lib/api-auth";
import { getCurrentFigmaRenderUrls, getCurrentFigmaSemanticState } from "@/lib/figma";
import { publicDriveMediaUrl } from "@/lib/studio";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTarGz } from "@/lib/studio-after-effects-export";
import {
  createResolveBridgeScript,
  resolveGraphicPath,
  resolveManifest,
  resolveMediaPath,
  resolveReadme,
  serializeResolveOtio,
  windowsResolveLauncher,
  type ResolveGraphic,
  type ResolveMedia
} from "@/lib/studio-davinci-export";
import type { StructuredStudioPayload } from "@/lib/studio-artifact";
import type { DriveAsset } from "@/lib/types";

export const maxDuration = 300;
const MAX_GRAPHICS_BYTES = 2_500_000;
const GRAPHIC_ROLES = ["primaryLogo", "mascot", "partnerLogo", "brandElement", "decoration", "eyebrow", "headline", "body"] as const;

function slug(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "academy-video";
}

async function fetchGraphic(url: string) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Falha ao baixar layer do Figma (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function GET(_: Request, context: { params: Promise<{ projectId: string; versionId: string }> }) {
  const auth = await apiAdmin();
  if (!auth) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const { projectId, versionId } = await context.params;
    const admin = createAdminClient();
    const [{ data: project, error: projectError }, { data: version, error: versionError }] = await Promise.all([
      admin.from("content_projects").select("id,name,content_type,drive_assets,figma_file_key").eq("id", projectId).single(),
      admin.from("content_versions").select("id,version_number,payload,figma_frame_ids").eq("id", versionId).eq("project_id", projectId).single()
    ]);
    if (projectError) throw projectError;
    if (versionError) throw versionError;
    if (project.content_type !== "reel") throw new Error("A exportação direta para DaVinci Resolve está disponível para Reel/vídeo.");

    const payload = version.payload as StructuredStudioPayload;
    const timeline = payload?.artifact?.videoTimeline;
    if (!timeline) throw new Error("Esta versão ainda não possui timeline estruturada de vídeo.");
    const frameIds = Array.isArray(version.figma_frame_ids) ? version.figma_frame_ids.map(String) : [];
    if (!frameIds.length) throw new Error("Sincronize esta versão com o Figma antes de exportar ao DaVinci, para levar logo, mascote e grafismos como layers reais.");
    const frameId = frameIds[0];

    const driveAssets = Array.isArray(project.drive_assets) ? (project.drive_assets as DriveAsset[]) : [];
    const usedAssetIds = [...new Set(timeline.tracks.flatMap((track) => track.assetId ? [track.assetId] : []))];
    const media: ResolveMedia[] = usedAssetIds.flatMap((assetId) => {
      const asset = driveAssets.find((candidate) => candidate.id === assetId);
      return asset ? [{ asset, relativePath: resolveMediaPath(asset), downloadUrl: publicDriveMediaUrl(projectId, asset.id) }] : [];
    });

    const [semantic] = await getCurrentFigmaSemanticState([frameId]);
    const semanticRequests = GRAPHIC_ROLES.flatMap((role) => (semantic.roles[role] ?? []).map((item) => ({ role, item }))).filter(({ item }) => Boolean(item.id));
    const renderUrls = semanticRequests.length ? await getCurrentFigmaRenderUrls(semanticRequests.map(({ item }) => item.id), "png") : [];
    const graphics: ResolveGraphic[] = [];
    const graphicFiles: Array<{ path: string; data: Uint8Array }> = [];
    let graphicBytes = 0;
    for (let index = 0; index < semanticRequests.length; index += 1) {
      const request = semanticRequests[index];
      try {
        const bytes = await fetchGraphic(renderUrls[index]);
        if (graphicBytes + bytes.byteLength > MAX_GRAPHICS_BYTES) continue;
        const relativePath = resolveGraphicPath(request.role, request.item.name || request.role, request.item.id);
        graphicBytes += bytes.byteLength;
        graphics.push({ nodeId: request.item.id, role: request.role, name: request.item.name || request.role, relativePath });
        graphicFiles.push({ path: relativePath, data: bytes });
      } catch (error) {
        console.warn("[davinci-export] Figma layer omitted from portable package", { nodeId: request.item.id, role: request.role, error: String(error) });
      }
    }

    const projectName = String(project.name);
    const versionNumber = Number(version.version_number);
    const otio = serializeResolveOtio({ payload, projectName, media, graphics });
    const manifest = resolveManifest({
      payload,
      projectId,
      projectName,
      versionNumber,
      figmaFileKey: project.figma_file_key ? String(project.figma_file_key) : null,
      frameId,
      media,
      graphics
    });
    const archive = createTarGz([
      { path: "content.otio", data: JSON.stringify(otio, null, 2) },
      { path: "project-manifest.json", data: JSON.stringify(manifest, null, 2) },
      { path: "academy-resolve-bridge.py", data: createResolveBridgeScript({ projectName, versionNumber }) },
      { path: "OPEN-IN-DAVINCI.bat", data: windowsResolveLauncher() },
      { path: "README.txt", data: resolveReadme(versionNumber) },
      ...graphicFiles
    ]);
    if (archive.byteLength > 4_100_000) throw new Error("O pacote de integração com o DaVinci excedeu o limite seguro. Reduza a quantidade de grafismos no frame Figma e tente novamente.");

    const fileBase = `${slug(projectName)}-v${versionNumber}`;
    return new Response(new Uint8Array(archive), {
      headers: {
        "content-type": "application/gzip",
        "content-disposition": `attachment; filename="${fileBase}-davinci-resolve.tar.gz"`,
        "cache-control": "private, no-store"
      }
    });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 400 });
  }
}
