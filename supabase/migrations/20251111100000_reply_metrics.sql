-- AI reply classification metrics & auditing schema

create table if not exists public.ai_reply_classifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  message_id uuid,
  model text not null default 'gpt-4o-mini',
  ai_intent text not null,
  ai_confidence real,
  meta jsonb
);

create index if not exists idx_ai_cls_thread on public.ai_reply_classifications(thread_id);
create index if not exists idx_ai_cls_created on public.ai_reply_classifications(created_at);

create table if not exists public.reply_human_labels (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  human_intent text not null check (
    human_intent in (
      'positive',
      'neutral',
      'question',
      'negative',
      'unsubscribe',
      'out_of_office',
      'unknown'
    )
  ),
  note text
);

create index if not exists idx_human_labels_thread on public.reply_human_labels(thread_id);

create or replace view public.v_latest_human_label as
select distinct on (thread_id)
  thread_id,
  human_intent,
  created_at,
  created_by
from public.reply_human_labels
order by thread_id, created_at desc;

create or replace view public.v_intent_stats_30d as
select
  coalesce(ai_intent, 'unknown') as intent,
  count(*) as cnt
from public.inbox_threads
where ai_classified_at >= now() - interval '30 days'
group by 1
order by 2 desc;

create or replace view public.v_intent_audit_30d as
with base as (
  select
    t.id as thread_id,
    t.ai_intent,
    t.ai_confidence,
    t.ai_classified_at,
    h.human_intent
  from public.inbox_threads t
  join public.v_latest_human_label h on h.thread_id = t.id
  where t.ai_classified_at >= now() - interval '30 days'
)
select
  count(*) as audited,
  sum(case when ai_intent = human_intent then 1 else 0 end)::float / nullif(count(*), 0) as accuracy,
  avg(ai_confidence) as avg_confidence
from base;

create or replace view public.v_intent_confusion_30d as
select
  ai_intent,
  human_intent,
  count(*) as cnt
from (
  select
    t.ai_intent,
    h.human_intent
  from public.inbox_threads t
  join public.v_latest_human_label h on h.thread_id = t.id
  where t.ai_classified_at >= now() - interval '30 days'
) x
group by 1, 2;

create or replace view public.v_needs_audit as
select
  t.id,
  t.subject,
  t.ai_intent,
  t.ai_confidence,
  t.ai_classified_at,
  t.lead_id
from public.inbox_threads t
left join public.v_latest_human_label h on h.thread_id = t.id
where h.thread_id is null
order by t.ai_classified_at desc nulls last
limit 200;

alter table public.reply_human_labels enable row level security;
create policy if not exists "insert own labels" on public.reply_human_labels
for insert
to authenticated
with check (auth.uid() = created_by);

alter table public.ai_reply_classifications enable row level security;
create policy if not exists "svc writes logs" on public.ai_reply_classifications
for insert
to service_role
with check (true);

