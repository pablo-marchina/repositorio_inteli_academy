import { readFile } from "node:fs/promises";

const criticalFiles = [
  "lib/studio-ai.ts",
  "lib/studio-artifact.ts",
  "lib/studio-post-archetype.ts",
  "lib/studio-reel-analysis.ts",
  "lib/studio-reference-style.ts",
  "lib/studio-brand-critic.ts",
  "lib/figma.ts",
  "figma-plugin/code.js"
];

const forbiddenContentRules = [
  {
    id: "historical-company-or-post",
    pattern: /\b(?:bcg(?:\s*x)?|tractian|fintalk|academy\s+week)\b/i,
    message: "generation-critical code must not encode a historical company, campaign or post"
  },
  {
    id: "topic-specific-archetype-rule",
    pattern: /\b(?:llm|rag|nps)\b/i,
    message: "editorial generation must not be specialized to one technology or metric"
  },
  {
    id: "fixed-figma-page",
    pattern: /(?:SOCIAL_MEDIA_PAGE|sourcePageName\s*:\s*["']Social Media["']|designSystemPage\s*:\s*["']Social Media["']|pagina\s+Social Media)/i,
    message: "Figma structure must be discovered rather than bound to a fixed page name"
  },
  {
    id: "numbered-figma-layer",
    pattern: /\b(?:vector|frame|layer|group)\s*(?:3|5)\b/i,
    message: "brand/template discovery must not depend on a numbered Figma layer from one design"
  }
];

const concreteIdentifierRules = [
  {
    id: "hardcoded-drive-or-media-id",
    pattern: /\b(?:asset|file|media|reference|partnerLogoAsset)Id\s*[:=]\s*["'][A-Za-z0-9_-]{16,}["']/g,
    message: "media identifiers must come from runtime input, not source literals"
  },
  {
    id: "hardcoded-figma-node-id",
    pattern: /["']\d{1,8}:\d{1,8}["']/g,
    message: "Figma node IDs must be discovered or supplied at runtime"
  }
];

function lineFor(text, index) {
  return text.slice(0, index).split("\n").length;
}

const violations = [];
for (const file of criticalFiles) {
  const text = await readFile(file, "utf8");
  for (const rule of forbiddenContentRules) {
    const match = rule.pattern.exec(text);
    if (match) {
      violations.push(`${file}:${lineFor(text, match.index)} [${rule.id}] ${rule.message}: ${JSON.stringify(match[0])}`);
    }
  }
  for (const rule of concreteIdentifierRules) {
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      violations.push(`${file}:${lineFor(text, match.index ?? 0)} [${rule.id}] ${rule.message}: ${JSON.stringify(match[0])}`);
    }
  }
}

if (violations.length) {
  console.error("Studio generalization guard failed:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Studio generalization guard passed for ${criticalFiles.length} generation-critical files.`);
