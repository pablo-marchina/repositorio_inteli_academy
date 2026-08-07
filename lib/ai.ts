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
import type { GeneratedPost, ReviewResult, StoryCluster } from "@/lib/types";

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

type Message = { role: "system" | "user" | "assistant"; content: string };
type ThinkingLevel = "minimal" | "low" | "medium" | "high";

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
  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }]
    }));
  const responseJsonSchema = z.toJSONSchema(schema, { target: "draft-07" }) as Record<string, unknown>;
  delete responseJsonSchema.$schema;

  const generationConfig: Record<string, unknown> = {
    responseMimeType: "application/json",
    responseJsonSchema
  };
  if (/^gemini-3(?:\.|-)/.test(model)) {
    generationConfig.thinkingConfig = {
      thinkingLevel: options.thinkingLevel ?? "high"
    };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": config.GEMINI_API_KEY,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
        contents,
        generationConfig
      }),
      cache: "no-store"
    }
  );

  if (!response.ok) throw new Error(`Gemini request failed (${response.status}): ${await response.text()}`);
  const payload = (await response.json()) as GeminiPayload;
  const raw = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!raw) {
    const reason = payload.promptFeedback?.blockReasonMessage ?? payload.promptFeedback?.blockReason ?? payload.candidates?.[0]?.finishReason;
    throw new Error(`Gemini returned no content${reason ? `: ${reason}` : "."}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim());
  } catch (error) {
    throw new Error(`Invalid JSON returned by Gemini: ${String(error)}`);
  }
  return schema.parse(parsed);
}

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

export async function generateEditorialPost(clusters: StoryCluster[], historicalGuidance: string) {
  const system = `Você é o diretor editorial e de arte do Instagram da Inteli Academy. Crie um carrossel brasileiro de IA com alta precisão factual, narrativa forte e identidade visual auditável. Retorne somente JSON válido.

OBJETIVO EDITORIAL
- Escolha de 3 a 5 acontecimentos com maior utilidade, novidade e potencial de compartilhamento ou salvamento.
- Explique por que cada acontecimento importa para uma pessoa não especialista.
- Use português brasileiro natural, específico e sóbrio.
- Não invente números, citações, datas, causalidade ou conclusões.
- Toda afirmação factual deve aparecer em factualClaims com uma URL fornecida nas evidências.
- A capa deve prometer um benefício ou aprendizado concreto, nunca apenas “notícias da semana”.
- A legenda deve incluir contexto, uma chamada para salvar ou compartilhar e uma seção curta de fontes.
- As fontes ficam na legenda e em factualClaims; não crie slide exclusivo de fontes.

CONTRATO VISUAL FECHADO
- O contrato foi extraído em modo somente leitura de todas as páginas do Figma ID Academy: ${auditedPages}.
- Os enums do schema JSON são a lista completa de valores permitidos para cores, gradientes, tipografias, pesos, tamanhos, raios, strokes, efeitos, tratamentos de mídia, layouts, composições, motivos e elementos gráficos.
- Escolha somente valores presentes nesses enums. Não invente nomes, tokens, cores, fontes, efeitos, formas, motivos ou layouts fora do schema.
- Combine os elementos permitidos com liberdade editorial, mas mantenha uma hierarquia clara e um conceito principal por slide.
- Use entre ${brand.visualRules.minSlides} e ${brand.visualRules.maxSlides} slides.
- A sequência deve começar com capa, desenvolver a narrativa e terminar com CTA.
- Use visualElements para declarar todos os elementos decorativos do slide; no máximo quatro.
- O campo highlight, quando usado, deve existir literalmente em title.
- Tamanhos acima de 180 devem ser reservados a números ou palavras muito curtas.
- bodySize deve permanecer legível e proporcional à quantidade de texto.

DENSIDADE
- Título ideal: 3 a 9 palavras e no máximo ${brand.visualRules.maxTitleCharacters} caracteres.
- Corpo: no máximo ${brand.visualRules.maxBodyCharacters} caracteres e preferencialmente até 42 palavras.
- No máximo ${brand.visualRules.maxBullets} bullets por slide.
- Cards devem conter frases curtas e escaneáveis.

FORMATO
Preencha todos os campos visuais obrigatórios do schema. Use gradient="none", effect="none" ou mediaMode="none" quando o recurso não for necessário.`;

  const user = `CANDIDATOS DA SEMANA\n${clusterContext(clusters)}\n\nAPRENDIZADO DO PERFIL\n${historicalGuidance || "Ainda não há histórico suficiente; priorize clareza, novidade, utilidade e potencial de compartilhamento."}`;
  const generated = await callGeminiJson<GeneratedPost>(
    [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    generatedPostSchema,
    { thinkingLevel: "high" }
  );

  generated.slides = generated.slides
    .sort((a, b) => a.position - b.position)
    .map((slide, index) => ({ ...slide, position: index + 1 }));
  return generated satisfies GeneratedPost;
}

export async function factualReview(post: GeneratedPost, evidence: StoryCluster[]): Promise<ReviewResult> {
  return callGeminiJson<ReviewResult>(
    [
      {
        role: "system",
        content: `Você é um fact-checker independente. Compare TODAS as afirmações do post com as evidências fornecidas. Reprove se houver afirmação sem fonte compatível, exagero causal, número não sustentado, citação inventada ou URL que não esteja nas evidências. As fontes podem ficar somente na legenda e em factualClaims; não exija slide de fontes. Retorne somente JSON: {"passed":boolean,"score":0-100,"issues":[],"corrections":[]}. Exija score >= 92 para passed=true.`
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
        content: `Você é um revisor editorial e diretor de arte da Inteli Academy. Avalie clareza, força da capa, progressão narrativa, densidade, utilidade e potencial de compartilhamento e salvamento. O contrato visual é fechado e foi extraído de todas as páginas do Figma ID Academy (${auditedPages}). Reprove qualquer valor visual, elemento, motivo ou composição que não pertença aos enums do post. Não exija slide de fontes. Retorne somente JSON: {"passed":boolean,"score":0-100,"issues":[],"corrections":[]}. Exija score >= 90 para passed=true.`
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
  return callGeminiJson<GeneratedPost>(
    [
      {
        role: "system",
        content: `Você é um editor corretor e diretor de arte. Corrija o post usando somente as evidências e resolva todos os problemas apontados. Preserve os pontos fortes, a sequência capa → narrativa → CTA e mantenha cada campo visual estritamente dentro dos enums do contrato fechado extraído do Figma ID Academy. Mantenha as fontes na legenda e em factualClaims, sem criar slide de fontes. Retorne somente o mesmo formato JSON do post original.`
      },
      {
        role: "user",
        content: `POST ORIGINAL\n${JSON.stringify(post)}\n\nREVISÕES\n${JSON.stringify(reviews)}\n\nEVIDÊNCIAS\n${clusterContext(evidence)}`
      }
    ],
    generatedPostSchema,
    { thinkingLevel: "high" }
  );
}
