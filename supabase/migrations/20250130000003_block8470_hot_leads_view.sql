-- Block 8470 — Hot Lead Inbox (All "Hot" Replies in One View)
-- View: hot_leads
-- Shows each lead that has at least one 'hot' intent reply
-- with the timestamp of the most recent hot reply.

-- First, ensure inbound_replies table has intent_label and received_at columns
alter table public.inbound_replies
  add column if not exists intent_label text,
  add column if not exists received_at timestamptz;

-- Create index to support joins (if not already indexed)
create index if not exists idx_inbound_replies_lead_id_intent
  on public.inbound_replies (lead_id, intent_label)
  where intent_label is not null;

create index if not exists idx_inbound_replies_received_at
  on public.inbound_replies (received_at desc)
  where received_at is not null;

-- Create the hot_leads view
-- This view aggregates leads that have at least one 'hot' intent reply
create or replace view public.hot_leads as
select
  l.id::uuid              as lead_id,
  coalesce(l.name, trim(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, ''))) as lead_name,
  l.email                 as lead_email,
  l.phone                 as lead_phone,
  max(coalesce(ir.received_at, ir.created_at)) as last_hot_reply_at,
  count(ir.id)            as hot_reply_count
from public.leads l
join public.inbound_replies ir
  on ir.lead_id = l.id
where ir.intent_label = 'hot'
group by l.id, l.name, l.first_name, l.last_name, l.email, l.phone;

-- Grant access to authenticated users
grant select on public.hot_leads to authenticated;

-- Comment on the view
comment on view public.hot_leads is 'Shows each lead that has at least one hot intent reply, with the timestamp of the most recent hot reply';

























































