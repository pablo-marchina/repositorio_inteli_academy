export const FIGMA_BRIDGE_CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type,x-figma-bridge-secret",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "cache-control": "no-store"
} as const;

export function figmaBridgeJson(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      ...FIGMA_BRIDGE_CORS_HEADERS,
      ...(init.headers ?? {})
    }
  });
}

export function figmaBridgeOptions() {
  return new Response(null, { status: 204, headers: FIGMA_BRIDGE_CORS_HEADERS });
}
