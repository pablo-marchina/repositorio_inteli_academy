create table public.instagram_reference_posts (
  id text primary key,
  account_id uuid not null references public.instagram_accounts(id) on delete cascade,
  media_type text not null,
  media_product_type text,
  caption text not null default '',
  permalink text not null,
  media_url text,
  thumbnail_url text,
  media_timestamp timestamptz not null,
  children jsonb not null default '[]'::jsonb,
  visual_analysis jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table public.drive_connections (
  id boolean primary key default true check (id),
  google_email text,
  root_folder_id text not null,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  is_active boolean not null default true,
  connected_by uuid references auth.users(id),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_projects (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id),
  name text not null default 'Novo conteúdo',
  content_type text not null check (content_type in ('single','carousel','reel','story')),
  article_ids jsonb not null default '[]'::jsonb,
  user_context text not null default '',
  instagram_reference_media_id text references public.instagram_reference_posts(id) on delete set null,
  use_drive boolean not null default false,
  drive_assets jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','generated','figma_queued','in_figma','approved','publishing','published','failed')),
  selected_version_id uuid,
  figma_file_key text,
  figma_frame_ids jsonb not null default '[]'::jsonb,
  figma_last_synced_at timestamptz,
  published_instagram_media_id text,
  published_permalink text,
  published_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.content_projects(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  parent_version_id uuid references public.content_versions(id) on delete set null,
  change_request text not null default '',
  payload jsonb not null,
  review_report jsonb not null default '{}'::jsonb,
  status text not null default 'generated' check (status in ('generated','selected','figma_queued','in_figma','superseded','published','failed')),
  figma_frame_ids jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (project_id, version_number)
);

alter table public.content_projects
  add constraint content_projects_selected_version_fk
  foreign key (selected_version_id) references public.content_versions(id) on delete set null;

create table public.figma_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.content_projects(id) on delete cascade,
  version_id uuid not null references public.content_versions(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','imported','failed')),
  payload jsonb not null,
  frame_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  imported_at timestamptz,
  last_error text
);

create index instagram_reference_timestamp_idx on public.instagram_reference_posts (account_id, media_timestamp desc);
create index content_projects_status_created_idx on public.content_projects (status, created_at desc);
create index content_versions_project_version_idx on public.content_versions (project_id, version_number desc);
create index figma_jobs_status_created_idx on public.figma_jobs (status, created_at);

create trigger touch_drive_connections before update on public.drive_connections
for each row execute procedure public.touch_updated_at();
create trigger touch_content_projects before update on public.content_projects
for each row execute procedure public.touch_updated_at();

alter table public.instagram_reference_posts enable row level security;
alter table public.drive_connections enable row level security;
alter table public.content_projects enable row level security;
alter table public.content_versions enable row level security;
alter table public.figma_jobs enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'instagram_reference_posts','drive_connections','content_projects','content_versions','figma_jobs'
  ] loop
    execute format('create policy "admins can read %1$s" on public.%1$I for select to authenticated using (true)', table_name);
    execute format('create policy "admins can insert %1$s" on public.%1$I for insert to authenticated with check (true)', table_name);
    execute format('create policy "admins can update %1$s" on public.%1$I for update to authenticated using (true) with check (true)', table_name);
    execute format('create policy "admins can delete %1$s" on public.%1$I for delete to authenticated using (true)', table_name);
  end loop;
end $$;

grant select, insert, update, delete on table public.instagram_reference_posts to authenticated, service_role;
grant select, insert, update, delete on table public.drive_connections to authenticated, service_role;
grant select, insert, update, delete on table public.content_projects to authenticated, service_role;
grant select, insert, update, delete on table public.content_versions to authenticated, service_role;
grant select, insert, update, delete on table public.figma_jobs to authenticated, service_role;
