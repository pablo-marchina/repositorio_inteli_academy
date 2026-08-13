import { notFound } from "next/navigation";
import { ContentWorkbench } from "@/components/ContentWorkbench";
import { requireAdmin } from "@/lib/auth";
import { studioPayloadSchema } from "@/lib/studio-ai";
import type { StructuredStudioPayload } from "@/lib/studio-artifact";
import type { DriveAsset } from "@/lib/types";

export default async function StudioProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase } = await requireAdmin();
  const { data: project, error: projectError } = await supabase
    .from("content_projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) throw projectError;
  if (!project) notFound();

  const { data: versionRows, error: versionsError } = await supabase
    .from("content_versions")
    .select("id,version_number,parent_version_id,change_request,payload,status,figma_frame_ids,created_at")
    .eq("project_id", projectId)
    .order("version_number", { ascending: false });
  if (versionsError) throw versionsError;

  const articleIds = Array.isArray(project.article_ids) ? project.article_ids.map(String) : [];
  const { data: articles, error: articlesError } = articleIds.length
    ? await supabase.from("articles").select("id,title,source_name,canonical_url").in("id", articleIds)
    : { data: [], error: null };
  if (articlesError) throw articlesError;

  const referenceIds = Array.isArray(project.instagram_reference_media_ids)
    ? project.instagram_reference_media_ids.map((id: unknown) => String(id))
    : project.instagram_reference_media_id ? [String(project.instagram_reference_media_id)] : [];
  const { data: references, error: referencesError } = referenceIds.length
    ? await supabase.from("instagram_reference_posts").select("id,permalink,caption").in("id", referenceIds)
    : { data: [], error: null };
  if (referencesError) throw referencesError;
  const referenceById = new Map((references ?? []).map((reference) => [String(reference.id), reference]));
  const orderedReferences = referenceIds.flatMap((id: string) => {
    const reference = referenceById.get(id);
    return reference ? [reference] : [];
  });

  const versions = (versionRows ?? []).map((row) => ({
    id: String(row.id),
    version_number: Number(row.version_number),
    parent_version_id: row.parent_version_id ? String(row.parent_version_id) : null,
    change_request: String(row.change_request ?? ""),
    payload: studioPayloadSchema.passthrough().parse(row.payload) as StructuredStudioPayload,
    status: String(row.status),
    figma_frame_ids: Array.isArray(row.figma_frame_ids) ? row.figma_frame_ids.map(String) : [],
    created_at: String(row.created_at)
  }));

  const normalizedProject = {
    id: String(project.id),
    name: String(project.name),
    content_type: String(project.content_type),
    status: String(project.status),
    selected_version_id: project.selected_version_id ? String(project.selected_version_id) : null,
    figma_file_key: project.figma_file_key ? String(project.figma_file_key) : null,
    figma_frame_ids: Array.isArray(project.figma_frame_ids) ? project.figma_frame_ids.map(String) : [],
    published_permalink: project.published_permalink ? String(project.published_permalink) : null,
    last_error: project.last_error ? String(project.last_error) : null,
    drive_assets: Array.isArray(project.drive_assets) ? (project.drive_assets as DriveAsset[]) : []
  };

  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">Content Studio</span>
          <h1>{normalizedProject.name}</h1>
          <p>Compare versões estruturadas, refine por linguagem natural, edite no Figma sem perder a identidade e publique somente depois da revisão final.</p>
        </div>
      </header>
      <ContentWorkbench
        project={normalizedProject}
        versions={versions}
        provenance={{
          articles: articles ?? [],
          references: orderedReferences,
          userContext: String(project.user_context ?? "")
        }}
      />
    </>
  );
}
