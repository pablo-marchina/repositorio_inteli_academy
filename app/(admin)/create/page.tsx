import { ContentStudio } from "@/components/ContentStudio";
import { requireAdmin } from "@/lib/auth";

export default async function CreateContentPage() {
  const { supabase } = await requireAdmin();
  const [articles, references, drive] = await Promise.all([
    supabase.from("articles").select("id,title,summary,source_name,published_at").order("published_at", { ascending: false }).limit(160),
    supabase.from("instagram_reference_posts").select("id,media_type,media_product_type,caption,permalink,media_url,thumbnail_url,media_timestamp").order("media_timestamp", { ascending: false }).limit(80),
    supabase.from("drive_connections").select("is_active").eq("id", true).maybeSingle()
  ]);

  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">Content Studio</span>
          <h1>Criar publicação</h1>
          <p>Escolha o formato, as evidências, uma referência real do Instagram e as mídias autorizadas. Depois da V1 você poderá gerar quantas variações quiser antes de mandar uma única versão ao Figma.</p>
        </div>
      </header>
      <ContentStudio
        articles={articles.data ?? []}
        initialReferences={references.data ?? []}
        driveConnected={Boolean(drive.data?.is_active)}
      />
    </>
  );
}
