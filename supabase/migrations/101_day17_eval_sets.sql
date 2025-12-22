-- Step 17 — Golden Eval Sets (create ➝ freeze ➝ run ➝ compare)
-- Migration: 101_day17_eval_sets.sql

-- A) Eval set registry
create table if not exists public.ai_eval_sets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null unique,
  notes text,
  is_frozen boolean not null default false
);

-- B) Memberships: which samples belong to which set
create table if not exists public.ai_eval_set_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  eval_set_id uuid not null references public.ai_eval_sets(id) on delete cascade,
  sample_id uuid not null references public.ai_training_samples(id) on delete cascade,
  unique(eval_set_id, sample_id)
);

-- C) Snapshot of metrics per model per eval set (for quick compare)
create table if not exists public.ai_eval_set_metrics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  eval_set_id uuid not null references public.ai_eval_sets(id) on delete cascade,
  model_version text not null,
  accuracy numeric(6,4),
  per_label jsonb default '{}'
);

-- D) Leakage view: eval members that accidentally appear in train/eval splits
create or replace view public.ai_eval_leakage as
select m.eval_set_id, m.sample_id, s.split
from public.ai_eval_set_members m
join public.ai_training_samples s on s.id = m.sample_id
where s.split in ('train','eval');

-- E) Helper RPCs

-- 1) create or get eval set by name
create or replace function public.ensure_eval_set(_name text, _notes text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _id uuid;
begin
  select id into _id from public.ai_eval_sets where name = _name;
  if _id is null then
    insert into public.ai_eval_sets(name, notes) values (_name, _notes) returning id into _id;
  end if;
  return _id;
end
$$;

grant execute on function public.ensure_eval_set(text, text) to authenticated, service_role;

-- 2) add samples by label/date/limit (nulls mean "no filter")
create or replace function public.add_to_eval_set(
  _eval_set_id uuid,
  _label text default null,
  _since timestamptz default null,
  _until timestamptz default null,
  _limit int default 500
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  _n int;
begin
  with candidates as (
    select id
    from public.ai_training_samples
    where (_label is null or label = _label)
      and (_since is null or created_at >= _since)
      and (_until is null or created_at < _until)
    order by created_at desc
    limit coalesce(_limit, 500)
  ),
  ins as (
    insert into public.ai_eval_set_members(eval_set_id, sample_id)
    select _eval_set_id, id from candidates
    on conflict do nothing
    returning 1
  )
  select count(*) into _n from ins;
  return coalesce(_n, 0);
end
$$;

grant execute on function public.add_to_eval_set(uuid, text, timestamptz, timestamptz, int) to authenticated, service_role;

-- 3) freeze set (locks current members; optional auto-mark to holdout split)
create or replace function public.freeze_eval_set(_eval_set_id uuid, _force_holdout boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_eval_sets
  set is_frozen = true
  where id = _eval_set_id;

  if _force_holdout then
    update public.ai_training_samples s
    set split = 'holdout'
    from public.ai_eval_set_members m
    where m.eval_set_id = _eval_set_id
      and m.sample_id = s.id;
  end if;
end
$$;

grant execute on function public.freeze_eval_set(uuid, boolean) to authenticated, service_role;
















