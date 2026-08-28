import { apiAdmin } from "@/lib/api-auth";
import { updateStudioPartnerBrand } from "@/lib/studio-brand-assets";

export const maxDuration = 120;

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const auth = await apiAdmin();
  if (!auth) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const { projectId } = await context.params;
    const result = await updateStudioPartnerBrand(projectId, await request.json(), auth.user.id);
    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
