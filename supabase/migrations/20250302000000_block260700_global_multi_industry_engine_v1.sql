-- Block 260700 — SmartSend Global Expansion & Multi-Industry Engine v1
-- Multi-trade industries, localization, expansion readiness

-- ============================================================================
-- 1. INDUSTRIES & COMPANY-INDUSTRY MAPPINGS
-- ============================================================================

-- 1.1 industries
-- Canonical list of high-ticket service industries SmartSend supports.
create table if not exists public.industries (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,           -- 'roofing', 'gutters', 'solar', 'hvac', 'plumbing', etc.
  default_settings jsonb default '{}'::jsonb,
  is_roofing_master boolean not null default false, -- roofing is the canonical baseline
  created_at timestamptz not null default now()
);

-- 1.2 company_industries
-- Maps companies to one or more industries (multi-trade support).
create table if not exists public.company_industries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  industry_id uuid not null references public.industries(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  constraint company_industries_unique_company_industry unique (company_id, industry_id)
);

create index if not exists idx_company_industries_company_id
  on public.company_industries(company_id);

create index if not exists idx_company_industries_industry_id
  on public.company_industries(industry_id);

-- ============================================================================
-- 2. LOCALIZATION & COMPLIANCE PROFILES
-- ============================================================================

-- 2.1 localization_profiles
-- Region + (optional) trade-specific localization: codes, compliance, language, currency.
create table if not exists public.localization_profiles (
  id uuid primary key default gen_random_uuid(),
  industry_id uuid references public.industries(id) on delete set null, -- null = applies across trades
  region text not null,                      -- e.g. 'TX', 'WA', 'CA', 'UK', 'AU'
  building_codes jsonb default '{}'::jsonb,  -- local building / install code variants
  compliance_rules jsonb default '{}'::jsonb, -- OSHA, electrical, mechanical, licensing per trade
  language text,                             -- 'en', 'es', etc.
  currency text,                             -- 'USD', 'CAD', 'GBP', 'AUD', etc.
  created_at timestamptz not null default now()
);

create index if not exists idx_localization_profiles_region
  on public.localization_profiles(region);

create index if not exists idx_localization_profiles_industry_region
  on public.localization_profiles(industry_id, region);

-- ============================================================================
-- 3. INTEGRATION WITH COMPANIES / JOBS (MULTI-TRADE & WORKFLOW SWITCHING)
-- ============================================================================

-- 3.1 companies: primary industry + default localization profile
alter table public.companies
  add column if not exists primary_industry_id uuid references public.industries(id) on delete set null,
  add column if not exists default_localization_profile_id uuid references public.localization_profiles(id) on delete set null;

-- 3.2 leads: optional industry tag (which trade this lead is for)
alter table public.leads
  add column if not exists industry_id uuid references public.industries(id) on delete set null;

-- 3.3 jobs: industry awareness for trade-specific workflows
alter table public.jobs
  add column if not exists industry_id uuid references public.industries(id) on delete set null;

create index if not exists idx_jobs_industry_id
  on public.jobs(industry_id);

-- ============================================================================
-- 4. EXPANSION READINESS SCORE (WHEN TO ADD NEW TRADES)
-- ============================================================================

create table if not exists public.expansion_readiness_scores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  score int not null check (score >= 0 and score <= 100), -- 0–100 readiness score
  factors jsonb default '{}'::jsonb,                      -- crew_stability, cash_flow, qa_control, etc.
  recommended_next_industry_id uuid references public.industries(id) on delete set null,
  recommendation_text text,                               -- human-readable recommendation summary
  created_at timestamptz not null default now()
);

create index if not exists idx_expansion_readiness_company_created_at
  on public.expansion_readiness_scores(company_id, created_at desc);

-- ============================================================================
-- 5. RLS CONFIGURATION
-- ============================================================================

-- industries: global catalog, managed by backend
alter table public.industries enable row level security;

create policy if not exists "industries_service_role_all" on public.industries
  for all to service_role
  using (true) with check (true);

create policy if not exists "industries_select_authenticated" on public.industries
  for select to authenticated
  using (true);

-- company_industries: scoped by company workspace membership, managed mainly by backend
alter table public.company_industries enable row level security;

create policy if not exists "company_industries_service_role_all" on public.company_industries
  for all to service_role
  using (true) with check (true);

create policy if not exists "company_industries_select_workspace_members" on public.company_industries
  for select to authenticated
  using (
    exists (
      select 1
      from public.companies c
      join public.team_members tm on tm.workspace_id = c.workspace_id
      where c.id = company_industries.company_id
        and tm.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.companies c
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where c.id = company_industries.company_id
        and wm.user_id = auth.uid()
    )
  );

-- localization_profiles: read-mostly catalog, backend-managed
alter table public.localization_profiles enable row level security;

create policy if not exists "localization_profiles_service_role_all" on public.localization_profiles
  for all to service_role
  using (true) with check (true);

create policy if not exists "localization_profiles_select_authenticated" on public.localization_profiles
  for select to authenticated
  using (true);

-- expansion_readiness_scores: per-company, backend-calculated
alter table public.expansion_readiness_scores enable row level security;

create policy if not exists "expansion_readiness_scores_service_role_all" on public.expansion_readiness_scores
  for all to service_role
  using (true) with check (true);

create policy if not exists "expansion_readiness_scores_select_workspace_members" on public.expansion_readiness_scores
  for select to authenticated
  using (
    exists (
      select 1
      from public.companies c
      join public.team_members tm on tm.workspace_id = c.workspace_id
      where c.id = expansion_readiness_scores.company_id
        and tm.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.companies c
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where c.id = expansion_readiness_scores.company_id
        and wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 6. SEEDING & BACKFILL: "ROOFING FIRST" PROTECTION LAYER
-- ============================================================================

-- 6.1 Seed core industries (roofing as canonical master)
insert into public.industries (name, default_settings, is_roofing_master)
values
  ('roofing', '{"roofing_first": true}'::jsonb, true),
  ('gutters', '{}'::jsonb, false),
  ('siding', '{}'::jsonb, false),
  ('solar', '{}'::jsonb, false),
  ('hvac', '{}'::jsonb, false),
  ('plumbing', '{}'::jsonb, false)
on conflict (name) do update
  set is_roofing_master = excluded.is_roofing_master;

-- 6.2 Attach all existing companies to roofing as their primary trade (if not set)
insert into public.company_industries (company_id, industry_id, is_primary)
select c.id, i.id, true
from public.companies c
cross join public.industries i
left join public.company_industries ci
  on ci.company_id = c.id and ci.industry_id = i.id
where i.name = 'roofing'
  and ci.id is null;

update public.companies c
set primary_industry_id = i.id
from public.industries i
where i.name = 'roofing'
  and c.primary_industry_id is null;

-- 6.3 Default existing leads and jobs to roofing where trade is unknown
update public.leads l
set industry_id = i.id
from public.industries i
where i.name = 'roofing'
  and l.industry_id is null;

update public.jobs j
set industry_id = i.id
from public.industries i
where i.name = 'roofing'
  and j.industry_id is null;

-- ============================================================================
-- 7. COMMENTS
-- ============================================================================

comment on table public.industries is 'Block 260700: Canonical list of high-ticket service industries (roofing as master baseline) used for multi-trade templates, workflows, and reporting.';
comment on table public.company_industries is 'Block 260700: Mapping table that allows a single company to operate in multiple trades (roofing, gutters, siding, solar, HVAC, etc.).';
comment on table public.localization_profiles is 'Block 260700: Region- and trade-aware localization profiles (building codes, compliance rules, language, currency).';
comment on table public.expansion_readiness_scores is 'Block 260700: Per-company expansion readiness score with factor breakdown and recommended next trade.';












