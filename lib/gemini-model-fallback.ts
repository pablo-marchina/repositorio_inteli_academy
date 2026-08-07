const GEMINI_GENERATE_URL = /^(https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/)([^/:]+)(:generateContent(?:\?.*)?)$/;

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
 * Gemini free-tier quotas are enforced per project/model. When a model returns
 * HTTP 429 RESOURCE_EXHAUSTED, the exact same request is retried against the
 * configured fallback models. Non-Gemini requests and non-429 responses are
 * never modified.
 *
 * This intentionally sits below callGeminiJson so the existing structured
 * output fallback, Zod validation, repair pass, and fact/editorial reviews all
 * gain model failover without duplicating generation logic.
 */
export function installGeminiModelFallback(fallbackModels: string[]) {
  if (installed || typeof globalThis.fetch !== "function") return;

  const models = uniqueModels(fallbackModels);
  if (!models.length) return;

  const nativeFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = inputUrl(input);
    const match = url.match(GEMINI_GENERATE_URL);
    if (!match) return nativeFetch(input, init);

    const [, prefix, primaryModel, suffix] = match;
    let response = await nativeFetch(input, init);
    if (response.status !== 429) return response;

    // callGeminiJson currently calls fetch with a URL string and a reusable JSON
    // body. Do not attempt to replay an arbitrary Request whose body may already
    // have been consumed.
    if (typeof input !== "string" && !(input instanceof URL)) return response;

    for (const fallbackModel of models) {
      if (fallbackModel === primaryModel) continue;

      const fallbackUrl = `${prefix}${encodeURIComponent(fallbackModel)}${suffix}`;
      console.warn(`Gemini quota exhausted for ${primaryModel}; retrying with fallback model ${fallbackModel}.`);
      response = await nativeFetch(fallbackUrl, init);

      if (response.status !== 429) return response;
    }

    return response;
  };

  installed = true;
}
