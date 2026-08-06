import type { EngagementMetrics } from "@/lib/types";

const EMPTY: EngagementMetrics = {
  views: 0,
  reach: 0,
  likes: 0,
  comments: 0,
  saved: 0,
  shares: 0,
  follows: 0,
  profileVisits: 0,
  totalInteractions: 0
};

export function parseInsights(payload: unknown): EngagementMetrics {
  const result = { ...EMPTY };
  const rows = (payload as { data?: Array<{ name?: string; values?: Array<{ value?: number }>; value?: number }> })?.data ?? [];
  const map: Record<string, keyof EngagementMetrics> = {
    views: "views",
    reach: "reach",
    likes: "likes",
    comments: "comments",
    saved: "saved",
    shares: "shares",
    follows: "follows",
    profile_visits: "profileVisits",
    total_interactions: "totalInteractions"
  };

  for (const row of rows) {
    const key = row.name ? map[row.name] : undefined;
    if (!key) continue;
    result[key] = Number(row.values?.[0]?.value ?? row.value ?? 0);
  }
  return result;
}
