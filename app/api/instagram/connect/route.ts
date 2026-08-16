import { NextResponse } from "next/server";
import { apiAdmin } from "@/lib/api-auth";
import { instagramAuthorizationUrl } from "@/lib/instagram";
import { signPublicAsset } from "@/lib/crypto";

export async function GET(request: Request) {
  const auth = await apiAdmin();
  if (!auth) return NextResponse.redirect(new URL("/login", request.url));
  const payload = `${auth.user.id}:${Date.now()}`;
  const state = `${Buffer.from(payload).toString("base64url")}.${signPublicAsset(payload)}`;
  try {
    return NextResponse.redirect(instagramAuthorizationUrl(state));
  } catch (error) {
    console.error("[instagram-oauth] connect failed", String(error));
    const url = new URL("/settings", request.url);
    url.searchParams.set("instagram_error", String(error));
    return NextResponse.redirect(url);
  }
}
