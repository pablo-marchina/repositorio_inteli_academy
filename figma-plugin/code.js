figma.showUI(__html__, { width: 430, height: 620, themeColors: true });

const SOCIAL_MEDIA_PAGE = "Social Media";
const SEMANTIC_PREFIX = "AI::";

function taggedRole(node) {
  const match = /^AI::([a-zA-Z]+)(?:\s*\||$)/.exec(node.name || "");
  return match ? match[1] : null;
}

function tagNode(node, role) {
  if (taggedRole(node) === role) return;
  const clean = (node.name || node.type).replace(/^AI::[a-zA-Z]+\s*\|\s*/, "");
  node.name = `${SEMANTIC_PREFIX}${role} | ${clean}`;
}

function numericFontSize(node) {
  return typeof node.fontSize === "number" ? node.fontSize : 0;
}

function descendants(frame, type) {
  return frame.findAll((node) => node.type === type);
}

function textNodes(frame) {
  return descendants(frame, "TEXT");
}

function hasImageFill(node) {
  if (!("fills" in node) || !Array.isArray(node.fills)) return false;
  return node.fills.some((paint) => paint && paint.type === "IMAGE");
}

function imageNodes(frame) {
  return frame.findAll((node) => hasImageFill(node));
}

function isBrandText(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return true;
  return text === "ia" || text.includes("inteli academy") || text === "academy" || /^\d{1,2}\s*\/\s*\d{1,2}$/.test(text) || text.startsWith("@inteli");
}

async function loadFontsForText(node) {
  if (!node.characters.length) {
    if (node.fontName && node.fontName !== figma.mixed) await figma.loadFontAsync(node.fontName);
    return;
  }
  const fonts = node.getRangeAllFontNames(0, node.characters.length);
  for (const font of fonts) await figma.loadFontAsync(font);
}

async function setText(node, value, role) {
  if (!node) return null;
  await loadFontsForText(node);
  node.characters = String(value ?? "");
  tagNode(node, role);
  return node;
}

function alreadyTagged(texts, role) {
  return texts.find((node) => taggedRole(node) === role) || null;
}

function pickHeadline(texts) {
  return alreadyTagged(texts, "headline") || texts
    .filter((node) => !isBrandText(node.characters) && node.characters.trim().length > 2)
    .sort((a, b) => numericFontSize(b) - numericFontSize(a) || b.characters.length - a.characters.length)[0] || null;
}

function pickStat(texts) {
  return alreadyTagged(texts, "stat") || texts
    .filter((node) => /\d/.test(node.characters) && node.characters.trim().length <= 18 && !/^\d{1,2}\s*\/\s*\d{1,2}$/.test(node.characters.trim()))
    .sort((a, b) => numericFontSize(b) - numericFontSize(a))[0] || null;
}

function pickEyebrow(texts, excluded) {
  return alreadyTagged(texts, "eyebrow") || texts
    .filter((node) => !excluded.has(node) && !isBrandText(node.characters) && node.characters.trim().length > 1 && node.characters.trim().length <= 60)
    .sort((a, b) => a.y - b.y || numericFontSize(a) - numericFontSize(b))[0] || null;
}

function pickBody(texts, excluded) {
  return alreadyTagged(texts, "body") || texts
    .filter((node) => !excluded.has(node) && !isBrandText(node.characters) && node.characters.trim().length >= 20)
    .sort((a, b) => b.characters.length - a.characters.length || numericFontSize(b) - numericFontSize(a))[0] || null;
}

function pickStatLabel(texts, excluded) {
  return alreadyTagged(texts, "statLabel") || texts
    .filter((node) => !excluded.has(node) && !isBrandText(node.characters) && node.characters.trim().length >= 3)
    .sort((a, b) => numericFontSize(b) - numericFontSize(a))[0] || null;
}

function pickBulletNodes(texts, excluded, desiredCount) {
  const tagged = texts.filter((node) => taggedRole(node) === "bullets");
  if (tagged.length) return tagged.slice(0, desiredCount);
  return texts
    .filter((node) => !excluded.has(node) && !isBrandText(node.characters) && node.characters.trim().length >= 8)
    .sort((a, b) => a.y - b.y)
    .slice(0, desiredCount);
}

function normalizedName(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function frameFeatureScore(frame, sceneFrame, studioFrame) {
  const width = sceneFrame.width || 1080;
  const height = sceneFrame.height || 1350;
  const sizePenalty = Math.abs(frame.width - width) + Math.abs(frame.height - height);
  if (sizePenalty > 30) return -100000;
  const ancestry = `${frame.name} ${frame.parent && "name" in frame.parent ? frame.parent.name : ""}`;
  const name = normalizedName(ancestry);
  let score = 1000 - sizePenalty;
  for (const hint of sceneFrame.preferredTemplateNames || []) {
    const normalizedHint = normalizedName(hint);
    if (normalizedHint && name.includes(normalizedHint)) score += 240;
  }
  const texts = textNodes(frame);
  const images = imageNodes(frame);
  const largest = texts.reduce((max, node) => Math.max(max, numericFontSize(node)), 0);
  if (studioFrame.template === "cover") score += largest * 2 - Math.max(0, texts.length - 8) * 12;
  if (studioFrame.template === "photo") score += images.length * 170;
  if (studioFrame.template === "stat" && texts.some((node) => /\d/.test(node.characters) && numericFontSize(node) > 60)) score += 260;
  if (studioFrame.template === "cta" && /(fim|cta|academy week)/.test(name)) score += 320;
  if (studioFrame.template === "editorial" && texts.length >= 3) score += 100;
  if (studioFrame.template === "quote" && texts.length >= 2 && texts.length <= 10) score += 80;
  return score;
}

async function resolveTemplate(sceneFrame, studioFrame) {
  if (sceneFrame && sceneFrame.sourceFigmaFrameId) {
    const base = await figma.getNodeByIdAsync(sceneFrame.sourceFigmaFrameId);
    if (base && base.type === "FRAME") return { node: base, fromBaseVersion: true };
  }
  const page = figma.root.children.find((candidate) => candidate.name === SOCIAL_MEDIA_PAGE);
  if (!page) throw new Error(`Página ${SOCIAL_MEDIA_PAGE} não encontrada no arquivo.`);
  await figma.setCurrentPageAsync(page);
  const targetWidth = sceneFrame?.width || 1080;
  const targetHeight = sceneFrame?.height || 1350;
  const candidates = page.findAll((node) => node.type === "FRAME" && Math.abs(node.width - targetWidth) <= 15 && Math.abs(node.height - targetHeight) <= 15);
  if (!candidates.length) throw new Error(`Nenhum frame editável ${targetWidth}x${targetHeight} foi encontrado em ${SOCIAL_MEDIA_PAGE}.`);
  candidates.sort((a, b) => frameFeatureScore(b, sceneFrame, studioFrame) - frameFeatureScore(a, sceneFrame, studioFrame));
  return { node: candidates[0], fromBaseVersion: false };
}

async function downloadDriveImage(platformUrl, secret, jobId, fileId) {
  const response = await fetch(`${platformUrl.replace(/\/$/, "")}/api/figma/bridge/media/${encodeURIComponent(fileId)}?job=${encodeURIComponent(jobId)}`, {
    headers: { "x-figma-bridge-secret": secret }
  });
  if (!response.ok) throw new Error(`Falha ao carregar mídia do Drive: ${await response.text()}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) return null;
  return figma.createImage(new Uint8Array(await response.arrayBuffer()));
}

async function replaceMedia(frame, platformUrl, secret, jobId, fileId, fit) {
  if (!fileId) return null;
  const image = await downloadDriveImage(platformUrl, secret, jobId, fileId);
  if (!image) return null;
  let target = frame.findAll((node) => taggedRole(node) === "media" && hasImageFill(node))[0] || imageNodes(frame)
    .sort((a, b) => (("width" in b ? b.width : 0) * ("height" in b ? b.height : 0)) - (("width" in a ? a.width : 0) * ("height" in a ? a.height : 0)))[0];
  if (!target) {
    const rect = figma.createRectangle();
    rect.resize(Math.max(320, frame.width * 0.72), Math.max(320, frame.height * 0.42));
    rect.x = (frame.width - rect.width) / 2;
    rect.y = frame.height * 0.42;
    frame.appendChild(rect);
    target = rect;
  }
  if (!("fills" in target)) return null;
  const existing = Array.isArray(target.fills) ? [...target.fills] : [];
  const imageIndex = existing.findIndex((paint) => paint && paint.type === "IMAGE");
  const nextPaint = { type: "IMAGE", imageHash: image.hash, scaleMode: fit === "contain" ? "FIT" : "FILL" };
  if (imageIndex >= 0) existing[imageIndex] = nextPaint;
  else existing.unshift(nextPaint);
  target.fills = existing;
  tagNode(target, "media");
  return target;
}

async function clearOldEditorialText(texts, protectedNodes) {
  for (const node of texts) {
    if (protectedNodes.has(node) || taggedRole(node) || isBrandText(node.characters)) continue;
    const value = node.characters.trim();
    if (value.length < 8) continue;
    await loadFontsForText(node);
    node.characters = "";
  }
}

async function applySemanticContent(frame, studioFrame, sceneFrame, context) {
  const texts = textNodes(frame);
  const changed = new Set(sceneFrame?.changedRoles?.length ? sceneFrame.changedRoles : ["eyebrow", "headline", "body", "stat", "statLabel", "bullets", "media"]);
  const protectedNodes = new Set();

  let headline = pickHeadline(texts);
  let stat = studioFrame.template === "stat" ? pickStat(texts) : null;
  if (stat && headline === stat) headline = texts.filter((node) => node !== stat).sort((a, b) => numericFontSize(b) - numericFontSize(a))[0] || headline;
  const excluded = new Set([headline, stat].filter(Boolean));
  const eyebrow = pickEyebrow(texts, excluded);
  if (eyebrow) excluded.add(eyebrow);
  const body = pickBody(texts, excluded);
  if (body) excluded.add(body);
  const statLabel = studioFrame.template === "stat" ? pickStatLabel(texts, excluded) : null;
  if (statLabel) excluded.add(statLabel);

  if (headline) { tagNode(headline, "headline"); protectedNodes.add(headline); }
  if (eyebrow) { tagNode(eyebrow, "eyebrow"); protectedNodes.add(eyebrow); }
  if (body) { tagNode(body, "body"); protectedNodes.add(body); }
  if (stat) { tagNode(stat, "stat"); protectedNodes.add(stat); }
  if (statLabel) { tagNode(statLabel, "statLabel"); protectedNodes.add(statLabel); }

  if (changed.has("headline")) await setText(headline, studioFrame.title, "headline");
  if (changed.has("eyebrow") && eyebrow) await setText(eyebrow, studioFrame.eyebrow || "", "eyebrow");
  if (changed.has("body") && body) await setText(body, studioFrame.body || "", "body");
  if (changed.has("stat") && stat) await setText(stat, studioFrame.stat || "", "stat");
  if (changed.has("statLabel") && statLabel) await setText(statLabel, studioFrame.statLabel || "", "statLabel");

  const bullets = Array.isArray(studioFrame.bullets) ? studioFrame.bullets.slice(0, 4) : [];
  if (bullets.length) {
    const bulletNodes = pickBulletNodes(texts, excluded, bullets.length);
    for (let index = 0; index < bulletNodes.length; index += 1) {
      protectedNodes.add(bulletNodes[index]);
      tagNode(bulletNodes[index], "bullets");
      if (changed.has("bullets")) await setText(bulletNodes[index], bullets[index] || "", "bullets");
    }
  }

  if (!context.fromBaseVersion) await clearOldEditorialText(texts, protectedNodes);
  if (changed.has("media") && studioFrame.mediaAssetId) {
    await replaceMedia(frame, context.platformUrl, context.secret, context.jobId, studioFrame.mediaAssetId, studioFrame.mediaFit);
  } else {
    const existingMedia = imageNodes(frame)[0];
    if (existingMedia) tagNode(existingMedia, "media");
  }

  const brandText = textNodes(frame).find((node) => /inteli academy|^ia$/i.test(node.characters.trim()));
  if (brandText) tagNode(brandText, "logo");
  const pagination = textNodes(frame).find((node) => /^\d{1,2}\s*\/\s*\d{1,2}$/.test(node.characters.trim()));
  if (pagination) tagNode(pagination, "pagination");
}

async function buildFrame(section, studioFrame, sceneFrame, index, total, context) {
  const resolved = await resolveTemplate(sceneFrame, studioFrame);
  const templateNodeId = resolved.node.id;
  const cloned = resolved.node.clone();
  await figma.setCurrentPageAsync(context.outputPage);
  section.appendChild(cloned);
  cloned.name = `${String(index + 1).padStart(2, "0")} · ${studioFrame.template} · ${studioFrame.title.slice(0, 42)}`;
  await applySemanticContent(cloned, studioFrame, sceneFrame, { ...context, fromBaseVersion: resolved.fromBaseVersion });

  const pagination = textNodes(cloned).find((node) => taggedRole(node) === "pagination");
  if (pagination) {
    try { await setText(pagination, `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, "pagination"); } catch { /* preserve original pagination if its font is unavailable */ }
  }
  return { frame: cloned, templateNodeId };
}

async function importNext(platformUrl, secret) {
  const baseUrl = platformUrl.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/figma/bridge/queue`, { headers: { "x-figma-bridge-secret": secret } });
  if (!response.ok) throw new Error(await response.text());
  const { job } = await response.json();
  if (!job) return { empty: true };
  const data = job.payload;
  const payload = data.payload;
  if (!payload?.frames?.length) throw new Error("Job sem frames gerados.");

  let outputPage = figma.root.children.find((candidate) => candidate.name === data.outputPageName);
  if (!outputPage) {
    outputPage = figma.createPage();
    outputPage.name = data.outputPageName;
  }
  await figma.setCurrentPageAsync(outputPage);

  const section = figma.createSection();
  section.name = `${data.projectName} · V${data.versionNumber} · Structured`;
  const existing = outputPage.children.filter((node) => "x" in node && "width" in node);
  const rightmost = existing.reduce((max, node) => Math.max(max, node.x + node.width), 0);
  section.x = rightmost + 240;
  section.y = 0;
  outputPage.appendChild(section);

  const created = [];
  const templateNodeIds = [];
  try {
    const sceneFrames = payload.artifact?.sceneGraph?.frames || [];
    const vertical = data.contentType === "story" || data.contentType === "reel";
    const frameWidth = 1080;
    const frameHeight = vertical ? 1920 : 1350;
    const gap = 80;
    for (let index = 0; index < payload.frames.length; index += 1) {
      const sceneFrame = sceneFrames[index] || {
        width: frameWidth,
        height: frameHeight,
        preferredTemplateNames: vertical ? ["instagram story"] : [payload.frames[index].template],
        changedRoles: ["eyebrow", "headline", "body", "stat", "statLabel", "bullets", "media"]
      };
      const result = await buildFrame(section, payload.frames[index], sceneFrame, index, payload.frames.length, {
        platformUrl: baseUrl,
        secret,
        jobId: job.id,
        outputPage
      });
      result.frame.x = index * (frameWidth + gap);
      result.frame.y = 110;
      created.push(result.frame);
      templateNodeIds.push(result.templateNodeId);
    }
    section.resizeWithoutConstraints(Math.max(1320, payload.frames.length * (frameWidth + gap) + 80), frameHeight + 260);
    const complete = await fetch(`${baseUrl}/api/figma/bridge/jobs/${encodeURIComponent(job.id)}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-figma-bridge-secret": secret },
      body: JSON.stringify({ frameIds: created.map((node) => node.id), templateNodeIds })
    });
    if (!complete.ok) throw new Error(`Frames criados, mas o backend não confirmou: ${await complete.text()}`);
    figma.currentPage.selection = created;
    figma.viewport.scrollAndZoomIntoView(created);
    return { empty: false, jobId: job.id, frameIds: created.map((node) => node.id), templateNodeIds, versionNumber: data.versionNumber, projectName: data.projectName };
  } catch (error) {
    for (const node of created) node.remove();
    section.remove();
    throw error;
  }
}

figma.ui.onmessage = async (message) => {
  if (message.type === "load-config") {
    const saved = await figma.clientStorage.getAsync("academy-content-bridge");
    figma.ui.postMessage({ type: "config", value: saved ?? null });
    return;
  }
  if (message.type !== "import-next") return;
  const platformUrl = String(message.platformUrl ?? "").trim();
  const secret = String(message.secret ?? "").trim();
  if (!/^https?:\/\//.test(platformUrl) || !secret) {
    figma.ui.postMessage({ type: "error", message: "Informe a URL da plataforma e o segredo do bridge." });
    return;
  }
  await figma.clientStorage.setAsync("academy-content-bridge", { platformUrl, secret });
  try {
    const result = await importNext(platformUrl, secret);
    figma.ui.postMessage(result.empty
      ? { type: "empty" }
      : { type: "success", message: `${result.projectName} · V${result.versionNumber} importada com templates editáveis reais`, frameIds: result.frameIds });
  } catch (error) {
    figma.ui.postMessage({ type: "error", message: String(error) });
  }
};
