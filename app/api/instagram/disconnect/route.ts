import { apiAdmin } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  if (!(await apiAdmin())) return Response.json({ error: "Não autorizado." }, { status: 401 });
  const { error } = await createAdminClient().from("instagram_accounts").update({ is_active: false }).eq("is_active", true);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ ok: true });
}
