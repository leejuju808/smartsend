-- Block 477 — SDR Thread Summaries + Health Score (At-a-Glance Priority)
-- Every AI SDR thread gets an auto-generated summary and a health score (0–100)

-- ============================================================================
-- 1️⃣ Add columns to ai_sdr_threads
-- ============================================================================

alter table public.ai_sdr_threads
  add column if not exists summary text,
  add column if not exists summary_updated_at timestamptz,
  add column if not exists health_score integer check (health_score between 0 and 100),
  add column if not exists health_label text check (health_label in ('hot','warm','cold')),
  -- whether we should still auto-update summaries on this thread
  add column if not exists auto_summary_enabled boolean not null default true;

-- Indexes for efficient queries
create index if not exists idx_ai_sdr_threads_health_score on public.ai_sdr_threads(health_score desc);
create index if not exists idx_ai_sdr_threads_health_label on public.ai_sdr_threads(health_label);
create index if not exists idx_ai_sdr_threads_auto_summary on public.ai_sdr_threads(auto_summary_enabled) where auto_summary_enabled = true;
create index if not exists idx_ai_sdr_threads_summary_updated on public.ai_sdr_threads(summary_updated_at);

-- ============================================================================
-- 2️⃣ Update ai_sdr_thread_overview view to surface summary + health
-- ============================================================================

create or replace view ai_sdr_thread_overview as
select
  t.id as thread_id,
  t.lead_id,
  t.campaign_id,
  t.status,
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

comment on view ai_sdr_thread_overview is 'Overview of AI SDR threads with lead, campaign, summary, and health score info for list page';


