-- Block 254300 — SmartSend Sales Acceleration Engine v1
-- Database schema for AI Estimator, Instant Quotes, Lead Scoring, Sales Rep Tracking, Proposal Auto-Builder

-- ============================================================================
-- 1. SALES REPS TABLE
-- ============================================================================

create table if not exists public.sales_reps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_sales_reps_org on public.sales_reps(org_id);
create index if not exists idx_sales_reps_active on public.sales_reps(org_id, is_active) where is_active = true;

-- ============================================================================
-- 2. ENHANCE LEADS TABLE (add sales-specific fields if not exist)
-- ============================================================================

-- Add sales-specific columns to leads table if they don't exist
do $$
begin
  -- Lead score
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'lead_score') then
    alter table public.leads add column lead_score int default 0;
  end if;
  
  -- Lead source
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'lead_source') then
    alter table public.leads add column lead_source text;
  end if;
  
  -- Assigned sales rep
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'assigned_to') then
    alter table public.leads add column assigned_to uuid references public.sales_reps(id) on delete set null;
  end if;
  
  -- Sales status (extends existing status)
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'sales_status') then
    alter table public.leads add column sales_status text default 'new' check (sales_status in ('new', 'contacted', 'estimating', 'quoted', 'follow_up_needed', 'won', 'lost'));
  end if;
  
  -- Customer name (if not exists)
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'customer_name') then
    alter table public.leads add column customer_name text;
  end if;
  
  -- Address (if not exists)
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'address') then
    alter table public.leads add column address text;
  end if;
end $$;

-- Indexes for sales queries
create index if not exists idx_leads_sales_status on public.leads(sales_status) where sales_status is not null;
create index if not exists idx_leads_assigned_to on public.leads(assigned_to) where assigned_to is not null;
create index if not exists idx_leads_lead_score on public.leads(lead_score desc) where lead_score is not null;
create index if not exists idx_leads_lead_source on public.leads(lead_source) where lead_source is not null;

-- ============================================================================
-- 3. ESTIMATES TABLE
-- ============================================================================

create table if not exists public.estimates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  job_type text not null, -- 'roof_replacement', 'roof_repair', 'storm_damage', etc.
  squares numeric not null,
  pitch text, -- e.g., '6/12', '8/12'
  layers int default 1,
  material_system text, -- 'architectural_shingle', 'metal', 'tile', etc.
  region text,
  price numeric not null,
  breakdown jsonb default '{}'::jsonb, -- { material_cost, labor_cost, overhead, margin, line_items }
  created_by uuid references public.sales_reps(id) on delete set null,
  validation_warnings jsonb default '[]'::jsonb, -- AI validation warnings
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_estimates_org on public.estimates(org_id);
create index if not exists idx_estimates_lead on public.estimates(lead_id) where lead_id is not null;
create index if not exists idx_estimates_created_by on public.estimates(created_by) where created_by is not null;
create index if not exists idx_estimates_created_at on public.estimates(created_at desc);

-- ============================================================================
-- 4. PROPOSALS TABLE
-- ============================================================================

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  estimate_id uuid references public.estimates(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  pdf_url text,
  pdf_path text, -- Storage path
  sent boolean default false,
  sent_at timestamptz,
  sent_to_email text,
  viewed_at timestamptz,
  signed boolean default false,
  signed_at timestamptz,
  metadata jsonb default '{}'::jsonb, -- Additional proposal data
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_proposals_org on public.proposals(org_id);
create index if not exists idx_proposals_estimate on public.proposals(estimate_id) where estimate_id is not null;
create index if not exists idx_proposals_lead on public.proposals(lead_id) where lead_id is not null;
create index if not exists idx_proposals_sent on public.proposals(sent, sent_at desc);

-- ============================================================================
-- 5. SALES FOLLOW-UP AUTOMATION TABLE
-- ============================================================================

create table if not exists public.sales_followups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  sequence_step int not null default 1, -- 1, 2, 3...
  day_offset int not null, -- Days after last contact
  scheduled_for timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'skipped', 'cancelled')),
  subject text,
  body_text text,
  body_html text,
  sent_at timestamptz,
  skipped_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_sales_followups_org on public.sales_followups(org_id);
create index if not exists idx_sales_followups_lead on public.sales_followups(lead_id);
create index if not exists idx_sales_followups_scheduled on public.sales_followups(scheduled_for, status) where status = 'scheduled';

-- ============================================================================
-- 6. SALES ACTIVITY LOG TABLE
-- ============================================================================

create table if not exists public.sales_activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  rep_id uuid references public.sales_reps(id) on delete set null,
  activity_type text not null check (activity_type in ('call', 'email', 'meeting', 'estimate_created', 'proposal_sent', 'status_changed', 'note')),
  description text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_sales_activities_org on public.sales_activities(org_id);
create index if not exists idx_sales_activities_lead on public.sales_activities(lead_id) where lead_id is not null;
create index if not exists idx_sales_activities_rep on public.sales_activities(rep_id) where rep_id is not null;
create index if not exists idx_sales_activities_created_at on public.sales_activities(created_at desc);

-- ============================================================================
-- 7. TRIGGERS FOR UPDATED_AT
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_sales_reps_updated_at on public.sales_reps;
create trigger trg_sales_reps_updated_at
before update on public.sales_reps
for each row execute function public.set_updated_at();

drop trigger if exists trg_estimates_updated_at on public.estimates;
create trigger trg_estimates_updated_at
before update on public.estimates
for each row execute function public.set_updated_at();

drop trigger if exists trg_proposals_updated_at on public.proposals;
create trigger trg_proposals_updated_at
before update on public.proposals
for each row execute function public.set_updated_at();

drop trigger if exists trg_sales_followups_updated_at on public.sales_followups;
create trigger trg_sales_followups_updated_at
before update on public.sales_followups
for each row execute function public.set_updated_at();

-- ============================================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================================

alter table public.sales_reps enable row level security;
alter table public.estimates enable row level security;
alter table public.proposals enable row level security;
alter table public.sales_followups enable row level security;
alter table public.sales_activities enable row level security;

-- Helper function for org membership check
create or replace function public.is_org_member(check_org uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from public.org_memberships
    where org_id = check_org and user_id = auth.uid() and status = 'active'
  );
$$;

-- Sales Reps policies
drop policy if exists "sales_reps_read_org_members" on public.sales_reps;
create policy "sales_reps_read_org_members" on public.sales_reps
  for select using (is_org_member(org_id));

drop policy if exists "sales_reps_write_org_members" on public.sales_reps;
create policy "sales_reps_write_org_members" on public.sales_reps
  for all using (is_org_member(org_id));

-- Estimates policies
drop policy if exists "estimates_read_org_members" on public.estimates;
create policy "estimates_read_org_members" on public.estimates
  for select using (is_org_member(org_id));

drop policy if exists "estimates_write_org_members" on public.estimates;
create policy "estimates_write_org_members" on public.estimates
  for all using (is_org_member(org_id));

-- Proposals policies
drop policy if exists "proposals_read_org_members" on public.proposals;
create policy "proposals_read_org_members" on public.proposals
  for select using (is_org_member(org_id));

drop policy if exists "proposals_write_org_members" on public.proposals;
create policy "proposals_write_org_members" on public.proposals
  for all using (is_org_member(org_id));

-- Sales Followups policies
drop policy if exists "sales_followups_read_org_members" on public.sales_followups;
create policy "sales_followups_read_org_members" on public.sales_followups
  for select using (is_org_member(org_id));

drop policy if exists "sales_followups_write_org_members" on public.sales_followups;
create policy "sales_followups_write_org_members" on public.sales_followups
  for all using (is_org_member(org_id));

-- Sales Activities policies
drop policy if exists "sales_activities_read_org_members" on public.sales_activities;
create policy "sales_activities_read_org_members" on public.sales_activities
  for select using (is_org_member(org_id));

drop policy if exists "sales_activities_write_org_members" on public.sales_activities;
create policy "sales_activities_write_org_members" on public.sales_activities
  for all using (is_org_member(org_id));

-- ============================================================================
-- 9. VIEWS FOR SALES PIPELINE DASHBOARD
-- ============================================================================

-- Sales Pipeline Summary View
create or replace view public.v_sales_pipeline_summary as
select
  l.org_id,
  count(*) filter (where l.sales_status = 'new') as new_leads,
  count(*) filter (where l.sales_status = 'contacted') as contacted_leads,
  count(*) filter (where l.sales_status = 'estimating') as estimating_leads,
  count(*) filter (where l.sales_status = 'quoted') as quoted_leads,
  count(*) filter (where l.sales_status = 'follow_up_needed') as follow_up_needed,
  count(*) filter (where l.sales_status = 'won') as won_leads,
  count(*) filter (where l.sales_status = 'lost') as lost_leads,
  count(*) as total_leads,
  count(*) filter (where l.sales_status in ('quoted', 'follow_up_needed', 'won')) as in_pipeline,
  count(p.id) filter (where p.sent = true) as proposals_sent,
  coalesce(sum(e.price) filter (where l.sales_status = 'won'), 0) as projected_revenue,
  round(
    (count(*) filter (where l.sales_status = 'won')::numeric / 
     nullif(count(*) filter (where l.sales_status in ('contacted', 'estimating', 'quoted', 'follow_up_needed', 'won', 'lost')), 0)
    ) * 100, 
    1
  ) as close_rate_percent
from public.leads l
left join public.proposals p on p.lead_id = l.id
left join public.estimates e on e.lead_id = l.id and l.sales_status = 'won'
where l.org_id is not null
group by l.org_id;

-- Sales Rep Performance View
create or replace view public.v_sales_rep_performance as
select
  sr.org_id,
  sr.id as rep_id,
  sr.name as rep_name,
  count(distinct l.id) as total_leads,
  count(distinct l.id) filter (where l.assigned_to = sr.id and l.sales_status != 'new') as leads_worked,
  count(distinct e.id) as estimates_created,
  count(distinct p.id) filter (where p.sent = true) as proposals_sent,
  round(avg(
    extract(epoch from (e.created_at - l.created_at)) / 3600
  ) filter (where e.id is not null), 1) as avg_quote_speed_hours,
  round(
    (count(*) filter (where l.sales_status = 'won' and l.assigned_to = sr.id)::numeric / 
     nullif(count(*) filter (where l.assigned_to = sr.id and l.sales_status in ('contacted', 'estimating', 'quoted', 'follow_up_needed', 'won', 'lost')), 0)
    ) * 100, 
    1
  ) as close_rate_percent,
  coalesce(sum(e.price) filter (where l.sales_status = 'won' and l.assigned_to = sr.id), 0) as revenue_closed,
  count(*) filter (where l.sales_status = 'won' and l.assigned_to = sr.id) as jobs_won,
  round(
    coalesce(sum(e.price) filter (where l.sales_status = 'won' and l.assigned_to = sr.id), 0) / 
    nullif(count(*) filter (where l.sales_status = 'won' and l.assigned_to = sr.id), 0), 
    0
  ) as avg_deal_size
from public.sales_reps sr
left join public.leads l on l.assigned_to = sr.id
left join public.estimates e on e.lead_id = l.id and e.created_by = sr.id
left join public.proposals p on p.lead_id = l.id
where sr.is_active = true
group by sr.org_id, sr.id, sr.name;






















