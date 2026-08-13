import { z } from "zod";
import { apiAdmin } from "@/lib/api-auth";
import { applyMotionRevision } from "@/lib/studio-motion-ai";

const schema = z.object({ changeRequest: z.string().min(2).max(2000) });

export async function POST(request: Request, context: { params: Promise<{ projectId: string; versionId: string }> }) {
  if (!(await apiAdmin())) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const { projectId, versionId } = await context.params;
    const { changeRequest } = schema.parse(await request.json());
    await applyMotionRevision(projectId, versionId, changeRequest);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 400 });
  }
}
