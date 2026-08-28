import { localReelTemporalFallbackResponse } from "@/lib/local-reel-temporal-fallback";

const GEMINI_GENERATE_URL = /^(https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/)([^/:]+)(:generateContent(?:\?.*)?)$/;
const EMERGENCY_FLASH_MODEL = "gemini-3.1-flash-lite";
const RETRYABLE_MODEL_STATUSES = new Set([429, 500, 502, 503, 504]);
const REEL_REFERENCE_PROMPT_MARKER = "Analise temporalmente este Reel REAL";
const RHYTHMS = new Set(["slow", "medium", "fast", "mixed"]);
const LEVELS = new Set(["low", "medium", "high"]);
const DENSITIES = new Set(["light", "medium", "heavy"]);

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

function isReelTemporalRequest(init?: Parameters<typeof fetch>[1]) {
  return typeof init?.body === "string" && init.body.includes(REEL_REFERENCE_PROMPT_MARKER);
}

function stripJsonFence(value: string) {
  return value.replace(/^```json\s*|```$/g, "").trim();
}

function numberInRange(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function validShot(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const shot = value as Record<string, unknown>;
  return numberInRange(shot.startSeconds, 0, 180)
    && numberInRange(shot.endSeconds, 0, 180)
    && typeof shot.motion === "string" && LEVELS.has(shot.motion)
    && typeof shot.energy === "string" && LEVELS.has(shot.energy)
    && typeof shot.transition === "string" && shot.transition.length <= 80
    && (shot.focalX === undefined || numberInRange(shot.focalX, 0, 1))
    && (shot.focalY === undefined || numberInRange(shot.focalY, 0, 1));
}

function validTextCue(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const cue = value as Record<string, unknown>;
  return numberInRange(cue.startSeconds, 0, 180)
    && numberInRange(cue.endSeconds, 0, 180)
    && typeof cue.density === "string" && DENSITIES.has(cue.density)
    && typeof cue.placement === "string" && cue.placement.length <= 120;
}

function validTemporalPayload(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const parsed = value as Record<string, unknown>;
  if (!numberInRange(parsed.durationSeconds, 1, 180)) return false;
  if (!numberInRange(parsed.averageShotSeconds, .2, 20)) return false;
  if (typeof parsed.rhythm !== "string" || !RHYTHMS.has(parsed.rhythm)) return false;
  if (!Array.isArray(parsed.shots) || parsed.shots.length < 1 || parsed.shots.length > 40) return false;
  if (!parsed.shots.every(validShot)) return false;
  if (parsed.beatSeconds !== undefined) {
    if (!Array.isArray(parsed.beatSeconds) || parsed.beatSeconds.length > 400) return false;
    if (!parsed.beatSeconds.every((beat) => numberInRange(beat, 0, 180))) return false;
  }
  if (parsed.textCues !== undefined) {
    if (!Array.isArray(parsed.textCues) || parsed.textCues.length > 80) return false;
    if (!parsed.textCues.every(validTextCue)) return false;
  }
  return true;
}

async function hasUsableReelTemporalPayload(response: Response) {
  try {
    const payload = await response.clone().json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!raw) return false;
    return validTemporalPayload(JSON.parse(stripJsonFence(raw)));
  } catch {
    return false;
  }
}

async function localReelFallbackOr(response: Response, init?: Parameters<typeof fetch>[1]) {
  const localResponse = await localReelTemporalFallbackResponse(init);
  return localResponse ?? response;
}

async function remoteSuccessOrLocal(response: Response, init?: Parameters<typeof fetch>[1]) {
  if (!response.ok || !isReelTemporalRequest(init)) return response;
  if (await hasUsableReelTemporalPayload(response)) return response;

  console.warn("[reel-reference] Gemini returned HTTP 200 that does not satisfy the Reel temporal schema; using local FFmpeg fallback");
  return localReelFallbackOr(response, init);
}

/**
 * Installs a narrowly-scoped fetch wrapper for Gemini generateContent calls.
 *
 * For quota exhaustion or temporary model outages, the same request is retried
 * against configured fallback models and one low-cost emergency model. Before
 * any terminal non-2xx response is returned, Reel temporal analysis can fall
 * back to deterministic FFmpeg scene detection. Successful HTTP 200 responses
 * are checked against the required temporal payload shape so a semantically
 * invalid model response cannot bypass the local analyzer and fail later.
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
    if (response.ok) return remoteSuccessOrLocal(response, init);

    if (!shouldTryAnotherModel(response)) return localReelFallbackOr(response, init);

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

      if (response.ok) return remoteSuccessOrLocal(response, init);
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
