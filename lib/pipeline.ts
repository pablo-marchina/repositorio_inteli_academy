import { createAdminClient } from "@/lib/supabase/admin";
import { collectCandidateArticles, DEFAULT_FEEDS, type FeedSource } from "@/lib/rss";
import {
  calculateClusterScore,
  defaultWeights,
  engagementScore,
  predictEngagement,
  titleSimilarity,
  updateWeights,
  type LearnedWeights
} from "@/lib/scoring";
import {
  editorialReview,
  factualReview,
  generateEditorialPost,
  programmaticReview,
  repairPost
} from "@/lib/ai";
import { env } from "@/lib/env";
import { fetchMediaInsights, publishCarousel } from "@/lib/instagram";
import { signPublicAsset } from "@/lib/crypto";
import type { InstagramAccount, PostSlide, StoryCluster } from "@/lib/types";

const DAY = 86_400_000;

type Settings = {
  timezone: string;
  publish_weekday: number;
  publish_hour: number;
  generation_lead_hours: number;
  auto_publish: boolean;
};

type DbArticle = {
  id: string;
  title: string;
  summary: string;
  canonical_url: string;
  source_name: string;
  source_quality: number;
  content_type: string;
  published_at: string;
  popularity: Record<string, number> | null;
};

function weekdayNumber(value: string) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value);
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: weekdayNumber(get("weekday"))
  };
}

function timeZoneOffset(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime();
}

function zonedDateToUtc(year: number, month: number, day: number, hour: number, timeZone: string) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour));
  const first = new Date(guess.getTime() - timeZoneOffset(guess, timeZone));
  return new Date(guess.getTime() - timeZoneOffset(first, timeZone));
}

export function currentWeekStart(timeZone: string, date = new Date()) {
  const parts = zonedParts(date, timeZone);
  const daysFromMonday = (parts.weekday + 6) % 7;
  const local = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  local.setUTCDate(local.getUTCDate() - daysFromMonday);
  return local.toISOString().slice(0, 10);
}

export function nextPublishAt(settings: Settings, from = new Date()) {
  const parts = zonedParts(from, settings.timezone);
  const daysAhead = (settings.publish_weekday - parts.weekday + 7) % 7;
  const local = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  local.setUTCDate(local.getUTCDate() + daysAhead);
  let candidate = zonedDateToUtc(
    local.getUTCFullYear(),
    local.getUTCMonth() + 1,
    local.getUTCDate(),
    settings.publish_hour,
    settings.timezone
  );
  if (candidate <= from) {
    local.setUTCDate(local.getUTCDate() + 7);
    candidate = zonedDateToUtc(
      local.getUTCFullYear(),
      local.getUTCMonth() + 1,
      local.getUTCDate(),
      settings.publish_hour,
      settings.timezone
    );
  }
  return candidate;
}

async function settings(): Promise<Settings> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("app_settings").select("*").eq("id", true).single();
  if (error) throw error;
  return data as Settings;
}

async function startRun(stage: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pipeline_runs")
    .insert({ stage, status: "running", details: {} })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function finishRun(runId: string, details: Record<string, unknown>) {
  await createAdminClient()
    .from("pipeline_runs")
    .update({ status: "success", details, finished_at: new Date().toISOString() })
    .eq("id", runId);
}

async function failRun(runId: string, error: unknown) {
  await createAdminClient()
    .from("pipeline_runs")
    .update({ status: "failed", error: String(error), finished_at: new Date().toISOString() })
    .eq("id", runId);
}

async function learnedWeights(): Promise<LearnedWeights> {
  const { data } = await createAdminClient().from("model_weights").select("feature,weight");
  if (!data?.length) return defaultWeights();
  return Object.fromEntries(data.map((row: { feature: string; weight: number | string }) => [row.feature, Number(row.weight)]));
}

function numeric(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function collectStage() {
  const runId = await startRun("collect");
  try {
    const admin = createAdminClient();
    const { data: sourceRows } = await admin.from("sources").select("name,url,quality,content_type").eq("enabled", true);
    const feeds: FeedSource[] = sourceRows?.length
      ? sourceRows.map((row: { name: string; url: string; quality: number | string; content_type: string }) => ({
          name: row.name,
          url: row.url,
          quality: numeric(row.quality, 0.7),
          contentType: row.content_type as FeedSource["contentType"]
        }))
      : DEFAULT_FEEDS;
    const { articles, failures } = await collectCandidateArticles(feeds);
    const cutoff = Date.now() - 10 * DAY;
    const recent = articles.filter((article) => new Date(article.publishedAt).getTime() >= cutoff);
    const rows = recent.map((article) => ({
      canonical_url: article.url,
      title: article.title,
      summary: article.summary,
      source_name: article.source,
      source_quality: article.sourceQuality,
      content_type: article.contentType,
      published_at: article.publishedAt,
      popularity: article.popularity,
      raw: article
    }));
    if (rows.length) {
      const { error } = await admin.from("articles").upsert(rows, { onConflict: "canonical_url" });
      if (error) throw error;
    }
    const clustered = await clusterRecentArticles();
    const details = { collected: rows.length, failures, clusters: clustered };
    await finishRun(runId, details);
    return details;
  } catch (error) {
    await failRun(runId, error);
    throw error;
  }
}

async function clusterRecentArticles() {
  const admin = createAdminClient();
  const config = await settings();
  const weekStart = currentWeekStart(config.timezone);
  const since = new Date(Date.now() - 8 * DAY).toISOString();
  const { data, error } = await admin
    .from("articles")
    .select("id,title,summary,canonical_url,source_name,source_quality,content_type,published_at,popularity")
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(600);
  if (error) throw error;

  const groups: DbArticle[][] = [];
  for (const article of (data ?? []) as DbArticle[]) {
    const group = groups.find((candidate) => candidate.some((member) => titleSimilarity(member.title, article.title) >= 0.42));
    if (group) group.push(article);
    else groups.push([article]);
  }

  const weights = await learnedWeights();
  const prepared = groups.map((group) => {
    const representative = [...group].sort((a, b) => numeric(b.source_quality) - numeric(a.source_quality))[0];
    const uniqueSources = new Set(group.map((article) => article.source_name));
    const points = group.reduce((sum, article) => sum + numeric(article.popularity?.points), 0);
    const comments = group.reduce((sum, article) => sum + numeric(article.popularity?.comments), 0);
    const popularityScore = Math.min(100, Math.log1p(points) * 12 + Math.log1p(comments) * 8 + uniqueSources.size * 11);
    const sourceQuality = group.reduce((sum, article) => sum + numeric(article.source_quality, 0.7), 0) / group.length;
    const ageHours = Math.max(0, (Date.now() - new Date(representative.published_at).getTime()) / 3_600_000);
    const noveltyScore = Math.max(0.15, 1 - ageHours / (9 * 24));
    const clarityScore = representative.title.length >= 28 && representative.title.length <= 110 ? 0.9 : 0.65;
    const topicCounts = group.reduce<Record<string, number>>((acc, article) => {
      acc[article.content_type] = (acc[article.content_type] ?? 0) + 1;
      return acc;
    }, {});
    const topic = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other";
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
    cluster.predictedEngagement = predictEngagement(cluster, weights);
    cluster.score = calculateClusterScore(cluster, weights);
    return cluster;
  });

  await admin.from("story_clusters").delete().eq("week_start", weekStart).eq("status", "candidate");
  let inserted = 0;
  for (const cluster of prepared.sort((a, b) => b.score - a.score).slice(0, 80)) {
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
  return inserted;
}

async function historicalGuidance() {
  const admin = createAdminClient();
  const { data: weights } = await admin
    .from("model_weights")
    .select("feature,weight,sample_count")
    .order("weight", { ascending: false });
  const { data: bestPosts } = await admin
    .from("post_metrics")
    .select("engagement_score,posts(title,features)")
    .order("engagement_score", { ascending: false })
    .limit(5);
  const weightText = (weights ?? [])
    .map((row: { feature: string; weight: number | string; sample_count: number }) => `${row.feature}: ${numeric(row.weight).toFixed(3)} (${row.sample_count} amostras)`)
    .join("; ");
  const examples = (bestPosts ?? [])
    .map((row: { posts: unknown; engagement_score: number | string }) => `${JSON.stringify(row.posts)} score=${numeric(row.engagement_score).toFixed(3)}`)
    .join("\n");
  return `Pesos atuais: ${weightText || "iniciais"}.\nPosts de melhor desempenho:\n${examples || "nenhum ainda"}`;
}

function rowToCluster(row: Record<string, unknown>): StoryCluster {
  return {
    id: String(row.id),
    title: String(row.title),
    summary: String(row.summary ?? ""),
    topic: String(row.topic ?? "other"),
    articleIds: [],
    sourceUrls: Array.isArray(row.source_urls) ? (row.source_urls as string[]) : [],
    sourceCount: numeric(row.source_count, 1),
    sourceQuality: numeric(row.source_quality, 0.7),
    popularityScore: numeric(row.popularity_score),
    noveltyScore: numeric(row.novelty_score),
    clarityScore: numeric(row.clarity_score),
    predictedEngagement: numeric(row.predicted_engagement),
    score: numeric(row.score)
  };
}

export async function generateStage(force = false) {
  const runId = await startRun("generate");
  try {
    const admin = createAdminClient();
    const config = await settings();
    const weekStart = currentWeekStart(config.timezone);
    const { data: existing } = await admin.from("posts").select("id,status").eq("week_start", weekStart).maybeSingle();
    if (existing && !force) {
      const details = { skipped: true, reason: "post already exists", postId: existing.id, status: existing.status };
      await finishRun(runId, details);
      return details;
    }
    if (existing && force) {
      if (existing.status === "published" || existing.status === "publishing") {
        const details = { skipped: true, reason: "published posts are immutable", postId: existing.id, status: existing.status };
        await finishRun(runId, details);
        return details;
      }
      await admin.from("posts").delete().eq("id", existing.id);
    }

    const { data: rows, error } = await admin
      .from("story_clusters")
      .select("*")
      .eq("week_start", weekStart)
      .order("score", { ascending: false })
      .limit(12);
    if (error) throw error;
    const allClusters = (rows ?? []).map((row: Record<string, unknown>) => rowToCluster(row));
    const qualified = allClusters.filter((cluster: StoryCluster) => cluster.sourceQuality >= 0.75 || cluster.sourceCount >= 2);
    const clusters = qualified.length >= 3 ? qualified : allClusters;
    if (clusters.length < 3) throw new Error("Not enough story clusters. Run collection first.");

    const guidance = await historicalGuidance();
    let post = await generateEditorialPost(clusters, guidance);
    let reviews = [programmaticReview(post), await factualReview(post, clusters), await editorialReview(post, guidance)];
    if (!reviews.every((review) => review.passed)) {
      post = await repairPost(post, reviews, clusters);
      reviews = [programmaticReview(post), await factualReview(post, clusters), await editorialReview(post, guidance)];
    }
    const approved = reviews.every((review) => review.passed);
    const scheduledFor = nextPublishAt(config);
    const { data: inserted, error: postError } = await admin
      .from("posts")
      .insert({
        week_start: weekStart,
        title: post.title,
        caption: post.caption,
        status: approved ? "approved" : "failed",
        selected_cluster_ids: clusters.slice(0, 5).map((cluster: StoryCluster) => cluster.id),
        features: post.features,
        review_report: { reviews, factualClaims: post.factualClaims },
        scheduled_for: scheduledFor.toISOString(),
        last_error: approved ? null : "Automatic review did not pass after one repair attempt."
      })
      .select("id")
      .single();
    if (postError) throw postError;
    const slideRows = post.slides.map((slide) => ({
      post_id: inserted.id,
      position: slide.position,
      layout: slide.layout,
      content: slide
    }));
    const { error: slideError } = await admin.from("post_slides").insert(slideRows);
    if (slideError) throw slideError;
    const details = { postId: inserted.id, approved, scheduledFor: scheduledFor.toISOString(), reviews };
    await finishRun(runId, details);
    return details;
  } catch (error) {
    await failRun(runId, error);
    throw error;
  }
}

async function activeInstagramAccount(): Promise<InstagramAccount | null> {
  const { data, error } = await createAdminClient()
    .from("instagram_accounts")
    .select("*")
    .eq("is_active", true)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    instagramUserId: data.instagram_user_id,
    username: data.username,
    accountType: data.account_type,
    accessTokenEncrypted: data.access_token_encrypted,
    tokenExpiresAt: data.token_expires_at
  };
}

export async function publishStage(forcePostId?: string) {
  const runId = await startRun("publish");
  const admin = createAdminClient();
  let postId: string | undefined = forcePostId;
  try {
    const account = await activeInstagramAccount();
    if (!account) throw new Error("No active Instagram professional account is connected.");
    let query = admin
      .from("posts")
      .select("id,caption,status,scheduled_for,publish_attempts")
      .in("status", ["approved", "scheduled"])
      .order("scheduled_for", { ascending: true })
      .limit(1);
    if (forcePostId) query = query.eq("id", forcePostId);
    else query = query.lte("scheduled_for", new Date().toISOString());
    const { data: post, error } = await query.maybeSingle();
    if (error) throw error;
    if (!post) {
      const details = { skipped: true, reason: "no post due" };
      await finishRun(runId, details);
      return details;
    }
    postId = post.id;
    await admin
      .from("posts")
      .update({ status: "publishing", publish_attempts: numeric(post.publish_attempts) + 1, last_error: null })
      .eq("id", post.id);
    const { data: slides, error: slidesError } = await admin
      .from("post_slides")
      .select("position")
      .eq("post_id", post.id)
      .order("position");
    if (slidesError) throw slidesError;
    if (!slides || slides.length < 2) throw new Error("Post has fewer than two slides.");
    const imageUrls = slides.map((slide: { position: number }) => {
      const value = `${post.id}:${slide.position}`;
      const signature = signPublicAsset(value);
      return `${env().NEXT_PUBLIC_APP_URL}/api/render/${post.id}/${slide.position}?sig=${encodeURIComponent(signature)}`;
    });
    const published = await publishCarousel(account, imageUrls, post.caption);
    await admin
      .from("posts")
      .update({ status: "published", published_at: new Date().toISOString(), instagram_media_id: published.id })
      .eq("id", post.id);
    const details = { postId: post.id, mediaId: published.id, username: account.username };
    await finishRun(runId, details);
    return details;
  } catch (error) {
    if (postId) {
      const { data: current } = await admin.from("posts").select("publish_attempts").eq("id", postId).single();
      await admin
        .from("posts")
        .update({ status: numeric(current?.publish_attempts) >= 3 ? "failed" : "approved", last_error: String(error) })
        .eq("id", postId);
    }
    await failRun(runId, error);
    throw error;
  }
}

export async function syncMetricsStage() {
  const runId = await startRun("metrics");
  try {
    const admin = createAdminClient();
    const account = await activeInstagramAccount();
    if (!account) throw new Error("No active Instagram account is connected.");
    const { data: posts, error } = await admin
      .from("posts")
      .select("id,instagram_media_id,features,published_at,learning_applied_at")
      .eq("status", "published")
      .gte("published_at", new Date(Date.now() - 45 * DAY).toISOString());
    if (error) throw error;
    let captured = 0;
    let weights = await learnedWeights();
    for (const post of posts ?? []) {
      if (!post.instagram_media_id) continue;
      try {
        const metrics = await fetchMediaInsights(account, post.instagram_media_id);
        const score = engagementScore(metrics);
        await admin.from("post_metrics").insert({
          post_id: post.id,
          views: metrics.views,
          reach: metrics.reach,
          likes: metrics.likes,
          comments: metrics.comments,
          saved: metrics.saved,
          shares: metrics.shares,
          follows: metrics.follows,
          profile_visits: metrics.profileVisits,
          total_interactions: metrics.totalInteractions,
          engagement_score: score
        });
        captured += 1;
        const oldEnough = Date.now() - new Date(post.published_at).getTime() >= 48 * 3_600_000;
        if (!post.learning_applied_at && oldEnough) {
          const numericFeatures = Object.fromEntries(
            Object.entries((post.features ?? {}) as Record<string, unknown>)
              .filter(([, value]) => typeof value === "number")
              .map(([key, value]) => [key, Number(value)])
          );
          weights = updateWeights(weights, numericFeatures, score);
          for (const [feature, weight] of Object.entries(weights)) {
            const { data: existing } = await admin.from("model_weights").select("sample_count").eq("feature", feature).maybeSingle();
            await admin.from("model_weights").upsert({
              feature,
              weight,
              sample_count: numeric(existing?.sample_count) + 1,
              updated_at: new Date().toISOString()
            });
          }
          await admin.from("posts").update({ learning_applied_at: new Date().toISOString() }).eq("id", post.id);
        }
      } catch (postError) {
        await admin.from("pipeline_runs").insert({
          stage: "metrics-item",
          status: "failed",
          error: `${post.id}: ${String(postError)}`,
          finished_at: new Date().toISOString()
        });
      }
    }
    const details = { captured };
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

export async function cronTick() {
  const config = await settings();
  const result: Record<string, unknown> = {};
  const lastCollect = await lastSuccessfulRun("collect");
  if (!lastCollect || Date.now() - lastCollect.getTime() >= 20 * 3_600_000) result.collect = await collectStage();

  const nextPublish = nextPublishAt(config);
  const generationOpensAt = new Date(nextPublish.getTime() - config.generation_lead_hours * 3_600_000);
  const weekStart = currentWeekStart(config.timezone);
  const { data: weeklyPost } = await createAdminClient().from("posts").select("id").eq("week_start", weekStart).maybeSingle();
  if (!weeklyPost && new Date() >= generationOpensAt) result.generate = await generateStage();

  const account = await activeInstagramAccount();
  if (config.auto_publish && account) result.publish = await publishStage();
  else if (config.auto_publish) result.publish = { skipped: true, reason: "no Instagram account connected" };
  const lastMetrics = await lastSuccessfulRun("metrics");
  if (account && (!lastMetrics || Date.now() - lastMetrics.getTime() >= 12 * 3_600_000)) {
    result.metrics = await syncMetricsStage();
  }
  return result;
}

export function slideFromRow(content: unknown): PostSlide {
  return content as PostSlide;
}
