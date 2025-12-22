-- Inbox System Hardening and Schema
-- Adds user_id, RLS, indexes, and creates v_inbox_rows view

-- Step 0: Schema hardening - add user_id columns and ensure leads have user_id
alter table leads add column if not exists user_id uuid not null default auth.uid();

-- Ensure email_messages has necessary columns (already exist in 20250228000000 migration)
-- alter table email_messages add column if not exists body_plain text;

-- Add user_id to email_messages if it doesn't exist  
do $$ begin
  if not exists (select 1 from information_schema.columns 
      where table_schema='public' and table_name='email_messages' and column_name='user_id') then
    alter table email_messages add column user_id uuid;
  end if;
end $$;

-- sent_messages already exists in 20250228000000 migration
-- Just ensure it has user_id column

do $$ begin
  if not exists (select 1 from information_schema.columns 
      where table_schema='public' and table_name='sent_messages' and column_name='user_id') then
    alter table sent_messages add column user_id uuid;
  end if;
end $$;

-- Backfill user_id from leads
update email_messages em
set user_id = l.user_id
from leads l
where em.lead_id = l.id and em.user_id is null;

update sent_messages sm
set user_id = l.user_id
from leads l
where sm.lead_id = l.id and sm.user_id is null;

-- Indexes for speed
create index if not exists idx_leads_user_id on leads(user_id);
create index if not exists idx_em_lead_inbound_time on email_messages(lead_id, is_inbound, sent_at desc nulls last);
create index if not exists idx_sm_lead_time on sent_messages(lead_id, sent_at desc nulls last);
create index if not exists idx_em_thread_time on email_messages(thread_id, sent_at desc nulls last);

-- RLS hardening - read-only for clients; writes via service role only
alter table leads enable row level security;
alter table email_messages enable row level security;
alter table sent_messages enable row level security;

-- Drop and recreate policies for clarity
drop policy if exists "read leads" on leads;
drop policy if exists "read leads by owner" on leads;
create policy "read leads by owner" on leads
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "read messages" on email_messages;
drop policy if exists "read messages by owner" on email_messages;
create policy "read messages by owner" on email_messages
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "read sent" on sent_messages;
drop policy if exists "read sent by owner" on sent_messages;
create policy "read sent by owner" on sent_messages
  for select to authenticated
  using (user_id = auth.uid());

-- Revoke write permissions from authenticated (service role handles writes)
revoke insert, update, delete on leads, email_messages, sent_messages from authenticated;

-- Ensure service role has full access
do $$ begin
  if not exists (select 1 from pg_policies where policyname='service full access leads') then
    create policy "service full access leads" on leads for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname='service full access email_messages') then
    create policy "service full access email_messages" on email_messages for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname='service full access sent_messages') then
    create policy "service full access sent_messages" on sent_messages for all to service_role using (true) with check (true);
  end if;
end $$;

-- Step 1: Create v_inbox_rows view for the Inbox
create or replace view v_inbox_rows as
select
  l.id as lead_id,
  l.user_id,
  l.email,
  l.first_name,
  l.last_name,
  l.company,
  l.status,
  -- latest inbound
  li.id as latest_inbound_id,
  li.sent_at as latest_inbound_at,
  left(coalesce(li.subject,''), 150) as latest_inbound_subject,
  left(coalesce(li.body_plain,''), 280) as latest_inbound_snippet,
  li.thread_id as latest_thread_id,
  -- latest outbound
  lo.id as latest_outbound_id,
  lo.sent_at as latest_outbound_at,
  left(coalesce(lo.subject,''), 150) as latest_outbound_subject,
  -- derived flags
  (li.sent_at is not null and (lo.sent_at is null or li.sent_at > lo.sent_at)) as has_new_reply
from leads l
left join lateral (
  select id, sent_at, subject, body_plain, thread_id
  from email_messages
  where lead_id = l.id and is_inbound = true
  order by sent_at desc nulls last
  limit 1
) li on true
left join lateral (
  select id, sent_at, subject
  from email_messages
  where lead_id = l.id and is_inbound = false
  order by sent_at desc nulls last
  limit 1
) lo on true;

-- Grant access to authenticated users
grant select on v_inbox_rows to authenticated;

