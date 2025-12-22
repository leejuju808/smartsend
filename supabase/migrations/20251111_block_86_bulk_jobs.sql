
-- Enums ----------------------------------------------------------------------
do $$
begin
  create type saved_view_job_type as enum ('export_csv', 'queue_campaign');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type saved_view_job_status as enum ('queued', 'running', 'done', 'failed');
exception
  when duplicate_object then null;
end $$;

-- Saved View Jobs ------------------------------------------------------------
create table if not exists public.saved_view_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  view_id uuid not null references public.saved_views(id) on delete cascade,
  kind saved_view_job_type not null,
  status saved_view_job_status not null default 'queued',
  requested_by uuid references auth.users(id) on delete set null,
  params jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb
);

create index if not exists idx_sv_jobs_account on public.saved_view_jobs(account_id);
create index if not exists idx_sv_jobs_view on public.saved_view_jobs(view_id);

drop trigger if exists trg_saved_view_jobs_set_updated_at on public.saved_view_jobs;
create trigger trg_saved_view_jobs_set_updated_at
before update on public.saved_view_jobs
for each row execute function public.set_updated_at();

-- Campaign Audience ----------------------------------------------------------
create table if not exists public.campaign_audience (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  source text not null default 'saved_view',
  unique (campaign_id, lead_id)
);

create index if not exists idx_campaign_audience_campaign on public.campaign_audience(campaign_id);

-- RPC Helpers ----------------------------------------------------------------
create or replace function public.rpc_view_lead_ids(p_view_id uuid)
returns table(lead_id uuid)
language plpgsql
as $$
declare
  v_view record;
begin
  select id, account_id, filter
  into v_view
  from public.saved_views
  where id = p_view_id;

  if not found then
    return;
  end if;

  return query
  select lead_id
  from public.rpc_lead_ids_for_filter(v_view.account_id, v_view.filter);
end;
$$;

-- RLS Policies ---------------------------------------------------------------
alter table public.saved_view_jobs enable row level security;

drop policy if exists sv_jobs_select on public.saved_view_jobs;
drop policy if exists sv_jobs_manage on public.saved_view_jobs;
drop policy if exists sv_jobs_service on public.saved_view_jobs;

create policy sv_jobs_select
  on public.saved_view_jobs
  for select
  using (
    auth.role() = 'service_role'
    or public.is_account_member(auth.uid(), account_id)
    or exists (
      select 1
      from public.saved_view_memberships m
      where m.view_id = saved_view_jobs.view_id
        and m.user_id = auth.uid()
    )
  );

create policy sv_jobs_manage
  on public.saved_view_jobs
  for insert
  with check (
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.saved_view_memberships m
      where m.view_id = saved_view_jobs.view_id
        and m.user_id = auth.uid()
        and m.role in ('editor', 'owner')
    )
  );

create policy sv_jobs_service
  on public.saved_view_jobs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

alter table public.campaign_audience enable row level security;

drop policy if exists campaign_audience_select on public.campaign_audience;
drop policy if exists campaign_audience_modify on public.campaign_audience;
drop policy if exists campaign_audience_service on public.campaign_audience;

create policy campaign_audience_select
  on public.campaign_audience
  for select
  using (
    auth.role() = 'service_role'
    or public.is_account_member(auth.uid(), account_id)
  );

create policy campaign_audience_modify
  on public.campaign_audience
  for insert
  with check (
    auth.role() = 'service_role'
    or public.is_account_member(auth.uid(), account_id)
  );

create policy campaign_audience_service
  on public.campaign_audience
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Notes ----------------------------------------------------------------------
-- Ensure indexes for leads filtering (company_size, company_industry, company_tech GIN, tags GIN)
-- exist from Block 84 migration before deploying this block.

