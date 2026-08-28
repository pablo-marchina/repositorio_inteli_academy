import { apiAdmin } from "@/lib/api-auth";
import { createStudioProject, syncInstagramReferences } from "@/lib/studio";
import { updateStudioPartnerBrand } from "@/lib/studio-brand-assets";

export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await apiAdmin();
  if (!auth) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    // Real @inteli.academy history is a required generation reference, not an optional fallback.
    await syncInstagramReferences();
    const raw = await request.json() as Record<string, unknown>;
    const result = await createStudioProject(raw, auth.user.id);
    const partnerName = typeof raw.partnerName === "string" ? raw.partnerName.trim() : "";
    const partnerLogoAssetId = typeof raw.partnerLogoAssetId === "string" ? raw.partnerLogoAssetId.trim() : "";
    if (partnerName || partnerLogoAssetId) {
      const branded = await updateStudioPartnerBrand(result.projectId, { partnerName, partnerLogoAssetId }, auth.user.id);
      return Response.json({ result: { ...result, versionId: branded.versionId, versionNumber: branded.versionNumber, brandContext: branded.brandContext } });
    }
    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
