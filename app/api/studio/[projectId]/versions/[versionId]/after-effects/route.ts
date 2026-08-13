import { apiAdmin } from "@/lib/api-auth";
import { downloadDriveAsset } from "@/lib/google-drive";
import { getCurrentFigmaRenderUrls, getCurrentFigmaSemanticState } from "@/lib/figma";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  afterEffectsReadme,
  createAfterEffectsScript,
  createTarGz,
  packageAssetPath,
  stripSvgText
} from "@/lib/studio-after-effects-export";
import type { StructuredStudioPayload } from "@/lib/studio-artifact";
import type { DriveAsset } from "@/lib/types";

export const maxDuration = 300;
const MAX_BUNDLED_ASSET_BYTES = 25 * 1024 * 1024;

function slug(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "academy-video";
}

async function fetchText(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Falha ao baixar SVG do Figma (${response.status}).`);
  return response.text();
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
    if (project.content_type !== "reel") throw new Error("O pacote nativo do After Effects está disponível para Reel/vídeo.");

    const payload = version.payload as StructuredStudioPayload;
    const timeline = payload?.artifact?.videoTimeline;
    if (!timeline) throw new Error("Esta versão ainda não possui timeline estruturada de vídeo.");
    const frameIds = Array.isArray(version.figma_frame_ids) ? version.figma_frame_ids.map(String) : [];
    if (!frameIds.length) throw new Error("Envie esta versão ao Figma e conclua a revisão visual antes de exportar o projeto nativo do After Effects.");

    const frameId = frameIds[0];
    const [[semanticState], [svgUrl]] = await Promise.all([
      getCurrentFigmaSemanticState([frameId]),
      getCurrentFigmaRenderUrls([frameId], "svg")
    ]);
    const fullSvg = await fetchText(svgUrl);
    const graphicsSvg = stripSvgText(fullSvg);
    const driveAssets = Array.isArray(project.drive_assets) ? (project.drive_assets as DriveAsset[]) : [];
    const usedAssetIds = [...new Set(timeline.tracks.flatMap((track) => track.assetId ? [track.assetId] : []))];
    const assetFiles = usedAssetIds.flatMap((assetId) => {
      const asset = driveAssets.find((candidate) => candidate.id === assetId);
      return asset ? [{ asset, relativePath: packageAssetPath(asset) }] : [];
    });
    const bundled: Array<{ path: string; data: Uint8Array }> = [];
    const missingLarge: Array<{ id: string; name: string; relativePath: string; size: string | null | undefined }> = [];
    for (const file of assetFiles) {
      const declaredSize = Number(file.asset.size ?? 0);
      if (declaredSize > 0 && declaredSize <= MAX_BUNDLED_ASSET_BYTES) {
        const downloaded = await downloadDriveAsset(file.asset.id);
        bundled.push({ path: file.relativePath, data: downloaded.bytes });
      } else {
        missingLarge.push({ id: file.asset.id, name: file.asset.name, relativePath: file.relativePath, size: file.asset.size });
      }
    }

    const figmaGraphicsPath = "figma/brand-graphics-no-text.svg";
    const figmaReferencePath = "figma/full-approved-reference.svg";
    const jsxName = `InteliAcademy-V${version.version_number}.jsx`;
    const script = createAfterEffectsScript({
      projectName: String(project.name),
      versionNumber: Number(version.version_number),
      payload,
      semanticState,
      assetFiles,
      figmaGraphicsPath,
      figmaReferencePath
    });
    const manifest = {
      schema: "inteli-academy-after-effects-package/v1",
      projectId,
      projectName: String(project.name),
      versionNumber: Number(version.version_number),
      figmaFileKey: project.figma_file_key ? String(project.figma_file_key) : null,
      figmaFrameId: frameId,
      sceneGraph: payload.artifact?.sceneGraph ?? null,
      timeline,
      assets: assetFiles.map((file) => ({
        id: file.asset.id,
        name: file.asset.name,
        mimeType: file.asset.mimeType,
        relativePath: file.relativePath,
        bundled: !missingLarge.some((missing) => missing.id === file.asset.id)
      })),
      missingLargeAssets: missingLarge
    };
    const files = [
      { path: jsxName, data: script },
      { path: "README.txt", data: afterEffectsReadme(Number(version.version_number)) },
      { path: "project-manifest.json", data: JSON.stringify(manifest, null, 2) },
      { path: figmaGraphicsPath, data: graphicsSvg },
      { path: figmaReferencePath, data: fullSvg },
      ...bundled
    ];
    const archive = createTarGz(files);
    const fileBase = `${slug(String(project.name))}-v${version.version_number}`;
    return new Response(new Uint8Array(archive), {
      headers: {
        "content-type": "application/gzip",
        "content-disposition": `attachment; filename="${fileBase}-after-effects.tar.gz"`,
        "cache-control": "private, no-store"
      }
    });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 400 });
  }
}
