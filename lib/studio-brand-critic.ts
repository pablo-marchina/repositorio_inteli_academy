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
  })).max(20)
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

function brandInstruction(payload: StudioPayload) {
  const partnerRequired = payload.postArchetype === "partnership" || Boolean(payload.brandContext?.partnerName);
  return `Arquétipo editorial: ${payload.postArchetype ?? "general"}. Marca principal: ${payload.brandContext?.primaryBrandName ?? "Inteli Academy"}. ${partnerRequired
    ? `Há parceiro${payload.brandContext?.partnerName ? ` (${payload.brandContext.partnerName})` : ""}: exija uma partnerLogo real e separada da primaryLogo. Não aceite texto improvisado, recorte incidental de foto/vídeo ou símbolo redesenhado como logo.`
    : "Não há exigência de logo de parceiro."}`;
}

export async function reviewFigmaBrandFidelity(input: { payload: StudioPayload; outputRenderUrls: string[]; sourceRenderUrls: string[] }): Promise<StudioBrandReport | null> {
  const pairs = Math.min(input.outputRenderUrls.length, input.sourceRenderUrls.length, 4);
  if (!pairs) return null;
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{
    text: `Você é um diretor de arte revisando fidelidade de marca da Inteli Academy. Para cada par, a primeira imagem é o TEMPLATE/BASE real descoberto no Figma e a segunda é o OUTPUT gerado a partir dele. Avalie identidade, hierarquia, composição, proporções, tipografia percebida, grafismos, primaryLogo, partnerLogo quando exigida, respiro e qualidade visual. Mudanças de texto e mídia são esperadas; descaracterização não é. Penalize desalinhamento, excesso de texto, contraste ruim, substituição ou invenção de logos e perda do padrão do template. ${brandInstruction(input.payload)} Conteúdo esperado: ${JSON.stringify({ contentType: input.payload.contentType, title: input.payload.title, frames: input.payload.frames, styleSummary: input.payload.styleSummary })}. Retorne apenas JSON com score 0-100, passed, issues, corrections e checks.`
  }];
  for (let index = 0; index < pairs; index += 1) {
    parts.push({ text: `PAR ${index + 1} — template/base real` }, await asInlineImage(input.sourceRenderUrls[index]), { text: `PAR ${index + 1} — output gerado` }, await asInlineImage(input.outputRenderUrls[index]));
  }
  return runCritic(parts, "visual-critic", 82);
}

export async function reviewRenderedReelFrames(input: { payload: StructuredStudioPayload; renderedFrames: string[]; figmaReferenceUrl?: string | null }): Promise<StudioBrandReport | null> {
  if (!input.renderedFrames.length) return null;
  const timeline = input.payload.artifact?.videoTimeline;
  const plan = input.payload.artifact?.reelPlan;
  const styleMatch = plan && (plan as typeof plan & { styleMatch?: Record<string, unknown> }).styleMatch;
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{
    text: `Você está fazendo QA VISUAL do render real de um Reel da Inteli Academy. As imagens seguintes são frames capturados do vídeo executável; não são mockups. Compare o resultado com a referência registrada no plano na medida em que essa informação realmente estiver disponível. Avalie separadamente: (1) timing/cadência, (2) função narrativa de cada shot, (3) escala/enquadramento do sujeito, (4) mudança visual entre cortes consecutivos, (5) variedade real de cenas sem repetição da mesma sala/plano, (6) crop 9:16 e acompanhamento do assunto, (7) overlays/textos apenas nas janelas detectadas, (8) estrutura de marca do Figma e (9) primaryLogo/partnerLogo. ${brandInstruction(input.payload)} Penalize severamente metadata-fallback, frames duplicados, redundância visual, sujeitos importantes cortados, texto inventado, logo inventada e uma sequência que acerta apenas os timestamps mas não reproduz a progressão visual da referência. NÃO trate analysisMode=local-video ou reference.analysisMode=temporal-fallback como equivalentes a metadata-fallback: nesses modos os pixels/cortes foram analisados por FFmpeg, mas não conceda crédito por semântica indisponível. O áudio natural dos takes NÃO deve ser considerado beat-matched com a referência; somente música dedicada com beatSource=music pode receber crédito por sincronização musical. Se reference.semanticAvailable=false, não marque equivalência narrativa/semântica como aprovada. Plano executado: ${JSON.stringify({ executionSummary: timeline?.executionSummary, tracks: timeline?.tracks, reelQuality: input.payload.artifact?.reelQuality, analysisSummary: plan?.analysisSummary, styleMatch, shots: plan?.shots, reference: plan?.reference, styleSummary: input.payload.styleSummary })}. Um score >= 84 é necessário para passed, sem nenhum check de erro falhando. Retorne somente JSON.`
  }];
  if (input.figmaReferenceUrl) parts.push({ text: "FRAME DO FIGMA aprovado como referência de layout/brand" }, await asInlineImage(input.figmaReferenceUrl));
  input.renderedFrames.slice(0, 6).forEach((frame, index) => parts.push({ text: `RENDER REAL — amostra ${index + 1}` }, dataUrlPart(frame)));
  return runCritic(parts, "render-critic", 84);
}
