import { env } from "@/lib/env";

function figmaConfig() {
  const config = env();
  if (!config.FIGMA_ACCESS_TOKEN) {
    throw new Error("FIGMA_ACCESS_TOKEN é necessário para validar e exportar a versão final do Figma.");
  }
  return config;
}

async function figmaRequest<T>(path: string, search?: Record<string, string>): Promise<T> {
  const config = figmaConfig();
  const url = new URL(`https://api.figma.com/v1/${path.replace(/^\//, "")}`);
  Object.entries(search ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    headers: { "x-figma-token": config.FIGMA_ACCESS_TOKEN! },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Figma API falhou (${response.status}): ${await response.text()}`);
  return (await response.json()) as T;
}

export async function getCurrentFigmaNodes(nodeIds: string[]) {
  if (!nodeIds.length) throw new Error("Nenhum frame do Figma foi associado a esta versão.");
  const config = figmaConfig();
  const payload = await figmaRequest<{
    name?: string;
    lastModified?: string;
    version?: string;
    nodes?: Record<string, { document?: { id?: string; name?: string; type?: string; absoluteBoundingBox?: { width?: number; height?: number } } } | null>;
  }>(`files/${config.FIGMA_FILE_KEY}/nodes`, { ids: nodeIds.join(",") });
  const missing = nodeIds.filter((id) => !payload.nodes?.[id]?.document);
  if (missing.length) throw new Error(`Frames não encontrados no Figma: ${missing.join(", ")}`);
  return payload;
}

export async function getCurrentFigmaRenderUrls(nodeIds: string[], format: "png" | "jpg" = "png") {
  if (!nodeIds.length) throw new Error("Nenhum frame do Figma foi associado a esta versão.");
  const config = figmaConfig();
  await getCurrentFigmaNodes(nodeIds);
  const payload = await figmaRequest<{ images?: Record<string, string | null>; err?: string }>(
    `images/${config.FIGMA_FILE_KEY}`,
    { ids: nodeIds.join(","), format, scale: "1" }
  );
  if (payload.err) throw new Error(payload.err);
  const urls = nodeIds.map((id) => payload.images?.[id] ?? null);
  if (urls.some((url) => !url)) throw new Error("O Figma não conseguiu renderizar um ou mais frames finais.");
  return urls as string[];
}

export function assertFigmaBridgeSecret(value: string | null) {
  const configured = env().FIGMA_PLUGIN_SECRET;
  if (!configured) throw new Error("FIGMA_PLUGIN_SECRET não foi configurado.");
  if (!value || value !== configured) throw new Error("Credencial do plugin Figma inválida.");
}

export function figmaIntegrationSummary() {
  const config = env();
  return {
    fileKey: config.FIGMA_FILE_KEY,
    outputPageName: config.FIGMA_OUTPUT_PAGE_NAME,
    readConfigured: Boolean(config.FIGMA_ACCESS_TOKEN),
    bridgeConfigured: Boolean(config.FIGMA_PLUGIN_SECRET)
  };
}
