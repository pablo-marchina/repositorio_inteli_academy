import { z } from "zod";
import { env } from "@/lib/env";
import { brand } from "@/lib/brand";
import type { GeneratedPost, ReviewResult, StoryCluster } from "@/lib/types";

const slideSchema = z.object({
  position: z.number().int().min(1).max(10),
  layout: z.enum(["cover", "headline", "stat", "split", "timeline", "cards", "impact", "sources", "cta"]),
  eyebrow: z.string().max(64).optional(),
  title: z.string().min(1).max(100),
  body: z.string().max(360).optional(),
  stat: z.string().max(32).optional(),
  statLabel: z.string().max(90).optional(),
  bullets: z.array(z.string().max(120)).max(4).optional(),
  sourceLabels: z.array(z.string().max(80)).max(8).optional(),
  accent: z.enum(["blue", "black", "white"]),
  composition: z.enum(["editorial", "poster", "modular", "split", "stack", "list"]),
  motif: z.enum(["brackets", "orbit", "grid", "ribbon", "frame", "none"]),
  titleStyle: z.enum(["sans", "serif", "mixed"]),
  highlight: z.string().max(48).optional()
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

export async function generateEditorialPost(clusters: StoryCluster[], historicalGuidance: string) {
  const system = `Você é o diretor editorial e de arte do Instagram da Inteli Academy. Crie um carrossel brasileiro de IA com alta precisão factual, forte narrativa e fidelidade rigorosa à identidade visual. Retorne somente JSON válido.

OBJETIVO EDITORIAL
- Escolha de 3 a 5 acontecimentos com maior utilidade, novidade e potencial de compartilhamento ou salvamento.
- Explique por que cada acontecimento importa para uma pessoa não especialista.
- Use português brasileiro natural, específico e sóbrio.
- Não invente números, citações, datas, causalidade ou conclusões.
- Toda afirmação factual deve aparecer em factualClaims com uma URL fornecida nas evidências.
- A capa deve prometer um benefício ou aprendizado concreto, nunca apenas “notícias da semana”.
- A legenda deve incluir contexto, uma chamada para salvar/compartilhar e uma seção curta “Fontes”.

SISTEMA VISUAL INTELI ACADEMY
- Paleta estrita: azul elétrico ${brand.colors.blue}, branco, carvão ${brand.colors.black} e cinza muito claro ${brand.colors.soft}. Não use gradientes, neon ou outras cores.
- Tipografia: grotesca geométrica e direta para informação; serif editorial de alto contraste apenas em capas, palavras-chave e números de destaque.
- Composição: grids editoriais assimétricos, margens generosas, títulos muito grandes, numerais editoriais, blocos sólidos, linhas finas, cantos arredondados e o monograma IA.
- Elementos recorrentes permitidos: brackets de canto, órbitas circulares, grid técnico discreto, faixa sólida, moldura editorial e cards modulares.
- Não use estética genérica de IA: robôs, cérebros, circuitos, estrelas, brilhos, hologramas, emojis ou ícones aleatórios.
- Um conceito principal por slide. Prefira espaço negativo a preencher a tela.
- Use entre ${brand.visualRules.minSlides} e ${brand.visualRules.maxSlides} slides.
- Ordem obrigatória: capa; desenvolvimento narrativo; penúltimo slide de fontes; último slide de CTA.
- Varie composição e motivo. Não repita a mesma composição em mais de dois slides consecutivos.
- Alterne fundos azul, branco e carvão; nunca use mais de dois fundos escuros consecutivos.
- O campo highlight, quando usado, deve ser uma palavra ou frase que exista literalmente no title.

DENSIDADE
- Título ideal: 3 a 9 palavras e no máximo ${brand.visualRules.maxTitleCharacters} caracteres.
- Corpo: no máximo ${brand.visualRules.maxBodyCharacters} caracteres e preferencialmente até 42 palavras.
- No máximo ${brand.visualRules.maxBullets} bullets por slide.
- Cards devem conter frases curtas; o slide de fontes deve usar nomes de fontes ou domínios, não URLs longas.

FORMATO JSON
{
  "title": "...",
  "caption": "...",
  "slides": [{
    "position": 1,
    "layout": "cover",
    "eyebrow": "...",
    "title": "...",
    "body": "...",
    "stat": "...",
    "statLabel": "...",
    "bullets": [],
    "sourceLabels": [],
    "accent": "blue",
    "composition": "editorial",
    "motif": "brackets",
    "titleStyle": "mixed",
    "highlight": "..."
  }],
  "features": {"research":0,"market":0,"tool":0,"regulation":0,"hasNumber":0,"slideCount":8,"coverQuestion":0,"coverPromise":1,"styleFidelity":1},
  "factualClaims": [{"claim":"...","sourceUrl":"https://..."}]
}`;

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
        content: `Você é um fact-checker independente. Compare TODAS as afirmações do post com as evidências fornecidas. Reprove se houver afirmação sem fonte compatível, exagero causal, número não sustentado, citação inventada ou URL que não esteja nas evidências. Retorne somente JSON: {"passed":boolean,"score":0-100,"issues":[],"corrections":[]}. Exija score >= 92 para passed=true.`
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
        content: `Você é um revisor editorial e diretor de arte da Inteli Academy. Avalie clareza, força da capa, progressão narrativa, densidade, utilidade, potencial de compartilhamento/salvamento e ausência de clickbait. Também avalie fidelidade visual: paleta azul/branco/carvão, títulos grandes, mistura controlada de sans e serif, grids assimétricos, espaço negativo, monograma IA, cards arredondados e motivos geométricos; reprove estética genérica de IA, gradientes, emojis, excesso de texto ou repetição de layout. Retorne somente JSON: {"passed":boolean,"score":0-100,"issues":[],"corrections":[]}. Exija score >= 90 para passed=true.`
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

export function programmaticReview(post: GeneratedPost): ReviewResult {
  const issues: string[] = [];
  const positions = post.slides.map((slide) => slide.position);
  const last = post.slides[post.slides.length - 1];
  const penultimate = post.slides[post.slides.length - 2];

  if (post.slides.length < brand.visualRules.minSlides || post.slides.length > brand.visualRules.maxSlides) {
    issues.push(`Quantidade de slides deve ficar entre ${brand.visualRules.minSlides} e ${brand.visualRules.maxSlides}.`);
  }
  if (!post.slides[0] || post.slides[0].layout !== "cover") issues.push("O primeiro slide deve ser uma capa.");
  if (!penultimate || penultimate.layout !== "sources") issues.push("O penúltimo slide deve ser o slide de fontes.");
  if (!last || last.layout !== "cta") issues.push("O último slide deve ser o CTA.");
  if (new Set(positions).size !== positions.length) issues.push("Há posições de slides duplicadas.");

  const compositions = new Set(post.slides.map((slide) => slide.composition));
  if (compositions.size < 3) issues.push("Use pelo menos três composições visuais diferentes.");
  if (post.slides[0]?.titleStyle === "sans") issues.push("A capa deve usar tipografia serif ou mista.");

  let repeatedAccent = 1;
  let repeatedComposition = 1;
  for (let index = 0; index < post.slides.length; index += 1) {
    const slide = post.slides[index];
    const previous = post.slides[index - 1];
    if (slide.title.length > brand.visualRules.maxTitleCharacters) issues.push(`Título longo no slide ${slide.position}.`);
    if ((slide.body?.length ?? 0) > brand.visualRules.maxBodyCharacters) issues.push(`Texto longo no slide ${slide.position}.`);
    if ((slide.bullets?.length ?? 0) > brand.visualRules.maxBullets) issues.push(`Bullets em excesso no slide ${slide.position}.`);
    if (slide.highlight && !slide.title.toLocaleLowerCase("pt-BR").includes(slide.highlight.toLocaleLowerCase("pt-BR"))) {
      issues.push(`O destaque do slide ${slide.position} não está contido no título.`);
    }
    if (previous) {
      repeatedAccent = previous.accent === slide.accent ? repeatedAccent + 1 : 1;
      repeatedComposition = previous.composition === slide.composition ? repeatedComposition + 1 : 1;
      if (repeatedAccent > 2 && slide.accent !== "white") issues.push(`Há mais de dois fundos escuros consecutivos no slide ${slide.position}.`);
      if (repeatedComposition > 2) issues.push(`A composição se repete mais de duas vezes até o slide ${slide.position}.`);
    }
  }
  if ((penultimate?.sourceLabels?.length ?? penultimate?.bullets?.length ?? 0) < 3) {
    issues.push("O slide de fontes deve listar pelo menos três referências.");
  }
  if (post.factualClaims.some((claim) => !claim.sourceUrl.startsWith("https://"))) issues.push("Toda fonte deve usar HTTPS.");
  const score = Math.max(0, 100 - issues.length * 12);
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
        content: `Você é um editor corretor e diretor de arte. Corrija o post usando somente as evidências e resolva todos os problemas apontados. Preserve os pontos fortes, a ordem capa → narrativa → fontes → CTA e a identidade Inteli Academy. Retorne somente o mesmo formato JSON do post original.`
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
