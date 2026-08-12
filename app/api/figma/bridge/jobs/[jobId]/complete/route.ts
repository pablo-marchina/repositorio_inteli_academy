import { z } from "zod";
import { assertFigmaBridgeSecret } from "@/lib/figma";
import { completeFigmaJob } from "@/lib/studio";

const schema = z.object({ frameIds: z.array(z.string().min(1)).min(1).max(10) });

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    assertFigmaBridgeSecret(request.headers.get("x-figma-bridge-secret"));
    const { jobId } = await context.params;
    const { frameIds } = schema.parse(await request.json());
    return Response.json({ result: await completeFigmaJob(jobId, frameIds) });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 400 });
  }
}
