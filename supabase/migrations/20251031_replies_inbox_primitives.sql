-- 20251031_replies_inbox_primitives.sql

-- 1. Messages table (direction=in|out); you likely already have something similar—safe to CREATE IF NOT EXISTS here.
create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  campaign_id uuid,
  direction text not null check (direction in ('in','out')),
  subject text,
  body_text text,
  body_html text,
  sent_at timestamptz not null default now(),
  provider_message_id text,
  error text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- helpful indexes
create index if not exists idx_email_messages_thread on public.email_messages(thread_id, sent_at desc);
create index if not exists idx_email_messages_lead on public.email_messages(lead_id);
create index if not exists idx_email_messages_unread on public.email_messages(is_read) where is_read=false;

-- 2. Thread "rollup" view for a fast left pane
create or replace view public.inbox_threads as
with latest as (
  select
    em.thread_id,
    max(em.sent_at) as last_at
  from public.email_messages em
  group by em.thread_id
),
last_msg as (
  select distinct on (em.thread_id)
    em.thread_id,
    em.id as last_message_id,
    em.body_text,
    em.subject,
    em.direction,
    em.sent_at
  from public.email_messages em
  order by em.thread_id, em.sent_at desc
),
unread as (
  select thread_id, count(*)::int as unread_count
  from public.email_messages
  where direction='in' and is_read=false
  group by thread_id
)
select
  l.thread_id,
  l.last_at,
  coalesce(u.unread_count, 0) as unread_count,
  lm.last_message_id,
  left(coalesce(lm.body_text, lm.subject, ''), 140) as last_snippet,
  lm.direction as last_direction,
  ld.id as lead_id,
  ld.email as lead_email,
  ld.first_name,
  ld.last_name,
  ld.company
from latest l
join last_msg lm on lm.thread_id = l.thread_id
join public.leads ld on ld.id = (select lead_id from public.email_messages where thread_id=l.thread_id order by sent_at desc limit 1)
left join unread u on u.thread_id = l.thread_id
order by l.last_at desc;

-- 3. Realtime (Supabase broadcasts changes off tables by default when enabled)
-- Enable realtime on email_messages table
do $$ begin
  alter publication supabase_realtime add table public.email_messages;
exception when duplicate_object then null; end $$;

-- 4. (Optional) basic RLS scaffolding (adapt to your auth model/workspace_id)
alter table public.email_messages enable row level security;

-- Allow workspace members to read their messages
do $$
begin
  if not exists (select 1 from pg_policies where tablename='email_messages' and policyname='allow_workspace_members_read') then
    create policy allow_workspace_members_read
    on public.email_messages
    for select
    using (
      exists (
        select 1
        from public.leads ld
        where ld.id = email_messages.lead_id
          and ld.workspace_id in (
            select workspace_id from public.workspace_members where user_id = auth.uid()
          )
      )
    );
  end if;
  
  if not exists (select 1 from pg_policies where tablename='email_messages' and policyname='allow_workspace_members_insert') then
    create policy allow_workspace_members_insert
    on public.email_messages
    for insert
    with check (
      exists (
        select 1
        from public.leads ld
        where ld.id = email_messages.lead_id
          and ld.workspace_id in (
            select workspace_id from public.workspace_members where user_id = auth.uid()
          )
      )
    );
  end if;
  
  if not exists (select 1 from pg_policies where tablename='email_messages' and policyname='allow_workspace_members_update') then
    create policy allow_workspace_members_update
    on public.email_messages
    for update
    using (
      exists (
        select 1
        from public.leads ld
        where ld.id = email_messages.lead_id
          and ld.workspace_id in (
            select workspace_id from public.workspace_members where user_id = auth.uid()
          )
      )
    );
  end if;
end$$;

-- 5. Grant view permissions to authenticated users
grant select on public.inbox_threads to authenticated;

