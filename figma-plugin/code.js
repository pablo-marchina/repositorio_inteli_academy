figma.showUI(__html__, { width: 430, height: 620, themeColors: true });

const BLUE = { r: 42 / 255, g: 0, b: 1 };
const BLACK = { r: 20 / 255, g: 20 / 255, b: 20 / 255 };
const WHITE = { r: 1, g: 1, b: 1 };
const SOFT = { r: 248 / 255, g: 248 / 255, b: 248 / 255 };
const LAVENDER = { r: 208 / 255, g: 199 / 255, b: 1 };

function solid(color, opacity = 1) {
  return [{ type: "SOLID", color, opacity }];
}

async function chooseFont(weight = "Regular") {
  const fonts = await figma.listAvailableFontsAsync();
  const desiredFamilies = ["Figtree", "Inter"];
  const desiredStyles = weight === "Bold" ? ["Bold", "SemiBold", "Black", "Regular"] : ["Regular", "Medium", "Book"];
  for (const family of desiredFamilies) {
    for (const style of desiredStyles) {
      const found = fonts.find((entry) => entry.fontName.family === family && entry.fontName.style === style);
      if (found) return found.fontName;
    }
  }
  return fonts[0]?.fontName ?? { family: "Inter", style: "Regular" };
}

async function addText(parent, text, options = {}) {
  const node = figma.createText();
  const fontName = await chooseFont(options.bold ? "Bold" : "Regular");
  await figma.loadFontAsync(fontName);
  node.fontName = fontName;
  node.characters = text || "";
  node.fontSize = options.size ?? 34;
  node.fills = solid(options.color ?? BLACK, options.opacity ?? 1);
  node.x = options.x ?? 0;
  node.y = options.y ?? 0;
  node.textAutoResize = "HEIGHT";
  node.resize(options.width ?? 900, Math.max(40, options.height ?? 100));
  if (options.align) node.textAlignHorizontal = options.align;
  if (options.letterSpacing !== undefined) node.letterSpacing = { unit: "PIXELS", value: options.letterSpacing };
  if (options.lineHeight) node.lineHeight = { unit: "PERCENT", value: options.lineHeight };
  parent.appendChild(node);
  return node;
}

function addRect(parent, options = {}) {
  const rect = figma.createRectangle();
  rect.x = options.x ?? 0;
  rect.y = options.y ?? 0;
  rect.resize(options.width ?? 100, options.height ?? 100);
  rect.fills = solid(options.color ?? WHITE, options.opacity ?? 1);
  if (options.radius !== undefined) rect.cornerRadius = options.radius;
  parent.appendChild(rect);
  return rect;
}

async function addDriveImage(parent, platformUrl, secret, jobId, fileId, box) {
  const response = await fetch(`${platformUrl.replace(/\/$/, "")}/api/figma/bridge/media/${encodeURIComponent(fileId)}?job=${encodeURIComponent(jobId)}`, {
    headers: { "x-figma-bridge-secret": secret }
  });
  if (!response.ok) throw new Error(`Falha ao carregar mídia do Drive: ${await response.text()}`);
  const image = figma.createImage(new Uint8Array(await response.arrayBuffer()));
  const rect = figma.createRectangle();
  rect.x = box.x;
  rect.y = box.y;
  rect.resize(box.width, box.height);
  rect.cornerRadius = box.radius ?? 28;
  rect.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: box.fit === "contain" ? "FIT" : "FILL" }];
  parent.appendChild(rect);
  return rect;
}

function addBrandMarks(frame, width, height, dark = false) {
  const rule = addRect(frame, { x: 0, y: height - 12, width, height: 12, color: BLUE });
  rule.name = "Academy / Bottom Rule";
  const orbA = figma.createEllipse();
  orbA.resize(520, 520);
  orbA.x = -330;
  orbA.y = -320;
  orbA.fills = solid(LAVENDER, dark ? 0.08 : 0.2);
  frame.appendChild(orbA);
  const orbB = figma.createEllipse();
  orbB.resize(460, 460);
  orbB.x = width - 180;
  orbB.y = height - 260;
  orbB.fills = solid(LAVENDER, dark ? 0.07 : 0.15);
  frame.appendChild(orbB);
}

async function buildFrame(parent, studioFrame, contentType, index, total, platformUrl, secret, jobId) {
  const vertical = contentType === "story" || contentType === "reel";
  const width = 1080;
  const height = vertical ? 1920 : 1350;
  const frame = figma.createFrame();
  frame.name = `${String(index + 1).padStart(2, "0")} · ${studioFrame.template} · ${studioFrame.title.slice(0, 42)}`;
  frame.resize(width, height);
  frame.clipsContent = true;
  frame.fills = solid(studioFrame.template === "cta" ? BLACK : SOFT);
  parent.appendChild(frame);
  addBrandMarks(frame, width, height, studioFrame.template === "cta");

  const inverse = studioFrame.template === "cta";
  await addText(frame, "IA", { x: 72, y: 58, width: 120, size: 44, bold: true, color: inverse ? WHITE : BLUE, letterSpacing: -4 });
  await addText(frame, `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, {
    x: width - 210, y: 72, width: 140, size: 18, bold: true, color: inverse ? WHITE : BLACK, align: "RIGHT"
  });

  const mediaFirst = studioFrame.template === "photo" && studioFrame.mediaAssetId;
  if (mediaFirst) {
    await addDriveImage(frame, platformUrl, secret, jobId, studioFrame.mediaAssetId, {
      x: 70, y: vertical ? 300 : 270, width: 940, height: vertical ? 900 : 650, radius: 32, fit: studioFrame.mediaFit
    });
  } else if (studioFrame.mediaAssetId) {
    await addDriveImage(frame, platformUrl, secret, jobId, studioFrame.mediaAssetId, {
      x: vertical ? 110 : 650, y: vertical ? 900 : 390, width: vertical ? 860 : 340, height: vertical ? 650 : 500, radius: 30, fit: studioFrame.mediaFit
    });
  }

  const contentX = 84;
  const contentWidth = mediaFirst ? 900 : studioFrame.mediaAssetId && !vertical ? 520 : 900;
  const startY = mediaFirst ? (vertical ? 1260 : 960) : (vertical ? 420 : 300);
  if (studioFrame.eyebrow) {
    await addText(frame, studioFrame.eyebrow.toUpperCase(), { x: contentX, y: startY, width: contentWidth, size: 22, bold: true, color: inverse ? WHITE : BLUE, letterSpacing: 2.5 });
  }

  if (studioFrame.template === "stat" && studioFrame.stat) {
    await addText(frame, studioFrame.stat, { x: contentX, y: startY + 70, width: contentWidth, size: vertical ? 190 : 170, bold: true, color: inverse ? WHITE : BLUE, lineHeight: 90 });
    if (studioFrame.statLabel) {
      await addText(frame, studioFrame.statLabel, { x: contentX, y: startY + 280, width: contentWidth, size: 50, bold: true, color: inverse ? WHITE : BLACK, lineHeight: 105 });
    }
  } else {
    const titleSize = vertical ? (studioFrame.title.length > 55 ? 72 : 88) : (studioFrame.title.length > 55 ? 62 : 78);
    await addText(frame, studioFrame.title, { x: contentX, y: startY + 70, width: contentWidth, size: titleSize, bold: true, color: inverse ? WHITE : BLUE, lineHeight: 100, letterSpacing: -2 });
  }

  const bodyY = studioFrame.template === "stat" ? startY + 430 : startY + (vertical ? 330 : 300);
  if (studioFrame.body) {
    await addText(frame, studioFrame.body, { x: contentX, y: bodyY, width: contentWidth, size: vertical ? 34 : 30, color: inverse ? WHITE : BLACK, opacity: inverse ? 0.84 : 1, lineHeight: 132 });
  }
  if (Array.isArray(studioFrame.bullets) && studioFrame.bullets.length) {
    let y = bodyY + (studioFrame.body ? 230 : 20);
    for (let i = 0; i < studioFrame.bullets.slice(0, 4).length; i += 1) {
      const bullet = studioFrame.bullets[i];
      addRect(frame, { x: contentX, y: y + 8, width: 42, height: 42, color: inverse ? WHITE : BLUE, radius: 21 });
      await addText(frame, String(i + 1), { x: contentX, y: y + 12, width: 42, height: 36, size: 18, bold: true, color: inverse ? BLACK : WHITE, align: "CENTER" });
      await addText(frame, bullet, { x: contentX + 64, y, width: contentWidth - 64, size: vertical ? 31 : 27, color: inverse ? WHITE : BLACK, lineHeight: 125 });
      y += vertical ? 150 : 125;
    }
  }
  return frame;
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

  let page = figma.root.children.find((candidate) => candidate.name === data.outputPageName);
  if (!page) {
    page = figma.createPage();
    page.name = data.outputPageName;
  }
  await figma.setCurrentPageAsync(page);

  const section = figma.createSection();
  section.name = `${data.projectName} · V${data.versionNumber}`;
  const existing = page.children.filter((node) => "x" in node && "width" in node);
  const rightmost = existing.reduce((max, node) => Math.max(max, node.x + node.width), 0);
  section.x = rightmost + 240;
  section.y = 0;
  page.appendChild(section);

  const created = [];
  try {
    const vertical = data.contentType === "story" || data.contentType === "reel";
    const frameWidth = 1080;
    const frameHeight = vertical ? 1920 : 1350;
    const gap = 80;
    for (let index = 0; index < payload.frames.length; index += 1) {
      const frame = await buildFrame(section, payload.frames[index], data.contentType, index, payload.frames.length, baseUrl, secret, job.id);
      frame.x = index * (frameWidth + gap);
      frame.y = 110;
      created.push(frame);
    }
    section.resizeWithoutConstraints(Math.max(1320, payload.frames.length * (frameWidth + gap) + 80), frameHeight + 260);
    const complete = await fetch(`${baseUrl}/api/figma/bridge/jobs/${encodeURIComponent(job.id)}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-figma-bridge-secret": secret },
      body: JSON.stringify({ frameIds: created.map((node) => node.id) })
    });
    if (!complete.ok) throw new Error(`Frames criados, mas o backend não confirmou: ${await complete.text()}`);
    figma.currentPage.selection = created;
    figma.viewport.scrollAndZoomIntoView(created);
    return { empty: false, jobId: job.id, frameIds: created.map((node) => node.id), versionNumber: data.versionNumber, projectName: data.projectName };
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
      : { type: "success", message: `${result.projectName} · V${result.versionNumber} importada`, frameIds: result.frameIds });
  } catch (error) {
    figma.ui.postMessage({ type: "error", message: String(error) });
  }
};
