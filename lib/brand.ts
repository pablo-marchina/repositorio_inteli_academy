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
  FIGMA_STROKE_WEIGHTS,
  FIGMA_TYPEFACES,
  FIGMA_TYPEFACE_CSS,
  FIGMA_TYPE_SIZES,
  FIGMA_VISUAL_ELEMENTS
} from "@/lib/figma-visual-system";

export const brand = {
  name: "Inteli Academy",
  mark: "IA",
  colors: {
    blue: "#2A00FF",
    black: "#272727",
    ink: "#0A0A14",
    white: "#FFFFFF",
    soft: "#F5F5F7",
    gray: "#5A5A66",
    line: "#E6E6EC"
  },
  typography: {
    sans: FIGMA_TYPEFACE_CSS.figtree,
    display: FIGMA_TYPEFACE_CSS["canela-deck"],
    mono: FIGMA_TYPEFACE_CSS["geist-mono"]
  },
  visualRules: {
    minSlides: 6,
    maxSlides: 9,
    maxTitleCharacters: 78,
    maxBodyCharacters: 280,
    maxBullets: 4,
    allowedColors: FIGMA_COLORS,
    allowedGradients: FIGMA_GRADIENT_IDS,
    allowedTypefaces: FIGMA_TYPEFACES,
    allowedFontWeights: FIGMA_FONT_WEIGHTS,
    allowedTypeSizes: FIGMA_TYPE_SIZES,
    allowedCornerRadii: FIGMA_CORNER_RADII,
    allowedStrokeWeights: FIGMA_STROKE_WEIGHTS,
    allowedEffects: FIGMA_EFFECTS,
    allowedMediaModes: FIGMA_MEDIA_MODES,
    allowedLayouts: FIGMA_LAYOUTS,
    allowedCompositions: FIGMA_COMPOSITIONS,
    allowedMotifs: FIGMA_MOTIFS,
    allowedVisualElements: FIGMA_VISUAL_ELEMENTS
  }
} as const;
