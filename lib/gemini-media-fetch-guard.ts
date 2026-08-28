const MEDIA_ANALYSIS_TIMEOUT_MS = 20_000;

type GuardedGlobal = typeof globalThis & { __academyGeminiMediaFetchGuardInstalled?: boolean };
type GeminiPayload = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};
type GeminiRequest = {
  contents?: Array<{ parts?: Array<{ inlineData?: { mimeType?: string } }> }>;
};

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function hasVisualInlineMedia(init?: Parameters<typeof fetch>[1]) {
  if (typeof init?.body !== "string") return false;
  try {
    const payload = JSON.parse(init.body) as GeminiRequest;
    return (payload.contents ?? []).some((content) => (content.parts ?? []).some((part) => {
      const mimeType = part.inlineData?.mimeType ?? "";
      return mimeType.startsWith("video/") || mimeType.startsWith("image/");
    }));
  } catch {
    return false;
  }
}

function isGeminiGenerateContent(url: string) {
  return url.startsWith("https://generativelanguage.googleapis.com/") && url.includes(":generateContent");
}

function nonRetryableMediaFailure(message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 422,
    headers: { "content-type": "application/json", "x-academy-media-fallback": "local" }
  });
}

function normalizedCandidatePayload(payload: GeminiPayload) {
  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  const raw = parts.map((part) => part.text ?? "").join("").trim();
  if (!raw) return { kind: "empty" as const };

  const normalized = raw.replace(/^```json\s*|```$/g, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    return { kind: "invalid" as const };
  }

  if (!Array.isArray(parsed)) return { kind: "object" as const };
  if (parsed.length !== 1 || !parsed[0] || typeof parsed[0] !== "object" || Array.isArray(parsed[0])) {
    return { kind: "invalid" as const };
  }

  if (!parts.length) return { kind: "invalid" as const };
  parts[0].text = JSON.stringify(parsed[0]);
  for (let index = 1; index < parts.length; index += 1) parts[index].text = "";
  return { kind: "normalized" as const, payload };
}

/**
 * Studio's Reel analyzer intentionally has a deterministic FFmpeg fallback.
 * Keep expensive visual Gemini calls bounded and make common JSON-array drift
 * compatible with the object schemas expected by the analyzer. This guard is
 * scoped to image/video inlineData only; ordinary text generation and audio
 * analysis keep their normal fetch behavior.
 */
export function installGeminiMediaFetchGuard() {
  const target = globalThis as GuardedGlobal;
  if (target.__academyGeminiMediaFetchGuardInstalled) return;

  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = requestUrl(input);
    if (!isGeminiGenerateContent(url) || !hasVisualInlineMedia(init)) {
      return originalFetch(input, init);
    }

    const timeoutSignal = AbortSignal.timeout(MEDIA_ANALYSIS_TIMEOUT_MS);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
    let response: Response;
    try {
      response = await originalFetch(input, { ...init, signal });
    } catch (error) {
      if (timeoutSignal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        console.warn("[reel-analysis] Gemini visual analysis exceeded media budget; using local fallback", {
          timeoutMs: MEDIA_ANALYSIS_TIMEOUT_MS
        });
        return nonRetryableMediaFailure("visual media analysis timed out; use local fallback");
      }
      throw error;
    }

    if (!response.ok) return response;

    let payload: GeminiPayload;
    try {
      payload = await response.clone().json() as GeminiPayload;
    } catch {
      console.warn("[reel-analysis] Gemini visual response was not JSON; using local fallback");
      return nonRetryableMediaFailure("visual media response was not JSON");
    }

    const normalized = normalizedCandidatePayload(payload);
    if (normalized.kind === "object") return response;
    if (normalized.kind === "normalized") {
      console.info("[reel-analysis] normalized single-object Gemini array response");
      return new Response(JSON.stringify(normalized.payload), {
        status: response.status,
        headers: { "content-type": "application/json", "x-academy-media-normalized": "single-object-array" }
      });
    }

    console.warn("[reel-analysis] Gemini visual candidate was structurally invalid; using local fallback", {
      kind: normalized.kind
    });
    return nonRetryableMediaFailure("visual media candidate was structurally invalid");
  }) as typeof fetch;

  target.__academyGeminiMediaFetchGuardInstalled = true;
}
