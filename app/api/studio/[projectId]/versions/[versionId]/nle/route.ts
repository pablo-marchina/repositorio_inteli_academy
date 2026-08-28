import { apiAdmin } from "@/lib/api-auth";
import { getCurrentFigmaRenderUrls, getCurrentFigmaSemanticState } from "@/lib/figma";
import { publicDriveMediaUrl } from "@/lib/studio";
import { createTarGz } from "@/lib/studio-after-effects-export";
import type { StructuredStudioPayload } from "@/lib/studio-artifact";
import {
  createResolveBridgeScript,
  resolveGraphicPath,
  resolveMediaPath,
  serializeResolveOtio,
  windowsResolveLauncher
} from "@/lib/studio-davinci-export";
import {
  mediaDownloadScript,
  nleReadme,
  parseNleTarget,
  serializeAvidAle,
  serializeEdl,
  serializeFinalCutXml,
  serializePremiereXml,
  serializeUniversalManifest,
  type PortableGraphic,
  type PortableMedia
} from "@/lib/studio-nle-export";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DriveAsset } from "@/lib/types";

export const maxDuration = 300;
const MAX_GRAPHICS_BYTES = 2_500_000;
const MAX_ARCHIVE_BYTES = 4_100_000;
const GRAPHIC_ROLES = ["primaryLogo", "mascot", "partnerLogo", "brandElement", "decoration", "eyebrow", "headline", "body"] as const;

function slug(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "academy-video";
}

async function fetchGraphic(url: string) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Falha ao baixar layer do Figma (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

function suffix(target: ReturnType<typeof parseNleTarget>) {
  if (target === "davinci") return "davinci-resolve";
  if (target === "premiere") return "adobe-premiere-pro";
  if (target === "final-cut") return "final-cut-pro";
  if (target === "avid") return "avid-media-composer";
  return "universal-edit";
}

export async function GET(request: Request, context: { params: Promise<{ projectId: string; versionId: string }> }) {
  const auth = await apiAdmin();
  if (!auth) return Response.json({ error: "Não autorizado." }, { status: 401 });

  try {
    const { projectId, versionId } = await context.params;
    const target = parseNleTarget(new URL(request.url).searchParams.get("target"));
    const admin = createAdminClient();
    const [{ data: project, error: projectError }, { data: version, error: versionError }] = await Promise.all([
      admin.from("content_projects").select("id,name,content_type,drive_assets,figma_file_key").eq("id", projectId).single(),
      admin.from("content_versions").select("id,version_number,payload,figma_frame_ids").eq("id", versionId).eq("project_id", projectId).single()
    ]);
    if (projectError) throw projectError;
    if (versionError) throw versionError;
    if (project.content_type !== "reel") throw new Error("Exportação para editores de vídeo está disponível para Reel/vídeo.");

    const payload = version.payload as StructuredStudioPayload;
    const timeline = payload?.artifact?.videoTimeline;
    if (!timeline) throw new Error("Esta versão ainda não possui timeline estruturada de vídeo.");

    const driveAssets = Array.isArray(project.drive_assets) ? (project.drive_assets as DriveAsset[]) : [];
    const usedAssetIds = [...new Set(timeline.tracks.flatMap((track) => track.assetId ? [track.assetId] : []))];
    const media: PortableMedia[] = usedAssetIds.flatMap((assetId) => {
      const asset = driveAssets.find((candidate) => candidate.id === assetId);
      return asset ? [{ asset, relativePath: resolveMediaPath(asset), downloadUrl: publicDriveMediaUrl(projectId, asset.id) }] : [];
    });

    const frameIds = Array.isArray(version.figma_frame_ids) ? version.figma_frame_ids.map(String) : [];
    const frameId = frameIds[0] ?? null;
    const graphics: PortableGraphic[] = [];
    const graphicFiles: Array<{ path: string; data: Uint8Array }> = [];
    let graphicBytes = 0;

    if (frameId) {
      try {
        const [semantic] = await getCurrentFigmaSemanticState([frameId]);
        const requests = GRAPHIC_ROLES.flatMap((role) => (semantic.roles[role] ?? []).map((item) => ({ role, item }))).filter(({ item }) => Boolean(item.id));
        const renderUrls = requests.length ? await getCurrentFigmaRenderUrls(requests.map(({ item }) => item.id), "png") : [];
        for (let index = 0; index < requests.length; index += 1) {
          const item = requests[index];
          try {
            const bytes = await fetchGraphic(renderUrls[index]);
            if (graphicBytes + bytes.byteLength > MAX_GRAPHICS_BYTES) continue;
            const relativePath = resolveGraphicPath(item.role, item.item.name || item.role, item.item.id);
            graphicBytes += bytes.byteLength;
            graphics.push({ nodeId: item.item.id, role: item.role, name: item.item.name || item.role, relativePath });
            graphicFiles.push({ path: relativePath, data: bytes });
          } catch (error) {
            console.warn("[nle-export] Figma layer omitted", { nodeId: item.item.id, role: item.role, error: String(error) });
          }
        }
      } catch (error) {
        console.warn("[nle-export] Figma enrichment unavailable; exporting timeline without packaged Figma renders", { error: String(error) });
      }
    }

    const projectName = String(project.name);
    const versionNumber = Number(version.version_number);
    const manifest = serializeUniversalManifest({
      payload,
      projectId,
      projectName,
      versionNumber,
      figmaFileKey: project.figma_file_key ? String(project.figma_file_key) : null,
      frameId,
      media,
      graphics
    });
    const otio = serializeResolveOtio({ payload, projectName, media, graphics });
    const edl = serializeEdl({ payload, media });
    const common: Array<{ path: string; data: string | Uint8Array }> = [
      { path: "project-manifest.json", data: JSON.stringify(manifest, null, 2) },
      { path: "DOWNLOAD-MEDIA.py", data: mediaDownloadScript() },
      { path: "README.txt", data: nleReadme(target, versionNumber) }
    ];

    const targetFiles: Array<{ path: string; data: string | Uint8Array }> = [];
    if (target === "davinci" || target === "universal") {
      targetFiles.push(
        { path: "content.otio", data: JSON.stringify(otio, null, 2) },
        { path: "academy-resolve-bridge.py", data: createResolveBridgeScript({ projectName, versionNumber }) },
        { path: "OPEN-IN-DAVINCI.bat", data: windowsResolveLauncher() }
      );
    }
    if (target === "premiere" || target === "universal") {
      targetFiles.push(
        { path: "premiere.xml", data: serializePremiereXml({ payload, projectName, media, graphics }) },
        { path: "project.edl", data: edl }
      );
      if (target === "premiere") targetFiles.push({ path: "content.otio", data: JSON.stringify(otio, null, 2) });
    }
    if (target === "final-cut" || target === "universal") {
      targetFiles.push({ path: "final-cut.fcpxml", data: serializeFinalCutXml({ payload, projectName, media, graphics }) });
      if (target === "final-cut") targetFiles.push({ path: "content.otio", data: JSON.stringify(otio, null, 2) });
    }
    if (target === "avid" || target === "universal") {
      targetFiles.push({ path: "avid.ale", data: serializeAvidAle({ payload, media }) });
      if (!targetFiles.some((file) => file.path === "project.edl")) targetFiles.push({ path: "project.edl", data: edl });
      if (target === "avid") targetFiles.push({ path: "content.otio", data: JSON.stringify(otio, null, 2) });
    }
    if (target === "universal" && !targetFiles.some((file) => file.path === "content.otio")) targetFiles.unshift({ path: "content.otio", data: JSON.stringify(otio, null, 2) });

    const archive = createTarGz([...common, ...targetFiles, ...graphicFiles]);
    if (archive.byteLength > MAX_ARCHIVE_BYTES) throw new Error("O pacote universal excedeu o limite seguro. Reduza a quantidade de grafismos do Figma e tente novamente.");

    const fileBase = `${slug(projectName)}-v${versionNumber}`;
    return new Response(new Uint8Array(archive), {
      headers: {
        "content-type": "application/gzip",
        "content-disposition": `attachment; filename="${fileBase}-${suffix(target)}.tar.gz"`,
        "cache-control": "private, no-store"
      }
    });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 400 });
  }
}
