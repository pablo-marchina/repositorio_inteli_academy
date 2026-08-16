import { z } from "zod";
import { assertFigmaBridgeSecret } from "@/lib/figma";
import { figmaBridgeJson, figmaBridgeOptions } from "@/lib/figma-bridge-http";
import { completeFigmaJob } from "@/lib/studio";

const schema = z.object({
  frameIds: z.array(z.string().min(1)).min(1).max(10),
  templateNodeIds: z.array(z.string().min(1)).max(10).default([])
});

export function OPTIONS() {
  return figmaBridgeOptions();
}

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    assertFigmaBridgeSecret(request.headers.get("x-figma-bridge-secret"));
    const { jobId } = await context.params;
    const { frameIds, templateNodeIds } = schema.parse(await request.json());
    return figmaBridgeJson({ result: await completeFigmaJob(jobId, frameIds, templateNodeIds) });
  } catch (error) {
    return figmaBridgeJson({ error: String(error) }, { status: 400 });
  }
}
