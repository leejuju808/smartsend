-- Follow-up orchestrator schema (idempotent)

-- A) Rule sets per campaign (ordered)
create table if not exists public.followup_rule_sets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  position int not null default 0,
  unique (campaign_id, name)
);

create index if not exists idx_followup_rule_sets_campaign on public.followup_rule_sets (campaign_id, position);

-- B) Rules inside a set, evaluated top→bottom
create table if not exists public.followup_rules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rule_set_id uuid not null references public.followup_rule_sets(id) on delete cascade,
  position int not null default 0,
  match jsonb not null,
  action jsonb not null,
  unique (rule_set_id, position)
);

create index if not exists idx_followup_rules_set on public.followup_rules (rule_set_id, position);

-- Ensure send_queue has columns needed for follow-up orchestrator inserts
alter table if exists public.send_queue
  add column if not exists thread_id uuid references public.inbox_threads(id) on delete cascade,
  add column if not exists lead_id uuid references public.leads(id) on delete cascade,
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade,
  add column if not exists variant_id uuid references public.nudge_variants(id) on delete set null,
  add column if not exists source text,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists not_before timestamptz,
  add column if not exists priority int not null default 0;

comment on column public.send_queue.source is 'Originator for analytics/debugging (e.g., followup_orchestrator)';

-- C) Per-thread follow-up state summary (for matching)
create or replace view public.v_followup_state as
select
  t.id as thread_id,
  t.campaign_id,
  coalesce(t.reply_type, 'no_reply') as intent,
  coalesce((
    select count(*) from public.send_queue q
    where q.thread_id = t.id and q.status = 'sent'
  ), 0) as touches_sent,
  coalesce(ls.score, 0)::int as engagement,
  t.resume_at,
  exists (
    select 1 from public.sla_timers s
    where s.thread_id = t.id and s.resolved_at is null
  ) as has_open_sla
from public.inbox_threads t
left join public.lead_scores ls on ls.lead_id = t.lead_id;

-- D) Decision ledger (what the engine decided last)
create table if not exists public.followup_decisions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  rule_id uuid references public.followup_rules(id) on delete set null,
  decision text not null,
  details jsonb
);

create index if not exists idx_followup_decisions_thread on public.followup_decisions (thread_id);

comment on column public.followup_decisions.decision is
  'enqueue | stop | snooze | skip_suppressed | wait_resume';

-- 2) Matcher helpers (SQL functions)

create or replace function public.rule_matches(
  p_match jsonb,
  p_intent text,
  p_engagement int,
  p_touches int,
  p_resume_at timestamptz
) returns boolean
language sql
immutable
as $$
  select
    (coalesce((p_match->'intent') ?| array[p_intent], true)) and
    (coalesce((p_match->>'engagement_min')::int, -999) <= p_engagement) and
    (coalesce((p_match->>'engagement_max')::int,  999) >= p_engagement) and
    (coalesce((p_match->>'touch_lte')::int,  999) >= p_touches) and
    (coalesce((p_match->>'touch_gte')::int, -999) <= p_touches) and
    (
      case when (p_match ? 'ooo') then
        ((p_resume_at is not null) = (p_match->>'ooo')::boolean)
      else true end
    );
$$;

grant execute on function public.rule_matches(jsonb, text, int, int, timestamptz) to anon, authenticated, service_role;

create or replace function public.pick_followup_rule(p_thread uuid)
returns table(rule_id uuid, action jsonb)
language sql
stable
as $$
  with s as (
    select *
    from public.v_followup_state
    where thread_id = p_thread
  ),
  sets as (
    select rs.id
    from public.followup_rule_sets rs
    join s on s.campaign_id = rs.campaign_id
    where rs.is_active
    order by rs.position asc, rs.created_at asc
  )
  select r.id, r.action
  from public.followup_rules r
  join sets on sets.id = r.rule_set_id
  join s on true
  where public.rule_matches(r.match, s.intent, s.engagement, s.touches_sent, s.resume_at)
  order by r.position asc, r.created_at asc
  limit 1;
$$;

grant execute on function public.pick_followup_rule(uuid) to anon, authenticated, service_role;

-- Helper to enqueue follow-up jobs with consistent payload
create or replace function public.enqueue_followup_job(
  p_campaign uuid,
  p_thread uuid,
  p_lead uuid,
  p_variant uuid,
  p_not_before timestamptz,
  p_priority int default 0,
  p_details jsonb default '{}'::jsonb
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.send_queue (
    campaign_id,
    thread_id,
    lead_id,
    variant_id,
    status,
    not_before,
    priority,
    source,
    payload
  ) values (
    p_campaign,
    p_thread,
    p_lead,
    p_variant,
    'pending',
    p_not_before,
    coalesce(p_priority, 0),
    'followup_orchestrator',
    coalesce(p_details, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.enqueue_followup_job(uuid, uuid, uuid, uuid, timestamptz, int, jsonb) to service_role;

-- 3) Default rules seed (covers most use cases)

insert into public.followup_rule_sets (campaign_id, name, position)
select id, 'Default Orchestrator', 0
from public.campaigns
on conflict (campaign_id, name) do nothing;

-- 1) OOO → wait until resume_at
insert into public.followup_rules (rule_set_id, position, match, action)
select rs.id, 10,
  jsonb_build_object('intent', jsonb_build_array('ooo'), 'ooo', true),
  jsonb_build_object('type', 'snooze', 'until', 'resume_at')
from public.followup_rule_sets rs
on conflict (rule_set_id, position) do nothing;

-- 2) Positive or Question → stop auto sequence
insert into public.followup_rules (rule_set_id, position, match, action)
select rs.id, 20,
  jsonb_build_object('intent', jsonb_build_array('positive', 'question')),
  jsonb_build_object('type', 'stop', 'reason', 'human_handoff')
from public.followup_rule_sets rs
on conflict (rule_set_id, position) do nothing;

-- 3) Neutral with low engagement → longer cool-off
insert into public.followup_rules (rule_set_id, position, match, action)
select rs.id, 30,
  jsonb_build_object('intent', jsonb_build_array('neutral'), 'engagement_max', 30, 'touch_lte', 3),
  jsonb_build_object('type', 'enqueue', 'delay_hours', 72, 'variant_key', 'neutral_soft')
from public.followup_rule_sets rs
on conflict (rule_set_id, position) do nothing;

-- 4) No reply & high engagement → faster follow-up
insert into public.followup_rules (rule_set_id, position, match, action)
select rs.id, 40,
  jsonb_build_object('intent', jsonb_build_array('no_reply'), 'engagement_min', 60, 'touch_lte', 5),
  jsonb_build_object('type', 'enqueue', 'delay_hours', 24, 'variant_key', 'cta_strong')
from public.followup_rule_sets rs
on conflict (rule_set_id, position) do nothing;

-- 5) No reply & medium engagement → standard cadence
insert into public.followup_rules (rule_set_id, position, match, action)
select rs.id, 50,
  jsonb_build_object(
    'intent', jsonb_build_array('no_reply'),
    'engagement_min', 30,
    'engagement_max', 59,
    'touch_lte', 5
  ),
  jsonb_build_object('type', 'enqueue', 'delay_hours', 48, 'variant_key', 'cta_standard')
from public.followup_rule_sets rs
on conflict (rule_set_id, position) do nothing;

-- 6) Cap touches at 6 (stop)
insert into public.followup_rules (rule_set_id, position, match, action)
select rs.id, 90,
  jsonb_build_object('touch_gte', 6),
  jsonb_build_object('type', 'stop', 'reason', 'max_touches')
from public.followup_rule_sets rs
on conflict (rule_set_id, position) do nothing;

-- 7) Fallback → stop (safety)
insert into public.followup_rules (rule_set_id, position, match, action)
select rs.id, 99,
  '{}'::jsonb,
  jsonb_build_object('type', 'stop', 'reason', 'no_rule')
from public.followup_rule_sets rs
on conflict (rule_set_id, position) do nothing;

-- Backfill decisions table comment for clarity.
comment on table public.followup_decisions is 'Decision ledger storing the latest orchestrator action per thread';

