-- Day 12 — Promotion Gates, Canary Routing, Rollback

-- A) Global gate rules (tunable)
create table if not exists public.ai_model_gate_rules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  eval_set text not null default 'reply_classifier',
  min_accuracy_delta numeric(6,4) not null default 0.0100,
  min_overall_accuracy numeric(6,4) not null default 0.8000,
  min_precision_unsubscribe numeric(6,4) not null default 0.9500,
  min_recall_meeting_intent numeric(6,4) not null default 0.8500,
  notes text
);

insert into public.ai_model_gate_rules (notes)
select 'default gates'
where not exists (select 1 from public.ai_model_gate_rules);

-- B) Pointer to the active/canary models and traffic split
create table if not exists public.ai_active_models (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  eval_set text not null default 'reply_classifier',
  active_model text not null,
  canary_model text,
  canary_percent int not null default 0 check (canary_percent between 0 and 100)
);

create unique index if not exists uniq_ai_active_models_eval_set
  on public.ai_active_models (eval_set);

-- C) Promotions log
create table if not exists public.ai_model_promotions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  eval_set text not null default 'reply_classifier',
  from_model text,
  to_model text not null,
  action text not null check (action in ('promote','rollback','set_canary')),
  actor uuid,
  details jsonb default '{}'
);

-- D) Compare candidate vs current (overall accuracy)
create or replace view public.ai_eval_best_by_version as
select
  model_version,
  eval_set,
  sum(is_correct::int)::float / count(*) as accuracy
from public.ai_eval_results
group by model_version, eval_set;

-- E) Per-label metrics: assumed existing as public.ai_eval_per_label

-- F) Gate checker (returns true/false and reason)
create or replace function public.check_model_gates(
  _eval_set text,
  _current text,
  _candidate text
) returns jsonb
language plpgsql
as $$
declare
  gates record;
  acc_current numeric;
  acc_candidate numeric;
  prec_unsub numeric;
  rec_meeting numeric;
  ok boolean := true;
  reasons text[] := '{}';
begin
  select * into gates
  from public.ai_model_gate_rules
  where eval_set = _eval_set
  limit 1;

  select accuracy into acc_current
  from public.ai_eval_best_by_version
  where eval_set = _eval_set
    and model_version = _current;

  select accuracy into acc_candidate
  from public.ai_eval_best_by_version
  where eval_set = _eval_set
    and model_version = _candidate;

  if acc_candidate is null then
    ok := false;
    reasons := array_append(reasons, 'candidate has no eval results');
  end if;

  if acc_current is not null and acc_candidate is not null then
    if acc_candidate < acc_current + gates.min_accuracy_delta then
      ok := false;
      reasons := array_append(reasons, 'accuracy delta too small');
    end if;
  end if;

  if acc_candidate is not null and acc_candidate < gates.min_overall_accuracy then
    ok := false;
    reasons := array_append(reasons, 'overall accuracy below floor');
  end if;

  select precision into prec_unsub
  from public.ai_eval_per_label
  where eval_set = _eval_set
    and model_version = _candidate
    and label = 'unsubscribe'
  limit 1;

  if prec_unsub is null or prec_unsub < gates.min_precision_unsubscribe then
    ok := false;
    reasons := array_append(reasons, 'unsubscribe precision below floor');
  end if;

  select recall into rec_meeting
  from public.ai_eval_per_label
  where eval_set = _eval_set
    and model_version = _candidate
    and label = 'meeting_intent'
  limit 1;

  if rec_meeting is null or rec_meeting < gates.min_recall_meeting_intent then
    ok := false;
    reasons := array_append(reasons, 'meeting_intent recall below floor');
  end if;

  return jsonb_build_object(
    'ok', ok,
    'current_accuracy', acc_current,
    'candidate_accuracy', acc_candidate,
    'prec_unsubscribe', prec_unsub,
    'rec_meeting_intent', rec_meeting,
    'reasons', reasons
  );
end;
$$;

insert into public.ai_active_models (eval_set, active_model, canary_model, canary_percent)
values ('reply_classifier', 'replyclf_v0.0.1', null, 0)
on conflict (eval_set) do nothing;
















