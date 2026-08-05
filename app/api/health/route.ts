export async function GET() {
  const required = [
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SECRET_KEY",
    "APP_ENCRYPTION_KEY",
    "CRON_SECRET"
  ];
  const missing = required.filter((key) => !process.env[key]);
  return Response.json({ ok: missing.length === 0, missing, timestamp: new Date().toISOString() }, { status: missing.length ? 503 : 200 });
}
