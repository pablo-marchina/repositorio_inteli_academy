import { z } from "zod";
import { env } from "@/lib/env";
import type { StudioPayload } from "@/lib/types";
import type { StudioBrandReport } from "@/lib/studio-artifact";

const criticSchema = z.object({
  score: z.number().min(0).max(100),
  passed: z.boolean(),
  issues: z.array(z.string().max(300)).max(12),
  corrections: z.array(z.string().max(300)).max(12),
  checks: z.array(z.object({
    id: z.string().max(80),
    label: z.string().max(160),
    passed: z.boolean(),
    severity: z.enum(["error", "warning", "info"]),
    detail: z.string().max(400)
  })).max(16)
});

async function asInlineImage(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Não foi possível baixar render do Figma (${response.status}).`);
  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "image/png";
  if (!contentType.startsWith("image/")) throw new Error("Render do Figma não retornou uma imagem.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > 8_000_000) throw new Error("Render do Figma excedeu o limite do crítico visual.");
  return { inlineData: { mimeType: contentType, data: bytes.toString("base64") } };
}

export async function reviewFigmaBrandFidelity(input: {
  payload: StudioPayload;
  outputRenderUrls: string[];
  sourceRenderUrls: string[];
}): Promise<StudioBrandReport | null> {
  const config = env();
  if (!config.GEMINI_API_KEY) return null;
  const pairs = Math.min(input.outputRenderUrls.length, input.sourceRenderUrls.length, 4);
  if (!pairs) return null;

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{
    text: `Você é um diretor de arte revisando fidelidade de marca da Inteli Academy. Para cada par, a primeira imagem é o TEMPLATE/BASE real do Figma e a segunda é o OUTPUT gerado a partir dele. Avalie se a geração preservou identidade, hierarquia, composição, proporções, tipografia percebida, grafismos, logo, respiro e qualidade visual. Mudanças de texto e mídia são esperadas; descaracterização visual não é. Penalize elementos desalinhados, excesso de texto, quebras, contraste ruim ou perda do padrão do template.\n\nConteúdo esperado: ${JSON.stringify({ contentType: input.payload.contentType, title: input.payload.title, frames: input.payload.frames, styleSummary: input.payload.styleSummary })}\n\nRetorne apenas JSON com score 0-100, passed, issues, corrections e checks.`
  }];

  for (let index = 0; index < pairs; index += 1) {
    parts.push({ text: `PAR ${index + 1} — template/base real` });
    parts.push(await asInlineImage(input.sourceRenderUrls[index]));
    parts.push({ text: `PAR ${index + 1} — output gerado` });
    parts.push(await asInlineImage(input.outputRenderUrls[index]));
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.GEMINI_POST_MODEL)}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": config.GEMINI_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json" }
      }),
      cache: "no-store"
    }
  );
  if (!response.ok) return null;
  const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const raw = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!raw) return null;
  try {
    const parsed = criticSchema.parse(JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim()));
    return { ...parsed, source: "visual-critic", reviewedAt: new Date().toISOString() };
  } catch {
    return null;
  }
}
