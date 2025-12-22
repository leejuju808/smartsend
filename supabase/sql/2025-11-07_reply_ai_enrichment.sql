-- Reply AI enrichment and evaluation scaffolding
-- Run in Supabase SQL editor (idempotent)

-- A) Rich AI fields on inbox_messages
alter table if exists public.inbox_messages
  add column if not exists ai_label text,
  add column if not exists ai_score numeric,
  add column if not exists ai_alt jsonb default '[]'::jsonb,
  add column if not exists ai_lang text,
  add column if not exists ai_reason text,
  add column if not exists ai_version text;

create index if not exists idx_inbox_ai_label on public.inbox_messages(ai_label);
create index if not exists idx_inbox_ai_created on public.inbox_messages(created_at desc);

-- B) Optional evaluation scaffolding
create table if not exists public.reply_eval (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message_id uuid not null references public.inbox_messages(id) on delete cascade,
  gold_label text not null,
  notes text
);

create table if not exists public.reply_confusion (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  version text not null,
  predicted text not null,
  gold text not null
);

-- C) Fast view for latest inbound per thread (with AI fields)
create or replace view public.v_thread_last_inbound as
select distinct on (t.id)
  t.id as thread_id,
  t.campaign_id,
  t.lead_id,
  m.id as message_id,
  m.created_at as last_inbound_at,
  m.ai_label as ai_label,
  m.ai_label as last_label,
  m.ai_score as ai_score,
  m.ai_score as last_confidence,
  m.ai_reason as ai_reason,
  m.ai_reason as last_reason
from public.inbox_threads t
join public.inbox_messages m on m.thread_id = t.id and m.direction = 'inbound'
order by t.id, m.created_at desc;

