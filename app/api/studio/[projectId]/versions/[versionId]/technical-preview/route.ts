import { apiAdmin } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderTechnicalStudioPreview } from "@/lib/studio-technical-preview";
import type { StructuredStudioPayload } from "@/lib/studio-artifact";
import type { DriveAsset } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_: Request, context: { params: Promise<{ projectId: string; versionId: string }> }) {
  if (!(await apiAdmin())) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const { projectId, versionId } = await context.params;
    const admin = createAdminClient();
    const [{ data: project, error: projectError }, { data: version, error: versionError }] = await Promise.all([
      admin.from("content_projects").select("drive_assets").eq("id", projectId).single(),
      admin.from("content_versions").select("payload").eq("id", versionId).eq("project_id", projectId).single()
    ]);
    if (projectError) throw projectError;
    if (versionError) throw versionError;
    const payload = version.payload as StructuredStudioPayload;
    const driveAssets = Array.isArray(project.drive_assets) ? (project.drive_assets as DriveAsset[]) : [];
    const preview = await renderTechnicalStudioPreview({ projectId, versionId, payload, driveAssets });
    return Response.json({ preview });
  } catch (error) {
    console.error("[technical-preview] failed", error);
    return Response.json({ error: String(error) }, { status: 400 });
  }
}
