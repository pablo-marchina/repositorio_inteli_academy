import { XMLParser } from "fast-xml-parser";
import type { ArticleCandidate } from "@/lib/types";

export type FeedSource = {
  name: string;
  url: string;
  quality: number;
  contentType: ArticleCandidate["contentType"];
};

export const DEFAULT_FEEDS: FeedSource[] = [
  { name: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml", quality: 0.96, contentType: "research" },
  { name: "Google AI", url: "https://blog.google/technology/ai/rss/", quality: 0.94, contentType: "news" },
  { name: "MIT Technology Review AI", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed", quality: 0.9, contentType: "news" },
  { name: "VentureBeat AI", url: "https://venturebeat.com/category/ai/feed/", quality: 0.76, contentType: "market" },
  { name: "arXiv cs.AI", url: "https://export.arxiv.org/rss/cs.AI", quality: 0.9, contentType: "research" },
  { name: "arXiv cs.LG", url: "https://export.arxiv.org/rss/cs.LG", quality: 0.9, contentType: "research" },
  { name: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml", quality: 0.88, contentType: "tool" },
  { name: "NVIDIA AI", url: "https://blogs.nvidia.com/blog/category/deep-learning/feed/", quality: 0.9, contentType: "news" }
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  cdataPropName: "#cdata"
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return stringValue(record["#text"] ?? record["#cdata"] ?? record["@_href"] ?? "");
  }
  return "";
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWithTimeout(url: string, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "InteliAcademyAIWeekly/1.0 (+https://inteli.edu.br)" },
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function collectFeed(source: FeedSource): Promise<ArticleCandidate[]> {
  const xml = await fetchWithTimeout(source.url);
  const document = parser.parse(xml) as Record<string, unknown>;
  const rss = document.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  const feed = document.feed as Record<string, unknown> | undefined;
  const entries = channel ? asArray(channel.item) : asArray(feed?.entry);

  return entries
    .map((entry) => {
      const item = entry as Record<string, unknown>;
      const linkValue = item.link;
      const link = Array.isArray(linkValue)
        ? stringValue((linkValue as unknown[]).find((candidate) => {
            const record = candidate as Record<string, unknown>;
            return record?.["@_rel"] === "alternate" || !record?.["@_rel"];
          }))
        : stringValue(linkValue);
      const title = stripHtml(stringValue(item.title));
      const summary = stripHtml(stringValue(item.description ?? item.summary ?? item.content)).slice(0, 1200);
      const publishedAt = stringValue(item.pubDate ?? item.published ?? item.updated ?? item["dc:date"]);

      return {
        title,
        url: link || stringValue(item.guid ?? item.id),
        source: source.name,
        summary,
        publishedAt: new Date(publishedAt || Date.now()).toISOString(),
        contentType: source.contentType,
        sourceQuality: source.quality,
        popularity: { mentions: 1 }
      } satisfies ArticleCandidate;
    })
    .filter((article) => article.title.length >= 8 && article.url.startsWith("http"));
}

async function collectHackerNews(): Promise<ArticleCandidate[]> {
  const since = Math.floor((Date.now() - 8 * 24 * 60 * 60 * 1000) / 1000);
  const endpoint = new URL("https://hn.algolia.com/api/v1/search_by_date");
  endpoint.searchParams.set("query", "AI");
  endpoint.searchParams.set("tags", "story");
  endpoint.searchParams.set("numericFilters", `created_at_i>${since}`);
  endpoint.searchParams.set("hitsPerPage", "80");

  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) throw new Error(`HN API failed: ${response.status}`);
  const payload = (await response.json()) as {
    hits?: Array<{
      title?: string;
      url?: string;
      story_text?: string;
      created_at?: string;
      points?: number;
      num_comments?: number;
      objectID?: string;
    }>;
  };

  return (payload.hits ?? [])
    .filter((hit) => hit.title && (hit.url || hit.objectID) && /\b(ai|artificial intelligence|machine learning|llm|transformer|neural|openai|anthropic|deepmind|nvidia)\b/i.test(hit.title))
    .map((hit) => ({
      title: hit.title ?? "",
      url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
      source: "Hacker News",
      summary: stripHtml(hit.story_text ?? "").slice(0, 1200),
      publishedAt: new Date(hit.created_at ?? Date.now()).toISOString(),
      contentType: "news" as const,
      sourceQuality: 0.62,
      popularity: { points: hit.points ?? 0, comments: hit.num_comments ?? 0, mentions: 1 }
    }));
}

export async function collectCandidateArticles(sources: FeedSource[] = DEFAULT_FEEDS) {
  const results = await Promise.allSettled([
    ...sources.map((source) => collectFeed(source)),
    collectHackerNews()
  ]);

  const articles = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const seen = new Set<string>();
  const failures = results
    .map((result, index) => (result.status === "rejected" ? `${index}: ${String(result.reason)}` : null))
    .filter(Boolean) as string[];

  const unique = articles.filter((article) => {
    const key = canonicalizeUrl(article.url);
    if (seen.has(key)) return false;
    seen.add(key);
    article.url = key;
    return true;
  });

  return { articles: unique, failures };
}

export function canonicalizeUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref", "source"].forEach((key) =>
      url.searchParams.delete(key)
    );
    url.hash = "";
    return url.toString();
  } catch {
    return rawUrl;
  }
}
