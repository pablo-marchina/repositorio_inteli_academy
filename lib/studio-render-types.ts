import type { StudioArtifact, StudioBrandReport, StructuredStudioPayload } from "@/lib/studio-artifact";

export type StudioRenderedReel = {
  storagePath: string;
  publicUrl: string;
  renderedAt: string;
  sha256: string;
  byteSize: number;
  durationSeconds: number;
  figmaVersion: string | null;
};

export type RenderedStudioArtifact = StudioArtifact & { renderedReel?: StudioRenderedReel };
export type RenderedStudioPayload = Omit<StructuredStudioPayload, "artifact"> & { artifact?: RenderedStudioArtifact };

export function asRenderedStudioPayload(payload: StructuredStudioPayload): RenderedStudioPayload {
  return payload as RenderedStudioPayload;
}

export function withRenderedReel(payload: StructuredStudioPayload, renderedReel: StudioRenderedReel, renderQa: StudioBrandReport): RenderedStudioPayload {
  return { ...payload, artifact: { ...payload.artifact!, renderedReel, renderQa } } as RenderedStudioPayload;
}

export function clearRenderedReel(payload: StructuredStudioPayload): RenderedStudioPayload {
  const current = asRenderedStudioPayload(payload);
  if (!current.artifact) return current;
  const { renderedReel: _renderedReel, ...artifact } = current.artifact;
  return { ...current, artifact: { ...artifact, renderQa: undefined } };
}
