-- Evaluation System Schema
-- Implements eval sets, items, runs, and predictions for model evaluation

-- A. Eval set header
create table if not exists public.eval_sets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,                    -- e.g., "Replies v1.0"
  task text not null check (task in ('reply_kind','ooo','meeting_intent','tone')),
  notes text,
  is_active boolean not null default true
);

create index if not exists ix_eval_sets_task on public.eval_sets(task, is_active);
create index if not exists ix_eval_sets_active on public.eval_sets(is_active) where is_active = true;

-- B. Items (gold labels)
create table if not exists public.eval_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  eval_set_id uuid not null references public.eval_sets(id) on delete cascade,
  source text not null check (source in ('reply','synthetic')),
  text text not null,          -- normalized body/snippet
  gold_label text not null,    -- e.g., 'positive','neutral','ooo','has_intent','formal'
  aux jsonb                    -- metadata: {contact_id, reply_id, ...}
);

create index if not exists ix_eval_items_set on public.eval_items(eval_set_id);
create index if not exists ix_eval_items_source on public.eval_items(source);

-- C. Runs (each model/prompt/version scored once per eval set)
create table if not exists public.eval_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  eval_set_id uuid not null references public.eval_sets(id) on delete cascade,
  pack_kind text not null check (pack_kind in ('policy','rewrite','detector')),  -- Day 25 packs
  pack_id uuid references public.prompt_packs(id) on delete set null,
  pack_version int,
  model text not null,            -- 'gpt-4o-mini', 'rules', etc.
  params jsonb,                   -- {temperature, epsilon,...}
  macro_f1 numeric,
  accuracy numeric,
  precision jsonb,                -- per label
  recall jsonb,                   -- per label
  confusion jsonb,                -- matrix
  notes text
);

create index if not exists ix_eval_runs_set on public.eval_runs(eval_set_id, created_at desc);
create index if not exists ix_eval_runs_pack on public.eval_runs(pack_id, pack_version);

-- D. Predictions per item per run
create table if not exists public.eval_predictions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_id uuid not null references public.eval_runs(id) on delete cascade,
  item_id uuid not null references public.eval_items(id) on delete cascade,
  pred_label text not null,
  confidence numeric,
  correct boolean
);

create index if not exists ix_eval_preds_run on public.eval_predictions(run_id);
create index if not exists ix_eval_preds_item on public.eval_predictions(item_id);
create index if not exists ix_eval_preds_correct on public.eval_predictions(correct) where correct is not null;

-- E. Add eval thresholds to campaigns
alter table public.campaigns
  add column if not exists eval_min_macro_f1 numeric default 0.80,
  add column if not exists eval_min_accuracy numeric default 0.85;

-- RLS policies
alter table public.eval_sets enable row level security;
alter table public.eval_items enable row level security;
alter table public.eval_runs enable row level security;
alter table public.eval_predictions enable row level security;

-- Service role has full access
create policy "service_role_full_eval_sets" on public.eval_sets
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "service_role_full_eval_items" on public.eval_items
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "service_role_full_eval_runs" on public.eval_runs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "service_role_full_eval_predictions" on public.eval_predictions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Users can read/write their own eval sets (for now, allow all authenticated users)
-- Adjust based on your RLS requirements
create policy "users_select_eval_sets" on public.eval_sets
  for select
  using (auth.role() = 'authenticated');

create policy "users_insert_eval_sets" on public.eval_sets
  for insert
  with check (auth.role() = 'authenticated');

create policy "users_update_eval_sets" on public.eval_sets
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "users_select_eval_items" on public.eval_items
  for select
  using (auth.role() = 'authenticated');

create policy "users_insert_eval_items" on public.eval_items
  for insert
  with check (auth.role() = 'authenticated');

create policy "users_select_eval_runs" on public.eval_runs
  for select
  using (auth.role() = 'authenticated');

create policy "users_insert_eval_runs" on public.eval_runs
  for insert
  with check (auth.role() = 'authenticated');

create policy "users_select_eval_predictions" on public.eval_predictions
  for select
  using (auth.role() = 'authenticated');















