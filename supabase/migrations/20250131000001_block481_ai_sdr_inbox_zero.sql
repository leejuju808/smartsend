-- Block 481 — AI SDR "Inbox Zero" Engine (Auto-Dismiss, Auto-Archive, Auto-Prioritize)
-- Makes SmartSend feel like a real SDR inbox with automatic cleanup rules

-- ============================================================================
-- 1️⃣ Add "Inbox State" Columns to ai_sdr_threads
-- ============================================================================

alter table public.ai_sdr_threads
  add column if not exists inbox_state text
    check (inbox_state in ('active','archived','muted','dismissed'))
    default 'active',

  add column if not exists inbox_state_reason text,

  add column if not exists inbox_state_updated_at timestamptz;

-- Indexes for efficient queries
create index if not exists idx_ai_sdr_threads_inbox_state on public.ai_sdr_threads(inbox_state);
create index if not exists idx_ai_sdr_threads_inbox_state_updated on public.ai_sdr_threads(inbox_state_updated_at);

-- ============================================================================
-- 2️⃣ Update ai_sdr_thread_overview View
-- ============================================================================

create or replace view ai_sdr_thread_overview as
select
  t.id as thread_id,
  t.lead_id,
  t.campaign_id,
  t.status,
  t.inbox_state,
  t.inbox_state_reason,
  t.inbox_state_updated_at,

  t.last_message_from,
  t.last_message_at,
  t.next_action_at,

  t.summary,
  t.summary_updated_at,
  t.health_score,
  t.health_label,
  t.auto_summary_enabled,

  l.email as lead_email,
  coalesce(l.first_name || ' ' || l.last_name, l.first_name, l.last_name, l.email) as lead_name,
  c.name as campaign_name,

  (
    select e.event_type
    from ai_sdr_events e
    where e.thread_id = t.id
    order by e.created_at desc
    limit 1
  ) as last_ai_event_type,
  (
    select e.created_at
    from ai_sdr_events e
    where e.thread_id = t.id
    order by e.created_at desc
    limit 1
  ) as last_ai_event_at

from ai_sdr_threads t
join leads l on l.id = t.lead_id
left join campaigns c on c.id = t.campaign_id;

comment on view ai_sdr_thread_overview is 'Overview of AI SDR threads with lead, campaign, summary, health score, and inbox state info for list page';


