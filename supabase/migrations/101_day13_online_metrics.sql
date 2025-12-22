-- Step 13 — Online Inference Logging, Metrics, Alerts

-- A) Raw online inferences (append-only)
create table if not exists public.ai_live_inferences (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request_id uuid,
  model_version text not null,
  eval_set text not null default 'reply_classifier',
  sample_id uuid,
  text_preview text,
  predicted_label text,
  score numeric(6,5),
  threshold numeric(6,5),
  route text check (route in ('active','canary','fallback')) default 'active',
  true_label text,
  is_correct boolean generated always as (
    case
      when true_label is null then null
      else (predicted_label = true_label)
    end
  ) stored
);

create index if not exists idx_live_created on public.ai_live_inferences(created_at);
create index if not exists idx_live_model on public.ai_live_inferences(model_version);

-- B) Rolling metrics (materialized view for quick charts)
create materialized view if not exists public.ai_online_metrics as
select
  date_trunc('hour', created_at) as ts_hour,
  model_version,
  eval_set,
  count(*)::int as n,
  avg(
    case
      when is_correct is not null then (is_correct::int)
      else null
    end
  )::float as accuracy_observed
from public.ai_live_inferences
group by 1,2,3;

create index if not exists idx_online_metrics_hour on public.ai_online_metrics(ts_hour);

-- C) Review queue (to triage hard cases)
create table if not exists public.ai_review_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  live_inference_id uuid references public.ai_live_inferences(id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open','labeled','dismissed')),
  assigned_to uuid
);

-- D) Alerts log (breaches & actions)
create table if not exists public.ai_alerts_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('canary_breach','rollback','metric_drop','info')),
  details jsonb not null
);

-- E) Helper to refresh materialized view
create or replace function public.refresh_ai_online_metrics()
returns void
language sql
as $$
  refresh materialized view concurrently public.ai_online_metrics;
$$;
















