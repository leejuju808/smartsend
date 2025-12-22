-- day 11 migration: model registry, training jobs, dataset metadata, hard-case mining views

-- A) Model registry (what versions exist/are planned)
create table if not exists public.ai_model_registry (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  model_version text not null unique,
  parent_version text,
  status text not null default 'pending' check (status in ('pending','training','active','archived','failed')),
  metrics jsonb default '{}',
  notes text
);

-- B) Training jobs (queue)
create table if not exists public.ai_training_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  status text not null default 'queued' check (status in ('queued','building_dataset','training','completed','failed')),
  target_model_version text not null references public.ai_model_registry(model_version) on delete cascade,
  dataset_uri text,
  params jsonb default '{}',
  stats jsonb default '{}'
);

-- C) Optional columns on training samples (if missing)
alter table public.ai_training_samples
  add column if not exists split text default 'auto' check (split in ('auto','train','eval','holdout')),
  add column if not exists weight numeric(6,3) default 1.0,
  add column if not exists locked boolean default false;

-- D) Hard-case mining views
create or replace view public.ai_hard_negatives as
select r.sample_id,
       r.model_version,
       r.true_label,
       r.predicted_label,
       r.confidence
from public.ai_eval_results r
where r.true_label is not null
  and r.predicted_label is not null
  and r.predicted_label <> r.true_label
  and r.confidence >= 0.70;

create or replace view public.ai_borderline as
select r.sample_id,
       r.model_version,
       r.true_label,
       r.predicted_label,
       r.confidence
from public.ai_eval_results r
where r.true_label is not null
  and r.predicted_label = r.true_label
  and r.confidence between 0.50 and 0.65;

create or replace view public.ai_label_drift as
with last14 as (
  select s.label,
         count(*)::float as n
  from public.ai_training_samples s
  where s.created_at >= now() - interval '14 days'
  group by s.label
),
alltime as (
  select s.label,
         count(*)::float as n
  from public.ai_training_samples s
  group by s.label
)
select a.label,
       coalesce(l.n, 0) as n_14d,
       a.n as n_all,
       case when a.n > 0 then coalesce(l.n, 0) / a.n else null end as ratio_14d_all
from alltime a
left join last14 l using (label);
















