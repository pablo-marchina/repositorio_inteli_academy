export const maxDuration = 300;

import { env } from "@/lib/env";
import { cronTick } from "@/lib/pipeline";

function authorized(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return token === env().CRON_SECRET;
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    return Response.json({ result: await cronTick() });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
