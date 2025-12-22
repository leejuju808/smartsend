-- Block 483 — AI SDR Objection Detection Engine (Real-Time Inbound Classifier + Suggested Replies + Auto-Route Rules)
-- Detects objection category on inbound email, generates suggested reply, triggers automated workflow updates

-- ============================================================================
-- 1️⃣ Create Table: ai_sdr_objections
-- ============================================================================

create table if not exists public.ai_sdr_objections (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.ai_sdr_threads(id) on delete cascade,
  email_id uuid not null references public.emails(id) on delete cascade,

  objection_type text check (objection_type in (
    'not_interested',
    'too_expensive',
    'no_budget',
    'bad_timing',
    'using_competitor',
    'not_decision_maker',
    'come_back_later',
    'send_info',
    'spam_complaint',
    'unclear',
    'other'
  )),

  confidence numeric check (confidence >= 0 and confidence <= 1),
  objection_summary text,
  suggested_reply text,

  created_at timestamptz default now()
);

-- Indexes for efficient queries
create index if not exists idx_ai_sdr_objections_thread on public.ai_sdr_objections(thread_id);
create index if not exists idx_ai_sdr_objections_email on public.ai_sdr_objections(email_id);
create index if not exists idx_ai_sdr_objections_type on public.ai_sdr_objections(objection_type);
create index if not exists idx_ai_sdr_objections_created on public.ai_sdr_objections(created_at desc);

alter table public.ai_sdr_objections enable row level security;

create policy "user sees their objections"
  on public.ai_sdr_objections
  for select
  using (
    auth.uid() = (
      select l.user_id from public.leads l
      join public.ai_sdr_threads t on t.lead_id = l.id
      where t.id = ai_sdr_objections.thread_id
    )
  );

-- ============================================================================
-- 2️⃣ Update ai_sdr_thread_overview View to include last_objection_type
-- ============================================================================

create or replace view public.ai_sdr_thread_overview as
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

  t.next_best_action,
  t.next_best_action_reason,
  t.next_best_action_generated_at,
  t.next_best_action_options,

  l.email as lead_email,
  coalesce(l.first_name || ' ' || l.last_name, l.first_name, l.last_name, l.email) as lead_name,
  c.name as campaign_name,

  (
    select e.event_type
    from public.ai_sdr_events e
    where e.thread_id = t.id
    order by e.created_at desc
    limit 1
  ) as last_ai_event_type,
  (
    select e.created_at
    from public.ai_sdr_events e
    where e.thread_id = t.id
    order by e.created_at desc
    limit 1
  ) as last_ai_event_at,

  (
    select o.objection_type
    from public.ai_sdr_objections o
    where o.thread_id = t.id
    order by o.created_at desc
    limit 1
  ) as last_objection_type

from public.ai_sdr_threads t
join public.leads l on l.id = t.lead_id
left join public.campaigns c on c.id = t.campaign_id;

comment on view public.ai_sdr_thread_overview is 'Overview of AI SDR threads with lead, campaign, summary, health score, inbox state, next best action, and last objection type info for list page';


