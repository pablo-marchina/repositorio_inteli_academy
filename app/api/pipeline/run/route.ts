export const maxDuration = 300;

import { z } from "zod";
import { apiAdmin } from "@/lib/api-auth";
import { collectStage, generateStage, publishStage, syncMetricsStage } from "@/lib/pipeline";

const schema = z.object({ stage: z.enum(["collect", "generate", "publish", "metrics"]) });

export async function POST(request: Request) {
  if (!(await apiAdmin())) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const { stage } = schema.parse(await request.json());
    const result =
      stage === "collect" ? await collectStage() :
      stage === "generate" ? await generateStage(true) :
      stage === "publish" ? await publishStage() :
      await syncMetricsStage();
    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
