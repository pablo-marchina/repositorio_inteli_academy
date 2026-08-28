import { localReelTemporalFallbackResponse } from "@/lib/local-reel-temporal-fallback";

const GEMINI_GENERATE_URL = /^(https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/)([^/:]+)(:generateContent(?:\?.*)?)$/;
const EMERGENCY_FLASH_MODEL = "gemini-3.1-flash-lite";
const RETRYABLE_MODEL_STATUSES = new Set([429, 500, 502, 503, 504]);

let installed = false;

function uniqueModels(models: string[]) {
  return [...new Set(models.map((model) => model.trim()).filter(Boolean))];
}

function inputUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function shouldTryAnotherModel(response: Response) {
  return RETRYABLE_MODEL_STATUSES.has(response.status) || response.status === 404;
}

function failureLabel(status: number) {
  if (status === 429) return "quota exhausted";
  if (status >= 500) return "temporarily unavailable";
  if (status === 404) return "model unavailable";
  return `HTTP ${status}`;
}

/**
 * Installs a narrowly-scoped fetch wrapper for Gemini generateContent calls.
 *
 * For quota exhaustion or temporary model outages, the same request is retried
 * against configured fallback models and one low-cost emergency model. If every
 * remote model is still unavailable and the request is specifically the
 * Instagram Reel temporal-analysis prompt, a deterministic FFmpeg scene
 * detector returns a Gemini-compatible response.
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
    if (response.ok) return response;
    if (!shouldTryAnotherModel(response)) return response;

    // The project calls Gemini with URL strings and reusable JSON bodies. Do not
    // replay an arbitrary Request whose body may already have been consumed.
    if (typeof input !== "string" && !(input instanceof URL)) return response;

    let lastModel = primaryModel;
    for (const fallbackModel of models) {
      if (fallbackModel === primaryModel) continue;

      console.warn(
        `Gemini ${failureLabel(response.status)} for ${lastModel}; retrying with fallback model ${fallbackModel}.`
      );
      const fallbackUrl = `${prefix}${encodeURIComponent(fallbackModel)}${suffix}`;
      response = await nativeFetch(fallbackUrl, init);
      lastModel = fallbackModel;

      if (response.ok) return response;
      if (!shouldTryAnotherModel(response)) return response;
    }

    console.warn("[reel-reference] all remote Gemini models unavailable; attempting local FFmpeg temporal fallback", {
      finalStatus: response.status,
      lastModel
    });
    const localResponse = await localReelTemporalFallbackResponse(init);
    if (localResponse) return localResponse;

    console.error("[reel-reference] local FFmpeg temporal fallback could not produce an analysis", {
      finalStatus: response.status,
      lastModel
    });
    return response;
  };

  installed = true;
}
