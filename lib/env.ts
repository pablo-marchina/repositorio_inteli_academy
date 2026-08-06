import { z } from "zod";

const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

const GEMINI_MODEL_REPLACEMENTS: Record<string, string> = {
  "gemini-2.5-flash": DEFAULT_GEMINI_MODEL,
  "gemini-2.0-flash": DEFAULT_GEMINI_MODEL,
  "gemini-2.0-flash-001": DEFAULT_GEMINI_MODEL
};

function normalizeGeminiModel(model: string | undefined) {
  if (!model) return undefined;
  return GEMINI_MODEL_REPLACEMENTS[model] ?? model;
}

const serverSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default(DEFAULT_GEMINI_MODEL),
  META_APP_ID: z.string().min(1).optional(),
  META_APP_SECRET: z.string().min(1).optional(),
  META_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v26.0"),
  APP_ENCRYPTION_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(24),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional()
});

let cached: z.infer<typeof serverSchema> | null = null;

export function env() {
  if (cached) return cached;
  cached = serverSchema.parse({
    ...process.env,
    GEMINI_MODEL: normalizeGeminiModel(process.env.GEMINI_MODEL)
  });
  return cached;
}

export function publicEnv() {
  const values = {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  };

  return z
    .object({
      NEXT_PUBLIC_APP_URL: z.string().url(),
      NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1)
    })
    .parse(values);
}
