export const FIGMA_SOURCE = {
  fileKey: "xFV6r1G9gMjWvLf7gqyuYo",
  fileName: "ID Academy",
  auditedAt: "2026-08-06",
  pages: [
    "Apresentações",
    "Calendário",
    "teste",
    "Creative Deposit",
    "Social Media",
    "Produtos",
    "Totens",
    "stock photos"
  ]
} as const;

export const FIGMA_COLORS = [
  "#000000", "#0004FF", "#0015FF", "#002212", "#003AD9", "#007AE7", "#0085FF", "#00DDFF",
  "#022347", "#05132A", "#090909", "#0A0A14", "#121212", "#141414", "#185DF6", "#190099",
  "#195AB4", "#1B1B1B", "#1E1E1E", "#1FFF84", "#262729", "#270CAC", "#272727", "#2A00FF",
  "#3006FF", "#3A3A3A", "#3E24FF", "#405C1C", "#414141", "#434343", "#441EFF", "#4630B8",
  "#4A73FF", "#4C2EE3", "#4F4F4F", "#565656", "#585858", "#5A5A66", "#5C72FB", "#5D5D5D",
  "#5D85FF", "#5F40FF", "#6040FF", "#6200FF", "#6344FF", "#65FA97", "#666666", "#74B322",
  "#757575", "#75B900", "#7E7E7E", "#7F9FFF", "#82FFF9", "#8770FF", "#8A92A7", "#8F6AFF",
  "#9581F6", "#95C2FD", "#A5A5A5", "#A865FA", "#AAAAAA", "#BBB2FF", "#C2C2C2", "#C6D9FF",
  "#C6DBFF", "#C6FFE3", "#CBCBCB", "#CDD9FF", "#D015FF", "#D0C7FF", "#D9D9D9", "#D9E5F5",
  "#DADADA", "#DFFFC6", "#E264DE", "#E6C6FF", "#E6E6E4", "#E6E6EC", "#EAC2C2", "#ED3779",
  "#ED37E7", "#EDD537", "#EFEFEF", "#F0F0F0", "#F3F3F3", "#F5F5F7", "#F57B4F", "#F8F8F6",
  "#F8F8F8", "#FA2171", "#FAFAFA", "#FB7474", "#FE4546", "#FE7B00", "#FF0000", "#FF0004",
  "#FF1E22", "#FF3278", "#FFB2B3", "#FFE198", "#FFFFFF"
] as const;

export const FIGMA_OPACITIES = [
  "0", "0.004", "0.03", "0.05", "0.1", "0.14", "0.2", "0.23", "0.25", "0.3", "0.4",
  "0.48", "0.49", "0.5", "0.53", "0.56", "0.59", "0.6", "0.62", "0.7", "0.72", "0.74",
  "0.75", "0.78", "0.82", "1"
] as const;

export const FIGMA_GRADIENT_IDS = [
  "none",
  "blue-white-linear",
  "blue-light-gray-linear",
  "dark-black-linear",
  "white-black-linear",
  "purple-deep-linear",
  "blue-periwinkle-linear",
  "white-deep-purple-linear",
  "white-blue-linear",
  "periwinkle-blue-linear",
  "blue-navy-linear",
  "periwinkle-green-linear",
  "white-gray-linear",
  "periwinkle-magenta-orange-linear",
  "dark-green-periwinkle-linear",
  "blue-pink-linear",
  "lavender-purple-linear",
  "pink-blue-linear",
  "navy-blue-linear",
  "coral-periwinkle-linear",
  "navy-periwinkle-linear",
  "light-gray-pale-blue-linear",
  "purple-alt-deep-linear",
  "blue-white-radial",
  "magenta-blue-linear"
] as const;

export const FIGMA_GRADIENTS: Record<(typeof FIGMA_GRADIENT_IDS)[number], string> = {
  none: "none",
  "blue-white-linear": "linear-gradient(135deg, #2A00FF 0%, #FFFFFF 100%)",
  "blue-light-gray-linear": "linear-gradient(135deg, #2A00FF 0%, #F0F0F0 100%)",
  "dark-black-linear": "linear-gradient(135deg, #1B1B1B 0%, #090909 100%)",
  "white-black-linear": "linear-gradient(135deg, #FFFFFF 0%, #000000 100%)",
  "purple-deep-linear": "linear-gradient(135deg, #5F40FF 0%, #190099 100%)",
  "blue-periwinkle-linear": "linear-gradient(135deg, #2A00FF 0%, #5C72FB 100%)",
  "white-deep-purple-linear": "linear-gradient(135deg, #FFFFFF 0%, #190099 100%)",
  "white-blue-linear": "linear-gradient(135deg, #FFFFFF 0%, #2A00FF 100%)",
  "periwinkle-blue-linear": "linear-gradient(135deg, #4A73FF 0%, #2A00FF 100%)",
  "blue-navy-linear": "linear-gradient(135deg, #2A00FF 0%, #05132A 100%)",
  "periwinkle-green-linear": "linear-gradient(135deg, #5C72FB 0%, #415D27 100%)",
  "white-gray-linear": "linear-gradient(135deg, #FFFFFF 0%, #CBCBCB 100%)",
  "periwinkle-magenta-orange-linear": "linear-gradient(135deg, #4A73FF 0%, #E264DE 52%, #FE7B00 100%)",
  "dark-green-periwinkle-linear": "linear-gradient(135deg, #002212 0%, #405C1C 52%, #4A73FF 100%)",
  "blue-pink-linear": "linear-gradient(135deg, #2A00FF 0%, #FF3278 100%)",
  "lavender-purple-linear": "linear-gradient(135deg, #D0C7FF 0%, #4630B8 100%)",
  "pink-blue-linear": "linear-gradient(135deg, #FF3278 0%, #2A00FF 100%)",
  "navy-blue-linear": "linear-gradient(135deg, #05132A 0%, #2A00FF 100%)",
  "coral-periwinkle-linear": "linear-gradient(135deg, #F57B4F 0%, #5C72FB 100%)",
  "navy-periwinkle-linear": "linear-gradient(135deg, #022347 0%, #5C72FB 100%)",
  "light-gray-pale-blue-linear": "linear-gradient(135deg, #F3F3F3 0%, #CDD9FF 100%)",
  "purple-alt-deep-linear": "linear-gradient(135deg, #8770FF 0%, #190099 100%)",
  "blue-white-radial": "radial-gradient(circle at 35% 35%, #2A00FF 0%, #FFFFFF 100%)",
  "magenta-blue-linear": "linear-gradient(135deg, #FA2171 0%, #2A00FF 100%)"
};

export const FIGMA_TYPEFACES = [
  "figtree", "inter", "canela-deck", "sf-pro", "roboto", "manrope", "poppins", "arial",
  "gt-america", "apple-garamond", "playfair-display", "erode-variable", "libre-baskerville",
  "neulis", "switzer-variable", "plantagenet-cherokee", "hiragino-kaku", "geist-mono"
] as const;

export const FIGMA_TYPEFACE_CSS: Record<(typeof FIGMA_TYPEFACES)[number], string> = {
  figtree: "Figtree, Inter, Arial, sans-serif",
  inter: "Inter, Figtree, Arial, sans-serif",
  "canela-deck": "Canela Deck Trial, Apple Garamond, Playfair Display, Libre Baskerville, serif",
  "sf-pro": "SF Pro, Inter, Figtree, Arial, sans-serif",
  roboto: "Roboto, Inter, Arial, sans-serif",
  manrope: "Manrope, Figtree, Inter, Arial, sans-serif",
  poppins: "Poppins, Figtree, Inter, Arial, sans-serif",
  arial: "Arial, Inter, Figtree, sans-serif",
  "gt-america": "GT America, Figtree, Inter, Arial, sans-serif",
  "apple-garamond": "Apple Garamond, Canela Deck Trial, Playfair Display, Libre Baskerville, serif",
  "playfair-display": "Playfair Display, Canela Deck Trial, Libre Baskerville, serif",
  "erode-variable": "Erode Variable, Canela Deck Trial, Playfair Display, serif",
  "libre-baskerville": "Libre Baskerville, Playfair Display, Canela Deck Trial, serif",
  neulis: "Neulis, Figtree, Inter, Arial, sans-serif",
  "switzer-variable": "Switzer Variable, Figtree, Inter, Arial, sans-serif",
  "plantagenet-cherokee": "Plantagenet Cherokee, Libre Baskerville, Playfair Display, serif",
  "hiragino-kaku": "Hiragino Kaku Gothic Std, Inter, Figtree, Arial, sans-serif",
  "geist-mono": "Geist Mono, Inter, monospace"
};

export const FIGMA_FONT_WEIGHTS = ["300", "400", "500", "600", "700", "800", "900"] as const;

export const FIGMA_TYPE_SIZES = [
  "14", "16", "18", "19", "20", "23", "24", "26", "27", "28", "29", "30", "32", "34",
  "36", "37.8", "38", "40", "44", "45", "48", "50", "51.89", "52", "55", "56", "58", "60",
  "62", "62.4", "64", "65.8", "70", "72", "75", "80", "85", "90", "94.5", "96", "100", "103",
  "110", "122.58", "126", "128", "140", "152", "162.67", "180", "325.34", "340", "800"
] as const;

export const FIGMA_CORNER_RADII = [
  "0", "4", "5", "8", "10", "11", "12.2", "13.04", "14", "15", "16", "17.57", "18", "18.33",
  "19", "20", "23", "23.46", "24", "25", "28", "29.25", "30", "36", "36.02", "39", "40", "41.03",
  "43", "52.57", "54.1", "60.97", "61", "80", "219.5", "300", "900"
] as const;

export const FIGMA_STROKE_WEIGHTS = [
  "0", "0.09", "0.12", "0.23", "0.25", "0.31", "0.37", "0.5", "1", "1.05", "1.25", "1.4",
  "1.78", "1.95", "2", "3", "3.44", "4", "4.32", "4.56", "4.84", "5.01", "6", "6.13",
  "8", "8.13", "10", "16.27", "25", "44", "281"
] as const;

export const FIGMA_EFFECTS = [
  "none", "drop-shadow-soft", "drop-shadow-medium", "drop-shadow-large", "inner-shadow",
  "layer-blur-soft", "layer-blur-medium", "layer-blur-large", "glass-0", "glass-4", "glass-10", "shader"
] as const;

export const FIGMA_MEDIA_MODES = ["none", "fill", "fit", "crop", "video-still"] as const;

export const FIGMA_LAYOUTS = [
  "cover", "headline", "stat", "split", "timeline", "cards", "impact", "quote", "collage",
  "diagram", "calendar", "product", "photo", "sticker-sheet", "cta"
] as const;

export const FIGMA_COMPOSITIONS = [
  "editorial", "poster", "modular", "split", "stack", "list", "centered", "asymmetric",
  "collage", "full-bleed", "tiled", "calendar", "product", "sticker-sheet", "banner", "story", "presentation"
] as const;

export const FIGMA_MOTIFS = [
  "none", "frame", "brackets", "orbit", "grid", "ribbon", "blurred-orbs", "glass-panels",
  "sticker", "stamp", "text-path", "connector", "qr-code", "calendar-grid", "image-cutout",
  "product-mockup", "robot-3d", "packaging-3d", "washi-tape", "keycap", "street-wall"
] as const;

export const FIGMA_VISUAL_ELEMENTS = [
  "rectangle", "ellipse", "vector-mark", "line", "gradient-field", "blurred-orbs", "glass-card",
  "sticker", "stamp", "text-path", "connector", "qr-code", "calendar-grid", "image-cutout",
  "photo-frame", "product-mockup", "robot-3d", "packaging-3d", "washi-tape", "keycap",
  "street-wall", "component-card", "text-label", "numeric-index"
] as const;

export type FigmaColor = (typeof FIGMA_COLORS)[number];
export type FigmaGradient = (typeof FIGMA_GRADIENT_IDS)[number];
export type FigmaTypeface = (typeof FIGMA_TYPEFACES)[number];
export type FigmaFontWeight = (typeof FIGMA_FONT_WEIGHTS)[number];
export type FigmaTypeSize = (typeof FIGMA_TYPE_SIZES)[number];
export type FigmaCornerRadius = (typeof FIGMA_CORNER_RADII)[number];
export type FigmaStrokeWeight = (typeof FIGMA_STROKE_WEIGHTS)[number];
export type FigmaEffect = (typeof FIGMA_EFFECTS)[number];
export type FigmaMediaMode = (typeof FIGMA_MEDIA_MODES)[number];
export type FigmaLayout = (typeof FIGMA_LAYOUTS)[number];
export type FigmaComposition = (typeof FIGMA_COMPOSITIONS)[number];
export type FigmaMotif = (typeof FIGMA_MOTIFS)[number];
export type FigmaVisualElement = (typeof FIGMA_VISUAL_ELEMENTS)[number];

export function isAllowedFigmaValue<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}
