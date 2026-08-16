import { env } from "@/lib/env";
import { decryptSecret } from "@/lib/crypto";
import { parseInsights } from "@/lib/metrics";
import type { EngagementMetrics, InstagramAccount, InstagramReferencePost } from "@/lib/types";

const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_insights"
] as const;

function config() {
  const values = env();
  const hasDedicated = Boolean(values.INSTAGRAM_APP_ID || values.INSTAGRAM_APP_SECRET);
  const appId = hasDedicated ? values.INSTAGRAM_APP_ID : values.META_APP_ID;
  const appSecret = hasDedicated ? values.INSTAGRAM_APP_SECRET : values.META_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error(
      hasDedicated
        ? "Configure INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET juntos na Vercel."
        : "Configure INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET com as credenciais do Instagram App no Meta App Dashboard."
    );
  }
  return {
    ...values,
    APP_ID: appId,
    APP_SECRET: appSecret,
    credentialSource: hasDedicated ? "instagram" as const : "legacy-meta" as const
  };
}

export function instagramCallbackUrl() {
  return `${env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/instagram/callback`;
}

export function instagramIntegrationSummary() {
  const values = env();
  const hasDedicated = Boolean(values.INSTAGRAM_APP_ID && values.INSTAGRAM_APP_SECRET);
  const hasLegacy = Boolean(values.META_APP_ID && values.META_APP_SECRET);
  const appId = values.INSTAGRAM_APP_ID ?? values.META_APP_ID ?? "";
  return {
    configured: hasDedicated || hasLegacy,
    credentialSource: hasDedicated ? "Instagram App ID/Secret" : hasLegacy ? "META_* legado" : "não configurado",
    appIdTail: appId ? appId.slice(-6) : null,
    callbackUrl: instagramCallbackUrl(),
    businessLoginUrlConfigured: Boolean(values.INSTAGRAM_BUSINESS_LOGIN_URL),
    graphVersion: values.META_GRAPH_VERSION,
    scopes: [...INSTAGRAM_SCOPES]
  };
}

export function instagramAuthorizationUrl(state: string) {
  const values = config();
  const callbackUrl = instagramCallbackUrl();
  const url = values.INSTAGRAM_BUSINESS_LOGIN_URL
    ? new URL(values.INSTAGRAM_BUSINESS_LOGIN_URL)
    : new URL("https://www.instagram.com/oauth/authorize");

  url.searchParams.set("client_id", values.APP_ID);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
  url.searchParams.set("state", state);
  url.searchParams.set("force_authentication", "1");
  // Business Login for Instagram supports showing the Facebook/Meta login option.
  // Leaving it enabled is more robust for professional accounts managed through Meta.
  url.searchParams.set("enable_fb_login", "1");
  return url.toString();
}

export async function exchangeInstagramCode(code: string) {
  const values = config();
  const form = new URLSearchParams({
    client_id: values.APP_ID,
    client_secret: values.APP_SECRET,
    grant_type: "authorization_code",
    redirect_uri: instagramCallbackUrl(),
    code
  });

  const shortResponse = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
    cache: "no-store"
  });
  if (!shortResponse.ok) throw new Error(`Instagram token exchange failed: ${await shortResponse.text()}`);
  const short = (await shortResponse.json()) as { access_token: string; user_id?: string };

  const longUrl = new URL("https://graph.instagram.com/access_token");
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", values.APP_SECRET);
  longUrl.searchParams.set("access_token", short.access_token);
  const longResponse = await fetch(longUrl, { cache: "no-store" });
  if (!longResponse.ok) throw new Error(`Long-lived token exchange failed: ${await longResponse.text()}`);
  const long = (await longResponse.json()) as { access_token: string; expires_in?: number };

  const profileUrl = new URL(`https://graph.instagram.com/${values.META_GRAPH_VERSION}/me`);
  profileUrl.searchParams.set("fields", "id,user_id,username,account_type");
  profileUrl.searchParams.set("access_token", long.access_token);
  const profileResponse = await fetch(profileUrl, { cache: "no-store" });
  if (!profileResponse.ok) throw new Error(`Instagram profile request failed: ${await profileResponse.text()}`);
  const profile = (await profileResponse.json()) as {
    id?: string;
    user_id?: string;
    username?: string;
    account_type?: string;
  };

  const instagramUserId = profile.user_id ?? profile.id ?? short.user_id;
  if (!instagramUserId || !profile.username) throw new Error("Instagram did not return the account id and username.");

  return {
    instagramUserId,
    username: profile.username,
    accountType: profile.account_type ?? null,
    accessToken: long.access_token,
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null
  };
}

async function graphRequest<T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
  searchParams?: Record<string, string>
): Promise<T> {
  const values = env();
  const url = new URL(`https://graph.instagram.com/${values.META_GRAPH_VERSION}/${path.replace(/^\//, "")}`);
  Object.entries(searchParams ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, { ...init, cache: "no-store" });
  if (!response.ok) throw new Error(`Instagram API ${path} failed (${response.status}): ${await response.text()}`);
  return (await response.json()) as T;
}

async function createImageContainer(
  userId: string,
  imageUrl: string,
  accessToken: string,
  options: { carouselItem?: boolean; mediaType?: "STORIES" } = {}
) {
  const body = new URLSearchParams({ image_url: imageUrl });
  if (options.carouselItem) body.set("is_carousel_item", "true");
  if (options.mediaType) body.set("media_type", options.mediaType);
  return graphRequest<{ id: string }>(`${userId}/media`, accessToken, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
}

async function createVideoContainer(
  userId: string,
  videoUrl: string,
  accessToken: string,
  mediaType: "REELS" | "STORIES"
) {
  const body = new URLSearchParams({ video_url: videoUrl, media_type: mediaType });
  return graphRequest<{ id: string }>(`${userId}/media`, accessToken, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
}

async function waitForContainer(containerId: string, accessToken: string, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await graphRequest<{ status_code?: string; status?: string }>(containerId, accessToken, undefined, {
      fields: "status_code,status"
    });
    if (status.status_code === "FINISHED") return;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
      throw new Error(`Instagram container ${containerId} failed: ${status.status ?? status.status_code}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`Instagram container ${containerId} was not ready in time.`);
}

async function publishContainer(userId: string, containerId: string, accessToken: string) {
  const body = new URLSearchParams({ creation_id: containerId });
  return graphRequest<{ id: string }>(`${userId}/media_publish`, accessToken, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
}

export async function publishSingleImage(account: InstagramAccount, imageUrl: string, caption: string) {
  const token = decryptSecret(account.accessTokenEncrypted);
  const body = new URLSearchParams({ image_url: imageUrl, caption });
  const container = await graphRequest<{ id: string }>(`${account.instagramUserId}/media`, token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  await waitForContainer(container.id, token);
  return publishContainer(account.instagramUserId, container.id, token);
}

export async function publishCarousel(account: InstagramAccount, imageUrls: string[], caption: string) {
  if (imageUrls.length < 2 || imageUrls.length > 10) throw new Error("Instagram carousels require 2 to 10 images.");
  const token = decryptSecret(account.accessTokenEncrypted);
  const childIds: string[] = [];

  for (const imageUrl of imageUrls) {
    const container = await createImageContainer(account.instagramUserId, imageUrl, token, { carouselItem: true });
    await waitForContainer(container.id, token);
    childIds.push(container.id);
  }

  const parentBody = new URLSearchParams({
    media_type: "CAROUSEL",
    children: childIds.join(","),
    caption
  });
  const parent = await graphRequest<{ id: string }>(`${account.instagramUserId}/media`, token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: parentBody
  });
  await waitForContainer(parent.id, token);
  return publishContainer(account.instagramUserId, parent.id, token);
}

export async function publishReel(account: InstagramAccount, videoUrl: string, caption: string) {
  const token = decryptSecret(account.accessTokenEncrypted);
  const body = new URLSearchParams({ video_url: videoUrl, media_type: "REELS", caption, share_to_feed: "true" });
  const container = await graphRequest<{ id: string }>(`${account.instagramUserId}/media`, token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  await waitForContainer(container.id, token, 36);
  return publishContainer(account.instagramUserId, container.id, token);
}

export async function publishStory(account: InstagramAccount, mediaUrl: string, isVideo: boolean) {
  if ((account.accountType ?? "").toUpperCase() !== "BUSINESS") {
    throw new Error("A API do Instagram permite publicação de Stories somente para contas Business.");
  }
  const token = decryptSecret(account.accessTokenEncrypted);
  const container = isVideo
    ? await createVideoContainer(account.instagramUserId, mediaUrl, token, "STORIES")
    : await createImageContainer(account.instagramUserId, mediaUrl, token, { mediaType: "STORIES" });
  await waitForContainer(container.id, token, isVideo ? 36 : 20);
  return publishContainer(account.instagramUserId, container.id, token);
}

export async function listInstagramMedia(account: InstagramAccount, limit = 60): Promise<InstagramReferencePost[]> {
  const token = decryptSecret(account.accessTokenEncrypted);
  const result: InstagramReferencePost[] = [];
  let after = "";
  while (result.length < limit) {
    const payload = await graphRequest<{
      data?: Array<{
        id: string;
        media_type?: string;
        media_product_type?: string;
        caption?: string;
        permalink?: string;
        media_url?: string;
        thumbnail_url?: string;
        timestamp?: string;
        children?: { data?: Array<Record<string, unknown>> };
      }>;
      paging?: { cursors?: { after?: string }; next?: string };
    }>(`${account.instagramUserId}/media`, token, undefined, {
      fields: "id,media_type,media_product_type,caption,permalink,media_url,thumbnail_url,timestamp,children{id,media_type,media_url,thumbnail_url}",
      limit: String(Math.min(50, limit - result.length)),
      ...(after ? { after } : {})
    });
    for (const media of payload.data ?? []) {
      if (!media.id || !media.permalink || !media.timestamp) continue;
      result.push({
        id: media.id,
        mediaType: media.media_type ?? "UNKNOWN",
        mediaProductType: media.media_product_type ?? null,
        caption: media.caption ?? "",
        permalink: media.permalink,
        mediaUrl: media.media_url ?? null,
        thumbnailUrl: media.thumbnail_url ?? null,
        timestamp: media.timestamp,
        children: media.children?.data ?? []
      });
    }
    const nextAfter = payload.paging?.cursors?.after;
    if (!payload.paging?.next || !nextAfter || !payload.data?.length) break;
    after = nextAfter;
  }
  return result.slice(0, limit);
}

export async function fetchInstagramPermalink(account: InstagramAccount, mediaId: string) {
  const token = decryptSecret(account.accessTokenEncrypted);
  const payload = await graphRequest<{ permalink?: string }>(mediaId, token, undefined, { fields: "permalink" });
  return payload.permalink ?? null;
}

export async function fetchMediaInsights(account: InstagramAccount, mediaId: string): Promise<EngagementMetrics> {
  const token = decryptSecret(account.accessTokenEncrypted);
  const payload = await graphRequest<unknown>(`${mediaId}/insights`, token, undefined, {
    metric: "views,reach,likes,comments,saved,shares,follows,profile_visits,total_interactions"
  });
  return parseInsights(payload);
}
