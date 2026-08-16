import { assertFigmaBridgeSecret } from "@/lib/figma";
import { FIGMA_BRIDGE_CORS_HEADERS, figmaBridgeOptions } from "@/lib/figma-bridge-http";
import { downloadDriveAsset } from "@/lib/google-drive";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;

export function OPTIONS() {
  return figmaBridgeOptions();
}

export async function GET(request: Request, context: { params: Promise<{ fileId: string }> }) {
  try {
    assertFigmaBridgeSecret(request.headers.get("x-figma-bridge-secret"));
    const { fileId } = await context.params;
    const jobId = new URL(request.url).searchParams.get("job");
    if (!jobId) throw new Error("job ausente.");
    const { data, error } = await createAdminClient().from("figma_jobs").select("payload").eq("id", jobId).maybeSingle();
    if (error) throw error;
    const payload = data?.payload as { driveAssets?: Array<{ id?: string }> } | undefined;
    if (!payload?.driveAssets?.some((asset) => asset.id === fileId)) throw new Error("Asset não pertence a este job do Figma.");
    const { asset, bytes } = await downloadDriveAsset(fileId);
    if (!asset.mimeType.startsWith("image/")) throw new Error("O plugin visual importa imagens; vídeos permanecem como mídia principal do Reel.");
    return new Response(bytes, {
      headers: {
        ...FIGMA_BRIDGE_CORS_HEADERS,
        "content-type": asset.mimeType,
        "cache-control": "private, max-age=300"
      }
    });
  } catch (error) {
    return new Response(String(error), { status: 403, headers: FIGMA_BRIDGE_CORS_HEADERS });
  }
}
