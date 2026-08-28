from pathlib import Path


def replace_exact(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly 1 match, found {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new), encoding="utf-8")

# 1) Normalize fetch rejections that never produce an HTTP response.
replace_exact(
    "components/ApiFetchGuard.tsx",
    '''    const guardedFetch: typeof window.fetch = async (input, init) => {\n      const response = await originalFetch(input, init);\n      if (response.status < 400 || !requestPath(input).startsWith("/api/")) return response;\n\n      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";''',
    '''    const guardedFetch: typeof window.fetch = async (input, init) => {\n      const path = requestPath(input);\n      let response: Response;\n      try {\n        response = await originalFetch(input, init);\n      } catch (error) {\n        if (!path.startsWith("/api/")) throw error;\n        const offline = typeof navigator !== "undefined" && navigator.onLine === false;\n        console.warn("[api-fetch] API request failed before receiving an HTTP response", { path, error: String(error) });\n        return new Response(JSON.stringify({\n          error: offline\n            ? "Sem conexão com a internet. Reconecte-se e tente novamente."\n            : "A conexão com a API foi interrompida antes de o servidor responder. Atualize o projeto para verificar se a operação concluiu e tente novamente apenas se necessário.",\n          status: 503,\n          retryable: true\n        }), {\n          status: 503,\n          statusText: "Service Unavailable",\n          headers: { "content-type": "application/json", "x-academy-network-error": "1" }\n        });\n      }\n      if (response.status < 400 || !path.startsWith("/api/")) return response;\n\n      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";'''
)

# 2) Reel audiovisual analysis v5: raw footage is analyzed with its original audio.
replace_exact(
    "lib/studio-reel-analysis.ts",
    "const SEMANTIC_ANALYSIS_VERSION = 4;",
    "const SEMANTIC_ANALYSIS_VERSION = 5;"
)

replace_exact(
    "lib/studio-reel-analysis.ts",
    '''export type FootageAnalysis = {\n  assetId: string;''',
    '''export type SourceAudioAnalysis = {\n  hasAudio: boolean;\n  speechPresent: boolean;\n  speechIntelligible: boolean;\n  ambientUseful: boolean;\n  summary: string;\n  recommendedVolume: number;\n  duckMusic: boolean;\n  segments: Array<{\n    startSeconds: number;\n    endSeconds: number;\n    kind: "speech" | "reaction" | "ambient" | "silence" | "other";\n    priority: "keep" | "optional" | "mute";\n    reason: string;\n  }>;\n};\n\nexport type FootageAnalysis = {\n  assetId: string;'''
)

replace_exact(
    "lib/studio-reel-analysis.ts",
    '''  cameraMovement: string;\n  bestSegments: Array<SemanticShot & {''',
    '''  cameraMovement: string;\n  sourceAudio?: SourceAudioAnalysis;\n  bestSegments: Array<SemanticShot & {'''
)

replace_exact(
    "lib/studio-reel-analysis.ts",
    '''const footageSchema = z.object({\n  cameraMovement: z.string().max(160),\n  bestSegments: z.array(z.object({''',
    '''const sourceAudioSchema = z.object({\n  hasAudio: z.boolean(),\n  speechPresent: z.boolean(),\n  speechIntelligible: z.boolean(),\n  ambientUseful: z.boolean(),\n  summary: z.string().max(320),\n  recommendedVolume: z.number().min(0).max(1),\n  duckMusic: z.boolean(),\n  segments: z.array(z.object({\n    startSeconds: z.number().min(0).max(900),\n    endSeconds: z.number().min(0).max(900),\n    kind: z.enum(["speech", "reaction", "ambient", "silence", "other"]),\n    priority: z.enum(["keep", "optional", "mute"]),\n    reason: z.string().max(180)\n  })).max(20).default([])\n});\n\nconst footageSchema = z.object({\n  cameraMovement: z.string().max(160),\n  sourceAudio: sourceAudioSchema.optional(),\n  bestSegments: z.array(z.object({'''
)

replace_exact(
    "lib/studio-reel-analysis.ts",
    '''      const prepared = await prepareVideoForAnalysis(bytes, asset.mimeType, "academy-reel-footage-", false);''',
    '''      const prepared = await prepareVideoForAnalysis(bytes, asset.mimeType, "academy-reel-footage-", true);'''
)

replace_exact(
    "lib/studio-reel-analysis.ts",
    '''      console.info("[reel-footage] visual proxy prepared", {''',
    '''      console.info("[reel-footage] audiovisual proxy prepared", {'''
)

replace_exact(
    "lib/studio-reel-analysis.ts",
    '''      : `Analise visualmente este VÍDEO BRUTO para edição de Reel 9:16. A duração real é ${duration.toFixed(3)}s. Não identifique pessoas. Escolha 2–6 melhores segmentos e, para cada um, retorne startSeconds/endSeconds, score 0-100, focalX/focalY inicial e endFocalX/endFocalY final para acompanhar o assunto, motion, energy, shotType (establishing|speaker|interaction|audience|detail|brand|movement|closing|other), framing (wide|medium|close|detail|other), sceneType (room|corridor|stage|table|exterior|brand|people|detail|other), subject curto e reason. Premie ação legível, rostos/gestos bem enquadrados sem identificar ninguém, branding visível, mudança de escala e composição forte; penalize costas sem contexto, teto/chão, câmera perdida, duplicidade visual e planos gerais estáticos sem sujeito. Nenhum endSeconds pode ultrapassar ${duration.toFixed(3)}.`;''',
    '''      : `Analise visualmente E ESCUTE O ÁUDIO ORIGINAL deste VÍDEO BRUTO para edição de Reel 9:16. A duração real é ${duration.toFixed(3)}s. Não identifique pessoas e não transcreva falas palavra por palavra. Escolha 2–6 melhores segmentos e, para cada um, retorne startSeconds/endSeconds, score 0-100, focalX/focalY inicial e endFocalX/endFocalY final para acompanhar o assunto, motion, energy, shotType (establishing|speaker|interaction|audience|detail|brand|movement|closing|other), framing (wide|medium|close|detail|other), sceneType (room|corridor|stage|table|exterior|brand|people|detail|other), subject curto e reason. Premie ação legível, gestos bem enquadrados sem identificar ninguém, branding visível, mudança de escala e composição forte; penalize costas sem contexto, teto/chão, câmera perdida, duplicidade visual e planos gerais estáticos sem sujeito. Também retorne sourceAudio: hasAudio, speechPresent, speechIntelligible, ambientUseful, summary curto sem citação literal, recommendedVolume 0–1, duckMusic e até 20 segments com startSeconds/endSeconds, kind (speech|reaction|ambient|silence|other), priority (keep|optional|mute) e reason. Use o áudio somente para entender fala, reação, silêncio, aplauso e ambiente e decidir o mix do take. NÃO trate nenhuma música já presente no vídeo como catálogo ou escolha musical: a trilha do Reel será escolhida livremente pela IA em uma etapa separada. Nenhum endSeconds pode ultrapassar ${duration.toFixed(3)}.`;'''
)

replace_exact(
    "lib/studio-reel-analysis.ts",
    '''      analysisMode: image ? "image" : "video",\n      cameraMovement: analysis.cameraMovement,\n      bestSegments''',
    '''      analysisMode: image ? "image" : "video",\n      cameraMovement: analysis.cameraMovement,\n      ...(image || !analysis.sourceAudio ? {} : {\n        sourceAudio: {\n          ...analysis.sourceAudio,\n          segments: analysis.sourceAudio.segments\n            .map((segment) => ({\n              ...segment,\n              startSeconds: clamp(segment.startSeconds, 0, duration),\n              endSeconds: clamp(segment.endSeconds, 0, duration)\n            }))\n            .filter((segment) => segment.endSeconds > segment.startSeconds)\n        }\n      }),\n      bestSegments'''
)

replace_exact(
    "lib/studio-reel-analysis.ts",
    '''async function chooseOpenMusic(input: {\n  context?: string;\n  reference: ReelReferenceTemporalAnalysis | null;\n  targetDurationSeconds: number;\n}) {\n  const referenceSummary = input.reference''',
    '''async function chooseOpenMusic(input: {\n  context?: string;\n  reference: ReelReferenceTemporalAnalysis | null;\n  footage: FootageAnalysis[];\n  targetDurationSeconds: number;\n}) {\n  const referenceSummary = input.reference'''
)

replace_exact(
    "lib/studio-reel-analysis.ts",
    '''  return geminiTextJson(\n    `Você é o music director de um editor profissional de Reels. Escolha livremente UMA música real que combine com este conteúdo. Você NÃO está limitado a Google Drive, uploads do usuário ou uma lista pré-selecionada. Pode escolher uma faixa comercial conhecida ou uma faixa de produção musical, desde que a escolha seja específica e coerente com o contexto. Não cite nem reproduza letras. Contexto editorial: ${(input.context ?? "").slice(0, 2200) || "não informado"}. Referência audiovisual: ${referenceSummary}. Retorne title, artist, searchQuery, BPM aproximado, beatOffsetSeconds relativo ao trecho sugerido, startOffsetSeconds do trecho ideal na faixa, section descrevendo o trecho (ex.: intro, hook, refrão, drop) e reason curto em português. A aplicação buscará a faixa posteriormente em um catálogo licenciado; sua tarefa aqui é escolher e dirigir musicalmente a edição, não escolher um arquivo local.`,''',
    '''  const sourceAudioSummary = input.footage\n    .flatMap((analysis) => analysis.sourceAudio?.hasAudio ? [analysis.sourceAudio] : [])\n    .slice(0, 8)\n    .map((audio, index) => `take${index + 1}: fala=${audio.speechPresent ? "sim" : "não"}, inteligível=${audio.speechIntelligible ? "sim" : "não"}, ambienteÚtil=${audio.ambientUseful ? "sim" : "não"}, duck=${audio.duckMusic ? "sim" : "não"}, resumo=${audio.summary}`)\n    .join(" | ") || "áudio original não analisado ou ausente";\n  return geminiTextJson(\n    `Você é o music director de um editor profissional de Reels. Escolha livremente UMA música real que combine com este conteúdo. Você NÃO está limitado a Google Drive, uploads do usuário, áudio já existente nos vídeos ou uma lista pré-selecionada. Pode escolher uma faixa comercial conhecida ou uma faixa de produção musical, desde que a escolha seja específica e coerente com o contexto. O áudio original dos takes abaixo é somente contexto editorial para você evitar conflito com falas e decidir energia/ducking; NUNCA escolha como trilha uma música que por acaso esteja tocando dentro de um vídeo bruto. Não cite nem reproduza letras. Contexto editorial: ${(input.context ?? "").slice(0, 2200) || "não informado"}. Referência audiovisual: ${referenceSummary}. Áudio original dos takes: ${sourceAudioSummary}. Retorne title, artist, searchQuery, BPM aproximado, beatOffsetSeconds relativo ao trecho sugerido, startOffsetSeconds do trecho ideal na faixa, section descrevendo o trecho (ex.: intro, hook, refrão, drop) e reason curto em português. A aplicação buscará a faixa posteriormente em um catálogo licenciado; sua tarefa aqui é escolher e dirigir musicalmente a edição, não escolher um arquivo local.`,'''
)

replace_exact(
    "lib/studio-reel-analysis.ts",
    '''  const musicDirection = await chooseOpenMusic({ context: options.context, reference, targetDurationSeconds });''',
    '''  const musicDirection = await chooseOpenMusic({ context: options.context, reference, footage, targetDurationSeconds });'''
)

# 3) Preserve source audio decisions as editable timeline audio tracks.
replace_exact(
    "lib/studio-artifact.ts",
    '''import { buildReelEditingPlan, type FootageAnalysis, type MusicDirection, type ReelEditingPlan } from "@/lib/studio-reel-analysis";''',
    '''import { buildReelEditingPlan, type FootageAnalysis, type MusicDirection, type ReelEditingPlan, type SourceAudioAnalysis } from "@/lib/studio-reel-analysis";'''
)

replace_exact(
    "lib/studio-artifact.ts",
    '''  musicDirection?: MusicDirection;\n};''',
    '''  musicDirection?: MusicDirection;\n  sourceAudioAnalysis?: SourceAudioAnalysis;\n};'''
)

replace_exact(
    "lib/studio-artifact.ts",
    '''  schemaVersion: 1 | 2 | 3 | 4;''',
    '''  schemaVersion: 1 | 2 | 3 | 4 | 5;'''
)

replace_exact(
    "lib/studio-artifact.ts",
    '''  const tracks: StudioVideoTrack[] = plan.shots.map((shot, index) => {\n    const asset = byId.get(shot.assetId);\n    const image = asset?.mimeType.startsWith("image/") ?? false;\n    return {''',
    '''  const analysisByAsset = new Map(plan.footage.map((analysis) => [analysis.assetId, analysis]));\n  const tracks: StudioVideoTrack[] = plan.shots.map((shot, index) => {\n    const asset = byId.get(shot.assetId);\n    const image = asset?.mimeType.startsWith("image/") ?? false;\n    const sourceAudio = analysisByAsset.get(shot.assetId)?.sourceAudio;\n    const keepAudio = sourceAudio?.segments.some((segment) => segment.priority === "keep" && segment.endSeconds > shot.sourceInSeconds && segment.startSeconds < shot.sourceOutSeconds) ?? false;\n    const sourceVolume = image || sourceAudio?.hasAudio === false\n      ? 0\n      : keepAudio\n        ? Math.max(.72, sourceAudio?.recommendedVolume ?? .72)\n        : sourceAudio?.recommendedVolume ?? (plan.musicDirection ? .22 : .72);\n    return {'''
)

replace_exact(
    "lib/studio-artifact.ts",
    '''      muted: image ? true : Boolean(plan.musicAssetId),\n      volume: image || plan.musicAssetId ? 0 : plan.musicDirection ? .18 : .72\n    } satisfies StudioVideoTrack;\n  });\n\n  const durationInFrames = Math.max(''',
    '''      muted: image || sourceAudio?.hasAudio === false || sourceVolume <= .001,\n      volume: sourceVolume,\n      ...(sourceAudio ? { sourceAudioAnalysis: sourceAudio } : {})\n    } satisfies StudioVideoTrack;\n  });\n\n  const sourceAudioTracks = plan.shots.flatMap((shot, index): StudioVideoTrack[] => {\n    const asset = byId.get(shot.assetId);\n    const sourceAudio = analysisByAsset.get(shot.assetId)?.sourceAudio;\n    if (!asset?.mimeType.startsWith("video/") || !sourceAudio?.hasAudio) return [];\n    const keepAudio = sourceAudio.segments.some((segment) => segment.priority === "keep" && segment.endSeconds > shot.sourceInSeconds && segment.startSeconds < shot.sourceOutSeconds);\n    const volume = keepAudio ? Math.max(.72, sourceAudio.recommendedVolume) : sourceAudio.recommendedVolume;\n    return [{\n      id: `audio-source-${index + 1}`,\n      name: `A2.${index + 1} · Áudio original · ${asset.name}`,\n      kind: "audio",\n      role: sourceAudio.speechPresent ? "voice" : "sfx",\n      startFrame: Math.round(shot.timelineStartSeconds * fps),\n      durationInFrames: Math.max(1, Math.round(shot.durationSeconds * fps)),\n      sourceStartFrame: Math.max(0, Math.round(shot.sourceInSeconds * fps)),\n      sourceEndFrame: Math.max(1, Math.round(shot.sourceOutSeconds * fps)),\n      zIndex: -5,\n      editable: true,\n      assetId: shot.assetId,\n      volume,\n      muted: volume <= .001,\n      sourceAudioAnalysis: sourceAudio\n    }];\n  });\n  tracks.push(...sourceAudioTracks);\n\n  const durationInFrames = Math.max('''
)

replace_exact(
    "lib/studio-artifact.ts",
    '''  const localCount = plan.footage.filter((analysis) => analysis.analysisMode === "local-video").length;\n  const analysisLabel = localCount ? `${localCount} mídia(s) com análise local FFmpeg; semântica remota indisponível nesses casos` : "semântica visual remota disponível para a mídia usada";\n  const executionSummary = `${structureLabel} · ${videoCount} vídeo(s) · ${imageCount} foto(s) · ${(durationInFrames / fps).toFixed(2)}s · ${audioLabel} · ${coverage} · ${analysisLabel}`;\n  return {\n    schemaVersion: 4,''',
    '''  const localCount = plan.footage.filter((analysis) => analysis.analysisMode === "local-video").length;\n  const heardSourceAudioCount = plan.footage.filter((analysis) => analysis.sourceAudio?.hasAudio).length;\n  const analysisLabel = localCount ? `${localCount} mídia(s) com análise local FFmpeg; semântica remota indisponível nesses casos` : "semântica visual remota disponível para a mídia usada";\n  const executionSummary = `${structureLabel} · ${videoCount} vídeo(s) · ${imageCount} foto(s) · ${(durationInFrames / fps).toFixed(2)}s · ${audioLabel} · áudio original ouvido em ${heardSourceAudioCount} mídia(s) · ${coverage} · ${analysisLabel}`;\n  return {\n    schemaVersion: 5,'''
)

replace_exact(
    "lib/studio-artifact.ts",
    '''  const sourceAudioAvailable = Boolean(plan.musicDirection || plan.musicAssetId) || plan.sourceAudio;\n  const semanticRatio = semanticMatchRatio(plan);''',
    '''  const sourceAudioAvailable = Boolean(plan.musicDirection || plan.musicAssetId) || plan.sourceAudio;\n  const usedVideoAnalyses = usedAnalysis.filter((analysis) => (assets.find((asset) => asset.id === analysis.assetId)?.mimeType ?? "").startsWith("video/"));\n  const listenedSourceAudio = usedVideoAnalyses.filter((analysis) => Boolean(analysis.sourceAudio)).length;\n  const semanticRatio = semanticMatchRatio(plan);'''
)

replace_exact(
    "lib/studio-artifact.ts",
    '''    { id: "audio", label: "Reel possui direção de áudio", passed: sourceAudioAvailable, severity: "error", detail: plan.musicDirection ? `IA escolheu ${plan.musicDirection.artist} — ${plan.musicDirection.title}; o arquivo deve ser resolvido em catálogo licenciado na etapa de publicação/edição final.` : plan.musicAssetId ? "Track musical legada baseada em asset." : "Áudio natural dos takes permanece ativo." },\n    { id: "music-beats",''',
    '''    { id: "audio", label: "Reel possui direção de áudio", passed: sourceAudioAvailable, severity: "error", detail: plan.musicDirection ? `IA escolheu livremente ${plan.musicDirection.artist} — ${plan.musicDirection.title}; o arquivo deve ser resolvido em catálogo licenciado na etapa de publicação/edição final.` : plan.musicAssetId ? "Track musical legada baseada em asset." : "Áudio natural dos takes permanece ativo." },\n    { id: "source-audio-listening", label: "IA pode ouvir o áudio original dos vídeos", passed: usedVideoAnalyses.length === 0 || listenedSourceAudio > 0, severity: "warning", detail: usedVideoAnalyses.length ? `${listenedSourceAudio}/${usedVideoAnalyses.length} vídeo(s) usados retornaram análise de fala/reação/ambiente; a música é escolhida em uma etapa independente e não usa o áudio bruto como catálogo.` : "A montagem não usa vídeos com áudio original." },\n    { id: "music-beats",'''
)

# 4) Current render gate now requires audiovisual v5.
replace_exact(
    "app/api/studio/[projectId]/versions/[versionId]/render-reel/route.ts",
    '''  if (!plan || (plan.analysisSummary?.semanticVersion ?? 0) < 4) {''',
    '''  if (!plan || (plan.analysisSummary?.semanticVersion ?? 0) < 5) {'''
)
replace_exact(
    "app/api/studio/[projectId]/versions/[versionId]/render-reel/route.ts",
    '''  if (plan.reference && (plan.reference.semanticVersion ?? 0) < 4) {''',
    '''  if (plan.reference && (plan.reference.semanticVersion ?? 0) < 5) {'''
)

# 5) Carry source-audio decisions through OTIO/editor metadata.
replace_exact(
    "lib/studio-davinci-export.ts",
    '''        volume: track.volume ?? null,\n        musicDirection: track.musicDirection ?? null''',
    '''        volume: track.volume ?? null,\n        muted: track.muted ?? false,\n        sourceAudioAnalysis: track.sourceAudioAnalysis ?? null,\n        musicDirection: track.musicDirection ?? null'''
)

replace_exact(
    "lib/studio-editor-export.ts",
    '''          volume: track.volume ?? null,\n          muted: track.muted ?? null,\n          musicDirection: track.musicDirection ?? null''',
    '''          volume: track.volume ?? null,\n          muted: track.muted ?? null,\n          sourceAudioAnalysis: track.sourceAudioAnalysis ?? null,\n          musicDirection: track.musicDirection ?? null'''
)

print("Audiovisual v5 patch applied")
