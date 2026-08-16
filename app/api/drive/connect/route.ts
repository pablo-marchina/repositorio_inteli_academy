import { NextResponse } from "next/server";
import { apiAdmin } from "@/lib/api-auth";
import { signPublicAsset } from "@/lib/crypto";
import { googleDriveAuthorizationUrl } from "@/lib/google-drive";

export async function GET(request: Request) {
  const auth = await apiAdmin();
  if (!auth) return NextResponse.redirect(new URL("/login", request.url));
  const payload = `${auth.user.id}:${Date.now()}`;
  const state = `${Buffer.from(payload).toString("base64url")}.${signPublicAsset(payload)}`;
  try {
    const authorizationUrl = googleDriveAuthorizationUrl(state);
    console.info("[drive-oauth] redirecting to Google authorization", {
      callback: new URL(authorizationUrl).searchParams.get("redirect_uri")
    });
    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    console.error("[drive-oauth] failed to start authorization", error);
    const url = new URL("/settings", request.url);
    url.searchParams.set("drive_error", error instanceof Error ? error.message : String(error));
    return NextResponse.redirect(url);
  }
}
