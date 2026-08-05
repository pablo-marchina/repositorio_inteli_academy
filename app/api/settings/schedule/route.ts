import { z } from "zod";
import { apiAdmin } from "@/lib/api-auth";

const schema = z.object({
  timezone: z.string().min(3).refine((value: string) => {
    try { new Intl.DateTimeFormat("en-US", { timeZone: value }); return true; } catch { return false; }
  }, "Fuso horário inválido."),
  publish_weekday: z.number().int().min(0).max(6),
  publish_hour: z.number().int().min(0).max(23),
  generation_lead_hours: z.number().int().min(1).max(168),
  auto_publish: z.boolean()
});

export async function PUT(request: Request) {
  const auth = await apiAdmin();
  if (!auth) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const values = schema.parse(await request.json());
    const { error } = await auth.supabase.from("app_settings").update(values).eq("id", true);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 400 });
  }
}
