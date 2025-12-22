-- Lead enrichment system (tables, policies, helpers, triggers, views)

-- A) Cache table for normalized enrichment per lead (latest snapshot)
create table if not exists public.lead_enrichments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lead_id uuid not null references public.leads(id) on delete cascade,

  -- identity
  email text,
  first_name text,
  last_name text,
  title text,
  seniority text,
  linkedin_url text,

  -- company
  company_name text,
  company_domain text,
  company_website text,
  company_size text,
  company_employee_count int,
  industry text,
  location text,
  country text,

  -- tech stack / signals
  tech_tags text[] not null default '{}',
  social_tags text[] not null default '{}',
  extras jsonb not null default '{}'::jsonb,

  -- provenance
  vendor text,
  vendor_confidence real,
  vendor_meta jsonb not null default '{}'::jsonb,

  -- freshness
  last_refreshed_at timestamptz,
  refresh_after timestamptz,
  is_stale boolean generated always as (now() >= coalesce(refresh_after, now())) stored,

  unique (lead_id)
);

create index if not exists idx_lead_enrichments_stale on public.lead_enrichments(is_stale);

-- helper trigger to maintain updated_at
create or replace function public.trg_set_timestamp()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists set_timestamp on public.lead_enrichments;
create trigger set_timestamp
before update on public.lead_enrichments
for each row execute function public.trg_set_timestamp();


-- B) Job queue table
create table if not exists public.lead_enrichment_jobs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  picked_at timestamptz,
  finished_at timestamptz,
  account_id uuid not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  priority int not null default 100,
  attempt int not null default 0,
  max_attempts int not null default 5,
  reason text not null default 'auto',
  force boolean not null default false,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  error text
);

create index if not exists idx_lead_enrichment_jobs_status_priority on public.lead_enrichment_jobs(status, priority, created_at);
create index if not exists idx_lead_enrichment_jobs_account on public.lead_enrichment_jobs(account_id);


-- C) Enable RLS
alter table public.lead_enrichments enable row level security;
alter table public.lead_enrichment_jobs enable row level security;


-- lead_enrichments RLS: mirror parent lead ownership
do $$
begin
  create policy if not exists lead_enrichments_select
  on public.lead_enrichments
  for select
  using (
    exists (
      select 1
      from public.leads l
      where l.id = lead_id
        and l.account_id = auth.uid()
    )
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy if not exists lead_enrichments_insert
  on public.lead_enrichments
  for insert
  with check (
    exists (
      select 1
      from public.leads l
      where l.id = lead_id
        and l.account_id = auth.uid()
    )
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy if not exists lead_enrichments_update
  on public.lead_enrichments
  for update
  using (
    exists (
      select 1
      from public.leads l
      where l.id = lead_id
        and l.account_id = auth.uid()
    )
  );
exception
  when duplicate_object then null;
end $$;


-- jobs RLS: users can view/insert for own account; service role bypasses RLS
do $$
begin
  create policy if not exists lead_enrichment_jobs_select
  on public.lead_enrichment_jobs
  for select
  using (account_id = auth.uid());
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy if not exists lead_enrichment_jobs_insert
  on public.lead_enrichment_jobs
  for insert
  with check (account_id = auth.uid());
exception
  when duplicate_object then null;
end $$;


-- D) Helper function to enqueue jobs for a lead
create or replace function public.enqueue_lead_enrichment(
  p_lead_id uuid,
  p_reason text default 'auto',
  p_force boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
  v_exists boolean;
begin
  select account_id
    into v_account
  from public.leads
  where id = p_lead_id;

  if v_account is null then
    return;
  end if;

  select exists (
    select 1
    from public.lead_enrichment_jobs
    where lead_id = p_lead_id
      and status in ('queued', 'running')
  )
  into v_exists;

  if not v_exists or p_force then
    insert into public.lead_enrichment_jobs (account_id, lead_id, priority, reason, force)
    values (
      v_account,
      p_lead_id,
      case when p_reason = 'manual' then 10 else 100 end,
      p_reason,
      p_force
    );
  end if;
end $$;


-- E) Trigger to enqueue jobs on new leads or identity changes
create or replace function public.trg_leads_enqueue_enrichment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT')
     or (tg_op = 'UPDATE'
         and (
           coalesce(new.email, '') <> coalesce(old.email, '')
           or coalesce(new.company_domain, '') <> coalesce(old.company_domain, '')
         )
     ) then
    perform public.enqueue_lead_enrichment(new.id, 'auto', false);
  end if;

  return new;
end $$;

drop trigger if exists leads_enqueue_enrichment on public.leads;
create trigger leads_enqueue_enrichment
after insert or update of email, company_domain on public.leads
for each row execute function public.trg_leads_enqueue_enrichment();


-- F) RPC for picking jobs fairly and locking them for processing
create or replace function public.pick_enrichment_jobs(
  p_limit int default 25,
  p_hold_minutes int default 10
)
returns setof public.lead_enrichment_jobs
language sql
security definer
set search_path = public
as $$
  with picked as (
    select id
    from public.lead_enrichment_jobs
    where status = 'queued'
    order by priority asc, created_at asc
    limit greatest(p_limit, 0)
    for update skip locked
  )
  update public.lead_enrichment_jobs j
     set picked_at = now(),
         status = 'running'
   where j.id in (select id from picked)
  returning *;
$$;


-- G) Nightly helper to enqueue stale or missing enrichments
create or replace function public.enqueue_stale_enrichments(
  p_account_id uuid default null,
  p_limit int default 500
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.lead_enrichment_jobs (account_id, lead_id, priority, reason)
  select l.account_id,
         l.id,
         80,
         'nightly'
  from public.leads l
  left join public.lead_enrichments le on le.lead_id = l.id
  where (p_account_id is null or l.account_id = p_account_id)
    and (le.lead_id is null or le.is_stale)
    and not exists (
      select 1
      from public.lead_enrichment_jobs j
      where j.lead_id = l.id
        and j.status in ('queued', 'running')
    )
  order by coalesce(le.updated_at, timestamp '1970-01-01') asc
  limit greatest(p_limit, 0);

  get diagnostics v_count = row_count;
  return v_count;
end $$;


-- H) View for UI consumption
create or replace view public.v_lead_enrichment as
select
  l.id as lead_id,
  le.updated_at,
  le.title,
  le.seniority,
  le.linkedin_url,
  le.company_name,
  le.company_domain,
  le.company_website,
  le.company_size,
  le.industry,
  coalesce(array_slice(le.tech_tags, 1, 15), '{}') as tech_tags,
  le.vendor,
  le.vendor_confidence,
  le.last_refreshed_at,
  le.refresh_after,
  le.is_stale
from public.leads l
left join public.lead_enrichments le
  on le.lead_id = l.id;

