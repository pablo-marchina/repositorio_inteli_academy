import crypto from "node:crypto";
import { env } from "@/lib/env";

const FIGMA_PAIR_WINDOW_MS = 10 * 60_000;
const FIGMA_BRIDGE_TOKEN_TTL_MS = 180 * 24 * 60 * 60_000;
const FIGMA_BRIDGE_TOKEN_VERSION = "v1";

function figmaConfig() {
  const config = env();
  if (!config.FIGMA_ACCESS_TOKEN) throw new Error("FIGMA_ACCESS_TOKEN é necessário para validar e exportar a versão final do Figma.");
  return config;
}

function bridgeSigningSecret() {
  const config = env();
  return config.FIGMA_PLUGIN_SECRET || config.CRON_SECRET;
}

function bridgeHmac(value: string) { return crypto.createHmac("sha256", bridgeSigningSecret()).update(value).digest("base64url"); }
function safeEqual(a: string, b: string) { if (a.length !== b.length) return false; return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); }

function pairingCodeForWindow(window: number) {
  const raw = bridgeHmac(`figma-pair:${window}`).replace(/[^a-zA-Z0-9]/g, "").slice(0, 12).toUpperCase();
  return raw.match(/.{1,4}/g)?.join("-") ?? raw;
}

export function createFigmaPairingCode(now = Date.now()) {
  const window = Math.floor(now / FIGMA_PAIR_WINDOW_MS);
  return { code: pairingCodeForWindow(window), expiresAt: new Date((window + 1) * FIGMA_PAIR_WINDOW_MS).toISOString() };
}

export function validateFigmaPairingCode(value: string, now = Date.now()) {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const currentWindow = Math.floor(now / FIGMA_PAIR_WINDOW_MS);
  for (const window of [currentWindow, currentWindow - 1]) {
    const expected = pairingCodeForWindow(window).replace(/-/g, "");
    if (safeEqual(normalized, expected)) return true;
  }
  return false;
}

export function issueFigmaBridgeToken(now = Date.now()) {
  const expiresAt = now + FIGMA_BRIDGE_TOKEN_TTL_MS;
  const payload = JSON.stringify({ iat: now, exp: expiresAt, nonce: crypto.randomBytes(12).toString("base64url") });
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  const unsigned = `${FIGMA_BRIDGE_TOKEN_VERSION}.${encoded}`;
  return { token: `${unsigned}.${bridgeHmac(unsigned)}`, expiresAt: new Date(expiresAt).toISOString() };
}

function validateIssuedBridgeToken(value: string) {
  const [version, encoded, signature] = value.split(".");
  if (version !== FIGMA_BRIDGE_TOKEN_VERSION || !encoded || !signature) return false;
  const unsigned = `${version}.${encoded}`;
  if (!safeEqual(signature, bridgeHmac(unsigned))) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { exp?: number };
    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch { return false; }
}

type FigmaRestNode = {
  id?: string;
  name?: string;
  type?: string;
  characters?: string;
  children?: FigmaRestNode[];
  visible?: boolean;
  opacity?: number;
  fills?: Array<{ type?: string; visible?: boolean }>;
  absoluteBoundingBox?: { x?: number; y?: number; width?: number; height?: number };
  style?: { fontFamily?: string; fontSize?: number; fontWeight?: number; textAlignHorizontal?: string; lineHeightPx?: number };
};

type SemanticItem = {
  id: string;
  name: string;
  text?: string;
  type: string;
  box?: { x: number; y: number; width: number; height: number };
  style?: FigmaRestNode["style"];
};

export type FigmaDesignSystemDiscovery = {
  fileName: string;
  pageNames: string[];
  candidateFrames: Array<{ id: string; name: string; pageName: string; width: number; height: number }>;
  discoveredAt: string;
};

async function figmaRequest<T>(path: string, search?: Record<string, string>): Promise<T> {
  const config = figmaConfig();
  const url = new URL(`https://api.figma.com/v1/${path.replace(/^\//, "")}`);
  Object.entries(search ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { headers: { "x-figma-token": config.FIGMA_ACCESS_TOKEN! }, cache: "no-store" });
  if (!response.ok) throw new Error(`Figma API falhou (${response.status}): ${await response.text()}`);
  return (await response.json()) as T;
}

export async function verifyFigmaReadAccess() {
  const config = figmaConfig();
  const payload = await figmaRequest<{ name?: string; lastModified?: string; version?: string }>(`files/${config.FIGMA_FILE_KEY}`, { depth: "1" });
  return { ok: true as const, fileName: payload.name ?? "ID Academy", lastModified: payload.lastModified ?? null, version: payload.version ?? null };
}

/**
 * Discover the real design-system surface instead of assuming a page name.
 * The returned candidates are intentionally generic; editorial archetype and
 * requested output dimensions are scored by the Figma plugin at import time.
 */
export async function discoverFigmaDesignSystem(): Promise<FigmaDesignSystemDiscovery> {
  const config = figmaConfig();
  const payload = await figmaRequest<{ name?: string; document?: FigmaRestNode }>(`files/${config.FIGMA_FILE_KEY}`, { depth: "2" });
  const pages = (payload.document?.children ?? []).filter((node) => node.type === "CANVAS" && node.visible !== false);
  const candidateFrames = pages.flatMap((page) => (page.children ?? [])
    .filter((node) => node.type === "FRAME" && node.visible !== false && node.id)
    .map((node) => ({
      id: node.id!,
      name: node.name ?? "",
      pageName: page.name ?? "",
      width: node.absoluteBoundingBox?.width ?? 0,
      height: node.absoluteBoundingBox?.height ?? 0
    }))
    .filter((frame) => frame.width > 0 && frame.height > 0));
  return {
    fileName: payload.name ?? "ID Academy",
    pageNames: pages.map((page) => page.name ?? "").filter(Boolean),
    candidateFrames,
    discoveredAt: new Date().toISOString()
  };
}

export async function getCurrentFigmaNodes(nodeIds: string[]) {
  if (!nodeIds.length) throw new Error("Nenhum frame do Figma foi associado a esta versão.");
  const config = figmaConfig();
  const payload = await figmaRequest<{ name?: string; lastModified?: string; version?: string; nodes?: Record<string, { document?: FigmaRestNode } | null> }>(`files/${config.FIGMA_FILE_KEY}/nodes`, { ids: nodeIds.join(",") });
  const missing = nodeIds.filter((id) => !payload.nodes?.[id]?.document);
  if (missing.length) throw new Error(`Frames não encontrados no Figma: ${missing.join(", ")}`);
  return payload;
}

function collectNodes(node: FigmaRestNode | undefined, output: FigmaRestNode[]) {
  if (!node) return;
  output.push(node);
  for (const child of node.children ?? []) collectNodes(child, output);
}

function semanticRole(name: string | undefined) {
  const match = /^AI::([a-zA-Z]+)(?:\s*\||$)/.exec(name ?? "");
  return match?.[1] ?? null;
}

function hasImageFill(node: FigmaRestNode) { return node.fills?.some((fill) => fill.visible !== false && fill.type === "IMAGE") ?? false; }
function containsEditorialContent(node: FigmaRestNode): boolean {
  if (node.type === "TEXT" || hasImageFill(node)) return true;
  return (node.children ?? []).some(containsEditorialContent);
}

function relativeItem(node: FigmaRestNode, frameBox: FigmaRestNode["absoluteBoundingBox"]): SemanticItem | null {
  if (!node.id || !node.type) return null;
  const box = node.absoluteBoundingBox && frameBox ? {
    x: (node.absoluteBoundingBox.x ?? 0) - (frameBox.x ?? 0),
    y: (node.absoluteBoundingBox.y ?? 0) - (frameBox.y ?? 0),
    width: node.absoluteBoundingBox.width ?? 0,
    height: node.absoluteBoundingBox.height ?? 0
  } : undefined;
  return { id: node.id, name: node.name ?? "", text: node.characters, type: node.type, box, style: node.style };
}

function pushRole(roles: Record<string, SemanticItem[]>, role: string, item: SemanticItem | null) {
  if (!item) return;
  roles[role] ??= [];
  if (!roles[role].some((candidate) => candidate.id === item.id)) roles[role].push(item);
}

function normalized(value: string | undefined) {
  return String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function primaryBrandCandidate(node: FigmaRestNode) {
  const value = `${normalized(node.name)} ${normalized(node.characters)}`;
  return /(?:^|\s)(inteli academy|academy|ia)(?:\s|$)/.test(value) && !/parceir|partner|cliente|empresa/.test(value);
}

function inferBrandRoles(root: FigmaRestNode | undefined, frameBox: FigmaRestNode["absoluteBoundingBox"], roles: Record<string, SemanticItem[]>) {
  if (!root || !frameBox?.width || !frameBox.height) return;
  const frameArea = frameBox.width * frameBox.height;
  const direct = (root.children ?? []).filter((node) => node.visible !== false && node.id && node.type && node.absoluteBoundingBox);
  const tagged = new Set(Object.values(roles).flat().map((item) => item.id));

  if (!roles.background?.length) {
    const background = direct
      .filter((node) => ["RECTANGLE", "VECTOR"].includes(node.type ?? "") && !hasImageFill(node) && !containsEditorialContent(node))
      .map((node) => ({ node, area: (node.absoluteBoundingBox?.width ?? 0) * (node.absoluteBoundingBox?.height ?? 0) }))
      .filter((candidate) => candidate.area >= frameArea * .68)
      .sort((a, b) => b.area - a.area)[0]?.node;
    pushRole(roles, "background", background ? relativeItem(background, frameBox) : null);
  }

  // Explicit AI::primaryLogo / AI::partnerLogo tags always win. For legacy
  // templates, only the owned Academy mark is inferred automatically.
  if (!roles.primaryLogo?.length) {
    const primary = direct.find(primaryBrandCandidate);
    pushRole(roles, "primaryLogo", primary ? relativeItem(primary, frameBox) : null);
  }
  if (!roles.primaryLogo?.length && roles.logo?.length) {
    pushRole(roles, "primaryLogo", roles.logo[0]);
  }

  // Keep `logo` as a backwards-compatible render alias containing both owned
  // and partner marks. The semantic QA still sees the two roles separately.
  for (const item of roles.primaryLogo ?? []) pushRole(roles, "logo", item);
  for (const item of roles.partnerLogo ?? []) pushRole(roles, "logo", item);

  const backgroundIds = new Set((roles.background ?? []).map((item) => item.id));
  const decorationCandidates = direct
    .filter((node) => !tagged.has(node.id!) && !backgroundIds.has(node.id!) && !containsEditorialContent(node) && ["VECTOR", "ELLIPSE", "RECTANGLE", "LINE", "POLYGON", "STAR", "INSTANCE", "COMPONENT", "GROUP"].includes(node.type ?? ""))
    .map((node) => ({ node, area: (node.absoluteBoundingBox?.width ?? 0) * (node.absoluteBoundingBox?.height ?? 0) }))
    .filter((candidate) => candidate.area >= frameArea * .0005 && candidate.area <= frameArea * .42)
    .sort((a, b) => b.area - a.area)
    .slice(0, 6);
  for (const candidate of decorationCandidates) pushRole(roles, "decoration", relativeItem(candidate.node, frameBox));
}

export async function getCurrentFigmaSemanticState(nodeIds: string[]) {
  const payload = await getCurrentFigmaNodes(nodeIds);
  return nodeIds.map((frameId) => {
    const root = payload.nodes?.[frameId]?.document;
    const frameBox = root?.absoluteBoundingBox;
    const nodes: FigmaRestNode[] = [];
    collectNodes(root, nodes);
    const roles: Record<string, SemanticItem[]> = {};
    for (const node of nodes) {
      const role = semanticRole(node.name);
      if (!role) continue;
      pushRole(roles, role, relativeItem(node, frameBox));
    }
    inferBrandRoles(root, frameBox, roles);
    return { frameId, frameName: root?.name ?? "", frameBox: frameBox ? { width: frameBox.width ?? 0, height: frameBox.height ?? 0 } : undefined, roles };
  });
}

export async function getCurrentFigmaRenderUrls(nodeIds: string[], format: "png" | "jpg" | "svg" = "png") {
  if (!nodeIds.length) throw new Error("Nenhum frame do Figma foi associado a esta versão.");
  const config = figmaConfig();
  await getCurrentFigmaNodes(nodeIds);
  const payload = await figmaRequest<{ images?: Record<string, string | null>; err?: string }>(`images/${config.FIGMA_FILE_KEY}`, {
    ids: nodeIds.join(","),
    format,
    ...(format === "svg" ? { svg_include_id: "true", svg_outline_text: "false", svg_simplify_stroke: "false" } : { scale: "1" })
  });
  if (payload.err) throw new Error(payload.err);
  const urls = nodeIds.map((id) => payload.images?.[id] ?? null);
  if (urls.some((url) => !url)) throw new Error("O Figma não conseguiu renderizar um ou mais frames finais.");
  return urls as string[];
}

export function assertFigmaBridgeSecret(value: string | null) {
  const configured = env().FIGMA_PLUGIN_SECRET;
  if (configured && value && safeEqual(value, configured)) return;
  if (!value || !validateIssuedBridgeToken(value)) throw new Error("Credencial do plugin Figma inválida ou expirada. Faça o pareamento novamente em Configurações.");
}

export function figmaIntegrationSummary() {
  const config = env();
  const pairing = createFigmaPairingCode();
  return { fileKey: config.FIGMA_FILE_KEY, outputPageName: config.FIGMA_OUTPUT_PAGE_NAME, readConfigured: Boolean(config.FIGMA_ACCESS_TOKEN), bridgeConfigured: true, legacyBridgeSecretConfigured: Boolean(config.FIGMA_PLUGIN_SECRET), pairingCode: pairing.code, pairingExpiresAt: pairing.expiresAt, platformUrl: config.NEXT_PUBLIC_APP_URL };
}
