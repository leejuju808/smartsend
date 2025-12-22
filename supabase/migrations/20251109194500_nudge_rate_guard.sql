-- 1) Policy knobs on followup rules
alter table public.followup_rules
  add column if not exists nudge_min_gap_minutes int not null default 1440,
  add column if not exists lead_daily_cap int not null default 1;


-- 2) Helper views for cooldown + per lead caps
create or replace view public.v_thread_last_nudge as
select a.thread_id, max(a.created_at) as last_nudge_at
from public.nudge_assignments a
group by a.thread_id;

create or replace view public.v_lead_nudge_24h as
select a.campaign_id, a.lead_id, count(*)::int as nudges_24h
from public.nudge_assignments a
where a.created_at >= now() - interval '24 hours'
group by a.campaign_id, a.lead_id;

create index if not exists idx_assign_thread_created on public.nudge_assignments (thread_id, created_at desc);
create index if not exists idx_assign_lead_campaign_created on public.nudge_assignments (lead_id, campaign_id, created_at desc);


-- 3) Guard RPC used by routing/API
create or replace function public.nudge_allowed(p_thread uuid)
returns table(ok boolean, reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_camp uuid;
  v_lead uuid;
  v_gap int;
  v_cap int;
  v_last timestamptz;
  v_cnt int;
begin
  select campaign_id, lead_id
    into v_camp, v_lead
  from public.inbox_threads
  where id = p_thread;

  if v_camp is null then
    return query select false, 'thread_not_found'::text;
    return;
  end if;

  if not public.is_campaign_viewer(v_camp) then
    return query select false, 'forbidden'::text;
    return;
  end if;

  select nudge_min_gap_minutes, lead_daily_cap
    into v_gap, v_cap
  from public.followup_rules
  where campaign_id = v_camp;

  select last_nudge_at
    into v_last
  from public.v_thread_last_nudge
  where thread_id = p_thread;

  if v_last is not null
     and (extract(epoch from (now() - v_last)) / 60.0) < coalesce(v_gap, 1440) then
    return query select false, 'thread_cooldown'::text;
    return;
  end if;

  select nudges_24h
    into v_cnt
  from public.v_lead_nudge_24h
  where campaign_id = v_camp
    and lead_id = v_lead;

  if coalesce(v_cnt, 0) >= coalesce(v_cap, 1) then
    return query select false, 'lead_daily_cap'::text;
    return;
  end if;

  return query select true, null::text;
end;
$$;

revoke all on function public.nudge_allowed(uuid) from public;
grant execute on function public.nudge_allowed(uuid) to authenticated;

