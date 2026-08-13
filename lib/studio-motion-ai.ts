import { z } from "zod";
import { callGeminiJson } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StructuredStudioPayload, StudioVideoTimeline } from "@/lib/studio-artifact";

const motionSchema = z.object({
  durationSeconds: z.number().min(3).max(60),
  footageInSeconds: z.number().min(0).max(60),
  eyebrowInSeconds: z.number().min(0).max(60),
  headlineInSeconds: z.number().min(0).max(60),
  bodyInSeconds: z.number().min(0).max(60)
});

function starts(timeline: StudioVideoTimeline) {
  const at = (role: string) => (timeline.tracks.find((track) => track.role === role)?.startFrame ?? 0) / timeline.fps;
  return {
    durationSeconds: timeline.durationInFrames / timeline.fps,
    footageInSeconds: at("footage"),
    eyebrowInSeconds: at("eyebrow"),
    headlineInSeconds: at("headline"),
    bodyInSeconds: at("body")
  };
}

function rebuildTimeline(timeline: StudioVideoTimeline, motion: z.infer<typeof motionSchema>) {
  const fps = timeline.fps;
  const total = Math.max(1, Math.round(motion.durationSeconds * fps));
  const roleStart: Record<string, number> = {
    footage: Math.round(motion.footageInSeconds * fps),
    eyebrow: Math.round(motion.eyebrowInSeconds * fps),
    headline: Math.round(motion.headlineInSeconds * fps),
    body: Math.round(motion.bodyInSeconds * fps)
  };
  return {
    ...timeline,
    durationInFrames: total,
    tracks: timeline.tracks.map((track) => {
      const requested = roleStart[track.role];
      const startFrame = Math.max(0, Math.min(requested ?? track.startFrame, total - 1));
      return { ...track, startFrame, durationInFrames: Math.max(1, total - startFrame) };
    })
  };
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
    { role: "system", content: "Converta o pedido de edição em tempos de uma timeline. Preserve qualquer valor que não tenha sido alterado pelo pedido." },
    { role: "user", content: `Atual: ${JSON.stringify(current)}\nPedido: ${changeRequest}\nTempos são segundos a partir do início.` }
  ], motionSchema, { thinkingLevel: "high" });
  const nextPayload = { ...payload, artifact: { ...payload.artifact!, videoTimeline: rebuildTimeline(timeline, motion) } };
  const { error: updateError } = await admin.from("content_versions").update({ payload: nextPayload }).eq("id", versionId).eq("project_id", projectId);
  if (updateError) throw updateError;
}
