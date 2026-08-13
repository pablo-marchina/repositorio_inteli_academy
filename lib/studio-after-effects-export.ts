import { gzipSync } from "node:zlib";
import type { DriveAsset } from "@/lib/types";
import type { StructuredStudioPayload, StudioVideoTimeline } from "@/lib/studio-artifact";
import type { getCurrentFigmaSemanticState } from "@/lib/figma";

type SemanticState = Awaited<ReturnType<typeof getCurrentFigmaSemanticState>>[number];

type PackageFile = {
  path: string;
  data: string | Uint8Array;
};

function safeName(value: string, fallback = "asset") {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const cleaned = normalized.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (cleaned || fallback).slice(0, 80);
}

function jsxString(value: string) {
  return JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function seconds(frame: number, fps: number) {
  return Math.max(0, frame / fps);
}

function timelineWindow(timeline: StudioVideoTimeline, role: string) {
  const track = timeline.tracks.find((candidate) => candidate.role === role);
  if (!track) return { start: 0, end: timeline.durationInFrames / timeline.fps };
  return {
    start: seconds(track.startFrame, timeline.fps),
    end: seconds(track.startFrame + track.durationInFrames, timeline.fps)
  };
}

function textLayerScript(input: {
  role: string;
  text: string;
  box?: { x: number; y: number; width: number; height: number };
  style?: { fontFamily?: string; fontSize?: number; fontWeight?: number; textAlignHorizontal?: string; lineHeightPx?: number };
  nodeId: string;
  start: number;
  end: number;
  compWidth: number;
  compHeight: number;
}) {
  const box = input.box ?? { x: 84, y: 1120, width: input.compWidth - 168, height: 240 };
  const x = Math.max(0, Math.min(input.compWidth, box.x + box.width / 2));
  const y = Math.max(0, Math.min(input.compHeight, box.y + box.height / 2));
  const fontSize = Math.max(12, Math.min(260, input.style?.fontSize ?? (input.role === "headline" ? 88 : 34)));
  const lineHeight = Math.max(fontSize, input.style?.lineHeightPx ?? fontSize * 1.15);
  const align = input.style?.textAlignHorizontal === "CENTER"
    ? "ParagraphJustification.CENTER_JUSTIFY"
    : input.style?.textAlignHorizontal === "RIGHT"
      ? "ParagraphJustification.RIGHT_JUSTIFY"
      : "ParagraphJustification.LEFT_JUSTIFY";
  const width = Math.max(40, box.width);
  const height = Math.max(40, box.height);
  return `
  (function () {
    var layer;
    try { layer = comp.layers.addBoxText([${width.toFixed(2)}, ${height.toFixed(2)}], ${jsxString(input.text)}); }
    catch (_) { layer = comp.layers.addText(${jsxString(input.text)}); }
    layer.name = ${jsxString(`TEXT • ${input.role} • ${input.nodeId}`)};
    layer.inPoint = ${input.start.toFixed(4)};
    layer.outPoint = Math.min(duration, ${Math.max(input.end, input.start + 0.1).toFixed(4)});
    var source = layer.property("ADBE Text Properties").property("ADBE Text Document");
    var doc = source.value;
    doc.text = ${jsxString(input.text)};
    doc.fontSize = ${fontSize.toFixed(2)};
    doc.leading = ${lineHeight.toFixed(2)};
    doc.justification = ${align};
    try { doc.font = ${jsxString(input.style?.fontFamily ?? "Figtree")}; } catch (_) {}
    source.setValue(doc);
    var transform = layer.property("ADBE Transform Group");
    var position = transform.property("ADBE Position");
    position.setValue([${x.toFixed(2)}, ${y.toFixed(2)}]);
    if (${input.start.toFixed(4)} > 0) {
      var opacity = transform.property("ADBE Opacity");
      opacity.setValueAtTime(${input.start.toFixed(4)}, 0);
      opacity.setValueAtTime(Math.min(duration, ${input.start.toFixed(4)} + 0.35), 100);
      position.setValueAtTime(${input.start.toFixed(4)}, [${x.toFixed(2)}, ${(y + 36).toFixed(2)}]);
      position.setValueAtTime(Math.min(duration, ${input.start.toFixed(4)} + 0.45), [${x.toFixed(2)}, ${y.toFixed(2)}]);
    }
  })();`;
}

export function createAfterEffectsScript(input: {
  projectName: string;
  versionNumber: number;
  payload: StructuredStudioPayload;
  semanticState: SemanticState;
  assetFiles: Array<{ asset: DriveAsset; relativePath: string }>;
  figmaGraphicsPath: string;
  figmaReferencePath: string;
}) {
  const timeline = input.payload.artifact?.videoTimeline;
  if (!timeline) throw new Error("Esta versão não possui timeline de vídeo.");
  const duration = timeline.durationInFrames / timeline.fps;
  const textScripts: string[] = [];
  const semanticTextRoles = ["eyebrow", "headline", "body", "stat", "statLabel", "bullets", "logo", "pagination"];
  for (const role of semanticTextRoles) {
    const items = input.semanticState.roles[role] ?? [];
    const window = timelineWindow(timeline, role);
    for (const item of items) {
      if (!item.text?.trim()) continue;
      textScripts.push(textLayerScript({
        role,
        text: item.text,
        box: item.box,
        style: item.style,
        nodeId: item.id,
        start: window.start,
        end: window.end,
        compWidth: timeline.width,
        compHeight: timeline.height
      }));
    }
  }

  const mediaScripts = timeline.tracks.flatMap((track) => {
    if (!track.assetId) return [];
    const file = input.assetFiles.find((candidate) => candidate.asset.id === track.assetId);
    if (!file) return [];
    const start = seconds(track.startFrame, timeline.fps);
    const end = seconds(track.startFrame + track.durationInFrames, timeline.fps);
    return [`
  (function () {
    var file = new File(root.fsName + ${jsxString(`/${file.relativePath}`)});
    if (!file.exists) {
      file = File.openDialog(${jsxString(`Localize a mídia: ${file.asset.name}`)});
    }
    if (!file || !file.exists) throw new Error(${jsxString(`Mídia obrigatória não localizada: ${file.asset.name}`)});
    var imported = app.project.importFile(new ImportOptions(file));
    var layer = comp.layers.add(imported);
    layer.name = ${jsxString(`${track.kind.toUpperCase()} • ${track.role} • ${file.asset.name}`)};
    layer.startTime = ${start.toFixed(4)};
    layer.inPoint = ${start.toFixed(4)};
    layer.outPoint = Math.min(duration, ${Math.max(end, start + 0.1).toFixed(4)});
  })();`];
  });

  return `// Inteli Academy Content Studio — native After Effects project bootstrap
// Execute with File > Scripts > Run Script File. The script creates and saves an .aep next to itself.
(function () {
  app.beginUndoGroup("Inteli Academy structured import");
  try {
    if (!app.project) app.newProject();
    var root = new File($.fileName).parent;
    var duration = ${duration.toFixed(4)};
    var comp = app.project.items.addComp(${jsxString(`${input.projectName} · V${input.versionNumber}`)}, ${timeline.width}, ${timeline.height}, 1, duration, ${timeline.fps});
    comp.bgColor = [0.078, 0.078, 0.078];

    // Exact Figma graphics without editorial text. Import as a composition when supported so SVG elements stay editable shape layers.
    var graphicsFile = new File(root.fsName + ${jsxString(`/${input.figmaGraphicsPath}`)});
    if (graphicsFile.exists) {
      var graphicsOptions = new ImportOptions(graphicsFile);
      try { if (graphicsOptions.canImportAs(ImportAsType.COMP)) graphicsOptions.importAs = ImportAsType.COMP; } catch (_) {}
      var graphicsItem = app.project.importFile(graphicsOptions);
      var graphicsLayer = comp.layers.add(graphicsItem);
      graphicsLayer.name = "FIGMA • Brand graphics • editable SVG";
      graphicsLayer.inPoint = 0;
      graphicsLayer.outPoint = duration;
    }

    // Keep the full approved Figma frame in the project as a disabled exact reference.
    var referenceFile = new File(root.fsName + ${jsxString(`/${input.figmaReferencePath}`)});
    if (referenceFile.exists) {
      var referenceOptions = new ImportOptions(referenceFile);
      try { if (referenceOptions.canImportAs(ImportAsType.COMP)) referenceOptions.importAs = ImportAsType.COMP; } catch (_) {}
      var referenceItem = app.project.importFile(referenceOptions);
      var referenceLayer = comp.layers.add(referenceItem);
      referenceLayer.name = "REFERENCE • Full approved Figma frame";
      referenceLayer.enabled = false;
      referenceLayer.guideLayer = true;
      referenceLayer.inPoint = 0;
      referenceLayer.outPoint = duration;
    }
${mediaScripts.join("\n")}
${textScripts.join("\n")}

    comp.openInViewer();
    var output = new File(root.fsName + ${jsxString(`/InteliAcademy-V${input.versionNumber}.aep`)});
    app.project.save(output);
    alert("Projeto criado com layers separados e salvo em:\n" + output.fsName);
  } catch (error) {
    alert("Falha ao montar projeto Inteli Academy:\n" + error.toString());
    throw error;
  } finally {
    app.endUndoGroup();
  }
})();
`;
}

export function stripSvgText(svg: string) {
  return svg
    .replace(/<text\b[^>]*>[\s\S]*?<\/text>/gi, "")
    .replace(/<text\b[^>]*\/\s*>/gi, "");
}

function writeAscii(buffer: Buffer, offset: number, length: number, value: string) {
  buffer.write(value.slice(0, length), offset, length, "ascii");
}

function writeOctal(buffer: Buffer, offset: number, length: number, value: number) {
  const text = Math.max(0, Math.floor(value)).toString(8).padStart(length - 1, "0").slice(-(length - 1)) + "\0";
  writeAscii(buffer, offset, length, text);
}

function tarHeader(path: string, size: number) {
  if (Buffer.byteLength(path) > 100) throw new Error(`Caminho muito longo no pacote: ${path}`);
  const header = Buffer.alloc(512, 0);
  writeAscii(header, 0, 100, path);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, Math.floor(Date.now() / 1000));
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  writeAscii(header, 257, 6, "ustar\0");
  writeAscii(header, 263, 2, "00");
  writeAscii(header, 265, 32, "inteli-academy");
  writeAscii(header, 297, 32, "inteli-academy");
  let checksum = 0;
  for (const byte of header) checksum += byte;
  const checksumText = checksum.toString(8).padStart(6, "0") + "\0 ";
  writeAscii(header, 148, 8, checksumText);
  return header;
}

export function createTarGz(files: PackageFile[]) {
  const chunks: Buffer[] = [];
  for (const file of files) {
    const path = file.path.split("/").map((part) => safeName(part, "file")).join("/");
    const data = typeof file.data === "string" ? Buffer.from(file.data, "utf8") : Buffer.from(file.data);
    chunks.push(tarHeader(path, data.length), data);
    const padding = (512 - (data.length % 512)) % 512;
    if (padding) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks), { level: 9 });
}

export function packageAssetPath(asset: DriveAsset) {
  const extension = asset.name.includes(".") ? "" : asset.mimeType.startsWith("video/") ? ".mp4" : ".png";
  return `assets/${safeName(asset.name, asset.id)}${extension}`;
}

export function afterEffectsReadme(versionNumber: number) {
  return `INTELI ACADEMY — AFTER EFFECTS EDITABLE PACKAGE\n\n1. Extraia este .tar.gz preservando as pastas.\n2. No After Effects, use File > Scripts > Run Script File.\n3. Execute InteliAcademy-V${versionNumber}.jsx.\n4. O script cria e salva InteliAcademy-V${versionNumber}.aep na mesma pasta.\n\nO projeto cria footage e textos em layers separados. A arte do Figma é incluída em SVG e importada como composição quando a versão do After Effects oferece suporte, permitindo editar seus elementos vetoriais. O frame completo aprovado também fica no projeto como reference layer desabilitada para conferência pixel-a-pixel.\n\nMídias pequenas podem vir dentro de assets/. Para evitar pacotes excessivamente grandes, mídias acima do limite do servidor não são embutidas; nesse caso o script abre um seletor para você localizar o arquivo original local. Depois que o .aep for criado, use File > Dependencies > Collect Files se quiser relocar o projeto com todas as mídias.\n`;
}
