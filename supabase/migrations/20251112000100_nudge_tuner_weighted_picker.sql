-- 2025-11-12 — Nudge tuner weighted picker, RLS, and decay helpers

-- a) timestamp helper ---------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_nudge_tuner_updated_at on public.nudge_tuner;
drop trigger if exists trg_touch_nudge_tuner on public.nudge_tuner;
create trigger trg_touch_nudge_tuner
before update on public.nudge_tuner
for each row
execute function public.touch_updated_at();


-- b) schema extensions ---------------------------------------------------------
alter table public.nudge_tuner
  add column if not exists weight real not null default 1.0,
  add column if not exists success_count integer not null default 0,
  add column if not exists fail_count integer not null default 0,
  add column if not exists last_used_at timestamptz;

update public.nudge_tuner
set weight = coalesce(nullif(weight, 0), 1.0)
where is_active is not null;

-- remove strict uniqueness to allow multiple variants per label/tone
drop index if exists idx_nudge_tuner_owner_label_tone;


-- c) row level security --------------------------------------------------------
alter table public.nudge_tuner enable row level security;

drop policy if exists nudge_tuner_select on public.nudge_tuner;
create policy nudge_tuner_select
on public.nudge_tuner
for select
using (owner_id = auth.uid());

drop policy if exists nudge_tuner_modify on public.nudge_tuner;
create policy nudge_tuner_modify
on public.nudge_tuner
for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());


-- d) weighted picker -----------------------------------------------------------
create or replace function public.pick_nudge(label_input text, owner_input uuid)
returns table(id uuid, tone text, prompt text, weight real)
language sql
security definer
set search_path = public
as $$
  select id,
         tone,
         prompt,
         weight
  from public.nudge_tuner
  where label = label_input
    and owner_id = owner_input
    and is_active = true
    and weight > 0
  order by -ln(greatest(1.0e-8, random())) / weight desc
  limit 1;
$$;

grant execute on function public.pick_nudge(text, uuid) to authenticated;
grant execute on function public.pick_nudge(text, uuid) to service_role;


-- e) nightly decay helper ------------------------------------------------------
create or replace function public.decay_nudges()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- gentle decay
  update public.nudge_tuner
  set weight = greatest(0.1, weight * 0.97)
  where is_active = true;

  -- auto-archive: no success in 30d and fail skewed
  update public.nudge_tuner
  set is_active = false
  where is_active = true
    and coalesce(success_count, 0) = 0
    and coalesce(fail_count, 0) >= 5
    and (last_used_at is null or last_used_at < now() - interval '30 days');
end;
$$;

grant execute on function public.decay_nudges() to service_role;
grant execute on function public.decay_nudges() to authenticated;


-- f) qa helper -----------------------------------------------------------------
-- with picks as (
--   select (public.pick_nudge('no_response', '00000000-0000-0000-0000-000000000000'::uuid)).tone as tone
--   from generate_series(1,1000)
-- )
-- select tone, count(*) cnt from picks group by tone order by cnt desc;


