export const brand = {
  name: "Inteli Academy",
  mark: "IA",
  colors: {
    blue: "#2A00FF",
    black: "#272727",
    ink: "#0A0A14",
    white: "#FFFFFF",
    soft: "#F4F3F8",
    gray: "#5A5A66",
    line: "#D8D6E0"
  },
  typography: {
    sans: "Arial, Helvetica, sans-serif",
    display: "Georgia, Times New Roman, serif"
  },
  visualRules: {
    minSlides: 6,
    maxSlides: 9,
    maxTitleCharacters: 78,
    maxBodyCharacters: 280,
    maxBullets: 4,
    allowedLayouts: ["cover", "headline", "stat", "split", "timeline", "cards", "impact", "sources", "cta"],
    allowedCompositions: ["editorial", "poster", "modular", "split", "stack", "list"],
    allowedMotifs: ["brackets", "orbit", "grid", "ribbon", "frame", "none"]
  }
} as const;
