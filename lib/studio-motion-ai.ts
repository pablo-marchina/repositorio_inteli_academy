import { z } from "zod";
import { callGeminiJson } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StructuredStudioPayload, StudioVideoTimeline, StudioVideoTrack } from "@/lib/studio-artifact";

const motionSchema = z.object({
  eyebrowInSeconds: z.number().min(0).max(60),
  headlineInSeconds: z.number().min(0).max(60),
  bodyInSeconds: z.number().min(0).max(60),
  musicInSeconds: z.number().min(0).max(60)
});

function starts(timeline: StudioVideoTimeline) {
  const at = (role: string) => (timeline.tracks.find((track) => track.role === role)?.startFrame ?? 0) / timeline.fps;
  return {
    durationSeconds: timeline.durationInFrames / timeline.fps,
    eyebrowInSeconds: at("eyebrow"),
    headlineInSeconds: at("headline"),
    bodyInSeconds: at("body"),
    musicInSeconds: at("music"),
    immutableShotCount: timeline.tracks.filter((track) => track.role === "footage").length
  };
}

function shiftedTrack(track: StudioVideoTrack, requestedSeconds: number | undefined, timeline: StudioVideoTimeline) {
  if (requestedSeconds === undefined) return track;
  const requested = Math.round(requestedSeconds * timeline.fps);
  const startFrame = Math.max(0, Math.min(requested, Math.max(0, timeline.durationInFrames - 1)));
  const maxDuration = Math.max(1, timeline.durationInFrames - startFrame);
  return { ...track, startFrame, durationInFrames: Math.min(track.durationInFrames, maxDuration) };
}

function rebuildTimeline(timeline: StudioVideoTimeline, motion: z.infer<typeof motionSchema>) {
  const roleStart: Record<string, number> = {
    eyebrow: motion.eyebrowInSeconds,
    headline: motion.headlineInSeconds,
    body: motion.bodyInSeconds,
    music: motion.musicInSeconds
  };
  return {
    ...timeline,
    // Footage edit decisions are immutable in this lightweight motion pass. A content revision replans them explicitly.
    tracks: timeline.tracks.map((track) => {
      if (track.role === "footage") return track;
      if (track.role === "music") {
        const shifted = shiftedTrack(track, roleStart.music, timeline);
        return { ...shifted, durationInFrames: Math.max(1, timeline.durationInFrames - shifted.startFrame) };
      }
      if (track.kind === "text") return shiftedTrack(track, roleStart[String(track.role)], timeline);
      return track;
    })
  } satisfies StudioVideoTimeline;
}

export async function applyMotionRevision(projectId: string, versionId: string, changeRequest: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("content_versions").select("payload").eq("id", versionId).eq("project_id", projectId).single();
  if (error) throw error;
  const payload = data.payload as StructuredStudioPayload;
  const timeline = payload?.artifact?.videoTimeline;
  if (payload?.contentType !== "reel" || !timeline) return;
  const current = starts(timeline);
  const motion = await callGeminiJson([
    {
      role: "system",
      content: "Converta o pedido em ajustes de entrada de texto/música. Preserve valores não mencionados. NÃO altere duração total, cortes, ordem de footage, source in/out, crop, duração dos shots ou número de shots; essas decisões pertencem ao plano de edição e exigem uma revisão completa, não este ajuste de motion."
    },
    { role: "user", content: `Atual: ${JSON.stringify(current)}\nPedido: ${changeRequest}\nRetorne os quatro tempos em segundos. Se o pedido não mexer em um deles, devolva exatamente o valor atual.` }
  ], motionSchema, { thinkingLevel: "high" });
  const nextTimeline = rebuildTimeline(timeline, motion);
  const nextPayload = {
    ...payload,
    artifact: {
      ...payload.artifact!,
      videoTimeline: nextTimeline,
      renderQa: undefined
    }
  };
  const { error: updateError } = await admin.from("content_versions").update({ payload: nextPayload }).eq("id", versionId).eq("project_id", projectId);
  if (updateError) throw updateError;
}
