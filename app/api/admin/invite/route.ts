import { z } from "zod";
import { apiAdmin } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

const schema = z.object({ email: z.string().email() });

export async function POST(request: Request) {
  if (!(await apiAdmin())) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const { email } = schema.parse(await request.json());
    const { error } = await createAdminClient().auth.admin.inviteUserByEmail(email, {
      data: { role: "admin" },
      redirectTo: `${env().NEXT_PUBLIC_APP_URL}/auth/accept`
    });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 400 });
  }
}
