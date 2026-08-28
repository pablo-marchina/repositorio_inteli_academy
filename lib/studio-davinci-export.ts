import type { DriveAsset } from "@/lib/types";
import type { StructuredStudioPayload, StudioVideoTimeline, StudioVideoTrack } from "@/lib/studio-artifact";

export type ResolveGraphic = {
  nodeId: string;
  role: string;
  name: string;
  relativePath: string;
};

export type ResolveMedia = {
  asset: DriveAsset;
  relativePath: string;
  downloadUrl: string;
};

function safeName(value: string, fallback = "asset") {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const cleaned = normalized.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (cleaned || fallback).slice(0, 88);
}

function rational(value: number, rate: number) {
  return { OTIO_SCHEMA: "RationalTime.1", value, rate };
}

function timeRange(start: number, duration: number, rate: number) {
  return { OTIO_SCHEMA: "TimeRange.1", start_time: rational(start, rate), duration: rational(duration, rate) };
}

function externalReference(targetUrl: string, metadata: Record<string, unknown>) {
  return {
    OTIO_SCHEMA: "ExternalReference.1",
    target_url: targetUrl,
    available_range: null,
    metadata: { academy: metadata }
  };
}

function missingReference(metadata: Record<string, unknown>) {
  return { OTIO_SCHEMA: "MissingReference.1", available_range: null, metadata: { academy: metadata } };
}

function clipForTrack(track: StudioVideoTrack, timeline: StudioVideoTimeline, mediaUrl: string | null) {
  const sourceStart = track.sourceStartFrame ?? 0;
  return {
    OTIO_SCHEMA: "Clip.2",
    name: track.name,
    source_range: timeRange(sourceStart, track.durationInFrames, timeline.fps),
    metadata: {
      academy: {
        id: track.id,
        role: track.role,
        kind: track.kind,
        editable: true,
        zIndex: track.zIndex,
        assetId: track.assetId ?? null,
        figmaNodeId: track.figmaNodeId ?? null,
        text: track.text ?? null,
        crop: track.crop ?? null,
        transition: track.transition ?? null,
        transitionDurationInFrames: track.transitionDurationInFrames ?? 0,
        volume: track.volume ?? null,
        muted: track.muted ?? false,
        sourceAudioAnalysis: track.sourceAudioAnalysis ?? null,
        musicDirection: track.musicDirection ?? null
      }
    },
    media_reference: mediaUrl
      ? externalReference(mediaUrl, { assetId: track.assetId ?? null, figmaNodeId: track.figmaNodeId ?? null, role: track.role })
      : missingReference({ generatedLayer: true, role: track.role, figmaNodeId: track.figmaNodeId ?? null, text: track.text ?? null, musicDirection: track.musicDirection ?? null })
  };
}

function transitionObject(track: StudioVideoTrack, fps: number) {
  const total = Math.max(0, track.transitionDurationInFrames ?? 0);
  if (!total || (track.transition ?? "cut") === "cut") return null;
  const before = Math.floor(total / 2);
  const after = total - before;
  return {
    OTIO_SCHEMA: "Transition.1",
    name: `AI · ${track.transition}`,
    transition_type: track.transition === "dissolve" ? "SMPTE_Dissolve" : "Custom",
    in_offset: rational(before, fps),
    out_offset: rational(after, fps),
    metadata: {
      academy: {
        transition: track.transition,
        durationInFrames: total,
        intent: "AI-selected contextual transition. Resolve may map custom transitions to a native effect while preserving timing."
      }
    }
  };
}

function sequentialFootageTrack(timeline: StudioVideoTimeline, mediaPaths: Map<string, string>) {
  const footage = timeline.tracks
    .filter((track) => track.role === "footage" && track.assetId)
    .sort((a, b) => a.startFrame - b.startFrame);
  const children: Array<Record<string, unknown>> = [];
  for (let index = 0; index < footage.length; index += 1) {
    const track = footage[index];
    if (index > 0) {
      const transition = transitionObject(track, timeline.fps);
      if (transition) children.push(transition);
    }
    children.push(clipForTrack(track, timeline, mediaPaths.get(track.assetId!) ?? null));
  }
  return {
    OTIO_SCHEMA: "Track.1",
    name: "V1 · AI EDIT · FOOTAGE",
    kind: "Video",
    metadata: { academy: { role: "footage", editable: true, aiEdited: true } },
    children
  };
}

function independentTrack(input: {
  track: StudioVideoTrack;
  timeline: StudioVideoTimeline;
  mediaUrl: string | null;
}) {
  const children: Array<Record<string, unknown>> = [];
  if (input.track.startFrame > 0) {
    children.push({ OTIO_SCHEMA: "Gap.1", name: "Pre-roll", source_range: timeRange(0, input.track.startFrame, input.timeline.fps), metadata: {} });
  }
  children.push(clipForTrack(input.track, input.timeline, input.mediaUrl));
  return {
    OTIO_SCHEMA: "Track.1",
    name: input.track.name,
    kind: input.track.kind === "audio" ? "Audio" : "Video",
    metadata: { academy: { id: input.track.id, role: input.track.role, kind: input.track.kind, zIndex: input.track.zIndex, editable: true } },
    children
  };
}

export function resolveMediaPath(asset: DriveAsset) {
  const ext = asset.name.includes(".") ? "" : asset.mimeType.startsWith("video/") ? ".mp4" : asset.mimeType.startsWith("audio/") ? ".m4a" : ".png";
  return `media/${safeName(asset.id.slice(0, 12))}-${safeName(asset.name, "media")}${ext}`;
}

export function resolveGraphicPath(role: string, name: string, nodeId: string) {
  return `figma/${safeName(role)}-${safeName(name, nodeId)}-${safeName(nodeId)}.png`;
}

export function serializeResolveOtio(input: {
  payload: StructuredStudioPayload;
  projectName: string;
  media: ResolveMedia[];
  graphics: ResolveGraphic[];
}) {
  const timeline = input.payload.artifact?.videoTimeline;
  if (!timeline) throw new Error("Esta versão não possui timeline de vídeo.");
  const mediaPaths = new Map(input.media.map((item) => [item.asset.id, item.relativePath]));
  const graphicPaths = new Map(input.graphics.map((item) => [item.nodeId, item.relativePath]));
  const graphicByRole = new Map<string, string>();
  for (const graphic of input.graphics) if (!graphicByRole.has(graphic.role)) graphicByRole.set(graphic.role, graphic.relativePath);

  const layers = timeline.tracks
    .filter((track) => track.role !== "footage")
    .sort((a, b) => a.zIndex - b.zIndex || a.startFrame - b.startFrame)
    .map((track) => {
      const url = track.assetId
        ? mediaPaths.get(track.assetId) ?? null
        : track.figmaNodeId
          ? graphicPaths.get(track.figmaNodeId) ?? null
          : graphicByRole.get(String(track.role)) ?? null;
      return independentTrack({ track, timeline, mediaUrl: url });
    });

  return {
    OTIO_SCHEMA: "Timeline.1",
    name: input.projectName,
    global_start_time: rational(0, timeline.fps),
    metadata: {
      academy: {
        schema: "inteli-academy-resolve/v1",
        sourceOfTruth: "ai-edit-timeline",
        timelineSchemaVersion: timeline.schemaVersion,
        width: timeline.width,
        height: timeline.height,
        fps: timeline.fps,
        editable: true,
        executionSummary: timeline.executionSummary ?? null
      }
    },
    tracks: {
      OTIO_SCHEMA: "Stack.1",
      name: "Inteli Academy · AI Edit",
      metadata: {},
      children: [sequentialFootageTrack(timeline, mediaPaths), ...layers]
    }
  };
}

export function resolveManifest(input: {
  payload: StructuredStudioPayload;
  projectId: string;
  projectName: string;
  versionNumber: number;
  figmaFileKey?: string | null;
  frameId: string;
  media: ResolveMedia[];
  graphics: ResolveGraphic[];
}) {
  const timeline = input.payload.artifact?.videoTimeline;
  if (!timeline) throw new Error("Esta versão não possui timeline de vídeo.");
  return {
    schema: "inteli-academy-davinci-package/v1",
    project: { id: input.projectId, name: input.projectName, version: input.versionNumber },
    timeline: {
      width: timeline.width,
      height: timeline.height,
      fps: timeline.fps,
      durationInFrames: timeline.durationInFrames,
      sourceOfTruth: "ai-edit-timeline",
      musicSelection: input.payload.artifact?.reelPlan ? {
        mode: input.payload.artifact.reelPlan.musicSelectionMode ?? "none",
        assetId: input.payload.artifact.reelPlan.musicAssetId ?? null,
        direction: input.payload.artifact.reelPlan.musicDirection ?? null,
        reason: input.payload.artifact.reelPlan.musicSelectionReason ?? null,
        beatSource: input.payload.artifact.reelPlan.beatSource
      } : null
    },
    figma: {
      fileKey: input.figmaFileKey ?? null,
      frameId: input.frameId,
      graphics: input.graphics
    },
    media: input.media.map((item) => ({
      id: item.asset.id,
      name: item.asset.name,
      mimeType: item.asset.mimeType,
      relativePath: item.relativePath,
      downloadUrl: item.downloadUrl
    })),
    nativeEditIntent: {
      footage: "Each AI-selected take is a separate source clip with source in/out and transition timing.",
      music: "AI chooses the song independently of Drive. The timeline carries title/artist/section/BPM/search metadata as an external music cue; relink the licensed source in Resolve or apply it in the publishing catalog.",
      figma: "Logo, mascot/robot and brand elements are independent Figma-rendered graphics with their node IDs retained.",
      text: "Text timing/content/style metadata is preserved. The packaged Figma render keeps visual fidelity; use the node ID/Figma source when native title recreation is required.",
      transitions: "Dissolves map natively. Whip/zoom/blur/push keep exact timing and Academy transition metadata so they can be replaced by Resolve-native effects without recutting."
    },
    tracks: timeline.tracks
  };
}

export function createResolveBridgeScript(input: { projectName: string; versionNumber: number }) {
  return `#!/usr/bin/env python3\nimport json, os, pathlib, sys, urllib.request\n\nROOT = pathlib.Path(__file__).resolve().parent\nMANIFEST = ROOT / "project-manifest.json"\nOTIO = ROOT / "content.otio"\n\ndef fail(message):\n    print("[Inteli Academy] " + message, file=sys.stderr)\n    raise SystemExit(1)\n\ndef download_media():\n    data = json.loads(MANIFEST.read_text(encoding="utf-8"))\n    for media in data.get("media", []):\n        target = ROOT / media["relativePath"]\n        target.parent.mkdir(parents=True, exist_ok=True)\n        if target.exists() and target.stat().st_size > 0:\n            continue\n        print("[Inteli Academy] Baixando:", media["name"])\n        urllib.request.urlretrieve(media["downloadUrl"], target)\n    return data\n\ndef resolve_module():\n    candidates = [\n        os.environ.get("RESOLVE_SCRIPT_API"),\n        r"C:\\ProgramData\\Blackmagic Design\\DaVinci Resolve\\Support\\Developer\\Scripting\\Modules",\n        "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules",\n        "/opt/resolve/Developer/Scripting/Modules",\n    ]\n    for candidate in candidates:\n        if candidate and os.path.isdir(candidate) and candidate not in sys.path:\n            sys.path.append(candidate)\n    try:\n        import DaVinciResolveScript as dvr_script\n        return dvr_script\n    except Exception as exc:\n        fail("Não encontrei DaVinciResolveScript. Abra o Resolve e habilite External scripting em Preferences > System > General. Detalhe: " + str(exc))\n\ndef import_timeline(data):\n    dvr_script = resolve_module()\n    resolve = dvr_script.scriptapp("Resolve")\n    if not resolve:\n        fail("DaVinci Resolve não está aberto ou o scripting externo não está habilitado.")\n    manager = resolve.GetProjectManager()\n    project = manager.GetCurrentProject()\n    if not project:\n        project = manager.CreateProject(${JSON.stringify(`${input.projectName} · AI Edit V${input.versionNumber}`)})\n    if not project:\n        fail("Não foi possível abrir/criar um projeto no Resolve.")\n    media_pool = project.GetMediaPool()\n    timeline = media_pool.ImportTimelineFromFile(str(OTIO), {\n        "timelineName": ${JSON.stringify(`${input.projectName} · AI Edit V${input.versionNumber}`)},\n        "importSourceClips": True,\n        "sourceClipsPath": str(ROOT / "media")\n    })\n    if not timeline:\n        fail("O Resolve não importou content.otio. Use File > Import > Timeline e selecione content.otio manualmente.")\n    try:\n        project.SetCurrentTimeline(timeline)\n    except Exception:\n        pass\n    print("[Inteli Academy] Timeline importada com sucesso:", timeline.GetName())\n    print("[Inteli Academy] Cuts, direção musical e gráficos permanecem separados. Se a música foi escolhida fora do Drive, relink a faixa licenciada indicada no manifest.")\n\nif __name__ == "__main__":\n    data = download_media()\n    import_timeline(data)\n`;
}

export function resolveReadme(versionNumber: number) {
  return `INTELI ACADEMY — DAVINCI RESOLVE · AI EDIT V${versionNumber}\n\nOBJETIVO\nEste pacote não contém um MP4 achatado. A IA entrega uma timeline profissional editável: takes, source in/out, música, cortes, transições e elementos do Figma continuam separados.\n\nABERTURA DIRETA\nWindows: execute OPEN-IN-DAVINCI.bat com o DaVinci Resolve aberto.\nmacOS/Linux: execute python3 academy-resolve-bridge.py.\n\nO bridge baixa as mídias originais autorizadas do Drive para media/ e importa content.otio no projeto atual do DaVinci Resolve.\n\nIMPORTAÇÃO MANUAL\nSe preferir, execute primeiro o bridge apenas para baixar as mídias e depois use File > Import > Timeline no Resolve, selecionando content.otio. O DaVinci Resolve 18.5+ suporta OpenTimelineIO (OTIO).\n\nEDITABILIDADE\n- cada take é um clip independente com source in/out;\n- a IA escolhe livremente a música; título, artista, trecho, BPM e busca ficam no manifest/track para relink em um catálogo licenciado;\n- logo, mascote/robô e grafismos reais do Figma são layers separados quando detectados;\n- dissolves usam transição OTIO nativa; whip/zoom/blur/push preservav timing e metadata para ajuste/substituição no Resolve;\n- textos preservav conteúdo, timing, tipografia e node IDs no manifest.\n\nO MP4 continua sendo apenas o render de aprovação; content.otio é a saída editorial profissional.\n`;
}

export function windowsResolveLauncher() {
  return `@echo off\nsetlocal\nwhere py >nul 2>&1 && (py -3 "%~dp0academy-resolve-bridge.py" & goto :end)\nwhere python >nul 2>&1 && (python "%~dp0academy-resolve-bridge.py" & goto :end)\necho Python 3 nao foi encontrado. Instale Python 3 ou rode academy-resolve-bridge.py manualmente.\npause\n:end\nendlocal\n`;
}
