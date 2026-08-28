import { z } from "zod";
import { getDriveAsset } from "@/lib/google-drive";
import { createAdminClient } from "@/lib/supabase/admin";
import { studioPayloadSchema } from "@/lib/studio-ai";
import { effectivePostArchetype } from "@/lib/studio-post-archetype";
import type { StructuredStudioPayload } from "@/lib/studio-artifact";
import { clearRenderedReel } from "@/lib/studio-render-types";
import type { StudioBrandContext, StudioPayload } from "@/lib/types";

const brandInputSchema = z.object({
  partnerName: z.string().trim().max(100).default(""),
  partnerLogoAssetId: z.string().trim().max(300).default("")
});

function invalidateBrandDependentArtifacts(payload: StructuredStudioPayload): StructuredStudioPayload {
  const clean = clearRenderedReel(payload) as StructuredStudioPayload;
  if (!clean.artifact) return clean;
  return {
    ...clean,
    artifact: {
      ...clean.artifact,
      figmaVideoLayout: undefined,
      visualBrandReview: undefined,
      renderQa: undefined,
      brandAudit: {
        ...clean.artifact.brandAudit,
        passed: false,
        checks: [
          ...clean.artifact.brandAudit.checks.filter((check) => check.id !== "partner-brand-resolution"),
          {
            id: "partner-brand-resolution",
            label: "Marca parceira precisa ser confirmada no Figma",
            passed: false,
            severity: "warning",
            detail: "A marca parceira foi alterada. Reimporte esta versão no Figma para validar primaryLogo, partnerLogo, layout e clear-space no render real."
          }
        ],
        issues: [
          ...(clean.artifact.brandAudit.issues ?? []).filter((issue) => !/marca parceira foi alterada/i.test(issue)),
          "A marca parceira foi alterada; o Figma e o render final precisam ser atualizados."
        ]
      }
    }
  };
}

function nextBrandContext(input: z.infer<typeof brandInputSchema>): StudioBrandContext {
  if (!input.partnerName) {
    return { primaryBrandName: "Inteli Academy", partnerLogoStatus: "not-required" };
  }
  return {
    primaryBrandName: "Inteli Academy",
    partnerName: input.partnerName,
    ...(input.partnerLogoAssetId ? {
      partnerLogoAssetId: input.partnerLogoAssetId,
      partnerLogoSource: "drive-user-authorized" as const,
      partnerLogoStatus: "ready" as const
    } : { partnerLogoStatus: "missing" as const })
  };
}

export async function updateStudioPartnerBrand(projectId: string, rawInput: unknown, userId: string) {
  const input = brandInputSchema.parse(rawInput);
  if (input.partnerLogoAssetId && !input.partnerName) {
    throw new Error("Informe o nome do parceiro associado à logo selecionada.");
  }
  if (input.partnerLogoAssetId) {
    const logo = await getDriveAsset(input.partnerLogoAssetId);
    if (!logo.mimeType.startsWith("image/")) throw new Error("A logo do parceiro precisa ser uma imagem do Drive.");
  }

  const admin = createAdminClient();
  const [{ data: project, error: projectError }, { data: latest, error: latestError }] = await Promise.all([
    admin.from("content_projects").select("id,name,selected_version_id").eq("id", projectId).single(),
    admin.from("content_versions")
      .select("id,version_number,payload,figma_frame_ids")
      .eq("project_id", projectId)
      .order("version_number", { ascending: false })
      .limit(1)
      .single()
  ]);
  if (projectError) throw projectError;
  if (latestError) throw latestError;

  const parsed = studioPayloadSchema.passthrough().parse(latest.payload) as StructuredStudioPayload;
  const brandContext = nextBrandContext(input);
  const basePayload: StructuredStudioPayload = {
    ...parsed,
    postArchetype: parsed.postArchetype ?? effectivePostArchetype(parsed as StudioPayload),
    brandContext
  };
  const payload = invalidateBrandDependentArtifacts(basePayload);
  const nextVersion = Number(latest.version_number) + 1;
  const changeRequest = input.partnerName
    ? `Marca parceira atualizada: ${input.partnerName}${input.partnerLogoAssetId ? " · logo oficial/autorizada selecionada" : " · logo pendente"}`
    : "Marca parceira removida";

  const { data: version, error: versionError } = await admin.from("content_versions").insert({
    project_id: projectId,
    version_number: nextVersion,
    parent_version_id: latest.id,
    change_request: changeRequest,
    payload,
    status: "generated",
    created_by: userId
  }).select("id,version_number").single();
  if (versionError) throw versionError;

  await admin.from("content_projects").update({
    status: "generated",
    selected_version_id: null,
    figma_frame_ids: [],
    figma_last_synced_at: null,
    last_error: null
  }).eq("id", projectId);

  return {
    projectId: String(project.id),
    versionId: String(version.id),
    versionNumber: Number(version.version_number),
    brandContext
  };
}
