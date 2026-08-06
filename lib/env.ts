import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

const serverSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_POST_MODEL: z.string().min(1).default("gemini-3.6-flash"),
  GEMINI_FILTER_MODEL: z.string().min(1).default("gemini-3.5-flash-lite"),
  META_APP_ID: z.string().min(1).optional(),
  META_APP_SECRET: z.string().min(1).optional(),
  META_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v26.0"),
  APP_ENCRYPTION_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(24),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),
  COMMUNITY_FEED_DISCOVERY: booleanString,
  COMMUNITY_FEED_CATALOG_URL: z
    .string()
    .url()
    .default("https://raw.githubusercontent.com/foorilla/allainews_sources/refs/heads/main/README.md"),
  MAX_ARTICLES_TO_CLASSIFY: z.coerce.number().int().min(0).max(200).default(60),
  MIN_ARTICLE_RELEVANCE: z.coerce.number().min(1).max(10).default(5.5)
});

let cached: z.infer<typeof serverSchema> | null = null;

export function env() {
  if (cached) return cached;
  cached = serverSchema.parse(process.env);
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
