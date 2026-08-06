import { env } from "@/lib/env";
import {
  classifyArticleBatch,
  type ArticleInsight,
  type ArticleIntelligenceInput
} from "@/lib/intelligence-ai";
import { collectStage, cronTick, currentWeekStart } from "@/lib/pipeline";
import { collectFeed, canonicalizeUrl, type FeedSource } from "@/lib/rss";
import {
  calculateClusterScore,
  defaultWeights,
  predictEngagement,
  titleSimilarity,
  type LearnedWeights
} from "@/lib/scoring";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ArticleCandidate, StoryCluster } from "@/lib/types";

const DAY = 86_400_000;
const COMMUNITY_SOURCE_QUALITY = 0.64;
const FEED_CONCURRENCY = 16;

type DbArticle = {
  id: string;
  title: string;
  summary: string;
  canonical_url: string;
  source_name: string;
  source_quality: number | string;
  content_type: string;
  published_at: string;
  popularity: Record<string, number> | null;
  raw: unknown;
};

function numeric(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function insightFromRaw(value: unknown): ArticleInsight | null {
  const insight = asRecord(asRecord(value).insight);
  const relevanceScore = numeric(insight.relevanceScore, Number.NaN);
  const category = insight.category;
  if (!String(insight.articleId ?? "") || !Number.isFinite(relevanceScore) || typeof category !== "string") {
    return null;
  }
  return {
    articleId: String(insight.articleId),
    relevanceScore,
    category: category as ArticleInsight["category"],
    rationale: String(insight.rationale ?? "")
  };
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>
) {
  const results: Array<PromiseSettledResult<R>> = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { status: "fulfilled", value: await worker(values[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => run()));
  return results;
}

function safeFeedUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (!url.protocol.match(/^https?:$/)) return false;
    const host = url.hostname.toLocaleLowerCase("en-US");
    if (host === "localhost" || host.endsWith(".local") || host === "::1") return false;
    if (/^(10\.|127\.|169\.254\.|192\.168\.)/.test(host)) return false;
    const private172 = host.match(/^172\.(\d+)\./);
    if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;
    if (/^(fc|fd|fe80)/i.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function sourceNameFromUrl(rawUrl: string) {
  const host = new URL(rawUrl).hostname.replace(/^www\./, "");
  const label = host.split(".")[0].replace(/[-_]+/g, " ");
  return label.replace(/\b\w/g, (character) => character.toUpperCase());
}

function inferContentType(url: string): FeedSource["contentType"] {
  const normalized = url.toLocaleLowerCase("en-US");
  if (/arxiv|research|paper|journal|science|academic/.test(normalized)) return "research";
  if (/github|huggingface|developer|tool|product/.test(normalized)) return "tool";
  if (/business|market|venture|startup|techcrunch/.test(normalized)) return "market";
  if (/policy|regulat|ethic|govern/.test(normalized)) return "regulation";
  return "news";
}

async function fetchText(url: string, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "InteliAcademyAIWeekly/3.0 (+https://inteli.edu.br)" },
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function discoverCommunityFeeds(): Promise<FeedSource[]> {
  const config = env();
  if (!config.COMMUNITY_FEED_DISCOVERY) return [];

  const readme = await fetchText(config.COMMUNITY_FEED_CATALOG_URL);
  const sectionMatch = readme.match(/## AI, ML, Big Data News([\s\S]*?)(?:\n## |$)/i);
  const section = sectionMatch?.[1] ?? readme;
  const urls = [...section.matchAll(/\(RSS feed:\s*(https?:\/\/[^)\s]+)\)/gi)]
    .map((match) => match[1].trim())
    .filter(safeFeedUrl);
  const unique = [...new Set(urls)];
  return unique.map((url) => ({
    name: sourceNameFromUrl(url),
    url,
    quality: COMMUNITY_SOURCE_QUALITY,
    contentType: inferContentType(url)
  }));
}

async function preservedInsights() {
  const since = new Date(Date.now() - 21 * DAY).toISOString();
  const { data } = await createAdminClient()
    .from("articles")
    .select("canonical_url,raw")
    .gte("published_at", since)
    .limit(3000);
  const result = new Map<string, ArticleInsight>();
  for (const row of data ?? []) {
    const insight = insightFromRaw(row.raw);
    if (insight) result.set(String(row.canonical_url), insight);
  }
  return result;
}

async function restorePreservedInsights(insights: Map<string, ArticleInsight>) {
  const admin = createAdminClient();
  let restored = 0;
  for (const urlChunk of chunks([...insights.keys()], 100)) {
    const { data } = await admin
      .from("articles")
      .select("id,canonical_url,raw")
      .in("canonical_url", urlChunk);
    await Promise.all(
      (data ?? []).map(async (row) => {
        const insight = insights.get(String(row.canonical_url));
        if (!insight || insightFromRaw(row.raw)) return;
        const { error } = await admin
          .from("articles")
          .update({
            raw: {
              ...asRecord(row.raw),
              insight,
              classifiedAt: new Date().toISOString()
            }
          })
          .eq("id", row.id);
        if (!error) restored += 1;
      })
    );
  }
  return restored;
}

async function collectCommunityArticles(insights: Map<string, ArticleInsight>) {
  let feeds: FeedSource[] = [];
  try {
    feeds = await discoverCommunityFeeds();
  } catch (error) {
    return {
      discoveredFeeds: 0,
      successfulFeeds: 0,
      collected: 0,
      failureCount: 1,
      failures: [`catalog: ${String(error)}`]
    };
  }
  if (!feeds.length) {
    return { discoveredFeeds: 0, successfulFeeds: 0, collected: 0, failureCount: 0, failures: [] as string[] };
  }

  const results = await mapWithConcurrency(feeds, FEED_CONCURRENCY, collectFeed);
  const failures = results
    .map((result, index) =>
      result.status === "rejected" ? `${feeds[index].name}: ${String(result.reason)}` : null
    )
    .filter((value): value is string => Boolean(value));
  const cutoff = Date.now() - 10 * DAY;
  const seen = new Set<string>();
  const articles = results
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter((article) => new Date(article.publishedAt).getTime() >= cutoff)
    .filter((article) => {
      const canonical = canonicalizeUrl(article.url);
      if (seen.has(canonical)) return false;
      seen.add(canonical);
      article.url = canonical;
      return true;
    });

  const rows = articles.map((article: ArticleCandidate) => {
    const insight = insights.get(article.url);
    return {
      canonical_url: article.url,
      title: article.title,
      summary: article.summary,
      source_name: article.source,
      source_quality: article.sourceQuality,
      content_type: article.contentType,
      published_at: article.publishedAt,
      popularity: article.popularity,
      raw: {
        ...article,
        discovery: "community-catalog",
        ...(insight ? { insight, classifiedAt: new Date().toISOString() } : {})
      }
    };
  });

  const admin = createAdminClient();
  for (const rowChunk of chunks(rows, 250)) {
    const { error } = await admin.from("articles").upsert(rowChunk, { onConflict: "canonical_url" });
    if (error) throw error;
  }

  return {
    discoveredFeeds: feeds.length,
    successfulFeeds: results.filter((result) => result.status === "fulfilled").length,
    collected: rows.length,
    failureCount: failures.length,
    failures: failures.slice(0, 100)
  };
}

function looksLikeAi(article: Pick<DbArticle, "title" | "summary" | "content_type">) {
  if (["research", "tool", "regulation"].includes(article.content_type)) return true;
  return /\b(ai|artificial intelligence|machine learning|deep learning|llm|language model|transformer|neural|computer vision|robotics|generative|foundation model|openai|anthropic|deepmind|gemini|claude|nvidia|hugging face|mistral|meta ai)\b/i.test(
    `${article.title} ${article.summary}`
  );
}

function articlePriority(article: DbArticle) {
  const popularity = article.popularity ?? {};
  const ageHours = Math.max(0, (Date.now() - new Date(article.published_at).getTime()) / 3_600_000);
  const lowSignal = /\b(webinar|podcast|newsletter|jobs?|hiring|sponsored|event|conference registration|weekly roundup)\b/i.test(article.title) ? 1.8 : 0;
  const titleClarity = article.title.length >= 25 && article.title.length <= 115 ? 1.2 : 0.5;
  return (
    numeric(article.source_quality, 0.6) * 4 +
    Math.log1p(numeric(popularity.points)) +
    Math.log1p(numeric(popularity.comments)) * 0.7 +
    Math.log1p(numeric(popularity.mentions, 1)) * 0.4 +
    Math.max(0, 2.5 - ageHours / 64) +
    titleClarity -
    lowSignal
  );
}

async function classifyRecentArticles() {
  const config = env();
  if (!config.GEMINI_API_KEY || config.MAX_ARTICLES_TO_CLASSIFY === 0) {
    return {
      considered: 0,
      classified: 0,
      accepted: 0,
      threshold: config.MIN_ARTICLE_RELEVANCE,
      failures: [] as string[],
      skipped: "Gemini not configured or classification disabled"
    };
  }

  const since = new Date(Date.now() - 10 * DAY).toISOString();
  const { data, error } = await createAdminClient()
    .from("articles")
    .select("id,title,summary,canonical_url,source_name,source_quality,content_type,published_at,popularity,raw")
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(3000);
  if (error) throw error;

  const pending = ((data ?? []) as DbArticle[])
    .filter((article) => !insightFromRaw(article.raw) && looksLikeAi(article))
    .sort((a, b) => articlePriority(b) - articlePriority(a))
    .slice(0, config.MAX_ARTICLES_TO_CLASSIFY);

  const failures: string[] = [];
  let classified = 0;
  let accepted = 0;
  const admin = createAdminClient();

  for (const batch of chunks(pending, 18)) {
    try {
      const inputs: ArticleIntelligenceInput[] = batch.map((article) => ({
        id: article.id,
        title: article.title,
        summary: article.summary,
        sourceName: article.source_name,
        sourceUrl: article.canonical_url,
        publishedAt: article.published_at
      }));
      const insights = await classifyArticleBatch(inputs);
      const byId = new Map(insights.map((insight) => [insight.articleId, insight]));
      for (const article of batch) {
        const insight = byId.get(article.id);
        if (!insight) continue;
        const acceptedForRanking = insight.relevanceScore >= config.MIN_ARTICLE_RELEVANCE;
        const { error: updateError } = await admin
          .from("articles")
          .update({
            raw: {
              ...asRecord(article.raw),
              insight,
              filterDecision: acceptedForRanking ? "accepted" : "rejected",
              classifiedAt: new Date().toISOString()
            }
          })
          .eq("id", article.id);
        if (updateError) throw updateError;
        classified += 1;
        if (acceptedForRanking) accepted += 1;
      }
    } catch (error) {
      failures.push(`${batch.map((article) => article.id).join(",")}: ${String(error)}`);
    }
  }

  return {
    considered: pending.length,
    classified,
    accepted,
    threshold: config.MIN_ARTICLE_RELEVANCE,
    failures: failures.slice(0, 50)
  };
}

async function learnedWeights(): Promise<LearnedWeights> {
  const { data } = await createAdminClient().from("model_weights").select("feature,weight");
  if (!data?.length) return defaultWeights();
  return Object.fromEntries(
    data.map((row: { feature: string; weight: number | string }) => [row.feature, Number(row.weight)])
  );
}

function categoryToTopic(category: string | undefined, fallback: string) {
  if (category === "Pesquisa Acadêmica") return "research";
  if (category === "Mercado e Negócios") return "market";
  if (category === "Ferramentas Dev") return "tool";
  if (category === "Ética e Regulação") return "regulation";
  return fallback || "other";
}

async function reclusterWithRelevance() {
  const admin = createAdminClient();
  const { data: config, error: settingsError } = await admin
    .from("app_settings")
    .select("timezone")
    .eq("id", true)
    .single();
  if (settingsError) throw settingsError;
  const weekStart = currentWeekStart(String(config.timezone));
  const since = new Date(Date.now() - 8 * DAY).toISOString();
  const { data, error } = await admin
    .from("articles")
    .select("id,title,summary,canonical_url,source_name,source_quality,content_type,published_at,popularity,raw")
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(3000);
  if (error) throw error;

  const minimum = env().MIN_ARTICLE_RELEVANCE;
  const eligible = ((data ?? []) as DbArticle[]).filter((article) => {
    const insight = insightFromRaw(article.raw);
    if (insight) return insight.relevanceScore >= minimum;
    return numeric(article.source_quality) >= 0.9 && looksLikeAi(article);
  });

  const groups: DbArticle[][] = [];
  for (const article of eligible) {
    const group = groups.find((candidate) =>
      candidate.some((member) => titleSimilarity(member.title, article.title) >= 0.42)
    );
    if (group) group.push(article);
    else groups.push([article]);
  }

  const weights = await learnedWeights();
  const prepared = groups.map((group) => {
    const representative = [...group].sort((a, b) => {
      const aScore = (insightFromRaw(a.raw)?.relevanceScore ?? 5.5) + numeric(a.source_quality) * 2;
      const bScore = (insightFromRaw(b.raw)?.relevanceScore ?? 5.5) + numeric(b.source_quality) * 2;
      return bScore - aScore;
    })[0];
    const uniqueSources = new Set(group.map((article) => article.source_name));
    const points = group.reduce((sum, article) => sum + numeric(article.popularity?.points), 0);
    const comments = group.reduce((sum, article) => sum + numeric(article.popularity?.comments), 0);
    const mentions = group.reduce((sum, article) => sum + numeric(article.popularity?.mentions, 1), 0);
    const popularityScore = Math.min(
      100,
      Math.log1p(points) * 12 +
        Math.log1p(comments) * 8 +
        uniqueSources.size * 11 +
        Math.log1p(mentions) * 4
    );
    const sourceQuality =
      group.reduce((sum, article) => sum + numeric(article.source_quality, 0.7), 0) / group.length;
    const ageHours = Math.max(
      0,
      (Date.now() - new Date(representative.published_at).getTime()) / 3_600_000
    );
    const noveltyScore = Math.max(0.15, 1 - ageHours / (9 * 24));
    const clarityScore = representative.title.length >= 28 && representative.title.length <= 110 ? 0.9 : 0.65;
    const insights = group
      .map((article) => insightFromRaw(article.raw))
      .filter((value): value is ArticleInsight => Boolean(value));
    const editorialRelevance = insights.length
      ? insights.reduce((sum, insight) => sum + insight.relevanceScore / 10, 0) / insights.length
      : 0.55;
    const contentCounts = group.reduce<Record<string, number>>((acc, article) => {
      const topic = categoryToTopic(insightFromRaw(article.raw)?.category, article.content_type);
      acc[topic] = (acc[topic] ?? 0) + 1;
      return acc;
    }, {});
    const topic = Object.entries(contentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other";
    const cluster: StoryCluster = {
      title: representative.title,
      summary: representative.summary,
      topic,
      articleIds: group.map((article) => article.id),
      sourceUrls: [...new Set(group.map((article) => article.canonical_url))],
      sourceCount: uniqueSources.size,
      sourceQuality,
      popularityScore,
      noveltyScore,
      clarityScore,
      predictedEngagement: 0,
      score: 0
    };
    const basePrediction = predictEngagement(cluster, weights);
    const baseScore = calculateClusterScore(cluster, weights);
    cluster.predictedEngagement = Math.min(1, basePrediction * 0.82 + editorialRelevance * 0.18);
    cluster.score = Math.round(Math.min(100, baseScore * 0.82 + editorialRelevance * 18) * 10) / 10;
    return cluster;
  });

  await admin.from("story_clusters").delete().eq("week_start", weekStart).eq("status", "candidate");
  let inserted = 0;
  for (const cluster of prepared.sort((a, b) => b.score - a.score).slice(0, 100)) {
    const { data: row, error: insertError } = await admin
      .from("story_clusters")
      .insert({
        week_start: weekStart,
        title: cluster.title,
        summary: cluster.summary,
        topic: cluster.topic,
        source_urls: cluster.sourceUrls,
        source_count: cluster.sourceCount,
        source_quality: cluster.sourceQuality,
        popularity_score: cluster.popularityScore,
        novelty_score: cluster.noveltyScore,
        clarity_score: cluster.clarityScore,
        predicted_engagement: cluster.predictedEngagement,
        score: cluster.score,
        status: "candidate"
      })
      .select("id")
      .single();
    if (insertError) throw insertError;
    if (cluster.articleIds.length) {
      const { error: joinError } = await admin
        .from("cluster_articles")
        .insert(cluster.articleIds.map((articleId) => ({ cluster_id: row.id, article_id: articleId })));
      if (joinError) throw joinError;
    }
    inserted += 1;
  }
  return { eligibleArticles: eligible.length, clusters: inserted };
}

async function startRun(stage: string) {
  const { data, error } = await createAdminClient()
    .from("pipeline_runs")
    .insert({ stage, status: "running", details: {} })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function finishRun(runId: string, details: Record<string, unknown>) {
  const { error } = await createAdminClient()
    .from("pipeline_runs")
    .update({ status: "success", details, finished_at: new Date().toISOString() })
    .eq("id", runId);
  if (error) throw error;
}

async function failRun(runId: string, error: unknown) {
  await createAdminClient()
    .from("pipeline_runs")
    .update({ status: "failed", error: String(error), finished_at: new Date().toISOString() })
    .eq("id", runId);
}

function baseCollectionDetails(value: unknown) {
  const record = asRecord(value);
  return {
    collected: numeric(record.collected),
    failures: Array.isArray(record.failures) ? record.failures.map(String) : []
  };
}

export async function enhancedCollectStage() {
  const runId = await startRun("collect-filter");
  try {
    const preserved = await preservedInsights();
    const base = await collectStage();
    const restored = await restorePreservedInsights(preserved);
    const community = await collectCommunityArticles(preserved);
    const filtering = await classifyRecentArticles();
    const ranking = await reclusterWithRelevance();
    const baseDetails = baseCollectionDetails(base);
    const details = {
      collected: baseDetails.collected + community.collected,
      base,
      restoredClassifications: restored,
      catalog: community,
      filtering,
      ranking,
      failureCount: baseDetails.failures.length + community.failureCount + filtering.failures.length
    };
    await finishRun(runId, details);
    return details;
  } catch (error) {
    await failRun(runId, error);
    throw error;
  }
}

async function lastSuccessfulRun(stage: string) {
  const { data } = await createAdminClient()
    .from("pipeline_runs")
    .select("finished_at")
    .eq("stage", stage)
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.finished_at ? new Date(data.finished_at) : null;
}

export async function enhancedCronTick() {
  const result: Record<string, unknown> = {};
  const lastCollection = await lastSuccessfulRun("collect-filter");
  if (!lastCollection || Date.now() - lastCollection.getTime() >= 20 * 3_600_000) {
    result.collection = await enhancedCollectStage();
  }
  result.core = await cronTick();
  return result;
}
