import { localReelTemporalFallbackResponse } from "@/lib/local-reel-temporal-fallback";

const GEMINI_GENERATE_URL = /^(https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/)([^/:]+)(:generateContent(?:\?.*)?)$/;
const EMERGENCY_FLASH_MODEL = "gemini-3.1-flash-lite";

let installed = false;

function uniqueModels(models: string[]) {
  return [...new Set(models.map((model) => model.trim()).filter(Boolean))];
}

function inputUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/**
 * Installs a narrowly-scoped fetch wrapper for Gemini generateContent calls.
 *
 * Gemini quotas are enforced per project/model. When a model returns HTTP 429
 * RESOURCE_EXHAUSTED, the exact same request is retried against configured
 * fallback models and one stable low-cost emergency model. If every remote
 * model remains quota-limited and the request is specifically the Instagram
 * Reel temporal-analysis prompt, a deterministic FFmpeg scene detector returns
 * a Gemini-compatible response so Reel generation can continue without lying
 * about whether the reference was actually inspected.
 */
export function installGeminiModelFallback(fallbackModels: string[]) {
  if (installed || typeof globalThis.fetch !== "function") return;

  const models = uniqueModels([...fallbackModels, EMERGENCY_FLASH_MODEL]);
  const nativeFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = inputUrl(input);
    const match = url.match(GEMINI_GENERATE_URL);
    if (!match) return nativeFetch(input, init);

    const [, prefix, primaryModel, suffix] = match;
    let response = await nativeFetch(input, init);
    if (response.status !== 429) return response;

    // The project calls Gemini with URL strings and reusable JSON bodies. Do not
    // replay an arbitrary Request whose body may already have been consumed.
    if (typeof input !== "string" && !(input instanceof URL)) return response;

    for (const fallbackModel of models) {
      if (fallbackModel === primaryModel) continue;

      const fallbackUrl = `${prefix}${encodeURIComponent(fallbackModel)}${suffix}`;
      console.warn(`Gemini quota exhausted for ${primaryModel}; retrying with fallback model ${fallbackModel}.`);
      response = await nativeFetch(fallbackUrl, init);

      if (response.status !== 429) return response;
    }

    const localResponse = await localReelTemporalFallbackResponse(init);
    return localResponse ?? response;
  };

  installed = true;
}
