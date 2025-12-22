-- Confusion matrix view by model + eval set
create or replace view public.ai_eval_confusion as
select
  model_version,
  eval_set,
  coalesce(true_label, '(null)') as true_label,
  coalesce(predicted_label, '(null)') as predicted_label,
  count(*)::int as n
from public.ai_eval_results
group by model_version, eval_set, true_label, predicted_label;

-- Per-label metrics (precision, recall, f1) computed one-vs-all per label.
create or replace view public.ai_eval_per_label as
with labels as (
  select distinct model_version, eval_set, true_label as label
  from public.ai_eval_results
  where true_label is not null
),
counts as (
  select
    l.model_version,
    l.eval_set,
    l.label,
    sum(
      case
        when r.predicted_label = l.label and r.true_label = l.label then 1
        else 0
      end
    )::int as tp,
    sum(
      case
        when r.predicted_label = l.label and r.true_label <> l.label then 1
        else 0
      end
    )::int as fp,
    sum(
      case
        when r.predicted_label <> l.label and r.true_label = l.label then 1
        else 0
      end
    )::int as fn
  from labels l
  join public.ai_eval_results r
    on r.model_version = l.model_version
   and r.eval_set = l.eval_set
  group by 1, 2, 3
)
select
  model_version,
  eval_set,
  label,
  tp,
  fp,
  fn,
  case
    when (tp + fp) > 0 then tp::float / (tp + fp)
    else null
  end as precision,
  case
    when (tp + fn) > 0 then tp::float / (tp + fn)
    else null
  end as recall,
  case
    when (tp + fp) > 0
      and (tp + fn) > 0
      and tp > 0 then
      2 * (tp::float / (tp + fp)) * (tp::float / (tp + fn))
      / ((tp::float / (tp + fp)) + (tp::float / (tp + fn)))
    else null
  end as f1
from counts;

-- Threshold storage table for score-based routes
create table if not exists public.ai_model_thresholds (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  model_version text not null,
  label text not null,
  threshold numeric(6, 5) not null,
  unique (model_version, label)
);

-- Upsert helper for thresholds
create or replace function public.upsert_ai_threshold(
  _model text,
  _label text,
  _t numeric
)
returns void
language plpgsql
as $$
begin
  insert into public.ai_model_thresholds (model_version, label, threshold)
  values (_model, _label, _t)
  on conflict (model_version, label)
  do update
    set threshold = excluded.threshold,
        updated_at = now();
end;
$$;
















