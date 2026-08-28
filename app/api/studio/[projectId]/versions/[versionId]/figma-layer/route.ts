import { apiAdmin } from "@/lib/api-auth";
import { getCurrentFigmaRenderUrls, getCurrentFigmaSemanticState } from "@/lib/figma";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED = new Set(["background", "decoration", "brandElement", "mascot", "logo", "primaryLogo", "partnerLogo", "eyebrow", "headline", "body"]);

export const maxDuration = 60;

export async function GET(request: Request, context: { params: Promise<{ projectId: string; versionId: string }> }) {
  if (!(await apiAdmin())) return new Response("Unauthorized", { status: 401 });
  try {
    const { projectId, versionId } = await context.params;
    const url = new URL(request.url);
    const role = url.searchParams.get("role") ?? "";
    const index = Math.max(0, Number(url.searchParams.get("index") ?? 0) || 0);
    if (!ALLOWED.has(role)) return new Response("Role inválido", { status: 400 });
    const { data: version, error } = await createAdminClient().from("content_versions").select("figma_frame_ids").eq("id", versionId).eq("project_id", projectId).single();
    if (error) throw error;
    const frameIds = Array.isArray(version.figma_frame_ids) ? version.figma_frame_ids.map(String) : [];
    if (!frameIds.length) return new Response("Versão ainda não sincronizada com Figma", { status: 404 });
    const [semantic] = await getCurrentFigmaSemanticState([frameIds[0]]);
    const node = semantic.roles?.[role]?.[index];
    if (!node?.id) return new Response("Layer não encontrada", { status: 404 });
    const [renderUrl] = await getCurrentFigmaRenderUrls([node.id], "png");
    const response = await fetch(renderUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Figma layer falhou (${response.status}).`);
    return new Response(await response.arrayBuffer(), { headers: { "content-type": response.headers.get("content-type") ?? "image/png", "cache-control": "private, max-age=300" } });
  } catch (error) {
    return new Response(String(error), { status: 500 });
  }
}
