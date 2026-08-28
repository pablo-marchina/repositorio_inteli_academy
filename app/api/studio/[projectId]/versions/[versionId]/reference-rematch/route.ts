import { apiAdmin } from "@/lib/api-auth";
import { rematchStudioVersionToReference } from "@/lib/studio-reference-style";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_: Request, context: { params: Promise<{ projectId: string; versionId: string }> }) {
  if (!(await apiAdmin())) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const { projectId, versionId } = await context.params;
    const result = await rematchStudioVersionToReference(projectId, versionId);
    return Response.json({ result });
  } catch (error) {
    console.error("[reference-style] route failed", error);
    return Response.json({ error: String(error) }, { status: 400 });
  }
}
