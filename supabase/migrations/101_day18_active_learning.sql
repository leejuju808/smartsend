-- Step 18 — Smart Sampling & Label Sprints
-- Migration: 101_day18_active_learning.sql

-- A) Policy config (tweak without code changes)
create table if not exists public.ai_al_policies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null unique,
  margin_max numeric(6,5) not null default 0.05000,
  min_score numeric(6,5) not null default 0.40,
  disagree_window_hours int not null default 24,
  class_quota jsonb not null default '{}'::jsonb
);

insert into public.ai_al_policies(name)
values ('default')
on conflict (name) do nothing;

-- B) Recent predictions enriched w/ thresholds
create or replace view public.ai_live_recent as
select
  l.id as live_id,
  l.created_at,
  l.model_version,
  l.predicted_label,
  l.score,
  l.threshold,
  l.true_label,
  l.route,
  l.text_preview,
  abs(coalesce(l.score, 0) - coalesce(l.threshold, 0)) as margin
from public.ai_live_inferences l
where l.created_at >= now() - interval '72 hours';

-- C) Uncertainty candidates (borderline near threshold)
create or replace view public.ai_al_uncertain as
select *
from public.ai_live_recent
where true_label is null
  and score is not null and threshold is not null
  and abs(score - threshold) <= (
    select margin_max
    from public.ai_al_policies
    where name = 'default'
    limit 1
  )
  and score >= (
    select min_score
    from public.ai_al_policies
    where name = 'default'
    limit 1
  );

-- D) Disagreement candidates (active vs canary disagree on same request_id)
create or replace view public.ai_al_disagree as
with pairs as (
  select
    request_id,
    count(distinct predicted_label) as labels,
    array_agg(distinct model_version) as models,
    min(created_at) as first_at
  from public.ai_live_inferences
  where created_at >= now() - interval '24 hours'
  group by request_id
)
select l.*
from public.ai_live_inferences l
join pairs p on p.request_id = l.request_id
where p.labels >= 2
  and l.true_label is null
  and l.created_at >= now() - interval '24 hours';

-- E) Rare-class booster: find labels with low recent representation
create or replace view public.ai_label_distribution_7d as
select coalesce(true_label, predicted_label) as label, count(*)::float as n
from public.ai_live_inferences
where created_at >= now() - interval '7 days'
group by 1;

-- F) Review assignment log (who got which live_id via AL allocator)
create table if not exists public.ai_al_assignments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  assigned_to uuid,
  strategy text not null,
  live_id uuid not null references public.ai_live_inferences(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'labeled', 'dismissed')),
  unique (live_id)
);

-- G) RPC: allocate a batch with simple quota mixing
create or replace function public.allocate_label_batch(
  _assigned_to uuid,
  _batch_size int default 10,
  _strategy text default 'quota_mix'
) returns setof uuid
language plpgsql
as $$
declare
  _quota jsonb := (
    select class_quota
    from public.ai_al_policies
    where name = 'default'
    limit 1
  );
  _k text;
  _portion numeric;
  _take int;
  _ids uuid[];
  _picked int := 0;
begin
  if _strategy = 'uncertain' then
    insert into public.ai_al_assignments(assigned_to, strategy, live_id)
    select _assigned_to, 'uncertain', live_id
    from (
      select live_id
      from public.ai_al_uncertain
      order by margin asc, created_at desc
      limit _batch_size
    ) x
    on conflict do nothing
    returning live_id into _ids;

    return query select unnest(_ids);
    return;
  end if;

  if _strategy = 'disagree' then
    insert into public.ai_al_assignments(assigned_to, strategy, live_id)
    select _assigned_to, 'disagree', id
    from (
      select id
      from public.ai_al_disagree
      order by created_at desc
      limit _batch_size
    ) x
    on conflict do nothing
    returning live_id into _ids;

    return query select unnest(_ids);
    return;
  end if;

  -- quota_mix: split by class quotas + fill remainder with uncertain
  for _k, _portion in select key, value::numeric from jsonb_each(_quota) loop
    _take := greatest(1, floor(_batch_size * _portion));

    if _k = '*' then
      insert into public.ai_al_assignments(assigned_to, strategy, live_id)
      select _assigned_to, 'quota_mix', live_id
      from (
        select live_id
        from public.ai_al_uncertain
        order by margin asc, created_at desc
        limit _take
      ) u
      on conflict do nothing;
    else
      insert into public.ai_al_assignments(assigned_to, strategy, live_id)
      select _assigned_to, 'quota_mix', lr.live_id
      from public.ai_live_recent lr
      where lr.predicted_label = _k
        and lr.true_label is null
        and lr.score is not null
        and lr.threshold is not null
      order by lr.margin asc, lr.created_at desc
      limit _take
      on conflict do nothing;
    end if;

    get diagnostics _picked = row_count;
  end loop;

  insert into public.ai_al_assignments(assigned_to, strategy, live_id)
  select _assigned_to, 'quota_mix', live_id
  from (
    select live_id
    from public.ai_al_uncertain u
    left join public.ai_al_assignments a on a.live_id = u.live_id
    where a.live_id is null
    order by margin asc, created_at desc
    limit greatest(
      0,
      _batch_size - (
        select count(*)
        from public.ai_al_assignments
        where assigned_to = _assigned_to
          and status = 'open'
      )
    )
  ) fill
  on conflict do nothing
  returning live_id into _ids;

  return query
    select live_id
    from public.ai_al_assignments
    where assigned_to = _assigned_to
      and status = 'open'
    order by created_at desc
    limit _batch_size;
end;
$$;
















