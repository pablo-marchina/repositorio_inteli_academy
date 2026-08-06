import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

function safeNext(url: URL, fallback: string) {
  const next = url.searchParams.get("next");
  return next?.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

function loginError(url: URL, message: string) {
  const target = new URL("/login", url.origin);
  target.searchParams.set("error", message);
  return NextResponse.redirect(target);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return loginError(url, error.message);
    return NextResponse.redirect(new URL(safeNext(url, "/dashboard"), url.origin));
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return loginError(url, error.message);
    return NextResponse.redirect(new URL(safeNext(url, type === "invite" ? "/auth/accept" : "/dashboard"), url.origin));
  }

  return loginError(url, "Link de autenticação inválido ou incompleto.");
}
