"use client";

import { useEffect } from "react";

function requestPath(input: Parameters<typeof fetch>[0]) {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return new URL(raw, window.location.href).pathname;
  } catch {
    return "";
  }
}

function friendlyPlatformError(status: number, raw: string) {
  if (status === 504) {
    return "A operação excedeu o tempo máximo do servidor. A geração foi interrompida antes de concluir; tente novamente após a análise ser reduzida ou retomada pelo fallback local.";
  }
  if (status === 502 || status === 503) {
    return "O servidor ficou temporariamente indisponível durante a operação. Tente novamente em instantes.";
  }
  const compact = raw.replace(/\s+/g, " ").trim().slice(0, 500);
  return compact || `A API retornou HTTP ${status} sem um corpo JSON válido.`;
}

/**
 * Vercel-generated 5xx responses can be plain text (for example after a
 * serverless timeout). Existing UI actions call response.json(), so normalize
 * only failed same-origin API responses here. Successful media/API responses
 * are returned byte-for-byte unchanged.
 */
export function ApiFetchGuard() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    const guardedFetch: typeof window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      if (response.status < 400 || !requestPath(input).startsWith("/api/")) return response;

      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (contentType.includes("application/json")) return response;

      const raw = await response.clone().text().catch(() => "");
      return new Response(JSON.stringify({
        error: friendlyPlatformError(response.status, raw),
        status: response.status
      }), {
        status: response.status,
        statusText: response.statusText,
        headers: { "content-type": "application/json", "x-academy-normalized-error": "1" }
      });
    };

    window.fetch = guardedFetch;
    return () => {
      if (window.fetch === guardedFetch) window.fetch = originalFetch;
    };
  }, []);

  return null;
}
