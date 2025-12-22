create table if not exists public.ai_eval_results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  model_version text not null,
  eval_set text not null check (eval_set in ('reply_classifier','nudge_tuner')),
  sample_id uuid references public.ai_training_samples(id) on delete cascade,
  predicted_label text,
  true_label text,
  confidence numeric(5,4),
  is_correct boolean generated always as (predicted_label = true_label) stored,
  feedback_source text check (feedback_source in ('user_label','auto_label')),
  notes text
);

create or replace view public.ai_eval_metrics as
select
  model_version,
  eval_set,
  count(*) as total,
  sum(case when is_correct then 1 else 0 end)::float / count(*) as accuracy
from public.ai_eval_results
group by model_version, eval_set;
















