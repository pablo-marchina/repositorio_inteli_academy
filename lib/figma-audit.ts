export const FIGMA_AUDIT = {
  fileKey: "xFV6r1G9gMjWvLf7gqyuYo",
  fileName: "ID Academy",
  auditedAt: "2026-08-12",
  pages: [
    { id: "0:1", name: "Apresentações", totalNodes: 1439, roles: ["presentation", "brand-language", "education"] },
    { id: "1177:2", name: "Calendário", totalNodes: 387, roles: ["calendar", "information-design"] },
    { id: "671:28", name: "teste", totalNodes: 128, roles: ["presentation-experiments", "education"] },
    { id: "260:580", name: "Creative Deposit", totalNodes: 86, roles: ["identity-assets", "qr", "marks"] },
    { id: "259:251", name: "Social Media", totalNodes: 2989, roles: ["instagram-feed", "carousel", "stories", "primary-social-visual-source"] },
    { id: "1319:2", name: "EXPORTAR", totalNodes: 141, roles: ["export", "vertical-assets"] },
    { id: "213:2", name: "Totens", totalNodes: 284, roles: ["vertical-layout", "event-signage", "social-adjacent"] },
    { id: "446:5", name: "Produtos", totalNodes: 232, roles: ["merchandise", "stickers", "mockups", "graphic-experiments"] },
    { id: "9:131", name: "stock photos", totalNodes: 69, roles: ["photos", "robot-assets", "illustrative-assets"] }
  ],
  socialMedia: {
    pageId: "259:251",
    feedSize: { width: 1080, height: 1350 },
    storySize: { width: 1080, height: 1920 },
    nodeCounts: {
      FRAME: 134,
      VECTOR: 336,
      RECTANGLE: 1681,
      TEXT: 418,
      GROUP: 216,
      ELLIPSE: 156,
      SLICE: 22,
      BOOLEAN_OPERATION: 12,
      COMPONENT: 9,
      COMPONENT_SET: 4,
      LINE: 1
    },
    representativeFrames: [
      "Post Parceria EJ",
      "case",
      "Post gestao",
      "Nova Diretoria",
      "tractian",
      "segura",
      "academy week",
      "lovable",
      "Hackathon",
      "Instagram story - 1",
      "Instagram story - 11"
    ]
  }
} as const;

export const FIGMA_AUDITED_PAGE_NAMES = FIGMA_AUDIT.pages.map((page) => page.name);
