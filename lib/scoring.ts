import type { EngagementMetrics, StoryCluster } from "@/lib/types";

export type LearnedWeights = Record<string, number>;

const INITIAL_WEIGHTS: LearnedWeights = {
  popularity: 0.28,
  sourceCoverage: 0.17,
  sourceQuality: 0.14,
  novelty: 0.13,
  clarity: 0.1,
  research: 0.05,
  market: 0.04,
  tool: 0.04,
  regulation: 0.03,
  hasNumber: 0.02
};

export function defaultWeights() {
  return { ...INITIAL_WEIGHTS };
}

export function normalizeTitle(value: string) {
  return value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|a|an|and|or|of|to|in|for|with|on|de|da|do|e|ou|para|com|em)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleSimilarity(a: string, b: string) {
  const aTokens = new Set(normalizeTitle(a).split(" ").filter(Boolean));
  const bTokens = new Set(normalizeTitle(b).split(" ").filter(Boolean));
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

export function clusterFeatures(cluster: StoryCluster) {
  const titleAndSummary = `${cluster.title} ${cluster.summary}`;
  return {
    popularity: Math.min(1, cluster.popularityScore / 100),
    sourceCoverage: Math.min(1, cluster.sourceCount / 6),
    sourceQuality: cluster.sourceQuality,
    novelty: cluster.noveltyScore,
    clarity: cluster.clarityScore,
    research: cluster.topic === "research" ? 1 : 0,
    market: cluster.topic === "market" ? 1 : 0,
    tool: cluster.topic === "tool" ? 1 : 0,
    regulation: cluster.topic === "regulation" ? 1 : 0,
    hasNumber: /\d/.test(titleAndSummary) ? 1 : 0
  };
}

export function predictEngagement(cluster: StoryCluster, weights: LearnedWeights = INITIAL_WEIGHTS) {
  const features = clusterFeatures(cluster);
  const raw = Object.entries(features).reduce((sum, [key, value]) => sum + value * (weights[key] ?? 0), 0);
  return sigmoid((raw - 0.45) * 5);
}

export function calculateClusterScore(cluster: StoryCluster, weights: LearnedWeights = INITIAL_WEIGHTS) {
  const predicted = predictEngagement(cluster, weights);
  const qualityFloor = cluster.sourceQuality < 0.55 || cluster.sourceCount < 1 ? 0.45 : 1;
  return Math.round(predicted * qualityFloor * 1000) / 10;
}

export function engagementScore(metrics: EngagementMetrics) {
  const reach = Math.max(metrics.reach, 1);
  const value =
    (metrics.shares * 4.5 +
      metrics.saved * 4 +
      metrics.follows * 5 +
      metrics.comments * 2.5 +
      metrics.profileVisits * 1.5 +
      metrics.likes * 0.5 +
      metrics.views * 0.02) /
    reach;
  return Math.min(1, value / 0.2);
}

export function updateWeights(
  current: LearnedWeights,
  features: Record<string, number>,
  actualScore: number,
  learningRate = 0.08
) {
  const predictedRaw = Object.entries(features).reduce((sum, [key, value]) => sum + value * (current[key] ?? 0), 0);
  const predicted = sigmoid((predictedRaw - 0.45) * 5);
  const error = actualScore - predicted;
  const updated = { ...current };

  for (const [key, value] of Object.entries(features)) {
    updated[key] = Math.max(-1, Math.min(1, (updated[key] ?? 0) + learningRate * error * value));
  }
  return updated;
}
