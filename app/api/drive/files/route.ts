import { apiAdmin } from "@/lib/api-auth";
import { listDriveMedia } from "@/lib/google-drive";

export const maxDuration = 120;

export async function GET() {
  if (!(await apiAdmin())) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const assets = await listDriveMedia();
    return Response.json({ assets });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
