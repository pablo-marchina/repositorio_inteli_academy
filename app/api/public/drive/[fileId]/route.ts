import { verifyPublicAsset } from "@/lib/crypto";
import { downloadDriveAsset } from "@/lib/google-drive";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;

export async function GET(request: Request, context: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await context.params;
  const url = new URL(request.url);
  const projectId = url.searchParams.get("project");
  const signature = url.searchParams.get("sig");
  if (!projectId || !signature || !verifyPublicAsset(`studio-drive:${projectId}:${fileId}`, signature)) {
    return new Response("Forbidden", { status: 403 });
  }
  const { data } = await createAdminClient().from("content_projects").select("drive_assets").eq("id", projectId).maybeSingle();
  const assets = Array.isArray(data?.drive_assets) ? data.drive_assets as Array<{ id?: string }> : [];
  if (!assets.some((asset) => asset.id === fileId)) return new Response("Forbidden", { status: 403 });
  try {
    const { asset, bytes } = await downloadDriveAsset(fileId);
    return new Response(bytes, {
      headers: {
        "content-type": asset.mimeType,
        "content-length": String(bytes.byteLength),
        "cache-control": "private, max-age=300"
      }
    });
  } catch (error) {
    return new Response(String(error), { status: 500 });
  }
}
