import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DriveAsset } from "@/lib/types";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const MEDIA_PREFIXES = ["image/", "video/"];

type DriveConnectionRow = {
  root_folder_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  google_email: string | null;
};

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  thumbnailLink?: string;
  modifiedTime?: string;
  size?: string;
};

function googleConfig() {
  const config = env();
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET são necessários para conectar o Drive.");
  }
  return config;
}

export function googleDriveAuthorizationUrl(state: string) {
  const config = googleConfig();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", `${config.NEXT_PUBLIC_APP_URL}/api/drive/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("scope", "openid email https://www.googleapis.com/auth/drive.readonly");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGoogleDriveCode(code: string) {
  const config = googleConfig();
  const body = new URLSearchParams({
    code,
    client_id: config.GOOGLE_CLIENT_ID!,
    client_secret: config.GOOGLE_CLIENT_SECRET!,
    redirect_uri: `${config.NEXT_PUBLIC_APP_URL}/api/drive/callback`,
    grant_type: "authorization_code"
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Google OAuth falhou: ${await response.text()}`);
  const tokens = (await response.json()) as GoogleTokenResponse;
  if (!tokens.access_token) throw new Error("Google não retornou access_token.");

  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
    cache: "no-store"
  });
  const profile = profileResponse.ok ? ((await profileResponse.json()) as { email?: string }) : {};
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
    email: profile.email ?? null
  };
}

export async function saveDriveConnection(input: {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  email: string | null;
  connectedBy: string;
}) {
  const admin = createAdminClient();
  const existing = await admin.from("drive_connections").select("refresh_token_encrypted").eq("id", true).maybeSingle();
  const refreshTokenEncrypted = input.refreshToken
    ? encryptSecret(input.refreshToken)
    : existing.data?.refresh_token_encrypted ?? null;
  const { error } = await admin.from("drive_connections").upsert({
    id: true,
    google_email: input.email,
    root_folder_id: env().GOOGLE_DRIVE_ROOT_FOLDER_ID,
    access_token_encrypted: encryptSecret(input.accessToken),
    refresh_token_encrypted: refreshTokenEncrypted,
    token_expires_at: input.expiresAt,
    is_active: true,
    connected_by: input.connectedBy
  });
  if (error) throw error;
}

async function activeConnection(): Promise<DriveConnectionRow> {
  const { data, error } = await createAdminClient()
    .from("drive_connections")
    .select("root_folder_id,access_token_encrypted,refresh_token_encrypted,token_expires_at,google_email")
    .eq("id", true)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Google Drive ainda não está conectado.");
  return data as DriveConnectionRow;
}

async function refreshedAccessToken(connection: DriveConnectionRow) {
  const expiry = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  if (expiry > Date.now() + 60_000) return decryptSecret(connection.access_token_encrypted);
  if (!connection.refresh_token_encrypted) return decryptSecret(connection.access_token_encrypted);

  const config = googleConfig();
  const body = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID!,
    client_secret: config.GOOGLE_CLIENT_SECRET!,
    refresh_token: decryptSecret(connection.refresh_token_encrypted),
    grant_type: "refresh_token"
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Falha ao renovar Google Drive: ${await response.text()}`);
  const token = (await response.json()) as GoogleTokenResponse;
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
  await createAdminClient().from("drive_connections").update({
    access_token_encrypted: encryptSecret(token.access_token),
    token_expires_at: expiresAt
  }).eq("id", true);
  return token.access_token;
}

async function driveFetch<T>(path: string, search?: Record<string, string>): Promise<T> {
  const connection = await activeConnection();
  const token = await refreshedAccessToken(connection);
  const url = new URL(`https://www.googleapis.com/drive/v3/${path.replace(/^\//, "")}`);
  Object.entries(search ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Google Drive API falhou (${response.status}): ${await response.text()}`);
  return (await response.json()) as T;
}

function asAsset(file: DriveFile, path: string[]): DriveAsset {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    webViewLink: file.webViewLink ?? null,
    thumbnailLink: file.thumbnailLink ?? null,
    modifiedTime: file.modifiedTime ?? null,
    size: file.size ?? null,
    path
  };
}

export async function listDriveMedia(): Promise<DriveAsset[]> {
  const connection = await activeConnection();
  const queue: Array<{ id: string; path: string[] }> = [{ id: connection.root_folder_id, path: [] }];
  const assets: DriveAsset[] = [];
  const visited = new Set<string>();

  while (queue.length && visited.size < 500) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    let pageToken = "";
    do {
      const payload = await driveFetch<{ files?: DriveFile[]; nextPageToken?: string }>("files", {
        q: `'${current.id.replace(/'/g, "\\'")}' in parents and trashed = false`,
        fields: "nextPageToken,files(id,name,mimeType,webViewLink,thumbnailLink,modifiedTime,size)",
        pageSize: "1000",
        orderBy: "folder,name",
        ...(pageToken ? { pageToken } : {})
      });
      for (const file of payload.files ?? []) {
        if (file.mimeType === FOLDER_MIME) {
          queue.push({ id: file.id, path: [...current.path, file.name] });
        } else if (MEDIA_PREFIXES.some((prefix) => file.mimeType.startsWith(prefix))) {
          assets.push(asAsset(file, current.path));
        }
      }
      pageToken = payload.nextPageToken ?? "";
    } while (pageToken);
  }

  return assets.sort((a, b) => `${a.path?.join("/")}/${a.name}`.localeCompare(`${b.path?.join("/")}/${b.name}`, "pt-BR"));
}

export async function getDriveAsset(fileId: string): Promise<DriveAsset> {
  const file = await driveFetch<DriveFile>(`files/${encodeURIComponent(fileId)}`, {
    fields: "id,name,mimeType,webViewLink,thumbnailLink,modifiedTime,size"
  });
  if (!MEDIA_PREFIXES.some((prefix) => file.mimeType.startsWith(prefix))) {
    throw new Error("O arquivo selecionado não é uma imagem ou vídeo.");
  }
  return asAsset(file, []);
}

export async function downloadDriveAsset(fileId: string) {
  const asset = await getDriveAsset(fileId);
  const connection = await activeConnection();
  const token = await refreshedAccessToken(connection);
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("alt", "media");
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Falha ao baixar mídia do Drive: ${await response.text()}`);
  return { asset, bytes: new Uint8Array(await response.arrayBuffer()) };
}

export async function driveConnectionSummary() {
  const { data } = await createAdminClient()
    .from("drive_connections")
    .select("google_email,root_folder_id,is_active,token_expires_at")
    .eq("id", true)
    .maybeSingle();
  return data ?? null;
}
