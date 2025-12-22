-- Follow-up bucket caps, cooldown helpers, and RPC guard

-- A) Per-campaign caps table
create table if not exists public.followup_caps (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  scenario text not null,
  tone text not null,
  daily_cap int not null,
  primary key (campaign_id, scenario, tone)
);

create index if not exists idx_caps_campaign on public.followup_caps(campaign_id);

-- B) Thread cooldown helper view
create or replace view public.v_thread_cooldown as
select
  t.id as thread_id,
  t.campaign_id,
  fr.hours_wait,
  last_in.last_inbound_at,
  case
    when fr.hours_wait is null then null
    when last_in.last_inbound_at is null then now()
    else last_in.last_inbound_at + make_interval(hours => fr.hours_wait)
  end as next_eligible_at
from public.inbox_threads t
join public.followup_rules fr on fr.campaign_id = t.campaign_id
left join lateral (
  select max(nm.sent_at) as last_inbound_at
  from public.normalized_messages nm
  where nm.linked_thread_id = t.id
    and nm.direction = 'inbound'
    and coalesce(nm.ai_label, '') in ('human_reply','question','positive','neutral','routing')
) last_in on true;

create index if not exists idx_v_thread_cooldown_campaign on public.v_thread_cooldown(campaign_id);

-- C) Today's cap usage snapshot
create or replace view public.v_cap_usage_today as
with today_nudges as (
  select
    na.variant_id,
    na.campaign_id,
    na.scenario,
    na.tone,
    q.created_at::date as d
  from public.nudge_assignments na
  join public.send_queue q on q.id = na.send_queue_id
  where q.created_at::date = now()::date
)
select campaign_id, scenario, tone, count(*)::int as used_today
from today_nudges
group by campaign_id, scenario, tone;

create index if not exists idx_v_cap_usage_today_campaign on public.v_cap_usage_today(campaign_id);

-- D) Cap check RPC
set check_function_bodies = off;

create or replace function public.nudge_cap_check(p_campaign_id uuid, p_scenario text, p_tone text)
returns jsonb
language sql
stable
as $$
  with cap as (
    select daily_cap
    from public.followup_caps
    where campaign_id = p_campaign_id
      and scenario = p_scenario
      and tone = p_tone
  ),
  usage as (
    select coalesce((
      select used_today
      from public.v_cap_usage_today
      where campaign_id = p_campaign_id
        and scenario = p_scenario
        and tone = p_tone
    ), 0) as used_today
  )
  select case
    when not exists (select 1 from cap) then jsonb_build_object('ok', true, 'capped', false, 'used', (select used_today from usage), 'cap', null)
    when (select used_today from usage) < (select daily_cap from cap) then
      jsonb_build_object('ok', true, 'capped', false, 'used', (select used_today from usage), 'cap', (select daily_cap from cap))
    else
      jsonb_build_object('ok', false, 'capped', true, 'used', (select used_today from usage), 'cap', (select daily_cap from cap))
  end
$$;

comment on function public.nudge_cap_check(uuid, text, text) is 'Returns JSON summary of cap usage for a campaign scenario/tone bucket.';


