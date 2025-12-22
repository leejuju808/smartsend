-- Block 461 — Account-Level AI Advisor (Workspace Brain v1)
-- Global Insights • Alerts • Audits • Recommendations • Cross-Campaign Intelligence
-- This creates the workspace-level intelligence layer that watches everything across the account

-- ============================================================================
-- 1️⃣ AI Advisor Insights Table
-- ============================================================================

create table if not exists public.ai_advisor_insights (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  
  -- Insight details
  insight_type text not null check (insight_type in (
    'deliverability',
    'sequence_performance',
    'revenue',
    'icp_drift',
    'sdr_coaching',
    'warmup_reputation',
    'multi_channel',
    'risk_alert'
  )),
  category text not null check (category in (
    'deliverability',
    'sequence',
    'revenue',
    'icp',
    'sdr',
    'warmup',
    'multi_channel',
    'risk'
  )),
  title text not null,
  description text not null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  
  -- Context and data
  context jsonb default '{}'::jsonb, -- Stores relevant IDs, metrics, etc.
  metrics jsonb default '{}'::jsonb, -- Stores performance metrics
  
  -- Status
  status text not null default 'active' check (status in ('active', 'acknowledged', 'resolved', 'dismissed')),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  
  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_advisor_insights_workspace on public.ai_advisor_insights(workspace_id);
create index if not exists idx_ai_advisor_insights_type on public.ai_advisor_insights(insight_type);
create index if not exists idx_ai_advisor_insights_status on public.ai_advisor_insights(status);
create index if not exists idx_ai_advisor_insights_priority on public.ai_advisor_insights(priority);
create index if not exists idx_ai_advisor_insights_created on public.ai_advisor_insights(created_at desc);

-- ============================================================================
-- 2️⃣ AI Advisor Recommendations (Next Best Actions)
-- ============================================================================

create table if not exists public.ai_advisor_recommendations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  
  -- Recommendation details
  action_type text not null check (action_type in (
    'rewrite_step',
    'disable_variant',
    'switch_inbox',
    'increase_warmup',
    'create_sequence',
    'assign_leads',
    'throttle_domain',
    'fix_dns',
    'pause_campaign',
    'optimize_timing',
    'other'
  )),
  title text not null,
  description text not null,
  priority_score int not null default 50 check (priority_score >= 0 and priority_score <= 100),
  
  -- Action context
  action_context jsonb default '{}'::jsonb, -- e.g., {"step_id": "...", "sequence_id": "..."}
  estimated_impact jsonb default '{}'::jsonb, -- e.g., {"metric": "reply_rate", "expected_change": "+3%"}
  
  -- Status
  status text not null default 'pending' check (status in ('pending', 'applied', 'dismissed', 'scheduled')),
  applied_at timestamptz,
  applied_by uuid references public.profiles(id) on delete set null,
  
  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_advisor_recommendations_workspace on public.ai_advisor_recommendations(workspace_id);
create index if not exists idx_ai_advisor_recommendations_status on public.ai_advisor_recommendations(status);
create index if not exists idx_ai_advisor_recommendations_priority on public.ai_advisor_recommendations(priority_score desc);
create index if not exists idx_ai_advisor_recommendations_created on public.ai_advisor_recommendations(created_at desc);

-- ============================================================================
-- 3️⃣ AI Advisor Alerts (In-App Notifications)
-- ============================================================================

create table if not exists public.ai_advisor_alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  
  -- Alert details
  alert_type text not null check (alert_type in (
    'deliverability_warning',
    'hot_icp_spike',
    'sequence_drop',
    'domain_risk',
    'inbox_risk',
    'revenue_opportunity',
    'sdr_performance',
    'warmup_lagging',
    'dns_misconfiguration',
    'other'
  )),
  severity text not null default 'medium' check (severity in ('info', 'warning', 'critical')),
  title text not null,
  message text not null,
  
  -- Context
  context jsonb default '{}'::jsonb,
  
  -- Quick fix actions
  quick_fix_actions jsonb default '[]'::jsonb, -- Array of action objects
  
  -- Status
  status text not null default 'active' check (status in ('active', 'acknowledged', 'resolved', 'dismissed')),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  
  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_advisor_alerts_workspace on public.ai_advisor_alerts(workspace_id);
create index if not exists idx_ai_advisor_alerts_type on public.ai_advisor_alerts(alert_type);
create index if not exists idx_ai_advisor_alerts_severity on public.ai_advisor_alerts(severity);
create index if not exists idx_ai_advisor_alerts_status on public.ai_advisor_alerts(status);
create index if not exists idx_ai_advisor_alerts_created on public.ai_advisor_alerts(created_at desc);

-- ============================================================================
-- 4️⃣ AI Advisor Weekly Audit Reports
-- ============================================================================

create table if not exists public.ai_advisor_audits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  
  -- Audit period
  audit_period_start timestamptz not null,
  audit_period_end timestamptz not null,
  audit_date date not null default current_date,
  
  -- Summary sections
  deliverability_summary jsonb default '{}'::jsonb,
  sequences_summary jsonb default '{}'::jsonb,
  icp_summary jsonb default '{}'::jsonb,
  revenue_summary jsonb default '{}'::jsonb,
  sdr_summary jsonb default '{}'::jsonb,
  
  -- Recommendations
  top_recommendations jsonb default '[]'::jsonb,
  
  -- Full report (AI-generated)
  full_report_text text,
  
  -- Status
  sent_via_email boolean default false,
  sent_at timestamptz,
  
  -- Timestamps
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_advisor_audits_workspace on public.ai_advisor_audits(workspace_id);
create index if not exists idx_ai_advisor_audits_date on public.ai_advisor_audits(audit_date desc);
create index if not exists idx_ai_advisor_audits_period on public.ai_advisor_audits(audit_period_start, audit_period_end);

-- ============================================================================
-- 5️⃣ AI Advisor Activity Log
-- ============================================================================

create table if not exists public.ai_advisor_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  
  -- Activity details
  activity_type text not null check (activity_type in (
    'insight_generated',
    'recommendation_applied',
    'alert_acknowledged',
    'alert_resolved',
    'audit_generated',
    'action_taken'
  )),
  entity_type text not null check (entity_type in ('insight', 'recommendation', 'alert', 'audit')),
  entity_id uuid not null,
  
  -- User action
  user_id uuid references public.profiles(id) on delete set null,
  action_details jsonb default '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_advisor_activity_workspace on public.ai_advisor_activity(workspace_id);
create index if not exists idx_ai_advisor_activity_type on public.ai_advisor_activity(activity_type);
create index if not exists idx_ai_advisor_activity_created on public.ai_advisor_activity(created_at desc);

-- ============================================================================
-- 6️⃣ RLS Policies
-- ============================================================================

alter table public.ai_advisor_insights enable row level security;
alter table public.ai_advisor_recommendations enable row level security;
alter table public.ai_advisor_alerts enable row level security;
alter table public.ai_advisor_audits enable row level security;
alter table public.ai_advisor_activity enable row level security;

-- Insights: workspace members can read, owners/admins can update
create policy ai_advisor_insights_read on public.ai_advisor_insights
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = ai_advisor_insights.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy ai_advisor_insights_update on public.ai_advisor_insights
  for update using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = ai_advisor_insights.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
    )
  );

-- Recommendations: workspace members can read and apply
create policy ai_advisor_recommendations_read on public.ai_advisor_recommendations
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = ai_advisor_recommendations.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy ai_advisor_recommendations_update on public.ai_advisor_recommendations
  for update using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = ai_advisor_recommendations.workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- Alerts: workspace members can read and acknowledge
create policy ai_advisor_alerts_read on public.ai_advisor_alerts
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = ai_advisor_alerts.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy ai_advisor_alerts_update on public.ai_advisor_alerts
  for update using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = ai_advisor_alerts.workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- Audits: workspace members can read
create policy ai_advisor_audits_read on public.ai_advisor_audits
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = ai_advisor_audits.workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- Activity: workspace members can read
create policy ai_advisor_activity_read on public.ai_advisor_activity
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = ai_advisor_activity.workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 7️⃣ Helper Functions
-- ============================================================================

-- Function to log activity
create or replace function public.log_ai_advisor_activity(
  p_workspace_id uuid,
  p_activity_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_user_id uuid default auth.uid(),
  p_action_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_activity_id uuid;
begin
  insert into public.ai_advisor_activity (
    workspace_id,
    activity_type,
    entity_type,
    entity_id,
    user_id,
    action_details
  ) values (
    p_workspace_id,
    p_activity_type,
    p_entity_type,
    p_entity_id,
    p_user_id,
    p_action_details
  )
  returning id into v_activity_id;
  
  return v_activity_id;
end;
$$;

-- Function to acknowledge insight
create or replace function public.acknowledge_ai_insight(
  p_insight_id uuid
)
returns void
language plpgsql
security definer
as $$
begin
  update public.ai_advisor_insights
  set status = 'acknowledged',
      acknowledged_at = now(),
      updated_at = now()
  where id = p_insight_id
    and exists (
      select 1 from public.workspace_members wm
      join public.ai_advisor_insights ai on ai.workspace_id = wm.workspace_id
      where ai.id = p_insight_id
      and wm.user_id = auth.uid()
    );
  
  -- Log activity
  perform public.log_ai_advisor_activity(
    (select workspace_id from public.ai_advisor_insights where id = p_insight_id),
    'alert_acknowledged',
    'insight',
    p_insight_id,
    auth.uid()
  );
end;
$$;

-- Function to apply recommendation
create or replace function public.apply_ai_recommendation(
  p_recommendation_id uuid
)
returns void
language plpgsql
security definer
as $$
begin
  update public.ai_advisor_recommendations
  set status = 'applied',
      applied_at = now(),
      applied_by = auth.uid(),
      updated_at = now()
  where id = p_recommendation_id
    and status = 'pending'
    and exists (
      select 1 from public.workspace_members wm
      join public.ai_advisor_recommendations ar on ar.workspace_id = wm.workspace_id
      where ar.id = p_recommendation_id
      and wm.user_id = auth.uid()
    );
  
  -- Log activity
  perform public.log_ai_advisor_activity(
    (select workspace_id from public.ai_advisor_recommendations where id = p_recommendation_id),
    'recommendation_applied',
    'recommendation',
    p_recommendation_id,
    auth.uid()
  );
end;
$$;

-- ============================================================================
-- 8️⃣ Triggers
-- ============================================================================

-- Update updated_at timestamp
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_ai_advisor_insights_updated_at
  before update on public.ai_advisor_insights
  for each row
  execute function public.set_updated_at();

create trigger trg_ai_advisor_recommendations_updated_at
  before update on public.ai_advisor_recommendations
  for each row
  execute function public.set_updated_at();

create trigger trg_ai_advisor_alerts_updated_at
  before update on public.ai_advisor_alerts
  for each row
  execute function public.set_updated_at();



