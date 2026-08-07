import { z } from "zod";
import { env } from "@/lib/env";
import { brand } from "@/lib/brand";
import {
  FIGMA_COLORS,
  FIGMA_COMPOSITIONS,
  FIGMA_CORNER_RADII,
  FIGMA_EFFECTS,
  FIGMA_FONT_WEIGHTS,
  FIGMA_GRADIENT_IDS,
  FIGMA_LAYOUTS,
  FIGMA_MEDIA_MODES,
  FIGMA_MOTIFS,
  FIGMA_SOURCE,
  FIGMA_STROKE_WEIGHTS,
  FIGMA_TYPEFACES,
  FIGMA_TYPE_SIZES,
  FIGMA_VISUAL_ELEMENTS,
  isAllowedFigmaValue
} from "@/lib/figma-visual-system";
import type { GeneratedPost, PostSlide, ReviewResult, StoryCluster } from "@/lib/types";

const slideSchema = z.object({
  position: z.number().int().min(1).max(10),
  layout: z.enum(FIGMA_LAYOUTS),
  eyebrow: z.string().max(64).optional(),
  title: z.string().min(1).max(100),
  body: z.string().max(360).optional(),
  stat: z.string().max(32).optional(),
  statLabel: z.string().max(90).optional(),
  bullets: z.array(z.string().max(120)).max(4).optional(),
  sourceLabels: z.array(z.string().max(80)).max(8).optional(),
  highlight: z.string().max(48).optional(),
  backgroundColor: z.enum(FIGMA_COLORS),
  foregroundColor: z.enum(FIGMA_COLORS),
  accentColor: z.enum(FIGMA_COLORS),
  gradient: z.enum(FIGMA_GRADIENT_IDS),
  composition: z.enum(FIGMA_COMPOSITIONS),
  motif: z.enum(FIGMA_MOTIFS),
  titleTypeface: z.enum(FIGMA_TYPEFACES),
  bodyTypeface: z.enum(FIGMA_TYPEFACES),
  titleWeight: z.enum(FIGMA_FONT_WEIGHTS),
  bodyWeight: z.enum(FIGMA_FONT_WEIGHTS),
  titleItalic: z.boolean(),
  bodyItalic: z.boolean(),
  titleSize: z.enum(FIGMA_TYPE_SIZES),
  bodySize: z.enum(FIGMA_TYPE_SIZES),
  cornerRadius: z.enum(FIGMA_CORNER_RADII),
  strokeWeight: z.enum(FIGMA_STROKE_WEIGHTS),
  effect: z.enum(FIGMA_EFFECTS),
  mediaMode: z.enum(FIGMA_MEDIA_MODES),
  visualElements: z.array(z.enum(FIGMA_VISUAL_ELEMENTS)).max(4)
});

const generatedPostSchema = z.object({
  title: z.string().min(1).max(120),
  caption: z.string().min(50).max(2200),
  slides: z.array(slideSchema).min(6).max(9),
  features: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  factualClaims: z.array(z.object({ claim: z.string().min(1), sourceUrl: z.string().url() })).min(1)
});

const reviewSchema = z.object({
  passed: z.boolean(),
  score: z.number().min(0).max(100),
  issues: z.array(z.string()),
  corrections: z.array(z.string())
});

function visualIndex(values: readonly string[]) {
  return z.number().int().min(0).max(values.length - 1);
}

/*
 * Gemini can reject schemas containing very large enums. The wire schema keeps
 * the remote JSON Schema small by using zero-based integer IDs. Every ID is
 * decoded server-side into a value from the audited Figma whitelist and then
 * validated again by generatedPostSchema before a post can be stored.
 */
const wireSlideSchema = z.object({
  position: z.number().int().min(1).max(10),
  layoutId: visualIndex(FIGMA_LAYOUTS),
  eyebrow: z.string().optional(),
  title: z.string(),
  body: z.string().optional(),
  stat: z.string().optional(),
  statLabel: z.string().optional(),
  bullets: z.array(z.string()).max(4).optional(),
  highlight: z.string().optional(),
  backgroundColorId: visualIndex(FIGMA_COLORS),
  foregroundColorId: visualIndex(FIGMA_COLORS),
  accentColorId: visualIndex(FIGMA_COLORS),
  gradientId: visualIndex(FIGMA_GRADIENT_IDS),
  compositionId: visualIndex(FIGMA_COMPOSITIONS),
  motifId: visualIndex(FIGMA_MOTIFS),
  titleTypefaceId: visualIndex(FIGMA_TYPEFACES),
  bodyTypefaceId: visualIndex(FIGMA_TYPEFACES),
  titleWeightId: visualIndex(FIGMA_FONT_WEIGHTS),
  bodyWeightId: visualIndex(FIGMA_FONT_WEIGHTS),
  titleItalic: z.boolean(),
  bodyItalic: z.boolean(),
  titleSizeId: visualIndex(FIGMA_TYPE_SIZES),
  bodySizeId: visualIndex(FIGMA_TYPE_SIZES),
  cornerRadiusId: visualIndex(FIGMA_CORNER_RADII),
  strokeWeightId: visualIndex(FIGMA_STROKE_WEIGHTS),
  effectId: visualIndex(FIGMA_EFFECTS),
  mediaModeId: visualIndex(FIGMA_MEDIA_MODES),
  visualElementIds: z.array(visualIndex(FIGMA_VISUAL_ELEMENTS)).max(4)
});

const wireGeneratedPostSchema = z.object({
  title: z.string(),
  caption: z.string(),
  slides: z.array(wireSlideSchema).min(6).max(9),
  features: z.object({
    research: z.number(),
    market: z.number(),
    tool: z.number(),
    regulation: z.number(),
    hasNumber: z.number(),
    slideCount: z.number(),
    coverQuestion: z.number(),
    coverPromise: z.number(),
    styleFidelity: z.number()
  }),
  factualClaims: z.array(z.object({ claim: z.string(), sourceUrl: z.string() })).min(1)
});

type WireGeneratedPost = z.infer<typeof wireGeneratedPostSchema>;
type Message = { role: "system" | "user" | "assistant"; content: string };
type ThinkingLevel = "minimal" | "low" | "medium" | "high";
type GeminiContent = { role: "user" | "model"; parts: Array<{ text: string }> };

type GeminiPayload = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string; blockReasonMessage?: string };
};

type GeminiCallOptions = {
  model?: string;
  thinkingLevel?: ThinkingLevel;
};

const unsupportedSchemaKeys = new Set([
  "minLength",
  "maxLength",
  "pattern",
  "default",
  "examples",
  "contentEncoding",
  "contentMediaType",
  "propertyNames",
  "uniqueItems"
]);

function sanitizeGeminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeGeminiSchema);
  if (!value || typeof value !== "object") return value;

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (unsupportedSchemaKeys.has(key)) continue;
    result[key] = sanitizeGeminiSchema(child);
  }
  return result;
}

function schemaPrompt(responseJsonSchema: Record<string, unknown>) {
  return `FORMATO JSON OBRIGATÓRIO\nRetorne somente um objeto JSON que corresponda exatamente ao JSON Schema abaixo. Não envolva o objeto em outra chave, não omita propriedades listadas em required e não renomeie campos.\n\n${JSON.stringify(responseJsonSchema)}`;
}

function parseGeminiJson(raw: string): unknown {
  try {
    return JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim());
  } catch (error) {
    throw new Error(`Invalid JSON returned by Gemini: ${String(error)}`);
  }
}

function zodIssueSummary(error: z.ZodError) {
  return error.issues
    .slice(0, 12)
    .map((issue) => `${issue.path.length ? issue.path.join(".") : "<root>"}: ${issue.message}`)
    .join("; ");
}

export async function callGeminiJson<T>(
  messages: Message[],
  schema: z.ZodType<T>,
  options: GeminiCallOptions = {}
): Promise<T> {
  const config = env();
  if (!config.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required for generation and review.");

  const model = options.model ?? config.GEMINI_POST_MODEL;
  const systemInstruction = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const contents: GeminiContent[] = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }]
    }));

  const rawSchema = z.toJSONSchema(schema, { target: "draft-07" }) as Record<string, unknown>;
  delete rawSchema.$schema;
  const responseJsonSchema = sanitizeGeminiSchema(rawSchema) as Record<string, unknown>;
  const exactSchemaPrompt = schemaPrompt(responseJsonSchema);

  const generationConfig: Record<string, unknown> = {
    responseMimeType: "application/json",
    responseJsonSchema
  };
  if (/^gemini-3(?:\.|-)/.test(model)) {
    generationConfig.thinkingConfig = {
      thinkingLevel: options.thinkingLevel ?? "high"
    };
  }

  const request = async (configOverride: Record<string, unknown>, contentOverride: GeminiContent[] = contents) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": config.GEMINI_API_KEY!,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
        contents: contentOverride,
        generationConfig: configOverride
      }),
      cache: "no-store"
    });

  const fallbackConfig = { ...generationConfig };
  delete fallbackConfig.responseJsonSchema;

  let response = await request(generationConfig);
  if (!response.ok) {
    const firstError = await response.text();
    if (response.status === 400 && firstError.includes("INVALID_ARGUMENT")) {
      console.warn(`Gemini rejected responseJsonSchema for ${model}; retrying with the exact schema embedded in the prompt.`);
      response = await request(fallbackConfig, [
        ...contents,
        { role: "user", parts: [{ text: exactSchemaPrompt }] }
      ]);
      if (!response.ok) {
        throw new Error(
          `Gemini request failed after schema-in-prompt fallback (${response.status}, model ${model}): ${await response.text()}`
        );
      }
    } else {
      throw new Error(`Gemini request failed (${response.status}, model ${model}): ${firstError}`);
    }
  }

  const payload = (await response.json()) as GeminiPayload;
  const raw = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!raw) {
    const reason = payload.promptFeedback?.blockReasonMessage ?? payload.promptFeedback?.blockReason ?? payload.candidates?.[0]?.finishReason;
    throw new Error(`Gemini returned no content${reason ? `: ${reason}` : "."}`);
  }

  const parsed = parseGeminiJson(raw);
  const validation = schema.safeParse(parsed);
  if (validation.success) return validation.data;

  const issueSummary = zodIssueSummary(validation.error);
  console.warn(`Gemini returned JSON outside the required schema for ${model}; retrying once. ${issueSummary}`);

  const repairResponse = await request(fallbackConfig, [
    ...contents,
    {
      role: "user",
      parts: [
        {
          text: `${exactSchemaPrompt}\n\nA resposta anterior não correspondeu ao formato obrigatório. Gere novamente o resultado completo, corrigindo estes erros de estrutura: ${issueSummary}`
        }
      ]
    }
  ]);
  if (!repairResponse.ok) {
    throw new Error(
      `Gemini schema repair request failed (${repairResponse.status}, model ${model}): ${await repairResponse.text()}`
    );
  }

  const repairPayload = (await repairResponse.json()) as GeminiPayload;
  const repairRaw = repairPayload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!repairRaw) {
    const reason = repairPayload.promptFeedback?.blockReasonMessage ?? repairPayload.promptFeedback?.blockReason ?? repairPayload.candidates?.[0]?.finishReason;
    throw new Error(`Gemini returned no content during schema repair${reason ? `: ${reason}` : "."}`);
  }

  const repaired = parseGeminiJson(repairRaw);
  const repairedValidation = schema.safeParse(repaired);
  if (!repairedValidation.success) {
    throw new Error(`Gemini returned JSON outside the required schema after repair: ${zodIssueSummary(repairedValidation.error)}`);
  }
  return repairedValidation.data;
}

function pick<T extends readonly string[]>(values: T, id: number, label: string): T[number] {
  const value = values[id];
  if (value === undefined) throw new Error(`Invalid ${label} id returned by Gemini: ${id}`);
  return value;
}

function decodeWirePost(wire: WireGeneratedPost): GeneratedPost {
  const slides: PostSlide[] = wire.slides.map((slide) => ({
    position: slide.position,
    layout: pick(FIGMA_LAYOUTS, slide.layoutId, "layout"),
    eyebrow: slide.eyebrow,
    title: slide.title,
    body: slide.body,
    stat: slide.stat,
    statLabel: slide.statLabel,
    bullets: slide.bullets,
    highlight: slide.highlight,
    backgroundColor: pick(FIGMA_COLORS, slide.backgroundColorId, "background color"),
    foregroundColor: pick(FIGMA_COLORS, slide.foregroundColorId, "foreground color"),
    accentColor: pick(FIGMA_COLORS, slide.accentColorId, "accent color"),
    gradient: pick(FIGMA_GRADIENT_IDS, slide.gradientId, "gradient"),
    composition: pick(FIGMA_COMPOSITIONS, slide.compositionId, "composition"),
    motif: pick(FIGMA_MOTIFS, slide.motifId, "motif"),
    titleTypeface: pick(FIGMA_TYPEFACES, slide.titleTypefaceId, "title typeface"),
    bodyTypeface: pick(FIGMA_TYPEFACES, slide.bodyTypefaceId, "body typeface"),
    titleWeight: pick(FIGMA_FONT_WEIGHTS, slide.titleWeightId, "title weight"),
    bodyWeight: pick(FIGMA_FONT_WEIGHTS, slide.bodyWeightId, "body weight"),
    titleItalic: slide.titleItalic,
    bodyItalic: slide.bodyItalic,
    titleSize: pick(FIGMA_TYPE_SIZES, slide.titleSizeId, "title size"),
    bodySize: pick(FIGMA_TYPE_SIZES, slide.bodySizeId, "body size"),
    cornerRadius: pick(FIGMA_CORNER_RADII, slide.cornerRadiusId, "corner radius"),
    strokeWeight: pick(FIGMA_STROKE_WEIGHTS, slide.strokeWeightId, "stroke weight"),
    effect: pick(FIGMA_EFFECTS, slide.effectId, "effect"),
    mediaMode: pick(FIGMA_MEDIA_MODES, slide.mediaModeId, "media mode"),
    visualElements: slide.visualElementIds.map((id) => pick(FIGMA_VISUAL_ELEMENTS, id, "visual element"))
  }));

  return generatedPostSchema.parse({
    title: wire.title,
    caption: wire.caption,
    slides,
    features: wire.features,
    factualClaims: wire.factualClaims
  }) as GeneratedPost;
}

const visualTokenCatalog = JSON.stringify({
  colors: FIGMA_COLORS,
  gradients: FIGMA_GRADIENT_IDS,
  layouts: FIGMA_LAYOUTS,
  compositions: FIGMA_COMPOSITIONS,
  motifs: FIGMA_MOTIFS,
  typefaces: FIGMA_TYPEFACES,
  fontWeights: FIGMA_FONT_WEIGHTS,
  typeSizes: FIGMA_TYPE_SIZES,
  cornerRadii: FIGMA_CORNER_RADII,
  strokeWeights: FIGMA_STROKE_WEIGHTS,
  effects: FIGMA_EFFECTS,
  mediaModes: FIGMA_MEDIA_MODES,
  visualElements: FIGMA_VISUAL_ELEMENTS
});

function clusterContext(clusters: StoryCluster[]) {
  return clusters
    .map(
      (cluster, index) =>
        `${index + 1}. ${cluster.title}\n` +
        `Resumo: ${cluster.summary}\n` +
        `Tema: ${cluster.topic}; fontes independentes: ${cluster.sourceCount}; qualidade: ${cluster.sourceQuality.toFixed(2)}; popularidade: ${cluster.popularityScore.toFixed(1)}; previsão de engajamento: ${cluster.predictedEngagement.toFixed(2)}\n` +
        `Fontes: ${cluster.sourceUrls.join(", ")}`
    )
    .join("\n\n");
}

const auditedPages = FIGMA_SOURCE.pages.join(", ");

function visualContractPrompt() {
  return `CONTRATO VISUAL FECHADO\n- O contrato foi extraído de todas as páginas do Figma ID Academy: ${auditedPages}.\n- Cada campo visual termina em Id e deve receber o índice ZERO-BASED do valor correspondente no catálogo abaixo.\n- Todo ID válido resolve necessariamente para um elemento presente no Figma; não use valores fora dos intervalos do schema.\n- visualElementIds recebe no máximo quatro índices da lista visualElements.\n- Combine os elementos permitidos com liberdade editorial e hierarquia clara.\n\nCATÁLOGO DE TOKENS (índice = posição zero-based na lista)\n${visualTokenCatalog}`;
}

export async function generateEditorialPost(clusters: StoryCluster[], historicalGuidance: string) {
  const system = `Você é o diretor editorial e de arte do Instagram da Inteli Academy. Crie um carrossel brasileiro de IA com alta precisão factual, narrativa forte e identidade visual auditável. Retorne somente JSON válido.\n\nOBJETIVO EDITORIAL\n- Escolha de 3 a 5 acontecimentos com maior utilidade, novidade e potencial de compartilhamento ou salvamento.\n- Explique por que cada acontecimento importa para uma pessoa não especialista.\n- Use português brasileiro natural, específico e sóbrio.\n- Não invente números, citações, datas, causalidade ou conclusões.\n- Toda afirmação factual deve aparecer em factualClaims com uma URL fornecida nas evidências.\n- A capa deve prometer um benefício ou aprendizado concreto.\n- A legenda deve incluir contexto, chamada para salvar ou compartilhar e uma seção curta de fontes.\n- As fontes ficam na legenda e em factualClaims; não crie slide exclusivo de fontes.\n\n${visualContractPrompt()}\n\nESTRUTURA\n- Use entre ${brand.visualRules.minSlides} e ${brand.visualRules.maxSlides} slides.\n- O primeiro slide deve usar layoutId correspondente a cover.\n- O último deve usar layoutId correspondente a cta.\n- Um conceito principal por slide.\n- Títulos idealmente entre 3 e 9 palavras e até ${brand.visualRules.maxTitleCharacters} caracteres.\n- Corpo com até ${brand.visualRules.maxBodyCharacters} caracteres e no máximo ${brand.visualRules.maxBullets} bullets.\n- Tamanhos acima de 180 apenas para números ou palavras muito curtas.\n- highlight, quando usado, deve existir literalmente no title.\n- features deve preencher todos os nove campos numéricos do schema.`;

  const user = `CANDIDATOS DA SEMANA\n${clusterContext(clusters)}\n\nAPRENDIZADO DO PERFIL\n${historicalGuidance || "Ainda não há histórico suficiente; priorize clareza, novidade, utilidade e potencial de compartilhamento."}`;
  const wire = await callGeminiJson<WireGeneratedPost>(
    [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    wireGeneratedPostSchema,
    { thinkingLevel: "high" }
  );

  const generated = decodeWirePost(wire);
  generated.slides = generated.slides
    .sort((a, b) => a.position - b.position)
    .map((slide, index) => ({ ...slide, position: index + 1 }));
  return generated;
}

export async function factualReview(post: GeneratedPost, evidence: StoryCluster[]): Promise<ReviewResult> {
  return callGeminiJson<ReviewResult>(
    [
      {
        role: "system",
        content: `Você é um fact-checker independente. Compare TODAS as afirmações do post com as evidências fornecidas. Reprove se houver afirmação sem fonte compatível, exagero causal, número não sustentado, citação inventada ou URL que não esteja nas evidências. As fontes podem ficar somente na legenda e em factualClaims; não exija slide de fontes. Retorne somente JSON com passed, score, issues e corrections. Exija score >= 92 para passed=true.`
      },
      {
        role: "user",
        content: `POST\n${JSON.stringify(post)}\n\nEVIDÊNCIAS\n${clusterContext(evidence)}`
      }
    ],
    reviewSchema,
    { thinkingLevel: "high" }
  );
}

export async function editorialReview(post: GeneratedPost, historicalGuidance: string): Promise<ReviewResult> {
  return callGeminiJson<ReviewResult>(
    [
      {
        role: "system",
        content: `Você é um revisor editorial e diretor de arte da Inteli Academy. Avalie clareza, força da capa, progressão narrativa, densidade, utilidade e potencial de compartilhamento e salvamento. O contrato visual é fechado e foi extraído de todas as páginas do Figma ID Academy (${auditedPages}). A aplicação já converteu IDs para tokens auditados; trate qualquer token fora da whitelist como reprovação. Não exija slide de fontes. Retorne somente JSON com passed, score, issues e corrections. Exija score >= 90 para passed=true.`
      },
      {
        role: "user",
        content: `POST\n${JSON.stringify(post)}\n\nAPRENDIZADO HISTÓRICO\n${historicalGuidance || "Sem histórico suficiente."}`
      }
    ],
    reviewSchema,
    { thinkingLevel: "high" }
  );
}

function invalidToken(
  issues: string[],
  position: number,
  label: string,
  value: unknown,
  allowed: readonly string[]
) {
  if (!isAllowedFigmaValue(value, allowed)) {
    issues.push(`${label} fora da whitelist do Figma no slide ${position}.`);
  }
}

export function programmaticReview(post: GeneratedPost): ReviewResult {
  const issues: string[] = [];
  const positions = post.slides.map((slide) => slide.position);
  const last = post.slides[post.slides.length - 1];

  if (post.slides.length < brand.visualRules.minSlides || post.slides.length > brand.visualRules.maxSlides) {
    issues.push(`Quantidade de slides deve ficar entre ${brand.visualRules.minSlides} e ${brand.visualRules.maxSlides}.`);
  }
  if (!post.slides[0] || post.slides[0].layout !== "cover") issues.push("O primeiro slide deve ser uma capa.");
  if (!last || last.layout !== "cta") issues.push("O último slide deve ser o CTA.");
  if (new Set(positions).size !== positions.length) issues.push("Há posições de slides duplicadas.");

  for (const slide of post.slides) {
    invalidToken(issues, slide.position, "layout", slide.layout, FIGMA_LAYOUTS);
    invalidToken(issues, slide.position, "backgroundColor", slide.backgroundColor, FIGMA_COLORS);
    invalidToken(issues, slide.position, "foregroundColor", slide.foregroundColor, FIGMA_COLORS);
    invalidToken(issues, slide.position, "accentColor", slide.accentColor, FIGMA_COLORS);
    invalidToken(issues, slide.position, "gradient", slide.gradient, FIGMA_GRADIENT_IDS);
    invalidToken(issues, slide.position, "composition", slide.composition, FIGMA_COMPOSITIONS);
    invalidToken(issues, slide.position, "motif", slide.motif, FIGMA_MOTIFS);
    invalidToken(issues, slide.position, "titleTypeface", slide.titleTypeface, FIGMA_TYPEFACES);
    invalidToken(issues, slide.position, "bodyTypeface", slide.bodyTypeface, FIGMA_TYPEFACES);
    invalidToken(issues, slide.position, "titleWeight", slide.titleWeight, FIGMA_FONT_WEIGHTS);
    invalidToken(issues, slide.position, "bodyWeight", slide.bodyWeight, FIGMA_FONT_WEIGHTS);
    invalidToken(issues, slide.position, "titleSize", slide.titleSize, FIGMA_TYPE_SIZES);
    invalidToken(issues, slide.position, "bodySize", slide.bodySize, FIGMA_TYPE_SIZES);
    invalidToken(issues, slide.position, "cornerRadius", slide.cornerRadius, FIGMA_CORNER_RADII);
    invalidToken(issues, slide.position, "strokeWeight", slide.strokeWeight, FIGMA_STROKE_WEIGHTS);
    invalidToken(issues, slide.position, "effect", slide.effect, FIGMA_EFFECTS);
    invalidToken(issues, slide.position, "mediaMode", slide.mediaMode, FIGMA_MEDIA_MODES);

    for (const element of slide.visualElements ?? []) {
      invalidToken(issues, slide.position, "visualElement", element, FIGMA_VISUAL_ELEMENTS);
    }
    if ((slide.visualElements?.length ?? 0) > 4) issues.push(`Elementos visuais em excesso no slide ${slide.position}.`);
    if (slide.title.length > brand.visualRules.maxTitleCharacters) issues.push(`Título longo no slide ${slide.position}.`);
    if ((slide.body?.length ?? 0) > brand.visualRules.maxBodyCharacters) issues.push(`Texto longo no slide ${slide.position}.`);
    if ((slide.bullets?.length ?? 0) > brand.visualRules.maxBullets) issues.push(`Bullets em excesso no slide ${slide.position}.`);
    if (slide.highlight && !slide.title.toLocaleLowerCase("pt-BR").includes(slide.highlight.toLocaleLowerCase("pt-BR"))) {
      issues.push(`O destaque do slide ${slide.position} não está contido no título.`);
    }

    const titleSize = Number(slide.titleSize);
    const bodySize = Number(slide.bodySize);
    if (titleSize > 180 && slide.title.length > 12) issues.push(`Título incompatível com o tamanho escolhido no slide ${slide.position}.`);
    if (bodySize > 64 && (slide.body?.length ?? 0) > 50) issues.push(`Corpo incompatível com o tamanho escolhido no slide ${slide.position}.`);
  }

  if (post.factualClaims.some((claim) => !claim.sourceUrl.startsWith("https://"))) issues.push("Toda fonte deve usar HTTPS.");
  const score = Math.max(0, 100 - issues.length * 10);
  return { passed: issues.length === 0, score, issues, corrections: issues };
}

export async function repairPost(
  post: GeneratedPost,
  reviews: ReviewResult[],
  evidence: StoryCluster[]
): Promise<GeneratedPost> {
  const wire = await callGeminiJson<WireGeneratedPost>(
    [
      {
        role: "system",
        content: `Você é um editor corretor e diretor de arte. Corrija o post usando somente as evidências e resolva todos os problemas apontados. Preserve os pontos fortes, a sequência capa → narrativa → CTA e o contrato fechado do Figma. As fontes ficam na legenda e em factualClaims.\n\n${visualContractPrompt()}\n\nRetorne o post corrigido usando os IDs numéricos do schema.`
      },
      {
        role: "user",
        content: `POST ORIGINAL\n${JSON.stringify(post)}\n\nREVISÕES\n${JSON.stringify(reviews)}\n\nEVIDÊNCIAS\n${clusterContext(evidence)}`
      }
    ],
    wireGeneratedPostSchema,
    { thinkingLevel: "high" }
  );
  return decodeWirePost(wire);
}
