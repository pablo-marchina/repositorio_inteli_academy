import { z } from "zod";
import { apiAdmin } from "@/lib/api-auth";
import { queueStudioVersionForFigma } from "@/lib/studio";

const schema = z.object({ versionId: z.string().uuid() });

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  if (!(await apiAdmin())) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const { projectId } = await context.params;
    const { versionId } = schema.parse(await request.json());
    return Response.json({ result: await queueStudioVersionForFigma(projectId, versionId) });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
