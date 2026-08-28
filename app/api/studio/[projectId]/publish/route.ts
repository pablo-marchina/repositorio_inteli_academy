import { apiAdmin } from "@/lib/api-auth";
import { approveAndPublishFinalStudioProject } from "@/lib/studio-publish";

export const maxDuration = 300;

export async function POST(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  if (!(await apiAdmin())) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const { projectId } = await context.params;
    return Response.json({ result: await approveAndPublishFinalStudioProject(projectId) });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
