import {
  editorialReview,
  factualReview,
  generateEditorialPost,
  programmaticReview,
  repairPost
} from "@/lib/ai";
import { currentWeekStart, nextPublishAt } from "@/lib/pipeline";
import {
  calculateClusterScore,
  defaultWeights,
  predictEngagement,
  titleSimilarity,
  type LearnedWeights
} from "@/lib/scoring";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StoryCluster } from "@/lib/types";

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
};

type Settings = {
  timezone: string;
  publish_weekday: number;
  publish_hour: number;
  generation_lead_hours: number;
  auto_publish: boolean;
};

function numeric(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function learnedWeights(): Promise<LearnedWeights> {
  const { data } = await createAdminClient().from("model_weights").select("feature,weight");
  if (!data?.length) return defaultWeights();
  return Object.fromEntries(
    data.map((row: { feature: string; weight: number | string }) => [row.feature, Number(row.weight)])
  );
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
    .map((row: { feature: string; weight: number | string; sample_count: number }) =>
      `${row.feature}: ${numeric(row.weight).toFixed(3)} (${row.sample_count} amostras)`
    )
    .join("; ");
  const examples = (bestPosts ?? [])
    .map((row: { posts: unknown; engagement_score: number | string }) =>
      `${JSON.stringify(row.posts)} score=${numeric(row.engagement_score).toFixed(3)}`
    )
    .join("\n");
  return `Pesos atuais: ${weightText || "iniciais"}.\nPosts de melhor desempenho:\n${examples || "nenhum ainda"}`;
}

function selectedArticlesToClusters(articles: DbArticle[], weights: LearnedWeights) {
  const groups: DbArticle[][] = [];
  for (const article of articles) {
    const group = groups.find((candidate) =>
      candidate.some((member) => titleSimilarity(member.title, article.title) >= 0.42)
    );
    if (group) group.push(article);
    else groups.push([article]);
  }

  return groups.map((group) => {
    const representative = [...group].sort(
      (a, b) => numeric(b.source_quality) - numeric(a.source_quality)
    )[0];
    const uniqueSources = new Set(group.map((article) => article.source_name));
    const points = group.reduce((sum, article) => sum + numeric(article.popularity?.points), 0);
    const comments = group.reduce((sum, article) => sum + numeric(article.popularity?.comments), 0);
    const mentions = group.reduce((sum, article) => sum + numeric(article.popularity?.mentions, 1), 0);
    const popularityScore = Math.min(
      100,
      Math.log1p(points) * 12 + Math.log1p(comments) * 8 + uniqueSources.size * 11 + Math.log1p(mentions) * 4
    );
    const sourceQuality =
      group.reduce((sum, article) => sum + numeric(article.source_quality, 0.7), 0) / group.length;
    const ageHours = Math.max(
      0,
      (Date.now() - new Date(representative.published_at).getTime()) / 3_600_000
    );
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
}

async function startRun() {
  const { data, error } = await createAdminClient()
    .from("pipeline_runs")
    .insert({ stage: "generate-manual", status: "running", details: {} })
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

export async function generateManualStage(articleIds: string[]) {
  const uniqueArticleIds = [...new Set(articleIds)];
  if (uniqueArticleIds.length < 3 || uniqueArticleIds.length > 12) {
    throw new Error("Selecione entre 3 e 12 artigos.");
  }

  const runId = await startRun();
  try {
    const admin = createAdminClient();
    const { data: config, error: settingsError } = await admin
      .from("app_settings")
      .select("timezone,publish_weekday,publish_hour,generation_lead_hours,auto_publish")
      .eq("id", true)
      .single();
    if (settingsError) throw settingsError;

    const weekStart = currentWeekStart((config as Settings).timezone);
    const { data: existing } = await admin
      .from("posts")
      .select("id,status")
      .eq("week_start", weekStart)
      .maybeSingle();
    if (existing?.status === "published" || existing?.status === "publishing") {
      throw new Error("A publicação desta semana já foi publicada e não pode ser substituída.");
    }

    const { data, error } = await admin
      .from("articles")
      .select("id,title,summary,canonical_url,source_name,source_quality,content_type,published_at,popularity")
      .in("id", uniqueArticleIds);
    if (error) throw error;
    const articles = (data ?? []) as DbArticle[];
    if (articles.length !== uniqueArticleIds.length) {
      throw new Error("Um ou mais artigos selecionados não foram encontrados.");
    }

    const weights = await learnedWeights();
    const clusters = selectedArticlesToClusters(articles, weights).sort((a, b) => b.score - a.score);
    if (clusters.length < 3) {
      throw new Error(
        "Os artigos selecionados representam menos de três assuntos diferentes. Selecione artigos de pelo menos três histórias distintas."
      );
    }

    const guidance = await historicalGuidance();
    let post = await generateEditorialPost(clusters, guidance);
    let reviews = [
      programmaticReview(post),
      await factualReview(post, clusters),
      await editorialReview(post, guidance)
    ];
    if (!reviews.every((review) => review.passed)) {
      post = await repairPost(post, reviews, clusters);
      reviews = [
        programmaticReview(post),
        await factualReview(post, clusters),
        await editorialReview(post, guidance)
      ];
    }

    const approved = reviews.every((review) => review.passed);
    const scheduledFor = nextPublishAt(config as Settings);
    const selectedArticles = articles.map((article) => ({
      id: article.id,
      title: article.title,
      sourceName: article.source_name,
      sourceUrl: article.canonical_url
    }));

    if (existing) {
      const { error: deleteError } = await admin.from("posts").delete().eq("id", existing.id);
      if (deleteError) throw deleteError;
    }

    const { data: inserted, error: postError } = await admin
      .from("posts")
      .insert({
        week_start: weekStart,
        title: post.title,
        caption: post.caption,
        status: approved ? "approved" : "failed",
        selected_cluster_ids: [],
        features: post.features,
        review_report: {
          reviews,
          factualClaims: post.factualClaims,
          selectionMode: "manual",
          selectedArticles
        },
        scheduled_for: scheduledFor.toISOString(),
        last_error: approved ? null : "A revisão automática não foi aprovada após uma tentativa de correção."
      })
      .select("id")
      .single();
    if (postError) throw postError;

    const { error: slideError } = await admin.from("post_slides").insert(
      post.slides.map((slide) => ({
        post_id: inserted.id,
        position: slide.position,
        layout: slide.layout,
        content: slide
      }))
    );
    if (slideError) throw slideError;

    const details = {
      postId: inserted.id,
      approved,
      scheduledFor: scheduledFor.toISOString(),
      selectedArticleCount: articles.length,
      selectedStoryCount: clusters.length,
      reviews
    };
    await finishRun(runId, details);
    return details;
  } catch (error) {
    await failRun(runId, error);
    throw error;
  }
}
