import { z } from "zod";
import { env } from "@/lib/env";
import { brand } from "@/lib/brand";
import type { GeneratedPost, ReviewResult, StoryCluster } from "@/lib/types";

const slideSchema = z.object({
  position: z.number().int().min(1).max(10),
  layout: z.enum(["cover", "headline", "stat", "split", "timeline", "cards", "impact", "sources", "cta"]),
  eyebrow: z.string().max(80).optional(),
  title: z.string().min(1).max(120),
  body: z.string().max(500).optional(),
  stat: z.string().max(40).optional(),
  statLabel: z.string().max(100).optional(),
  bullets: z.array(z.string().max(140)).max(5).optional(),
  sourceLabels: z.array(z.string().max(80)).max(8).optional(),
  accent: z.enum(["blue", "black", "white"]).optional()
});

const generatedPostSchema = z.object({
  title: z.string().min(1).max(120),
  caption: z.string().min(50).max(2200),
  slides: z.array(slideSchema).min(5).max(10),
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

type GeminiPayload = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string; blockReasonMessage?: string };
};

export async function callGeminiJson<T>(messages: Message[], schema: z.ZodType<T>): Promise<T> {
  const config = env();
  if (!config.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required for generation and review.");

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

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.GEMINI_MODEL)}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": config.GEMINI_API_KEY,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
        contents,
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseJsonSchema
        }
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
  const system = `Você é o editor-chefe de um perfil brasileiro de IA voltado ao público geral. Sua prioridade é gerar compartilhamentos, salvamentos e seguidores sem sacrificar precisão. Retorne somente JSON válido.

REGRAS EDITORIAIS
- Escolha de 3 a 5 acontecimentos com maior potencial de engajamento, misturando pesquisa, produtos, ferramentas, mercado ou regulação conforme o desempenho previsto.
- Explique por que cada acontecimento importa para uma pessoa não especialista.
- Use português brasileiro natural, direto e sem sensacionalismo enganoso.
- Não invente números, citações, resultados ou datas.
- Cada afirmação factual deve aparecer em factualClaims com a URL que a sustenta.
- A capa deve ter uma promessa clara e específica, não apenas “notícias da semana”.
- A legenda deve incluir contexto, CTA para salvar/compartilhar e uma seção curta “Fontes”.

IDENTIDADE INTELI ACADEMY
- Azul elétrico ${brand.colors.blue}, branco, preto/cinza ${brand.colors.black}.
- Linguagem visual editorial, grandes títulos, cards arredondados, formas geométricas e contraste forte.
- Não existe template fixo: varie layouts entre cover, headline, stat, split, timeline, cards, impact, sources e cta.
- Entre ${brand.visualRules.minSlides} e ${brand.visualRules.maxSlides} slides.
- Um slide final de fontes e um CTA final são obrigatórios.

FORMATO JSON
{
  "title": "...",
  "caption": "...",
  "slides": [{"position":1,"layout":"cover","eyebrow":"...","title":"...","body":"...","stat":"...","statLabel":"...","bullets":[],"sourceLabels":[],"accent":"blue"}],
  "features": {"research":0,"market":0,"tool":0,"regulation":0,"hasNumber":0,"slideCount":8,"coverQuestion":0,"coverPromise":1},
  "factualClaims": [{"claim":"...","sourceUrl":"https://..."}]
}`;

  const user = `CANDIDATOS DA SEMANA\n${clusterContext(clusters)}\n\nAPRENDIZADO DO PERFIL\n${historicalGuidance || "Ainda não há histórico suficiente; priorize clareza, novidade, utilidade e potencial de compartilhamento."}`;
  const generated = await callGeminiJson<GeneratedPost>(
    [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    generatedPostSchema
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
        content: `Você é um fact-checker independente. Compare TODAS as afirmações do post com as evidências fornecidas. Reprove se houver afirmação sem fonte compatível, exagero causal, número não sustentado, citação inventada ou URL que não esteja nas evidências. Retorne somente JSON: {"passed":boolean,"score":0-100,"issues":[],"corrections":[]}. Exija score >= 90 para passed=true.`
      },
      {
        role: "user",
        content: `POST\n${JSON.stringify(post)}\n\nEVIDÊNCIAS\n${clusterContext(evidence)}`
      }
    ],
    reviewSchema
  );
}

export async function editorialReview(post: GeneratedPost, historicalGuidance: string): Promise<ReviewResult> {
  return callGeminiJson<ReviewResult>(
    [
      {
        role: "system",
        content: `Você é um revisor editorial e de crescimento do Instagram. Avalie clareza para público geral, força da capa, progressão narrativa, densidade de texto, utilidade, potencial de compartilhamento/salvamento, CTA e ausência de clickbait enganoso. Retorne somente JSON: {"passed":boolean,"score":0-100,"issues":[],"corrections":[]}. Exija score >= 85 para passed=true.`
      },
      {
        role: "user",
        content: `POST\n${JSON.stringify(post)}\n\nAPRENDIZADO HISTÓRICO\n${historicalGuidance || "Sem histórico suficiente."}`
      }
    ],
    reviewSchema
  );
}

export function programmaticReview(post: GeneratedPost): ReviewResult {
  const issues: string[] = [];
  const positions = post.slides.map((slide) => slide.position);
  if (post.slides.length < brand.visualRules.minSlides || post.slides.length > brand.visualRules.maxSlides) {
    issues.push(`Quantidade de slides deve ficar entre ${brand.visualRules.minSlides} e ${brand.visualRules.maxSlides}.`);
  }
  if (!post.slides.some((slide) => slide.layout === "sources")) issues.push("Falta slide de fontes.");
  if (!post.slides.some((slide) => slide.layout === "cta")) issues.push("Falta slide de CTA.");
  if (!post.slides[0] || post.slides[0].layout !== "cover") issues.push("O primeiro slide deve ser uma capa.");
  if (new Set(positions).size !== positions.length) issues.push("Há posições de slides duplicadas.");
  for (const slide of post.slides) {
    if (slide.title.length > brand.visualRules.maxTitleCharacters) issues.push(`Título longo no slide ${slide.position}.`);
    if ((slide.body?.length ?? 0) > brand.visualRules.maxBodyCharacters) issues.push(`Texto longo no slide ${slide.position}.`);
  }
  if (post.factualClaims.some((claim) => !claim.sourceUrl.startsWith("https://"))) issues.push("Toda fonte deve usar HTTPS.");
  const score = Math.max(0, 100 - issues.length * 15);
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
        content: `Você é um editor corretor. Corrija o post usando somente as evidências, resolvendo todos os problemas apontados. Preserve os pontos fortes. Retorne somente o mesmo formato JSON do post original.`
      },
      {
        role: "user",
        content: `POST ORIGINAL\n${JSON.stringify(post)}\n\nREVISÕES\n${JSON.stringify(reviews)}\n\nEVIDÊNCIAS\n${clusterContext(evidence)}`
      }
    ],
    generatedPostSchema
  );
}
