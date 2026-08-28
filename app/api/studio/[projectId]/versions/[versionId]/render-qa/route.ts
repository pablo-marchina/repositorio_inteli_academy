import { z } from "zod";
import { apiAdmin } from "@/lib/api-auth";
import { getCurrentFigmaRenderUrls } from "@/lib/figma";
import { createAdminClient } from "@/lib/supabase/admin";
import { attachRenderQa, type StructuredStudioPayload } from "@/lib/studio-artifact";
import { reviewRenderedReelFrames } from "@/lib/studio-brand-critic";

const schema = z.object({ frames: z.array(z.string().min(100).max(4_000_000)).min(3).max(5) });

export const maxDuration = 120;

export async function POST(request: Request, context: { params: Promise<{ projectId: string; versionId: string }> }) {
  const auth = await apiAdmin();
  if (!auth) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const { projectId, versionId } = await context.params;
    const { frames } = schema.parse(await request.json());
    const admin = createAdminClient();
    const { data: version, error } = await admin.from("content_versions").select("payload,figma_frame_ids").eq("id", versionId).eq("project_id", projectId).single();
    if (error) throw error;
    let payload = version.payload as StructuredStudioPayload;
    if (payload.contentType !== "reel" || !payload.artifact?.videoTimeline) throw new Error("Esta versão não possui Reel renderizável.");
    if (!payload.artifact.reelQuality?.passed) throw new Error("A timeline ainda não passou pelos gates estruturais; corrija-a antes do QA visual.");
    const frameIds = Array.isArray(version.figma_frame_ids) ? version.figma_frame_ids.map(String) : [];
    if (!frameIds.length || !payload.artifact.figmaVideoLayout) throw new Error("O QA visual do Reel só roda depois que a versão foi sincronizada com o Figma.");
    let figmaReferenceUrl: string | null = null;
    try { figmaReferenceUrl = (await getCurrentFigmaRenderUrls([frameIds[0]], "png"))[0] ?? null; } catch { figmaReferenceUrl = null; }
    const report = await reviewRenderedReelFrames({ payload, renderedFrames: frames, figmaReferenceUrl });
    if (!report) throw new Error("O crítico visual não conseguiu avaliar os frames renderizados.");
    payload = attachRenderQa(payload, report);
    const { error: updateError } = await admin.from("content_versions").update({ payload }).eq("id", versionId).eq("project_id", projectId);
    if (updateError) throw updateError;
    return Response.json({ report });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 400 });
  }
}
