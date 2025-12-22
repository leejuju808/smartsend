-- Inbound Reply Detection System
-- Creates inbox_messages table (if not exists) and trigger to auto-mark threads as replied

-- Core inbound messages table (if not yet)
create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  thread_id uuid references public.inbox_threads(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  account_id uuid references public.connected_accounts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  from_email text,
  to_email text,
  subject text,
  body_html text,
  body_text text,
  message_id text,
  in_reply_to text,
  received_at timestamptz default now(),
  raw jsonb
);

-- Add missing columns if table already exists
alter table public.inbox_messages
  add column if not exists account_id uuid references public.connected_accounts(id) on delete set null,
  add column if not exists body_html text,
  add column if not exists body_text text,
  add column if not exists message_id text,
  add column if not exists in_reply_to text,
  add column if not exists received_at timestamptz default now(),
  add column if not exists raw jsonb;

-- Add from_email/to_email if using different column names
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'inbox_messages' 
    and column_name = 'sender_email'
    and not exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'inbox_messages' 
      and column_name = 'from_email'
    )
  ) then
    alter table public.inbox_messages add column from_email text;
    update public.inbox_messages set from_email = sender_email where from_email is null;
  end if;

  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'inbox_messages' 
    and column_name = 'receiver_email'
    and not exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'inbox_messages' 
      and column_name = 'to_email'
    )
  ) then
    alter table public.inbox_messages add column to_email text;
    update public.inbox_messages set to_email = receiver_email where to_email is null;
  end if;
end $$;

create index if not exists idx_inbox_messages_inreply on public.inbox_messages(in_reply_to);
create index if not exists idx_inbox_messages_lead on public.inbox_messages(lead_id);
create index if not exists idx_inbox_messages_message_id on public.inbox_messages(message_id);

-- Ensure inbox_threads has replied_at and stopped_by_reply columns
alter table public.inbox_threads
  add column if not exists replied_at timestamptz,
  add column if not exists stopped_by_reply boolean default false;

create index if not exists idx_threads_replied_at on public.inbox_threads(replied_at);

-- Helper: auto-mark thread as replied
create or replace function public.handle_inbound_message()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Only process inbound messages (replies) - check if direction column exists
  if new.thread_id is not null then
    update public.inbox_threads
       set replied_at = now(),
           stopped_by_reply = true
     where id = new.thread_id
       and stopped_by_reply = false;

    perform public.cancel_future_queue_for_thread(new.thread_id);
  end if;
  
  return new;
end;
$$;

drop trigger if exists trg_inbound_reply on public.inbox_messages;
create trigger trg_inbound_reply
after insert on public.inbox_messages
for each row execute function public.handle_inbound_message();

grant execute on function public.handle_inbound_message() to service_role, authenticated;
