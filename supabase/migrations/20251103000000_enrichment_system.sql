-- Lead Enrichment System
-- Implements enrichment queue, provider integrations, and enrichment fields on leads

-- ============================================
-- A) Enrichment fields on leads
-- ============================================
alter table public.leads
  add column if not exists linkedin_url text,
  add column if not exists domain text,                 -- company domain
  add column if not exists company_size text,           -- e.g., "11-50"
  add column if not exists industry text,
  add column if not exists location text,
  add column if not exists phone text,
  add column if not exists tech_tags text[],            -- e.g., ['shopify','stripe']
  add column if not exists enrichment_status text
    check (enrichment_status in ('none','queued','processing','done','error'))
    default 'none',
  add column if not exists enrichment_error text,
  add column if not exists last_enriched_at timestamptz;

create index if not exists idx_leads_enrichment_status on public.leads(enrichment_status);

-- ============================================
-- B) Enrichment job queue
-- ============================================
create table if not exists public.enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid null references public.organizations(id) on delete set null,
  campaign_id uuid null references public.campaigns(id) on delete set null,
  lead_id uuid not null references public.leads(id) on delete cascade,

  priority int not null default 5,
  status text not null default 'queued'
    check (status in ('queued','taken','done','error','skipped')),
  attempt int not null default 0,
  provider text null,             -- last tried provider
  error text null,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  taken_at timestamptz null
);

create unique index if not exists uq_enrichment_jobs_lead on public.enrichment_jobs(lead_id) where status in ('queued','taken');
create index if not exists idx_enrich_status on public.enrichment_jobs(status, priority, created_at);
create index if not exists idx_enrich_lead on public.enrichment_jobs(lead_id);

alter table public.enrichment_jobs enable row level security;

-- RLS: user or org member can view their jobs
create policy "enrich.select.member"
on public.enrichment_jobs for select
using (
  user_id = auth.uid()
  or (org_id is not null and public.can_view_org(org_id))
  or (campaign_id is not null and public.can_view_campaign(campaign_id))
);

-- Inserts from server/API only
revoke all on public.enrichment_jobs from anon, authenticated;

-- ============================================
-- C) Integration settings for provider keys
-- ============================================
create table if not exists public.integration_settings (
  id uuid primary key default gen_random_uuid(),
  owner_scope text not null check (owner_scope in ('user','org')),
  owner_id uuid not null,  -- user_id or org_id
  provider text not null check (provider in ('clearbit','peopledatalabs','proxycurl','zerobounce')),
  api_key text not null,   -- stored encrypted via Supabase column encryption if available
  created_at timestamptz default now(),
  unique (owner_scope, owner_id, provider)
);

alter table public.integration_settings enable row level security;

create policy "integrations.select.mine"
on public.integration_settings for select
using (
  (owner_scope='user' and owner_id = auth.uid()) or
  (owner_scope='org' and public.can_view_org(owner_id))
);

create policy "integrations.upsert.mine"
on public.integration_settings
for insert
with check (
  (owner_scope='user' and owner_id = auth.uid()) or
  (owner_scope='org' and public.can_edit_org(owner_id))
);

create policy "integrations.update.mine"
on public.integration_settings
for update
using (
  (owner_scope='user' and owner_id = auth.uid()) or
  (owner_scope='org' and public.can_edit_org(owner_id))
);

create policy "integrations.delete.mine"
on public.integration_settings
for delete
using (
  (owner_scope='user' and owner_id = auth.uid()) or
  (owner_scope='org' and public.can_edit_org(owner_id))
);

-- ============================================
-- D) Helper: enqueue enrichment (service definer)
-- ============================================
create or replace function public.enqueue_enrichment(p_user uuid, p_org uuid, p_campaign uuid, p_lead uuid, p_priority int default 5)
returns void language plpgsql security definer as $$
begin
  -- Only insert if no active job exists for this lead
  if not exists (
    select 1 from public.enrichment_jobs 
    where lead_id = p_lead and status in ('queued','taken')
  ) then
    insert into public.enrichment_jobs (user_id, org_id, campaign_id, lead_id, priority)
    values (p_user, p_org, p_campaign, p_lead, coalesce(p_priority,5));
  end if;

  update public.leads set enrichment_status = 'queued'
  where id = p_lead and coalesce(enrichment_status,'none') in ('none','error');
end;
$$;

revoke all on function public.enqueue_enrichment(uuid,uuid,uuid,uuid,int) from public;
grant execute on function public.enqueue_enrichment(uuid,uuid,uuid,uuid,int) to service_role;

