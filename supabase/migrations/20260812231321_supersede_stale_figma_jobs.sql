create or replace function public.supersede_pending_figma_jobs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.figma_jobs
  set status = 'failed', last_error = 'Superseded by a newer selected version.'
  where project_id = new.project_id and status = 'queued';
  return new;
end;
$$;

revoke execute on function public.supersede_pending_figma_jobs() from public, anon, authenticated;

drop trigger if exists supersede_pending_figma_jobs_before_insert on public.figma_jobs;
create trigger supersede_pending_figma_jobs_before_insert
before insert on public.figma_jobs
for each row execute function public.supersede_pending_figma_jobs();

create unique index if not exists figma_jobs_one_queued_per_project_idx
on public.figma_jobs(project_id)
where status = 'queued';
