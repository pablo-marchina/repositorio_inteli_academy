export const maxDuration = 300;

import { z } from "zod";
import { apiAdmin } from "@/lib/api-auth";
import { enhancedCollectStage } from "@/lib/enhanced-pipeline";
import { generateManualStage } from "@/lib/manual-generation";
import { generateStage, publishStage, syncMetricsStage } from "@/lib/pipeline";

const schema = z
  .object({
    stage: z.enum(["collect", "generate", "publish", "metrics"]),
    articleIds: z.array(z.string().uuid()).min(3).max(12).optional()
  })
  .superRefine((value, context) => {
    if (value.articleIds && value.stage !== "generate") {
      context.addIssue({
        code: "custom",
        path: ["articleIds"],
        message: "A seleção de artigos só pode ser usada na geração."
      });
    }
  });

export async function POST(request: Request) {
  if (!(await apiAdmin())) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const { stage, articleIds } = schema.parse(await request.json());
    const result =
      stage === "collect" ? await enhancedCollectStage() :
      stage === "generate" && articleIds ? await generateManualStage(articleIds) :
      stage === "generate" ? await generateStage(true) :
      stage === "publish" ? await publishStage() :
      await syncMetricsStage();
    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
