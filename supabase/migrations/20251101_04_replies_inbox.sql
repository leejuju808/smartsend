-- 04_replies_inbox.sql

-- Speed up lookups from inbound email → lead
create index if not exists idx_inbound_from_email on public.inbound_messages (from_email);

-- Lightweight triage state per lead (one row per lead)
create table if not exists public.inbox_triage (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  starred boolean not null default false,
  resolved boolean not null default false,
  notes text,
  updated_at timestamptz not null default now()
);

-- View: latest inbound message per lead (so we can list "threads")
create or replace view public.inbox_latest_by_lead as
select
  l.id            as lead_id,
  l.campaign_id   as campaign_id,
  l.email,
  l.company,
  l.first_name,
  l.last_name,
  c.name          as campaign_name,
  im.subject      as last_subject,
  im.body         as last_body,
  im.created_at   as last_message_at,
  coalesce(t.starred, false)  as starred,
  coalesce(t.resolved, false) as resolved
from public.leads l
join public.campaigns c on c.id = l.campaign_id
join lateral (
  select *
  from public.inbound_messages im
  where im.from_email = l.email
  order by im.created_at desc
  limit 1
) im on true
left join public.inbox_triage t on t.lead_id = l.id;


