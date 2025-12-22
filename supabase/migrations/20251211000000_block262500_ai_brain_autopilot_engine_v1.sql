-- BLOCK 262500 — SmartSend AI Advisor, Autopilot Decisions & Self-Optimizing Company v1
-- AI BRAIN & AUTOPILOT ENGINE v1
-- This migration wires the core data structures for:
-- - AI Advisor (always watching)
-- - Decision Recommendation Engine
-- - Autopilot Rules
-- - Self-Optimizing Loops
-- - Early-Warning & Opportunity Detection
-- - AI Daily Briefing & What-To-Fix-First Intelligence

set check_function_bodies = off;

begin;

------------------------------------------------------------
-- 1. ai_recommendations
-- Stores every AI suggestion / decision with context,
-- impact, and explainability so owners can trust the system.
------------------------------------------------------------

create table if not exists public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),

  -- tenant scope
  company_id uuid not null references public.companies(id) on delete cascade,

  -- high-level area the recommendation applies to
  category text not null check (category in (
    'ops',       -- operations / scheduling / production
    'finance',   -- AR / cash flow / margins
    'sales',     -- pipeline / close rate / pricing
    'staffing',  -- crews / hiring / promotion
    'marketing', -- spend / channels / ROI
    'risk',      -- disputes / compliance / legal exposure
    'other'
  )),

  -- short machine-generated title of the move
  title text,

  -- full recommendation in natural language (the "move")
  recommendation text not null,

  -- optional structured payload for downstream automation
  payload jsonb default '{}'::jsonb,

  -- numeric confidence 0–100 (stored as 0–1 for precision)
  confidence numeric(5,4) check (confidence >= 0 and confidence <= 1),

  -- optional estimated impact in company currency / units
  expected_impact numeric,
  expected_impact_unit text, -- e.g. 'usd_monthly_profit', 'jobs_per_day', 'fuel_cost_pct'

  -- lifecycle of the recommendation
  status text not null default 'pending' check (status in (
    'pending',   -- waiting on owner review
    'approved',  -- approved but not yet executed
    'rejected',  -- explicitly declined
    'executed'   -- executed (by autopilot or human)
  )),

  -- explainability: why this matters and what data was used
  explanation text,
  data_used jsonb default '{}'::jsonb, -- snapshot of metrics / features used

  -- source channel (daily_briefing, autopilot, manual_review, etc.)
  source text,

  -- soft links to domain entities (optional, denormalized for speed)
  job_id uuid,
  crew_id uuid,
  campaign_id uuid,

  created_at timestamptz not null default now(),
  decided_at timestamptz, -- when owner approved / rejected
  executed_at timestamptz, -- when action actually happened

  created_by uuid, -- optional: user / system actor that logged this

  constraint ai_recommendations_confidence_not_null_when_executed
    check (
      status <> 'executed' or confidence is not null
    )
);

create index if not exists ai_recommendations_company_status_created_idx
  on public.ai_recommendations (company_id, status, created_at desc);

create index if not exists ai_recommendations_company_category_created_idx
  on public.ai_recommendations (company_id, category, created_at desc);

create index if not exists ai_recommendations_company_job_idx
  on public.ai_recommendations (company_id, job_id)
  where job_id is not null;

------------------------------------------------------------
-- 2. autopilot_rules
-- Owner-approved rules the system can execute without
-- re-asking each time. These are the backbone of
-- "owner stays in control" autopilot.
------------------------------------------------------------

create table if not exists public.autopilot_rules (
  id uuid primary key default gen_random_uuid(),

  -- tenant scope
  company_id uuid not null references public.companies(id) on delete cascade,

  -- human-readable name and description
  name text not null,
  description text,

  -- trigger is a semantic label (evaluated by engine code)
  -- examples: 'ar_ratio_above_threshold', 'margin_below_threshold',
  -- 'crew_score_below_threshold', 'zip_profitability_shift', etc.
  trigger text not null,

  -- structured condition & action blocks (engine-level schema)
  -- convention: { condition: {...}, action: {...}, meta: {...} }
  definition jsonb not null default '{}'::jsonb,

  -- whether the rule is currently active
  enabled boolean not null default false,

  -- owner control + auditability
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- optional safety controls
  max_executions_per_day integer,
  last_executed_at timestamptz,
  execution_count_today integer default 0,

  constraint autopilot_rules_definition_not_empty
    check (definition is not null)
);

create index if not exists autopilot_rules_company_enabled_idx
  on public.autopilot_rules (company_id, enabled);

create index if not exists autopilot_rules_company_trigger_idx
  on public.autopilot_rules (company_id, trigger);

-- simple trigger to keep updated_at fresh
create or replace function public.autopilot_rules_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger autopilot_rules_set_updated_at_trg
before update on public.autopilot_rules
for each row
execute function public.autopilot_rules_set_updated_at();

commit;












