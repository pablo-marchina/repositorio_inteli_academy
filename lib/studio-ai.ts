import { z } from "zod";
import { callGeminiJson } from "@/lib/ai";
import { env } from "@/lib/env";
import { FIGMA_AUDITED_PAGE_NAMES } from "@/lib/figma-audit";
import type { DriveAsset, InstagramReferencePost, StudioContentType, StudioPayload } from "@/lib/types";

const frameSchema = z.object({
  position: z.number().int().min(1).max(10),
  template: z.enum(["cover", "editorial", "stat", "quote", "photo", "cta"]),
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(100),
  body: z.string().max(360).optional(),
  bullets: z.array(z.string().max(120)).max(4).optional(),
  stat: z.string().max(32).optional(),
  statLabel: z.string().max(90).optional(),
  mediaAssetId: z.string().optional(),
  mediaFit: z.enum(["cover", "contain"]).optional()
});

export const studioPayloadSchema = z.object({
  contentType: z.enum(["single", "carousel", "reel", "story"]),
  title: z.string().min(1).max(120),
  caption: z.string().min(20).max(2200),
  frames: z.array(frameSchema).min(1).max(10),
  factualClaims: z.array(z.object({ claim: z.string().min(1), sourceUrl: z.string().url() })).min(1),
  primaryDriveAssetId: z.string().optional(),
  styleSummary: z.string().min(10).max(900)
});

const visualAnalysisSchema = z.object({
  composition: z.string(),
  hierarchy: z.string(),
  palette: z.string(),
  typography: z.string(),
  mediaUsage: z.string(),
  density: z.string(),
  motifs: z.array(z.string()).max(8),
  tone: z.string(),
  reusablePatterns: z.array(z.string()).max(10)
});

export type StudioArticleEvidence = {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
};

function frameRules(contentType: StudioContentType) {
  switch (contentType) {
    case "single":
      return "Crie exatamente 1 frame 1080x1350. O frame precisa funcionar sozinho no feed.";
    case "carousel":
      return "Crie de 2 a 10 frames 1080x1350. O primeiro é cover; o último fecha a narrativa/CTA. Um conceito principal por frame.";
    case "reel":
      return "Crie exatamente 1 frame 1080x1920 que funcione como capa/referência visual do Reel. O vídeo real deve vir de um asset de Drive selecionado e primaryDriveAssetId deve apontar para esse vídeo.";
    case "story":
      return "Crie exatamente 1 frame 1080x1920. Se houver mídia do Drive adequada, ela pode ser usada como base; mantenha safe areas para interface do Instagram.";
  }
}

function evidenceText(articles: StudioArticleEvidence[]) {
  return articles.map((article, index) => [
    `${index + 1}. ${article.title}`,
    `Fonte: ${article.source}`,
    `Publicado: ${article.publishedAt}`,
    `Resumo: ${article.summary}`,
    `URL: ${article.url}`
  ].join("\n")).join("\n\n");
}

function assetsText(assets: DriveAsset[]) {
  if (!assets.length) return "Nenhum asset do Drive foi autorizado para este conteúdo.";
  return assets.map((asset) =>
    `${asset.id} | ${asset.mimeType} | ${[...(asset.path ?? []), asset.name].join("/")}`
  ).join("\n");
}

function referenceText(reference: InstagramReferencePost | null, analysis: Record<string, unknown> | null) {
  if (!reference) return "Nenhum post específico foi escolhido. Use o perfil histórico geral como principal referência editorial.";
  return `POST REAL ESCOLHIDO COMO REFERÊNCIA DIRETA\n` +
    `ID: ${reference.id}\nTipo: ${reference.mediaProductType ?? reference.mediaType}\nData: ${reference.timestamp}\n` +
    `Legenda: ${reference.caption || "(sem legenda)"}\nPermalink: ${reference.permalink}\n` +
    `Análise visual: ${analysis ? JSON.stringify(analysis) : "imagem indisponível para análise; use tipo, legenda e padrões gerais"}\n` +
    `Este post tem prioridade de estilo para ESTA geração. Replique princípios de composição e ritmo, nunca texto, marcas de terceiros ou conteúdo factual dele.`;
}

function validateStudioPayload(payload: StudioPayload, allowedAssets: DriveAsset[]) {
  const normalized: StudioPayload = {
    ...payload,
    frames: [...payload.frames]
      .sort((a, b) => a.position - b.position)
      .map((frame, index) => ({ ...frame, position: index + 1 }))
  };
  const expectedFrames = normalized.contentType === "carousel" ? null : 1;
  if (expectedFrames && normalized.frames.length !== expectedFrames) {
    throw new Error(`A geração de ${normalized.contentType} deve ter exatamente ${expectedFrames} frame.`);
  }
  if (normalized.contentType === "carousel" && (normalized.frames.length < 2 || normalized.frames.length > 10)) {
    throw new Error("Carrossel deve ter entre 2 e 10 frames.");
  }
  if (normalized.contentType === "carousel" && normalized.frames[0]?.template !== "cover") {
    throw new Error("O primeiro frame do carrossel deve ser uma capa.");
  }
  const allowedAssetIds = allowedAssets.map((asset) => asset.id);
  for (const frame of normalized.frames) {
    if (frame.mediaAssetId && !allowedAssetIds.includes(frame.mediaAssetId)) {
      throw new Error("A geração tentou usar um asset do Drive que o usuário não autorizou.");
    }
  }
  if (normalized.primaryDriveAssetId && !allowedAssetIds.includes(normalized.primaryDriveAssetId)) {
    throw new Error("A geração tentou usar uma mídia principal não autorizada.");
  }
  if (normalized.contentType === "reel") {
    const primary = allowedAssets.find((asset) => asset.id === normalized.primaryDriveAssetId);
    if (!primary?.mimeType.startsWith("video/")) {
      throw new Error("Reel requer um vídeo do Drive selecionado como mídia principal.");
    }
  }
  return normalized;
}

export async function analyzeInstagramReferenceVisual(reference: InstagramReferencePost) {
  if (reference.visualAnalysis && Object.keys(reference.visualAnalysis).length) return reference.visualAnalysis;
  const imageUrl = reference.thumbnailUrl ?? (reference.mediaType === "IMAGE" ? reference.mediaUrl : null);
  if (!imageUrl) return null;
  const imageResponse = await fetch(imageUrl, { cache: "no-store" });
  if (!imageResponse.ok) return null;
  const contentType = imageResponse.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
  if (!contentType.startsWith("image/")) return null;
  const bytes = Buffer.from(await imageResponse.arrayBuffer());
  if (bytes.byteLength > 12_000_000) return null;

  const config = env();
  if (!config.GEMINI_API_KEY) return null;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.GEMINI_POST_MODEL)}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": config.GEMINI_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: "Analise este post REAL já publicado pelo Instagram da Inteli Academy como referência de direção de arte. Descreva composição, hierarquia, paleta percebida, tipografia percebida, uso de mídia, densidade, motivos gráficos, tom e padrões reutilizáveis. Não tente identificar pessoas. Retorne apenas JSON." },
            { inlineData: { mimeType: contentType, data: bytes.toString("base64") } }
          ]
        }],
        generationConfig: { responseMimeType: "application/json" }
      }),
      cache: "no-store"
    }
  );
  if (!response.ok) return null;
  const responsePayload = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const raw = responsePayload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!raw) return null;
  try {
    return visualAnalysisSchema.parse(JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim()));
  } catch {
    return null;
  }
}

export async function generateStudioPayload(input: {
  contentType: StudioContentType;
  articles: StudioArticleEvidence[];
  userContext: string;
  driveAssets: DriveAsset[];
  reference: InstagramReferencePost | null;
  referenceAnalysis: Record<string, unknown> | null;
  historicalInstagramGuidance: string;
}): Promise<StudioPayload> {
  const allowedAssetIds = input.driveAssets.map((asset) => asset.id);
  const system = `Você é o diretor editorial e de arte da Inteli Academy. Gere conteúdo para o Instagram oficial da liga usando evidências reais e a identidade existente.\n\nHIERARQUIA DE REFERÊNCIAS\n1. Um post real do @inteli.academy escolhido pelo usuário, quando existir, é a referência visual/editorial mais forte desta geração.\n2. O histórico real sincronizado do @inteli.academy define tom, densidade, formatos e padrões editoriais gerais.\n3. O Figma ID Academy define a identidade visual e a biblioteca de linguagem gráfica. Todas as páginas auditadas em 12/08/2026 devem ser consideradas: ${FIGMA_AUDITED_PAGE_NAMES.join(", ")}. A página Social Media é a principal fonte visual do Figma para formatos sociais, sem excluir as demais páginas.\n4. Artigos e contexto do usuário definem os fatos e a mensagem.\n\nREGRAS\n- Não invente fatos, números, datas, citações ou URLs.\n- Toda factualClaim deve apontar para uma URL dos artigos fornecidos.\n- Use português brasileiro natural, direto e sem linguagem corporativa vazia.\n- Não copie literalmente o post de referência; reutilize princípios, não conteúdo.\n- O renderer e o plugin Figma controlam a gramática visual final. Escolha template e conteúdo, não invente estilos fora da Academy.\n- mediaAssetId e primaryDriveAssetId só podem usar IDs da lista de assets autorizados. Se a lista estiver vazia, omita esses campos.\n- Para Reel, primaryDriveAssetId deve ser um vídeo autorizado.\n- Para carrossel, varie cover/editorial/stat/quote/photo/cta conforme o conteúdo; não repita layouts sem motivo.\n- Garanta leitura confortável em mobile e pouca densidade por frame.\n\nFORMATO: ${input.contentType}\n${frameRules(input.contentType)}`;

  const user = `ARTIGOS SELECIONADOS\n${evidenceText(input.articles)}\n\n` +
    `CONTEXTO ESPECÍFICO DO USUÁRIO\n${input.userContext.trim() || "Nenhum contexto adicional."}\n\n` +
    `${referenceText(input.reference, input.referenceAnalysis)}\n\n` +
    `PADRÕES DO HISTÓRICO REAL DO INSTAGRAM\n${input.historicalInstagramGuidance}\n\n` +
    `ASSETS DO DRIVE AUTORIZADOS PELO USUÁRIO\n${assetsText(input.driveAssets)}\n\n` +
    `IDs de assets permitidos: ${allowedAssetIds.length ? allowedAssetIds.join(", ") : "nenhum"}.`;

  const payload = await callGeminiJson(
    [{ role: "system", content: system }, { role: "user", content: user }],
    studioPayloadSchema,
    { thinkingLevel: "high" }
  );
  if (payload.contentType !== input.contentType) throw new Error("A geração retornou um tipo de conteúdo diferente do solicitado.");
  return validateStudioPayload(payload, input.driveAssets);
}

export async function reviseStudioPayload(input: {
  current: StudioPayload;
  changeRequest: string;
  articles: StudioArticleEvidence[];
  reference: InstagramReferencePost | null;
  referenceAnalysis: Record<string, unknown> | null;
  driveAssets: DriveAsset[];
  historicalInstagramGuidance: string;
}) {
  const system = `Você está revisando uma versão visual/editorial já gerada para o Instagram da Inteli Academy. A alteração pedida pelo usuário tem prioridade, mas deve preservar precisão factual, formato, identidade da Academy e os assets autorizados. Retorne a versão COMPLETA, não apenas um diff. Não altere fatos sem suporte nos artigos. O post real de referência continua sendo a referência visual prioritária quando existir. Todas as páginas auditadas do Figma (${FIGMA_AUDITED_PAGE_NAMES.join(", ")}) continuam válidas como identidade.`;
  const user = `VERSÃO ATUAL\n${JSON.stringify(input.current)}\n\nALTERAÇÃO PEDIDA\n${input.changeRequest}\n\nARTIGOS\n${evidenceText(input.articles)}\n\nREFERÊNCIA REAL\n${referenceText(input.reference, input.referenceAnalysis)}\n\nHISTÓRICO\n${input.historicalInstagramGuidance}\n\nASSETS AUTORIZADOS\n${assetsText(input.driveAssets)}`;
  const revised = await callGeminiJson(
    [{ role: "system", content: system }, { role: "user", content: user }],
    studioPayloadSchema,
    { thinkingLevel: "high" }
  );
  if (revised.contentType !== input.current.contentType) {
    throw new Error("Uma revisão visual não pode trocar o tipo de conteúdo. Crie um novo projeto para outro formato.");
  }
  return validateStudioPayload(revised, input.driveAssets);
}
