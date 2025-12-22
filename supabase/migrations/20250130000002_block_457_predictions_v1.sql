-- Block 457 — Predictions v1
-- AI Forecasting • Open/Reply Predictions • Revenue Projection • Inbox/Domain Risk Forecast • Step Performance Forecast
-- This block upgrades SmartSend into a forward-looking system

-- ============================================
-- 1) Predictions Table
-- ============================================
create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  step_id uuid references public.sequence_steps(id) on delete set null,
  inbox_id uuid references public.sender_inboxes(id) on delete set null,
  domain text,
  metric text not null check (metric in ('opens', 'replies', 'interested', 'revenue', 'bounce_risk', 'spam_risk', 'open_rate', 'reply_rate', 'interested_rate', 'meetings', 'deals', 'sending_volume')),
  predicted_value numeric not null,
  confidence float not null check (confidence >= 0 and confidence <= 1),
  horizon_days int not null check (horizon_days > 0),
  lower_bound numeric,
  upper_bound numeric,
  trend text check (trend in ('increasing', 'stable', 'declining')),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Indexes for fast queries
create index if not exists idx_predictions_workspace on public.predictions(workspace_id, created_at desc);
create index if not exists idx_predictions_campaign on public.predictions(campaign_id, metric, created_at desc);
create index if not exists idx_predictions_step on public.predictions(step_id, metric, created_at desc);
create index if not exists idx_predictions_inbox on public.predictions(inbox_id, metric, created_at desc);
create index if not exists idx_predictions_domain on public.predictions(domain, metric, created_at desc);
create index if not exists idx_predictions_metric_horizon on public.predictions(metric, horizon_days, created_at desc);
create index if not exists idx_predictions_created_at on public.predictions(created_at desc);

-- Enable RLS
alter table public.predictions enable row level security;

-- RLS Policies
create policy "predictions_select_workspace_member" on public.predictions
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = predictions.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- Service role can manage predictions
create policy "predictions_service_role_all" on public.predictions
  for all to service_role using (true) with check (true);

-- ============================================
-- 2) Prediction Alerts Table (for risk warnings)
-- ============================================
create table if not exists public.prediction_alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  alert_type text not null check (alert_type in ('step_performance', 'domain_risk', 'inbox_risk', 'campaign_risk', 'revenue_risk')),
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  title text not null,
  message text not null,
  entity_type text check (entity_type in ('campaign', 'step', 'inbox', 'domain')),
  entity_id uuid,
  entity_name text,
  recommendation text,
  prediction_id uuid references public.predictions(id) on delete set null,
  acknowledged boolean default false,
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_prediction_alerts_workspace on public.prediction_alerts(workspace_id, created_at desc);
create index if not exists idx_prediction_alerts_unacknowledged on public.prediction_alerts(workspace_id, acknowledged) where acknowledged = false;
create index if not exists idx_prediction_alerts_severity on public.prediction_alerts(workspace_id, severity, created_at desc);

alter table public.prediction_alerts enable row level security;

create policy "prediction_alerts_select_workspace_member" on public.prediction_alerts
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = prediction_alerts.workspace_id
        and wm.user_id = auth.uid()
    )
  );

create policy "prediction_alerts_update_workspace_member" on public.prediction_alerts
  for update using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = prediction_alerts.workspace_id
        and wm.user_id = auth.uid()
    )
  );

create policy "prediction_alerts_service_role_all" on public.prediction_alerts
  for all to service_role using (true) with check (true);

-- ============================================
-- 3) Helper Functions for Querying Predictions
-- ============================================

-- Get latest predictions for a workspace
create or replace function public.get_workspace_predictions(
  p_workspace_id uuid,
  p_metric text default null,
  p_horizon_days int default null
)
returns table (
  id uuid,
  campaign_id uuid,
  step_id uuid,
  inbox_id uuid,
  domain text,
  metric text,
  predicted_value numeric,
  confidence float,
  horizon_days int,
  lower_bound numeric,
  upper_bound numeric,
  trend text,
  created_at timestamptz
)
language plpgsql
security definer
as $$
begin
  return query
  select 
    p.id,
    p.campaign_id,
    p.step_id,
    p.inbox_id,
    p.domain,
    p.metric,
    p.predicted_value,
    p.confidence,
    p.horizon_days,
    p.lower_bound,
    p.upper_bound,
    p.trend,
    p.created_at
  from public.predictions p
  where p.workspace_id = p_workspace_id
    and (p_metric is null or p.metric = p_metric)
    and (p_horizon_days is null or p.horizon_days = p_horizon_days)
    and p.created_at >= now() - interval '2 days'  -- Only recent predictions
  order by p.created_at desc;
end;
$$;

-- Get predictions for a campaign
create or replace function public.get_campaign_predictions(
  p_campaign_id uuid,
  p_metric text default null
)
returns table (
  id uuid,
  step_id uuid,
  metric text,
  predicted_value numeric,
  confidence float,
  horizon_days int,
  lower_bound numeric,
  upper_bound numeric,
  trend text,
  created_at timestamptz
)
language plpgsql
security definer
as $$
begin
  return query
  select 
    p.id,
    p.step_id,
    p.metric,
    p.predicted_value,
    p.confidence,
    p.horizon_days,
    p.lower_bound,
    p.upper_bound,
    p.trend,
    p.created_at
  from public.predictions p
  where p.campaign_id = p_campaign_id
    and (p_metric is null or p.metric = p_metric)
    and p.created_at >= now() - interval '2 days'
  order by p.step_id nulls first, p.created_at desc;
end;
$$;

-- Get revenue projection for a workspace
create or replace function public.get_revenue_projection(
  p_workspace_id uuid,
  p_horizon_days int default 30
)
returns table (
  horizon_days int,
  predicted_value numeric,
  lower_bound numeric,
  upper_bound numeric,
  confidence float,
  created_at timestamptz
)
language plpgsql
security definer
as $$
begin
  return query
  select 
    p.horizon_days,
    p.predicted_value,
    p.lower_bound,
    p.upper_bound,
    p.confidence,
    p.created_at
  from public.predictions p
  where p.workspace_id = p_workspace_id
    and p.metric = 'revenue'
    and p.horizon_days = p_horizon_days
    and p.created_at >= now() - interval '2 days'
  order by p.created_at desc
  limit 1;
end;
$$;

-- Get risk predictions for inboxes/domains
create or replace function public.get_risk_predictions(
  p_workspace_id uuid,
  p_entity_type text,  -- 'inbox' or 'domain'
  p_horizon_days int default 7
)
returns table (
  entity_id uuid,
  entity_name text,
  bounce_risk numeric,
  spam_risk numeric,
  bounce_confidence float,
  spam_confidence float,
  trend text,
  created_at timestamptz
)
language plpgsql
security definer
as $$
begin
  if p_entity_type = 'inbox' then
    return query
    select 
      p.inbox_id as entity_id,
      si.email as entity_name,
      max(case when p.metric = 'bounce_risk' then p.predicted_value end) as bounce_risk,
      max(case when p.metric = 'spam_risk' then p.predicted_value end) as spam_risk,
      max(case when p.metric = 'bounce_risk' then p.confidence end) as bounce_confidence,
      max(case when p.metric = 'spam_risk' then p.confidence end) as spam_confidence,
      max(p.trend) as trend,
      max(p.created_at) as created_at
    from public.predictions p
    join public.sender_inboxes si on si.id = p.inbox_id
    where p.workspace_id = p_workspace_id
      and p.inbox_id is not null
      and p.metric in ('bounce_risk', 'spam_risk')
      and p.horizon_days = p_horizon_days
      and p.created_at >= now() - interval '2 days'
    group by p.inbox_id, si.email;
  elsif p_entity_type = 'domain' then
    return query
    select 
      null::uuid as entity_id,
      p.domain as entity_name,
      max(case when p.metric = 'bounce_risk' then p.predicted_value end) as bounce_risk,
      max(case when p.metric = 'spam_risk' then p.predicted_value end) as spam_risk,
      max(case when p.metric = 'bounce_risk' then p.confidence end) as bounce_confidence,
      max(case when p.metric = 'spam_risk' then p.confidence end) as spam_confidence,
      max(p.trend) as trend,
      max(p.created_at) as created_at
    from public.predictions p
    where p.workspace_id = p_workspace_id
      and p.domain is not null
      and p.metric in ('bounce_risk', 'spam_risk')
      and p.horizon_days = p_horizon_days
      and p.created_at >= now() - interval '2 days'
    group by p.domain;
  end if;
end;
$$;

-- ============================================
-- 4) Cleanup old predictions (keep last 30 days)
-- ============================================
create or replace function public.cleanup_old_predictions()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.predictions
  where created_at < now() - interval '30 days';
end;
$$;



