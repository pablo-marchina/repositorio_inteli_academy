import { apiAdmin } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderFinalStudioReel } from "@/lib/studio-reel-render";
import { withRenderedReel, type RenderedStudioPayload } from "@/lib/studio-render-types";
import type { StructuredStudioPayload } from "@/lib/studio-artifact";
import type { DriveAsset } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

function assertCurrentVisualPlan(payload: StructuredStudioPayload) {
  const plan = payload.artifact?.reelPlan;
  if (!plan || (plan.analysisSummary?.semanticVersion ?? 0) < 3) {
    throw new Error("Esta versão usa uma análise de Reel legada. Reanalise ou revise a versão antes de renderizar.");
  }
  if (plan.reference && (plan.reference.semanticVersion ?? 0) < 3) {
    throw new Error("A referência desta versão ainda não possui análise semântica atual.");
  }
  const byAsset = new Map(plan.footage.map((analysis) => [analysis.assetId, analysis]));
  if (plan.shots.some((shot) => byAsset.get(shot.assetId)?.analysisMode === "metadata-fallback")) {
    throw new Error("A timeline usa pelo menos um shot escolhido por fallback de metadados. Reanalise a mídia antes de renderizar.");
  }
}

export async function POST(_: Request, context: { params: Promise<{ projectId: string; versionId: string }> }) {
  if (!(await apiAdmin())) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const { projectId, versionId } = await context.params;
    const admin = createAdminClient();
    const [{ data: project, error: projectError }, { data: version, error: versionError }] = await Promise.all([
      admin.from("content_projects").select("drive_assets").eq("id", projectId).single(),
      admin.from("content_versions").select("payload,figma_frame_ids").eq("id", versionId).eq("project_id", projectId).single()
    ]);
    if (projectError) throw projectError;
    if (versionError) throw versionError;
    const payload = version.payload as StructuredStudioPayload;
    assertCurrentVisualPlan(payload);
    const frameIds = Array.isArray(version.figma_frame_ids) ? version.figma_frame_ids.map(String) : [];
    if (!frameIds.length) throw new Error("A versão ainda não foi sincronizada com o Figma.");
    const driveAssets = Array.isArray(project.drive_assets) ? (project.drive_assets as DriveAsset[]) : [];
    const result = await renderFinalStudioReel({ projectId, versionId, payload, driveAssets, frameId: frameIds[0] });
    const nextPayload: RenderedStudioPayload = withRenderedReel(payload, result.renderedReel, result.report);
    const { error: updateError } = await admin.from("content_versions").update({ payload: nextPayload }).eq("id", versionId).eq("project_id", projectId);
    if (updateError) throw updateError;
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 400 });
  }
}
