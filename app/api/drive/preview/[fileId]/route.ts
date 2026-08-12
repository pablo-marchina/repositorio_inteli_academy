import { apiAdmin } from "@/lib/api-auth";
import { downloadDriveAsset } from "@/lib/google-drive";

export const maxDuration = 120;

export async function GET(_request: Request, context: { params: Promise<{ fileId: string }> }) {
  if (!(await apiAdmin())) return new Response("Unauthorized", { status: 401 });
  try {
    const { fileId } = await context.params;
    const { asset, bytes } = await downloadDriveAsset(fileId);
    return new Response(bytes, {
      headers: {
        "content-type": asset.mimeType,
        "cache-control": "private, max-age=300"
      }
    });
  } catch (error) {
    return new Response(String(error), { status: 500 });
  }
}
