-- Follow-up auto-optimize controls and audit trail

-- A) Extend followup_rules with auto-tune knobs
alter table public.followup_rules
  add column if not exists auto_optimize boolean not null default false,
  add column if not exists min_hours_wait int not null default 12,
  add column if not exists max_hours_wait int not null default 72,
  add column if not exists step_hours int not null default 6,
  add column if not exists max_nudges_min int not null default 1,
  add column if not exists max_nudges_max int not null default 4,
  add column if not exists tone_pool text[] not null default '{professional,friendly,concise}',
  add column if not exists last_optimized_at timestamptz,
  add column if not exists optimization_notes text;

-- B) Audit table for transparency
create table if not exists public.followup_rule_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid,
  before jsonb not null,
  after jsonb not null,
  reason text not null
);

create index if not exists idx_followup_audit_campaign on public.followup_rule_audit(campaign_id);

-- C) Helper view: reply quality by campaign (7d window)
create or replace view public.v_reply_mix_7d as
with base as (
  select
    t.campaign_id,
    nm.ai_label,
    (nm.sent_at at time zone 'utc')::date as d
  from public.normalized_messages nm
  join public.inbox_threads t on t.id = nm.linked_thread_id
  where nm.direction = 'inbound'
    and nm.sent_at >= now() - interval '7 days'
)
select
  campaign_id,
  count(*) as total_inbound,
  sum((ai_label in ('human_reply','positive','question'))::int) as positiveish,
  sum((ai_label in ('routing','neutral'))::int) as neutralish,
  sum((ai_label in ('unsubscribe','negative'))::int) as negativeish
from base
group by campaign_id;

