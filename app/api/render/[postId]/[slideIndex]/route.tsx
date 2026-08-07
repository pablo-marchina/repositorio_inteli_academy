import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPublicAsset } from "@/lib/crypto";
import { renderInstagramHistoricalSlide } from "@/lib/instagram-historical-renderer";
import { slideFromRow } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ postId: string; slideIndex: string }> }) {
  const { postId, slideIndex } = await context.params;
  const position = Number(slideIndex);
  const signature = new URL(request.url).searchParams.get("sig") ?? "";
  if (!Number.isInteger(position) || !verifyPublicAsset(`${postId}:${position}`, signature)) {
    return Response.json({ error: "Assinatura inválida." }, { status: 403 });
  }

  const admin = createAdminClient();
  const [{ data: slide, error }, { count }] = await Promise.all([
    admin.from("post_slides").select("content").eq("post_id", postId).eq("position", position).single(),
    admin.from("post_slides").select("id", { count: "exact", head: true }).eq("post_id", postId)
  ]);
  if (error || !slide) return Response.json({ error: "Slide não encontrado." }, { status: 404 });

  return new ImageResponse(renderInstagramHistoricalSlide(slideFromRow(slide.content), count ?? 1), {
    width: 1080,
    height: 1350,
    headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" }
  });
}
