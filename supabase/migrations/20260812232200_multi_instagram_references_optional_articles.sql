alter table public.content_projects
  add column if not exists instagram_reference_media_ids jsonb not null default '[]'::jsonb;

update public.content_projects
set instagram_reference_media_ids = case
  when instagram_reference_media_id is not null then jsonb_build_array(instagram_reference_media_id)
  else '[]'::jsonb
end
where instagram_reference_media_ids = '[]'::jsonb;

alter table public.content_projects
  drop constraint if exists content_projects_instagram_reference_media_ids_check;

alter table public.content_projects
  add constraint content_projects_instagram_reference_media_ids_check
  check (
    jsonb_typeof(instagram_reference_media_ids) = 'array'
    and jsonb_array_length(instagram_reference_media_ids) <= 8
  );
