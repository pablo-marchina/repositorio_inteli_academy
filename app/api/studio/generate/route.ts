import { apiAdmin } from "@/lib/api-auth";
import { createStudioProject } from "@/lib/studio";

export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await apiAdmin();
  if (!auth) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const result = await createStudioProject(await request.json(), auth.user.id);
    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
