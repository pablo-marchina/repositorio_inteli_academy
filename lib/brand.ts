export const brand = {
  name: "Inteli Academy",
  mark: "IA",
  colors: {
    blue: "#2A00FF",
    black: "#272727",
    ink: "#0A0A14",
    white: "#FFFFFF",
    soft: "#F5F5F7",
    gray: "#5A5A66"
  },
  visualRules: {
    minSlides: 5,
    maxSlides: 10,
    maxTitleCharacters: 92,
    maxBodyCharacters: 360,
    allowedLayouts: ["cover", "headline", "stat", "split", "timeline", "cards", "impact", "sources", "cta"]
  }
} as const;
