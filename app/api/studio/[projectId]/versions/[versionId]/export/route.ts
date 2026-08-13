import { z } from "zod";
import { apiAdmin } from "@/lib/api-auth";
import { publicDriveMediaUrl } from "@/lib/studio";
import { createAdminClient } from "@/lib/supabase/admin";
import { serializeEditorManifest, serializeOtio } from "@/lib/studio-editor-export";
import type { StructuredStudioPayload } from "@/lib/studio-artifact";
import type { DriveAsset } from "@/lib/types";

const formatSchema = z.enum(["otio", "manifest"]);

function slug(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "academy-video";
}

export async function GET(request: Request, context: { params: Promise<{ projectId: string; versionId: string }> }) {
  const auth = await apiAdmin();
  if (!auth) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const { projectId, versionId } = await context.params;
    const format = formatSchema.parse(new URL(request.url).searchParams.get("format") ?? "otio");
    const admin = createAdminClient();
    const [{ data: project, error: projectError }, { data: version, error: versionError }] = await Promise.all([
      admin.from("content_projects").select("id,name,content_type,drive_assets,figma_file_key").eq("id", projectId).single(),
      admin.from("content_versions").select("id,version_number,payload").eq("id", versionId).eq("project_id", projectId).single()
    ]);
    if (projectError) throw projectError;
    if (versionError) throw versionError;
    if (project.content_type !== "reel") throw new Error("Exportação de timeline editável está disponível para Reel/vídeo.");

    const payload = version.payload as StructuredStudioPayload;
    if (!payload?.artifact?.videoTimeline) throw new Error("Esta versão ainda não possui timeline estruturada de vídeo.");
    const driveAssets = Array.isArray(project.drive_assets) ? (project.drive_assets as DriveAsset[]) : [];
    const assetUrl = (assetId: string) => publicDriveMediaUrl(projectId, assetId);
    const fileBase = `${slug(String(project.name))}-v${version.version_number}`;

    const output = format === "otio"
      ? serializeOtio({ payload, projectName: String(project.name), assetUrl })
      : serializeEditorManifest({
          payload,
          projectId,
          projectName: String(project.name),
          versionNumber: Number(version.version_number),
          driveAssets,
          figmaFileKey: project.figma_file_key ? String(project.figma_file_key) : null,
          assetUrl
        });

    return new Response(JSON.stringify(output, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${fileBase}.${format === "otio" ? "otio" : "academy-editor.json"}"`,
        "cache-control": "private, no-store"
      }
    });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 400 });
  }
}
