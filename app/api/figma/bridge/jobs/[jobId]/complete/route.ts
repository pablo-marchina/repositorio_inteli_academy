import { z } from "zod";
import { assertFigmaBridgeSecret } from "@/lib/figma";
import { figmaBridgeJson, figmaBridgeOptions } from "@/lib/figma-bridge-http";
import { createAdminClient } from "@/lib/supabase/admin";
import { completeFigmaJob } from "@/lib/studio";
import { clearRenderedReel } from "@/lib/studio-render-types";
import type { StructuredStudioPayload } from "@/lib/studio-artifact";

const schema = z.object({ frameIds: z.array(z.string().min(1)).min(1).max(10), templateNodeIds: z.array(z.string().min(1)).max(10).default([]) });

export function OPTIONS() { return figmaBridgeOptions(); }

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    assertFigmaBridgeSecret(request.headers.get("x-figma-bridge-secret"));
    const { jobId } = await context.params;
    const { frameIds, templateNodeIds } = schema.parse(await request.json());
    const result = await completeFigmaJob(jobId, frameIds, templateNodeIds);
    // A fresh Figma import invalidates any MP4 rendered from the previous visual state.
    const admin = createAdminClient();
    const { data } = await admin.from("content_versions").select("payload").eq("id", result.versionId).maybeSingle();
    if (data?.payload) await admin.from("content_versions").update({ payload: clearRenderedReel(data.payload as StructuredStudioPayload) }).eq("id", result.versionId);
    return figmaBridgeJson({ result });
  } catch (error) {
    return figmaBridgeJson({ error: String(error) }, { status: 400 });
  }
}
