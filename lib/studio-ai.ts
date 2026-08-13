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
  factualClaims: z.array(z.object({ claim: z.string().min(1), sourceUrl: z.string().url() })).max(24),
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
  if (!articles.length) {
    return "Nenhum artigo foi selecionado. Não crie factualClaims nem introduza fatos externos, números, datas ou citações não fornecidos no contexto do usuário.";
  }
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

function referencesText(references: InstagramReferencePost[]) {
  if (!references.length) {
    return "Nenhum post específico foi escolhido. Use o histórico real completo do perfil como principal referência editorial e Social Media como principal fonte visual do Figma.";
  }
  const rendered = references.map((reference, index) => [
    `REFERÊNCIA REAL ${index + 1}`,
    `ID: ${reference.id}`,
    `Tipo: ${reference.mediaProductType ?? reference.mediaType}`,
    `Data: ${reference.timestamp}`,
    `Legenda: ${reference.caption || "(sem legenda)"}`,
    `Permalink: ${reference.permalink}`,
    `Análise visual: ${reference.visualAnalysis ? JSON.stringify(reference.visualAnalysis) : "imagem indisponível para análise; use tipo, legenda e padrões gerais"}`
  ].join("\n")).join("\n\n");
  return `${rendered}\n\nOs posts acima formam JUNTOS o nível de referência mais forte desta geração. Extraia padrões comuns de composição, ritmo, densidade, mídia e tom. Quando divergirem, combine apenas elementos compatíveis com a identidade da Academy. Nenhum post deve ser tratado automaticamente como principal. Não copie literalmente texto ou conteúdo factual deles.`;
}

function validateStudioPayload(payload: StudioPayload, allowedAssets: DriveAsset[], articles: StudioArticleEvidence[]) {
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

  const allowedArticleUrls = new Set(articles.map((article) => article.url));
  if (!articles.length && normalized.factualClaims.length) {
    throw new Error("A geração criou alegações factuais mesmo sem artigos selecionados.");
  }
  for (const factualClaim of normalized.factualClaims) {
    if (!allowedArticleUrls.has(factualClaim.sourceUrl)) {
      throw new Error("A geração tentou atribuir uma alegação factual a uma fonte que não foi selecionada.");
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
  references: InstagramReferencePost[];
  historicalInstagramGuidance: string;
}): Promise<StudioPayload> {
  const allowedAssetIds = input.driveAssets.map((asset) => asset.id);
  const evidenceRules = input.articles.length
    ? "Artigos selecionados são as únicas fontes permitidas para factualClaims. Toda factualClaim deve apontar exatamente para uma URL desses artigos."
    : "Nenhum artigo foi selecionado. factualClaims DEVE ser []. Não invente fatos externos, números, datas, estudos, citações ou URLs. Trabalhe com o contexto do usuário, mensagens institucionais genéricas e direção editorial/visual.";
  const system = `Você é o diretor editorial e de arte da Inteli Academy. Gere conteúdo para o Instagram oficial da liga usando a identidade existente e somente as evidências explicitamente fornecidas quando houver.\n\nHIERARQUIA DE REFERÊNCIAS\n1. Todos os posts reais do @inteli.academy escolhidos pelo usuário formam JUNTOS o nível visual/editorial mais forte desta geração. Nenhum deles é automaticamente principal.\n2. O histórico real sincronizado do @inteli.academy define tom, densidade, formatos e padrões editoriais gerais.\n3. O Figma ID Academy define a identidade visual e a biblioteca de linguagem gráfica. Todas as páginas auditadas em 12/08/2026 devem ser consideradas: ${FIGMA_AUDITED_PAGE_NAMES.join(", ")}. A página Social Media é a PRINCIPAL fonte visual do Figma para formatos sociais, sem excluir as demais páginas.\n4. Artigos selecionados, quando existirem, fornecem evidência factual; o contexto do usuário define a mensagem e as restrições específicas.\n\nREGRAS\n- ${evidenceRules}\n- Não trate posts de referência do Instagram como fontes factuais; eles servem para estilo/editorial.\n- Use português brasileiro natural, direto e sem linguagem corporativa vazia.\n- Não copie literalmente os posts de referência; reutilize princípios, não conteúdo.\n- O renderer e o plugin Figma controlam a gramática visual final. Escolha template e conteúdo, não invente estilos fora da Academy.\n- mediaAssetId e primaryDriveAssetId só podem usar IDs da lista de assets autorizados. Se a lista estiver vazia, omita esses campos.\n- Para Reel, primaryDriveAssetId deve ser um vídeo autorizado.\n- Para carrossel, varie cover/editorial/stat/quote/photo/cta conforme o conteúdo; não repita layouts sem motivo.\n- Garanta leitura confortável em mobile e pouca densidade por frame.\n\nFORMATO: ${input.contentType}\n${frameRules(input.contentType)}`;

  const user = `ARTIGOS SELECIONADOS (OPCIONAIS)\n${evidenceText(input.articles)}\n\n` +
    `CONTEXTO ESPECÍFICO DO USUÁRIO\n${input.userContext.trim() || "Nenhum contexto adicional."}\n\n` +
    `REFERÊNCIAS REAIS DO INSTAGRAM\n${referencesText(input.references)}\n\n` +
    `PADRÕES DO HISTÓRICO REAL DO INSTAGRAM\n${input.historicalInstagramGuidance}\n\n` +
    `ASSETS DO DRIVE AUTORIZADOS PELO USUÁRIO\n${assetsText(input.driveAssets)}\n\n` +
    `IDs de assets permitidos: ${allowedAssetIds.length ? allowedAssetIds.join(", ") : "nenhum"}.`;

  const payload = await callGeminiJson(
    [{ role: "system", content: system }, { role: "user", content: user }],
    studioPayloadSchema,
    { thinkingLevel: "high" }
  );
  if (payload.contentType !== input.contentType) throw new Error("A geração retornou um tipo de conteúdo diferente do solicitado.");
  return validateStudioPayload(payload, input.driveAssets, input.articles);
}

export async function reviseStudioPayload(input: {
  current: StudioPayload;
  changeRequest: string;
  articles: StudioArticleEvidence[];
  references: InstagramReferencePost[];
  driveAssets: DriveAsset[];
  historicalInstagramGuidance: string;
}) {
  const evidenceRules = input.articles.length
    ? "Não altere fatos sem suporte nos artigos selecionados e mantenha factualClaims restritas às URLs desses artigos."
    : "Não há artigos selecionados: factualClaims deve permanecer vazia e a revisão não pode introduzir fatos externos, números, datas, estudos, citações ou URLs.";
  const system = `Você está revisando uma versão visual/editorial já gerada para o Instagram da Inteli Academy. A alteração pedida pelo usuário tem prioridade, mas deve preservar precisão, formato, identidade da Academy e os assets autorizados. Retorne a versão COMPLETA, não apenas um diff. ${evidenceRules} Todos os posts reais escolhidos continuam formando juntos o nível visual/editorial prioritário; nenhum é automaticamente principal. A página Social Media continua sendo a principal fonte visual do Figma para conteúdo social, e todas as páginas auditadas (${FIGMA_AUDITED_PAGE_NAMES.join(", ")}) permanecem válidas como identidade.`;
  const user = `VERSÃO ATUAL\n${JSON.stringify(input.current)}\n\nALTERAÇÃO PEDIDA\n${input.changeRequest}\n\nARTIGOS OPCIONAIS\n${evidenceText(input.articles)}\n\nREFERÊNCIAS REAIS\n${referencesText(input.references)}\n\nHISTÓRICO\n${input.historicalInstagramGuidance}\n\nASSETS AUTORIZADOS\n${assetsText(input.driveAssets)}`;
  const revised = await callGeminiJson(
    [{ role: "system", content: system }, { role: "user", content: user }],
    studioPayloadSchema,
    { thinkingLevel: "high" }
  );
  if (revised.contentType !== input.current.contentType) {
    throw new Error("Uma revisão visual não pode trocar o tipo de conteúdo. Crie um novo projeto para outro formato.");
  }
  return validateStudioPayload(revised, input.driveAssets, input.articles);
}
