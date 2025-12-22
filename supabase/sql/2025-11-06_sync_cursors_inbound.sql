-- Inbound sync cursors + inbound writer (run in Supabase SQL)

-- A) Per-account sync state ----------------------------------------------------
create table if not exists public.account_sync_state (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook')),
  -- Gmail: historyId or last_checked_at; Outlook: last_checked_at
  gmail_history_id text,
  gmail_watch_expiry timestamptz,
  outlook_subscription_id text,
  outlook_subscription_expiry timestamptz,
  last_checked_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  unique(account_id)
);

create index if not exists idx_sync_account on public.account_sync_state(account_id);

alter table public.account_sync_state
  add column if not exists gmail_watch_expiry timestamptz,
  add column if not exists outlook_subscription_id text,
  add column if not exists outlook_subscription_expiry timestamptz;

-- Optional: push notification event logs (debug visibility)
create table if not exists public.push_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider text,
  account_id uuid references public.connected_accounts(id) on delete cascade,
  payload jsonb
);

-- B) Ensure inbox messages has direction --------------------------------------
alter table public.inbox_messages
  add column if not exists direction text check (direction in ('inbound','outbound')) default 'inbound';

-- C) Thread upsert + inbound write (service-role) ------------------------------
create or replace function public._inbox_write_inbound(
  p_lead uuid,
  p_campaign uuid,
  p_provider text,
  p_provider_thread_id text,
  p_provider_message_id text,
  p_subject text,
  p_body_html text,
  p_ai_label text default null
) returns uuid
language plpgsql
security definer
as $$
declare
  v_thread uuid;
begin
  -- find existing thread
  select id into v_thread
    from public.inbox_threads
   where campaign_id = p_campaign
     and lead_id = p_lead
   order by updated_at desc
   limit 1;

  -- create one if missing
  if v_thread is null then
    insert into public.inbox_threads (campaign_id, lead_id, provider, provider_thread_id, updated_at)
    values (p_campaign, p_lead, p_provider, p_provider_thread_id, now())
    returning id into v_thread;
  else
    update public.inbox_threads
       set provider = coalesce(provider, p_provider),
           provider_thread_id = coalesce(provider_thread_id, p_provider_thread_id),
           updated_at = now(),
           replied_at = now()
     where id = v_thread;
  end if;

  -- insert inbound message
  insert into public.inbox_messages (
    thread_id, direction, subject, body_html, provider, provider_message_id, ai_label
  ) values (
    v_thread, 'inbound', p_subject, p_body_html, p_provider, p_provider_message_id, p_ai_label
  );

  return v_thread;
end;
$$;

revoke all on function public._inbox_write_inbound(uuid,uuid,text,text,text,text,text,text) from anon, authenticated;

