import { apiAdmin } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderTechnicalStudioPreview } from "@/lib/studio-technical-preview";
import type { StructuredStudioPayload } from "@/lib/studio-artifact";
import type { DriveAsset } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const PREVIEW_BUCKET = "studio-renders";
const FINGERPRINT_RE = /^[a-f0-9]{64}$/;

function playbackUrl(projectId: string, versionId: string, fingerprint: string) {
  return `/api/studio/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/technical-preview?fingerprint=${encodeURIComponent(fingerprint)}`;
}

function parseRange(value: string | null, size: number) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match) return null;
  let start: number;
  let end: number;
  if (!match[1] && match[2]) {
    const suffix = Math.max(1, Number(match[2]));
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1] || 0);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

export async function GET(request: Request, context: { params: Promise<{ projectId: string; versionId: string }> }) {
  if (!(await apiAdmin())) return new Response("Unauthorized", { status: 401 });
  try {
    const { projectId, versionId } = await context.params;
    const fingerprint = new URL(request.url).searchParams.get("fingerprint") ?? "";
    if (!FINGERPRINT_RE.test(fingerprint)) return new Response("Invalid preview fingerprint", { status: 400 });

    const storagePath = `previews/${projectId}/${versionId}/${fingerprint.slice(0, 24)}.mp4`;
    const admin = createAdminClient();
    const downloaded = await admin.storage.from(PREVIEW_BUCKET).download(storagePath);
    if (downloaded.error || !downloaded.data) {
      console.error("[technical-preview] playback download failed", { storagePath, error: downloaded.error?.message });
      return new Response("Preview not found", { status: 404 });
    }

    const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    const range = parseRange(request.headers.get("range"), bytes.byteLength);
    const headers = new Headers({
      "content-type": "video/mp4",
      "content-disposition": "inline",
      "accept-ranges": "bytes",
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff"
    });

    if (request.headers.has("range") && !range) {
      headers.set("content-range", `bytes */${bytes.byteLength}`);
      return new Response(null, { status: 416, headers });
    }
    if (range) {
      const chunk = bytes.slice(range.start, range.end + 1);
      headers.set("content-range", `bytes ${range.start}-${range.end}/${bytes.byteLength}`);
      headers.set("content-length", String(chunk.byteLength));
      return new Response(chunk, { status: 206, headers });
    }

    headers.set("content-length", String(bytes.byteLength));
    return new Response(bytes, { status: 200, headers });
  } catch (error) {
    console.error("[technical-preview] playback failed", error);
    return new Response(String(error), { status: 500 });
  }
}

export async function POST(_: Request, context: { params: Promise<{ projectId: string; versionId: string }> }) {
  if (!(await apiAdmin())) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const { projectId, versionId } = await context.params;
    const admin = createAdminClient();
    const [{ data: project, error: projectError }, { data: version, error: versionError }] = await Promise.all([
      admin.from("content_projects").select("drive_assets").eq("id", projectId).single(),
      admin.from("content_versions").select("payload").eq("id", versionId).eq("project_id", projectId).single()
    ]);
    if (projectError) throw projectError;
    if (versionError) throw versionError;
    const payload = version.payload as StructuredStudioPayload;
    const driveAssets = Array.isArray(project.drive_assets) ? (project.drive_assets as DriveAsset[]) : [];
    const preview = await renderTechnicalStudioPreview({ projectId, versionId, payload, driveAssets });
    return Response.json({
      preview: {
        ...preview,
        playbackUrl: playbackUrl(projectId, versionId, preview.fingerprint)
      }
    });
  } catch (error) {
    console.error("[technical-preview] failed", error);
    return Response.json({ error: String(error) }, { status: 400 });
  }
}
