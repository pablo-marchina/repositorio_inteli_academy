import { z } from "zod";
import { apiAdmin } from "@/lib/api-auth";
import { createStudioRevision } from "@/lib/studio";

export const maxDuration = 300;

const schema = z.object({
  baseVersionId: z.string().uuid(),
  changeRequest: z.string().min(2).max(6000)
});

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const auth = await apiAdmin();
  if (!auth) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const { projectId } = await context.params;
    const input = schema.parse(await request.json());
    const result = await createStudioRevision(projectId, input.baseVersionId, input.changeRequest, auth.user.id);
    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
