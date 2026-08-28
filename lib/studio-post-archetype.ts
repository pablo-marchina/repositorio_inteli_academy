import type { StudioBrandContext, StudioPayload, StudioPostArchetype } from "@/lib/types";

function normalized(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Compatibility-only inference for versions created before postArchetype became
 * explicit. Rules describe editorial intent, never a company, campaign,
 * technology, metric or historical post.
 */
const ARCHETYPE_RULES: Array<[StudioPostArchetype, RegExp]> = [
  ["partnership", /\b(parceria|parceiro|partner|collab|colaboracao)\b/],
  ["event-recap", /\b(visita|evento|retrospectiva|workshop|encontro|conferencia|palestra|painel)\b/],
  ["case", /\b(case|estudo de caso|projeto com|projeto para)\b/],
  ["results", /\b(resultado|impacto|metrica|indicador|numero|dados)\b/],
  ["announcement", /\b(novidade|anuncio|comunicado|lancamento)\b/],
  ["educational", /\b(aula|conceito|tutorial|guia|aprenda|entenda|explicacao|como fazer)\b/],
  ["people", /\b(equipe|diretoria|membros|pessoas|time)\b/],
  ["quote", /\b(frase|citacao|quote|depoimento)\b/],
  ["cta", /\b(inscreva|participe|contato|obrigado|saiba mais|chamada)\b/]
];

export function effectivePostArchetype(payload: Pick<StudioPayload, "postArchetype" | "title" | "caption">): StudioPostArchetype {
  if (payload.postArchetype) return payload.postArchetype;
  const text = normalized(`${payload.title} ${payload.caption}`);
  return ARCHETYPE_RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? "general";
}

function cleanPartner(value: string | undefined) {
  const cleaned = value?.trim().replace(/[.!?,;:]+$/g, "").trim();
  return cleaned && cleaned.length <= 100 ? cleaned : undefined;
}

/**
 * Legacy partner extraction is deliberately syntax-based: it captures whatever
 * organization followed a generic relationship phrase instead of maintaining
 * a list of known companies.
 */
export function inferLegacyPartnerName(payload: Pick<StudioPayload, "title" | "caption">) {
  const title = payload.title.trim();
  const patterns = [
    /\bvisita\s+(?:ao|a|à)\s+(.+)$/i,
    /\bparceria\s+(?:com\s+)?(.+)$/i,
    /\bcase\s+(?:com|para|da|do)?\s*:?-?\s*(.+)$/i,
    /\bworkshop\s+(?:com|na|no)\s+(.+)$/i,
    /\bprojeto\s+(?:com|para)\s+(.+)$/i,
    /\bevento\s+(?:com|na|no)\s+(.+)$/i
  ];
  for (const pattern of patterns) {
    const match = title.match(pattern);
    const partner = cleanPartner(match?.[1]);
    if (partner) return partner;
  }
  return undefined;
}

export function effectiveBrandContext(payload: Pick<StudioPayload, "brandContext" | "postArchetype" | "title" | "caption">): StudioBrandContext {
  if (payload.brandContext) return payload.brandContext;
  const partnerName = inferLegacyPartnerName(payload);
  return {
    primaryBrandName: "Inteli Academy",
    ...(partnerName ? { partnerName } : {}),
    partnerLogoStatus: partnerName ? "missing" : "not-required"
  };
}

export function requiresPartnerBrand(payload: Pick<StudioPayload, "brandContext" | "postArchetype" | "title" | "caption">) {
  const archetype = effectivePostArchetype(payload);
  const brand = effectiveBrandContext(payload);
  return archetype === "partnership" || Boolean(brand.partnerName);
}
