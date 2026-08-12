import { apiAdmin } from "@/lib/api-auth";
import { approveAndPublishStudioProject } from "@/lib/studio";

export const maxDuration = 300;

export async function POST(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  if (!(await apiAdmin())) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const { projectId } = await context.params;
    return Response.json({ result: await approveAndPublishStudioProject(projectId) });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
