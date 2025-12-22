-- 101_day15_metric_snapshots.sql
-- Snapshot helpers to freeze evaluation metrics at decision time.

create table if not exists public.ai_eval_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  model_version text not null,
  eval_set text not null default 'reply_classifier',
  accuracy numeric(6,4),
  per_label jsonb default '{}' -- {label:{precision,recall,f1}}
);

comment on table public.ai_eval_snapshots is
  'Stores historical snapshots of evaluation metrics for model versions.';

comment on column public.ai_eval_snapshots.model_version is
  'Identifier for the model version whose metrics were snapshot.';

comment on column public.ai_eval_snapshots.eval_set is
  'Evaluation set name captured in this snapshot.';

create or replace function public.snapshot_eval_metrics(
  _model text,
  _eval_set text default 'reply_classifier'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  acc numeric;
  lbl jsonb;
begin
  select accuracy
  into acc
  from public.ai_eval_best_by_version
  where model_version = _model
    and eval_set = _eval_set;

  select jsonb_object_agg(
           label,
           jsonb_build_object(
             'precision', precision,
             'recall',    recall,
             'f1',        f1
           )
         )
  into lbl
  from public.ai_eval_per_label
  where model_version = _model
    and eval_set = _eval_set;

  insert into public.ai_eval_snapshots (model_version, eval_set, accuracy, per_label)
  values (_model, _eval_set, acc, coalesce(lbl, '{}'::jsonb));
end;
$$;

grant execute on function public.snapshot_eval_metrics(text, text) to authenticated;
















