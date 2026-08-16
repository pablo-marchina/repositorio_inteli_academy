import { NextResponse } from "next/server";
import { verifyPublicAsset } from "@/lib/crypto";
import { exchangeGoogleDriveCode, saveDriveConnection } from "@/lib/google-drive";

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
  const destination = new URL("/settings", url.origin);
  try {
    const oauthError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
    if (oauthError) throw new Error(oauthError);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) throw new Error("Callback do Google Drive incompleto.");
    const parsed = parseState(state);
    if (!parsed) throw new Error("Estado OAuth do Drive inválido ou expirado.");
    const tokens = await exchangeGoogleDriveCode(code);
    await saveDriveConnection({ ...tokens, connectedBy: parsed.userId });
    console.info("[drive-oauth] connection stored", { email: tokens.email ?? null });
    destination.searchParams.set("drive", "connected");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[drive-oauth] callback failed", { message });
    destination.searchParams.set("drive_error", message);
  }
  return NextResponse.redirect(destination);
}
