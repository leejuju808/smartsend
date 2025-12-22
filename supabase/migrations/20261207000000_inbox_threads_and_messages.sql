-- Threads (one per lead x campaign)

create table if not exists public.inbox_threads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  subject text,
  assigned_to uuid references auth.users(id),
  status text not null default 'open' check (status in ('open','snoozed','closed')),
  last_message_at timestamptz default now(),
  last_direction text check (last_direction in ('in','out')),
  unread_count int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, lead_id)
);

create index if not exists idx_threads_campaign on public.inbox_threads(campaign_id, updated_at desc);
create index if not exists idx_threads_assignee on public.inbox_threads(assigned_to);
create index if not exists idx_threads_status on public.inbox_threads(status);

-- Messages (if not already)

create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  sender_email text,
  receiver_email text,
  subject text,
  body text,
  raw jsonb,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_msgs_thread on public.inbox_messages(thread_id, sent_at desc);
create index if not exists idx_msgs_campaign on public.inbox_messages(campaign_id, sent_at desc);

alter table public.inbox_threads enable row level security;
alter table public.inbox_messages enable row level security;

-- RLS: Anyone who can view campaign can read; only owner/editor can mutate.

drop policy if exists "thr_read" on public.inbox_threads;
create policy "thr_read"
on public.inbox_threads
for select
using (
  public.can_view_campaign(campaign_id)
  and exists (select 1 from public.campaigns c where c.id = campaign_id and c.deleted_at is null)
);

drop policy if exists "thr_write" on public.inbox_threads;
create policy "thr_write"
on public.inbox_threads
for insert, update, delete
using (public.can_edit_campaign(campaign_id))
with check (public.can_edit_campaign(campaign_id));

drop policy if exists "msg_read" on public.inbox_messages;
create policy "msg_read"
on public.inbox_messages
for select
using (
  public.can_view_campaign(campaign_id)
  and exists (select 1 from public.campaigns c where c.id = campaign_id and c.deleted_at is null)
);

drop policy if exists "msg_write" on public.inbox_messages;
create policy "msg_write"
on public.inbox_messages
for insert, update, delete
using (public.can_edit_campaign(campaign_id))
with check (public.can_edit_campaign(campaign_id));

-- Audit logs: add assignment events

alter table public.audit_logs
  add column if not exists thread_id uuid references public.inbox_threads(id);

-- Triggers to keep thread metadata current

create or replace function public.tg_inbox_messages_after()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.inbox_threads
    set last_message_at = coalesce(NEW.sent_at, now()),
        last_direction = NEW.direction,
        updated_at = now(),
        unread_count = case when NEW.direction = 'in' then unread_count + 1 else unread_count end
  where id = NEW.thread_id;
  return NEW;
end
$$;

drop trigger if exists tr_msgs_after on public.inbox_messages;
create trigger tr_msgs_after
after insert on public.inbox_messages
for each row execute function public.tg_inbox_messages_after();

-- Upsert helper when the first reply arrives (creates thread if missing)

create or replace function public.upsert_thread_on_message(
  p_campaign uuid, p_lead uuid, p_subject text, p_direction text
) returns uuid
language plpgsql security definer
as $$
declare v_thread uuid;
begin
  select id into v_thread
  from public.inbox_threads
  where campaign_id = p_campaign and lead_id = p_lead;

  if v_thread is null then
    insert into public.inbox_threads (campaign_id, lead_id, subject, last_direction)
    values (p_campaign, p_lead, left(coalesce(p_subject,''), 160), p_direction)
    returning id into v_thread;
  end if;

  return v_thread;
end
$$;

-- SQL helper for read-count reset

create or replace function public.mark_thread_read(p_thread uuid)
returns void language plpgsql security definer as $$
begin
  update public.inbox_threads
    set unread_count = 0, updated_at = now()
  where id = p_thread
    and public.can_view_campaign(campaign_id);
end $$;
