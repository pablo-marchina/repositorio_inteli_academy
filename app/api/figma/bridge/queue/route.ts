import { assertFigmaBridgeSecret } from "@/lib/figma";
import { figmaBridgeJson, figmaBridgeOptions } from "@/lib/figma-bridge-http";
import { nextFigmaJob } from "@/lib/studio";

export function OPTIONS() {
  return figmaBridgeOptions();
}

export async function GET(request: Request) {
  try {
    assertFigmaBridgeSecret(request.headers.get("x-figma-bridge-secret"));
    return figmaBridgeJson({ job: await nextFigmaJob() });
  } catch (error) {
    return figmaBridgeJson({ error: String(error) }, { status: 401 });
  }
}
