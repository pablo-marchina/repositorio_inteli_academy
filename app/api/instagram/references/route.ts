import { apiAdmin } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncInstagramReferences } from "@/lib/studio";

export const maxDuration = 120;

export async function GET() {
  if (!(await apiAdmin())) return Response.json({ error: "Não autorizado." }, { status: 401 });
  const { data, error } = await createAdminClient()
    .from("instagram_reference_posts")
    .select("id,media_type,media_product_type,caption,permalink,media_url,thumbnail_url,media_timestamp,visual_analysis")
    .order("media_timestamp", { ascending: false })
    .limit(80);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ references: data ?? [] });
}

export async function POST() {
  if (!(await apiAdmin())) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    return Response.json({ result: await syncInstagramReferences() });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
