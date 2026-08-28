import { readFile } from "node:fs/promises";

// Every executable path that can influence generated post content or visuals.
// Documentation/inventory files are intentionally excluded from historical-name
// checks because they may describe past work without affecting generation.
const generationFiles = [
  "lib/ai.ts",
  "lib/manual-generation.ts",
  "lib/pipeline.ts",
  "lib/enhanced-pipeline.ts",
  "lib/renderer.tsx",
  "lib/figma-visual-system.ts",
  "lib/studio-ai.ts",
  "lib/studio-artifact.ts",
  "lib/studio-post-archetype.ts",
  "lib/studio-reel-analysis.ts",
  "lib/studio-reference-style.ts",
  "lib/studio-brand-critic.ts",
  "lib/figma.ts",
  "figma-plugin/code.js"
];

// These files classify arbitrary Studio posts. Unlike the older AI-weekly
// pipeline, they must not encode a technology, metric or campaign as a category.
const genericStudioFiles = new Set([
  "lib/studio-ai.ts",
  "lib/studio-artifact.ts",
  "lib/studio-post-archetype.ts",
  "lib/studio-reference-style.ts",
  "lib/figma.ts",
  "figma-plugin/code.js"
]);

const allGenerationRules = [
  {
    id: "historical-company-or-post",
    pattern: /\b(?:bcg(?:\s*x)?|tractian|fintalk|academy\s+week)\b/i,
    message: "generation code must not encode a historical company, campaign or post"
  }
];

const genericStudioRules = [
  {
    id: "topic-specific-archetype-rule",
    pattern: /\b(?:llm|rag|nps)\b/i,
    message: "generic Studio classification must not be specialized to one technology or metric"
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

function addRuleViolations(violations, file, text, rules) {
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    const match = rule.pattern.exec(text);
    if (match) {
      violations.push(`${file}:${lineFor(text, match.index)} [${rule.id}] ${rule.message}: ${JSON.stringify(match[0])}`);
    }
  }
}

const violations = [];
for (const file of generationFiles) {
  const text = await readFile(file, "utf8");
  addRuleViolations(violations, file, text, allGenerationRules);
  if (genericStudioFiles.has(file)) addRuleViolations(violations, file, text, genericStudioRules);

  for (const rule of concreteIdentifierRules) {
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      violations.push(`${file}:${lineFor(text, match.index ?? 0)} [${rule.id}] ${rule.message}: ${JSON.stringify(match[0])}`);
    }
  }
}

if (violations.length) {
  console.error("Post-generation generalization guard failed:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Post-generation generalization guard passed for ${generationFiles.length} executable generation files.`);
