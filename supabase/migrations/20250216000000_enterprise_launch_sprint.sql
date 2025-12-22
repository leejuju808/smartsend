-- Enterprise Launch Sprint Migration
-- Adds seats to subscriptions, creates enterprise metrics view, case studies table, and workflow presets

-- 1) Add seats column to subscriptions table
alter table subscriptions add column if not exists seats int default 1;

-- 2) Create case_studies table for public proof
create table if not exists case_studies (
  id uuid primary key default gen_random_uuid(),
  org_name text not null,
  description text,
  results jsonb,
  logo_url text,
  published boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_case_studies_published on case_studies(published);

-- RLS: public read for published case studies
alter table case_studies enable row level security;

create policy "public can view published case studies"
  on case_studies
  for select
  using (published = true);

-- 3) Create enterprise_metrics view
create or replace view enterprise_metrics as
select
  count(*) filter (where plan_id='enterprise' or plan_id='pro') as active_orgs,
  coalesce(sum(seats), 0) as total_seats,
  coalesce(avg(case 
    when plan_id = 'pro' then 59.0 * coalesce(seats, 1)
    when plan_id = 'enterprise' then 299.0 + (49.0 * coalesce(seats, 1))
    else 0
  end), 0) as avg_org_value
from subscriptions
where status = 'active' and (plan_id = 'enterprise' or plan_id = 'pro');

-- 4) Create workflow_presets table for OpsGrid
create table if not exists workflow_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  stages jsonb not null, -- array of stage names
  automation jsonb, -- automation rules
  created_at timestamptz default now()
);

-- Seed Enterprise Sales Funnel preset
insert into workflow_presets (name, description, stages, automation)
values (
  'Enterprise Sales Funnel',
  'Complete sales pipeline from inbound demo to live deployment',
  '["Inbound Demo", "Technical Eval", "Pilot", "Contract", "Live"]'::jsonb,
  '{"triggers": ["notify-team", "auto-invoice"]}'::jsonb
)
on conflict do nothing;

-- Create workflows table if it doesn't exist (for OpsGrid)
create table if not exists workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  name text not null,
  preset_id uuid references workflow_presets(id),
  status text default 'active',
  created_at timestamptz default now()
);

create index if not exists idx_workflows_workspace on workflows(workspace_id);
create index if not exists idx_workflows_preset on workflows(preset_id);

-- Add comment
comment on view enterprise_metrics is 'Real-time metrics for enterprise and pro subscriptions: active orgs, total seats, avg MRR per org';

