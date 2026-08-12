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
    return NextResponse.redirect(googleDriveAuthorizationUrl(state));
  } catch (error) {
    const url = new URL("/settings", request.url);
    url.searchParams.set("drive_error", String(error));
    return NextResponse.redirect(url);
  }
}
