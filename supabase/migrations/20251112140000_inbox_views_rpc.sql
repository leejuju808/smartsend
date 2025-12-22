-- Inbox views, labels, snoozes, and RPC for inbox UI
-- Run in Supabase SQL editor if applying manually.

-- ============================================================================
-- A) Thread labels table (fed by reply classifier / rules)
-- ============================================================================

create table if not exists public.thread_labels (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  label text not null check (label in (
    'action_required','question','positive','neutral','ooo','not_interested','bounce','routing'
  )),
  confidence real not null default 0.8,
  unique(thread_id, label)
);

create index if not exists idx_thread_labels_thread on public.thread_labels(thread_id);
create index if not exists idx_thread_labels_label on public.thread_labels(label);

alter table public.thread_labels enable row level security;

-- ============================================================================
-- B) Thread snoozes (optional quick action support)
-- ============================================================================

create table if not exists public.thread_snoozes (
  thread_id uuid primary key references public.threads(id) on delete cascade,
  until timestamptz not null
);

create index if not exists idx_thread_snoozes_until on public.thread_snoozes(until);

-- ============================================================================
-- C) Ensure messages schema supports unread tracking
-- ============================================================================

alter table public.messages
  add column if not exists is_read boolean not null default false;

create index if not exists idx_messages_thread_created on public.messages(thread_id, created_at desc);
create index if not exists idx_threads_lead on public.threads(lead_id);
create index if not exists idx_leads_email on public.leads(email);
create index if not exists idx_messages_created_desc on public.messages(created_at desc);

-- ============================================================================
-- D) Helper views
-- ============================================================================

-- Last message per thread (direction + read state)
create or replace view public.v_thread_last_message as
select distinct on (m.thread_id)
  m.thread_id,
  m.id as message_id,
  m.created_at as last_msg_at,
  m.direction,
  m.is_read
from public.messages m
order by m.thread_id, m.created_at desc;

-- Unread inbound counts per thread
create or replace view public.v_thread_unread as
select thread_id, count(*)::int as unread_count
from public.messages
where direction = 'inbound' and coalesce(is_read, false) = false
group by thread_id;

-- Most recent / highest confidence label per thread
create or replace view public.v_thread_primary_label as
select
  tl.thread_id,
  (array_agg(tl.label order by tl.confidence desc, tl.created_at desc))[1] as primary_label,
  (array_agg(tl.confidence order by tl.confidence desc, tl.created_at desc))[1] as label_confidence
from public.thread_labels tl
group by tl.thread_id;

-- ============================================================================
-- E) Inbox rollup with engagement + relevance scoring
-- ============================================================================

create or replace view public.v_inbox as
with base as (
  select
    t.id as thread_id,
    t.lead_id,
    coalesce(l.name, concat_ws(' ', l.first_name, l.last_name)) as lead_name,
    l.email as lead_email,
    coalesce(ls.score, 0)::real as lead_score,
    coalesce(l.score_v3, 0)::int as lead_score_v3,
    coalesce(u.unread_count, 0) as unread_count,
    coalesce(lm.last_msg_at, t.last_message_at, t.created_at) as last_msg_at,
    lm.direction as last_direction,
    pl.primary_label,
    pl.label_confidence,
    -- Engagement score = lead score + unread boost + recency boost
    (
      coalesce(ls.score, 0)
      + (least(coalesce(u.unread_count, 0), 5) * 4)
      + greatest(
          0,
          30 - extract(epoch from (now() - coalesce(lm.last_msg_at, t.last_message_at, t.created_at))) / 3600
        )
    )::real as engagement_score,
    -- Relevance score with label weights, lead score, unread weight, recency weight
    (
      coalesce(
        case pl.primary_label
          when 'action_required' then 40
          when 'question' then 35
          when 'routing' then 25
          when 'positive' then 20
          when 'neutral' then 10
          when 'ooo' then -10
          when 'not_interested' then -20
          when 'bounce' then -40
          else 0
        end,
        0
      )
      + (coalesce(ls.score, 0) * 0.5)
      + (least(coalesce(u.unread_count, 0), 5) * 6)
      + greatest(
          0,
          24 - extract(epoch from (now() - coalesce(lm.last_msg_at, t.last_message_at, t.created_at))) / 3600
        ) * 1.5
    )::real as relevance_score
  from public.threads t
  join public.leads l on l.id = t.lead_id
  left join public.lead_scores ls on ls.lead_id = t.lead_id
  left join public.v_thread_unread u on u.thread_id = t.id
  left join public.v_thread_last_message lm on lm.thread_id = t.id
  left join public.v_thread_primary_label pl on pl.thread_id = t.id
  left join public.thread_snoozes ts
    on ts.thread_id = t.id
   and ts.until > now()
  where ts.thread_id is null
)
select * from base;

comment on view public.v_inbox is 'Inbox rollup view combining lead scores, unread counts, labels, and recency heuristics';

-- ============================================================================
-- F) RPC: fetch inbox with filters / sort / pagination
-- ============================================================================

create or replace function public.fetch_inbox(
  p_filter text default 'all',
  p_sort text default 'relevance',
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  thread_id uuid,
  lead_id uuid,
  lead_name text,
  lead_email text,
  primary_label text,
  unread_count int,
  last_msg_at timestamptz,
  engagement_score real,
  relevance_score real,
  lead_score real
)
language sql
as $$
  with base as (
    select *
    from public.v_inbox
    where case p_filter
      when 'unread' then unread_count > 0
      when 'actionable' then primary_label in ('action_required','question','routing')
      when 'ooo' then primary_label = 'ooo'
      when 'positive' then primary_label = 'positive'
      when 'not_interested' then primary_label = 'not_interested'
      else true
    end
  )
  select
    thread_id,
    lead_id,
    lead_name,
    lead_email,
    primary_label,
    unread_count,
    last_msg_at,
    engagement_score,
    relevance_score,
    lead_score
  from base
  order by
    case p_sort
      when 'engagement' then engagement_score
      when 'recent' then extract(epoch from last_msg_at)
      when 'unread' then unread_count
      else relevance_score
    end desc,
    last_msg_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(p_offset, 0);
$$;

grant execute on function public.fetch_inbox(text, text, int, int) to authenticated, service_role;

-- ============================================================================
-- G) Comments
-- ============================================================================

comment on function public.fetch_inbox(text, text, int, int) is
  'Filterable, sortable inbox query with pagination. Filters: all/unread/actionable/positive/ooo/not_interested; Sorts: relevance/engagement/recent/unread.';


