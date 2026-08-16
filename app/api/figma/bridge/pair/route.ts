import { issueFigmaBridgeToken, validateFigmaPairingCode } from "@/lib/figma";
import { figmaBridgeJson, figmaBridgeOptions } from "@/lib/figma-bridge-http";

export function OPTIONS() {
  return figmaBridgeOptions();
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { code?: string };
    const code = String(body.code ?? "").trim();
    if (!code || !validateFigmaPairingCode(code)) {
      return figmaBridgeJson({ error: "Código de pareamento inválido ou expirado. Gere um novo em Configurações." }, { status: 401 });
    }
    return figmaBridgeJson(issueFigmaBridgeToken());
  } catch (error) {
    return figmaBridgeJson({ error: String(error) }, { status: 400 });
  }
}
