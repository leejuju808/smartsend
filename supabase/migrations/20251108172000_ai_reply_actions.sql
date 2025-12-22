-- AI reply intent labels and actionable inbox support

-- A) Canonical AI labels (free text allowed too)
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'reply_intent'
      and n.nspname = 'public'
  ) then
    create type public.reply_intent as enum (
      'human_reply',
      'positive',
      'interested',
      'book_meeting',
      'question',
      'neutral',
      'negative',
      'objection',
      'out_of_office',
      'unsubscribe',
      'wrong_contact',
      'spam_trap_suspected',
      'bounce_like',
      'routing'
    );
  end if;
end
$$;

-- B) Extend normalized_messages to store model outputs (if not already present)
alter table public.normalized_messages
  add column if not exists ai_label public.reply_intent,
  add column if not exists ai_confidence real,
  add column if not exists ai_summary text,
  add column if not exists ai_action text,
  add column if not exists ai_meta jsonb;

create index if not exists idx_nm_ai_label on public.normalized_messages(ai_label);

-- C) Thread convenience flags
alter table public.inbox_threads
  add column if not exists needs_reply boolean not null default false,
  add column if not exists snoozed_until timestamptz;

-- D) Fast view for "Inbound needing action"
create or replace view public.v_inbound_actionable as
select
  nm.id as message_id,
  nm.linked_thread_id as thread_id,
  t.campaign_id,
  t.lead_id,
  nm.ai_label,
  nm.ai_confidence,
  nm.ai_action,
  nm.ai_meta,
  nm.sent_at
from public.normalized_messages nm
join public.inbox_threads t on t.id = nm.linked_thread_id
where nm.direction = 'inbound'
  and coalesce(nm.ai_action, '') not in ('ignore');


