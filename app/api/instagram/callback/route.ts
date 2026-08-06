import { NextResponse } from "next/server";
import { exchangeInstagramCode } from "@/lib/instagram";
import { encryptSecret, verifyPublicAsset } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

function parseState(state: string) {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return null;
  const payload = Buffer.from(encoded, "base64url").toString("utf8");
  if (!verifyPublicAsset(payload, signature)) return null;
  const [userId, timestampRaw] = payload.split(":");
  const timestamp = Number(timestampRaw);
  if (!userId || !Number.isFinite(timestamp) || Date.now() - timestamp > 15 * 60_000) return null;
  return { userId };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const destination = new URL("/settings", url.origin);
  try {
    if (oauthError) throw new Error(oauthError);
    if (!code || !state) throw new Error("Callback do Instagram incompleto.");
    const parsed = parseState(state);
    if (!parsed) throw new Error("Estado OAuth inválido ou expirado.");
    const account = await exchangeInstagramCode(code);
    const admin = createAdminClient();
    await admin.from("instagram_accounts").update({ is_active: false }).eq("is_active", true);
    const { error } = await admin.from("instagram_accounts").upsert(
      {
        instagram_user_id: account.instagramUserId,
        username: account.username,
        account_type: account.accountType,
        access_token_encrypted: encryptSecret(account.accessToken),
        token_expires_at: account.expiresAt,
        is_active: true,
        connected_by: parsed.userId,
        connected_at: new Date().toISOString()
      },
      { onConflict: "instagram_user_id" }
    );
    if (error) throw error;
    destination.searchParams.set("instagram", "connected");
  } catch (error) {
    destination.searchParams.set("instagram_error", String(error));
  }
  return NextResponse.redirect(destination);
}
