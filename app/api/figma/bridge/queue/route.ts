import { assertFigmaBridgeSecret } from "@/lib/figma";
import { nextFigmaJob } from "@/lib/studio";

export async function GET(request: Request) {
  try {
    assertFigmaBridgeSecret(request.headers.get("x-figma-bridge-secret"));
    return Response.json({ job: await nextFigmaJob() });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 401 });
  }
}
