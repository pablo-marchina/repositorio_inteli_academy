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

async function localReelFallbackOr(response: Response, init?: Parameters<typeof fetch>[1]) {
  const localResponse = await localReelTemporalFallbackResponse(init);
  return localResponse ?? response;
}

/**
 * Installs a narrowly-scoped fetch wrapper for Gemini generateContent calls.
 *
 * For quota exhaustion or temporary model outages, the same request is retried
 * against configured fallback models and one low-cost emergency model. Before
 * any terminal non-2xx Gemini response is returned, the wrapper also attempts
 * the deterministic local FFmpeg Reel analyzer. That analyzer is itself scoped
 * to the Instagram Reel temporal-analysis prompt, so all other Gemini requests
 * preserve their normal error semantics.
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

    // A non-retryable remote error must not prevent a valid Reel reference from
    // falling back to the local analyzer. For non-Reel requests this is a no-op.
    if (!shouldTryAnotherModel(response)) return localReelFallbackOr(response, init);

    // The project calls Gemini with URL strings and reusable JSON bodies. Do not
    // replay an arbitrary Request whose body may already have been consumed, but
    // still give Reel temporal analysis a chance to run locally.
    if (typeof input !== "string" && !(input instanceof URL)) {
      return localReelFallbackOr(response, init);
    }

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
      if (!shouldTryAnotherModel(response)) {
        console.warn("[reel-reference] remote fallback ended with a terminal Gemini error; checking local temporal fallback", {
          finalStatus: response.status,
          lastModel
        });
        return localReelFallbackOr(response, init);
      }
    }

    console.warn("[reel-reference] all remote Gemini models unavailable; attempting local FFmpeg temporal fallback", {
      finalStatus: response.status,
      lastModel
    });
    const finalResponse = await localReelFallbackOr(response, init);
    if (finalResponse !== response) return finalResponse;

    console.error("[reel-reference] local FFmpeg temporal fallback could not produce an analysis", {
      finalStatus: response.status,
      lastModel
    });
    return response;
  };

  installed = true;
}
