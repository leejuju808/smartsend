-- Replies Inbox core schema: messages, view, indexes, RLS, helpers

-- 1.1 Messages (both outbound + inbound)
create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  -- 'in' (customer reply) | 'out' (our sent email)
  direction text not null check (direction in ('in','out')),
  subject text,
  body text,
  thread_id text,             -- provider thread id if available
  external_id text,           -- provider message id
  provider text,              -- 'gmail' | 'outlook' | 'mock'
  from_email text,
  to_email text,
  sent_at timestamptz not null default now(),
  is_read boolean not null default false,
  labels text[] default '{}', -- e.g., {important,needs_followup}
  created_at timestamptz not null default now()
);

create index if not exists em_campaign_lead_dir_time on public.email_messages (campaign_id, lead_id, direction, sent_at desc);
create index if not exists em_thread on public.email_messages (thread_id);
create index if not exists em_campaign_lead on public.email_messages (campaign_id, lead_id);

-- 1.2 View: latest activity per (campaign, lead)
create or replace view public.email_threads as
select
  m.campaign_id,
  m.lead_id,
  max(m.sent_at) as last_activity,
  max(m.id) filter (where m.direction = 'in') as last_inbound_id,
  max(m.id) filter (where m.direction = 'out') as last_outbound_id,
  count(*) filter (where m.direction = 'in' and not m.is_read) as unread_inbound
from public.email_messages m
group by m.campaign_id, m.lead_id;

-- 1.3 RLS
alter table public.email_messages enable row level security;

drop policy if exists "messages tenant read" on public.email_messages;
create policy "messages tenant read" on public.email_messages
for select using (
  auth.uid() = (select owner_id from public.campaigns c where c.id = email_messages.campaign_id)
);

drop policy if exists "messages tenant write" on public.email_messages;
create policy "messages tenant write" on public.email_messages
for insert with check (
  auth.uid() = (select owner_id from public.campaigns c where c.id = email_messages.campaign_id)
);

-- 1.4 Helper: mark inbound as read for a lead
create or replace function public.fn_mark_inbound_read(_campaign uuid, _lead uuid)
returns void
language plpgsql
as $$
begin
  update public.email_messages
  set is_read = true
  where campaign_id = _campaign
    and lead_id = _lead
    and direction = 'in'
    and is_read = false;
end;
$$;


