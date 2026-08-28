import { z } from "zod";
import { env } from "@/lib/env";
import type { StudioPayload } from "@/lib/types";
import type { StudioBrandReport, StructuredStudioPayload } from "@/lib/studio-artifact";

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
  if (!response.ok) throw new Error(`Não foi possível baixar render (${response.status}).`);
  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "image/png";
  if (!contentType.startsWith("image/")) throw new Error("Render não retornou uma imagem.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > 8_000_000) throw new Error("Render excedeu o limite do crítico visual.");
  return { inlineData: { mimeType: contentType, data: bytes.toString("base64") } };
}

function dataUrlPart(dataUrl: string) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("Frame de QA inválido.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.byteLength > 2_500_000) throw new Error("Frame de QA excede 2,5 MB.");
  return { inlineData: { mimeType: match[1], data: match[2] } };
}

async function runCritic(parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>, source: StudioBrandReport["source"], threshold: number) {
  const config = env();
  if (!config.GEMINI_API_KEY) return null;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.GEMINI_POST_MODEL)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": config.GEMINI_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json" } }),
    cache: "no-store"
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const raw = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!raw) return null;
  try {
    const parsed = criticSchema.parse(JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim()));
    const hasErrorFailure = parsed.checks.some((check) => check.severity === "error" && !check.passed);
    return { ...parsed, passed: parsed.passed && parsed.score >= threshold && !hasErrorFailure, source, reviewedAt: new Date().toISOString() } satisfies StudioBrandReport;
  } catch {
    return null;
  }
}

export async function reviewFigmaBrandFidelity(input: { payload: StudioPayload; outputRenderUrls: string[]; sourceRenderUrls: string[] }): Promise<StudioBrandReport | null> {
  const pairs = Math.min(input.outputRenderUrls.length, input.sourceRenderUrls.length, 4);
  if (!pairs) return null;
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{
    text: `Você é um diretor de arte revisando fidelidade de marca da Inteli Academy. Para cada par, a primeira imagem é o TEMPLATE/BASE real do Figma e a segunda é o OUTPUT gerado a partir dele. Avalie identidade, hierarquia, composição, proporções, tipografia percebida, grafismos, logo, respiro e qualidade visual. Mudanças de texto e mídia são esperadas; descaracterização não é. Penalize desalinhamento, excesso de texto, contraste ruim e perda do padrão do template. Conteúdo esperado: ${JSON.stringify({ contentType: input.payload.contentType, title: input.payload.title, frames: input.payload.frames, styleSummary: input.payload.styleSummary })}. Retorne apenas JSON com score 0-100, passed, issues, corrections e checks.`
  }];
  for (let index = 0; index < pairs; index += 1) {
    parts.push({ text: `PAR ${index + 1} — template/base real` }, await asInlineImage(input.sourceRenderUrls[index]), { text: `PAR ${index + 1} — output gerado` }, await asInlineImage(input.outputRenderUrls[index]));
  }
  return runCritic(parts, "visual-critic", 80);
}

export async function reviewRenderedReelFrames(input: { payload: StructuredStudioPayload; renderedFrames: string[]; figmaReferenceUrl?: string | null }): Promise<StudioBrandReport | null> {
  if (!input.renderedFrames.length) return null;
  const timeline = input.payload.artifact?.videoTimeline;
  const plan = input.payload.artifact?.reelPlan;
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{
    text: `Você está fazendo QA VISUAL do render real de um Reel da Inteli Academy. As imagens seguintes são frames capturados do vídeo executável; não são mockups. Compare o resultado com a ESTRUTURA SEMÂNTICA da referência registrada no plano, não apenas com o layout do Figma. Avalie: (1) variedade real de enquadramentos e cenas, (2) se os frames parecem repetir a mesma sala/mesmo plano sem motivo, (3) correspondência entre função dos shots gerados e shotType/framing/motion/energy da referência, (4) crop 9:16 e acompanhamento do assunto, (5) legibilidade e presença de texto somente nas janelas textCues da referência, (6) consistência de marca, hierarquia, contraste e sensação de edição profissional. Penalize severamente frames duplicados ou semanticamente redundantes, vários planos gerais consecutivos quando a referência alterna funções, sujeitos importantes cortados, texto introduzido quando a referência não possui textCues, e qualquer reelQuality que tenha usado metadata-fallback. O áudio natural dos takes NÃO deve ser considerado beat-matched com a referência; somente música dedicada com beatSource=music pode receber crédito por sincronização musical. Plano executado: ${JSON.stringify({ executionSummary: timeline?.executionSummary, tracks: timeline?.tracks, reelQuality: input.payload.artifact?.reelQuality, analysisSummary: plan?.analysisSummary, shots: plan?.shots, reference: plan?.reference, styleSummary: input.payload.styleSummary })}. Um score >= 82 é necessário para passed. Retorne somente JSON.`
  }];
  if (input.figmaReferenceUrl) parts.push({ text: "FRAME DO FIGMA aprovado como referência de layout/brand" }, await asInlineImage(input.figmaReferenceUrl));
  input.renderedFrames.slice(0, 5).forEach((frame, index) => parts.push({ text: `RENDER REAL — amostra ${index + 1}` }, dataUrlPart(frame)));
  return runCritic(parts, "render-critic", 82);
}
