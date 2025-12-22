-- Ensure connected_accounts supports 'outlook' provider
do $$
declare
  constraint_name text;
begin
  -- Find existing provider check constraint
  select tc.constraint_name into constraint_name
  from information_schema.table_constraints tc
  where tc.table_schema = 'public' 
    and tc.table_name = 'connected_accounts'
    and tc.constraint_type = 'CHECK'
    and exists (
      select 1 from information_schema.constraint_column_usage ccu
      where ccu.constraint_name = tc.constraint_name
      and ccu.column_name = 'provider'
    )
  limit 1;
  
  -- If constraint exists, drop it and recreate with outlook support
  if constraint_name is not null then
    execute format('alter table public.connected_accounts drop constraint if exists %I', constraint_name);
    alter table public.connected_accounts
      add constraint connected_accounts_provider_check
      check (provider in ('gmail', 'outlook'));
  elsif not exists (
    -- If no constraint exists, add it
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'connected_accounts'
    and constraint_name = 'connected_accounts_provider_check'
  ) then
    alter table public.connected_accounts
      add constraint connected_accounts_provider_check
      check (provider in ('gmail', 'outlook'));
  end if;
end $$;

-- Per mailbox sync state (Gmail HistoryId / Outlook Delta token)

create table if not exists public.mail_sync_state (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.connected_accounts(id) on delete cascade unique,
  gmail_history_id text,
  outlook_delta_token text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_mail_sync_state_account on public.mail_sync_state(account_id);

-- Add counterparty_email to inbox_threads if not exists
alter table public.inbox_threads
  add column if not exists counterparty_email text;

create index if not exists idx_inbox_threads_counterparty on public.inbox_threads(counterparty_email);

-- Add snooze_until to inbox_threads if not exists
alter table public.inbox_threads
  add column if not exists snooze_until timestamptz;

-- Add ai_label, ai_confidence, classified_at to inbox_messages if not exists
alter table public.inbox_messages
  add column if not exists ai_label text,
  add column if not exists ai_confidence numeric(3,2),
  add column if not exists classified_at timestamptz;

-- Add direction column if not exists (for inbound messages)
alter table public.inbox_messages
  add column if not exists direction text check (direction in ('in','out'));

create index if not exists idx_inbox_messages_ai_label on public.inbox_messages(ai_label) where ai_label is not null;
create index if not exists idx_inbox_messages_direction on public.inbox_messages(direction) where direction = 'in';

-- Ensure inbox_threads can handle nullable campaign/lead for fallback threads
do $$
begin
  -- Make campaign_id nullable if there's a NOT NULL constraint and we want to support fallback threads
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inbox_threads' and column_name = 'campaign_id'
    and is_nullable = 'NO'
  ) then
    -- Only make nullable if we need to support counterparty-only threads
    -- For now, we'll require campaign+lead, but allow NULL for fallback cases
    alter table public.inbox_threads alter column campaign_id drop not null;
  end if;
  
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inbox_threads' and column_name = 'lead_id'
    and is_nullable = 'NO'
  ) then
    alter table public.inbox_threads alter column lead_id drop not null;
  end if;
end $$;

-- Thread upsert helper (by campaign/lead when known, else by counterparty)

create or replace function public.upsert_thread_for_inbound(
  p_campaign uuid,
  p_lead uuid,
  p_from_email text,
  p_to_email text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_thread uuid;
  v_counterparty text;
begin
  v_counterparty := coalesce(p_from_email, p_to_email);
  
  -- Prefer existing by campaign+lead
  if p_campaign is not null and p_lead is not null then
    select id into v_thread from public.inbox_threads
     where campaign_id = p_campaign and lead_id = p_lead
     limit 1;
  end if;

  -- Fallback: thread by counterparty (if no campaign/lead match found)
  if v_thread is null and v_counterparty is not null then
    -- Try to find existing thread by counterparty
    select id into v_thread from public.inbox_threads
     where counterparty_email = v_counterparty
       and (campaign_id is null or campaign_id = p_campaign)
       and (lead_id is null or lead_id = p_lead)
     limit 1;
  end if;

  -- Create new thread if still not found
  if v_thread is null then
    insert into public.inbox_threads(campaign_id, lead_id, counterparty_email)
    values (p_campaign, p_lead, v_counterparty)
    returning id into v_thread;
  end if;

  return v_thread;
end;
$$;

-- Regex-based OOO detector (subject + headers)

create or replace function public.is_ooo(p_subject text, p_headers jsonb)
returns boolean language sql immutable as $$
  select
    coalesce(
      (p_headers->>'Auto-Submitted') ilike 'auto-replied%' or
      (p_headers->>'X-Autoreply') is not null or
      (p_headers->>'X-Autorespond') is not null or
      (p_subject ~* '(out of office|automatic reply|autoreply|away until|vacation)'),
      false
    );
$$;

-- Simple return date extractor for OOO (e.g., "back on Nov 12")

create or replace function public.ooo_return_at(p_body text)
returns timestamptz language plpgsql immutable as $$
declare
  v text := coalesce(p_body,'');
  d text;
  ts timestamptz;
begin
  -- Try formats: Nov 12, November 12, 11/12/2025
  d := (select regexp_replace(m[1], '\s+', ' ')
        from regexp_matches(v, '(?:back|return|available)\s+(?:on|by|after)?\s*([A-Za-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?)', 'i') m limit 1);
  if d is not null then
    begin ts := to_timestamp(d, 'Mon DD, YYYY'); exception when others then null; end;
    if ts is null then begin ts := to_timestamp(d, 'Mon DD'); exception when others then null; end;
    if ts is not null then return ts; end if;
  end if;

  d := (select m[1] from regexp_matches(v, '(\d{1,2}/\d{1,2}/\d{2,4})', 'i') m limit 1);
  if d is not null then
    begin ts := to_timestamp(d, 'MM/DD/YYYY'); exception when others then null; end;
    if ts is null then begin ts := to_timestamp(d, 'MM/DD/YY'); exception when others then null; end;
    if ts is not null then return ts; end if;
  end if;

  return null;
end;
$$;

-- Bounce detector (Delivery Status Notification)

create or replace function public.is_bounce(p_headers jsonb, p_body text)
returns boolean language sql immutable as $$
  with h as (
    select
      coalesce(p_headers->>'X-Failed-Recipients','') as failed,
      coalesce(p_headers->>'Diagnostic-Code','') as dcode,
      coalesce(p_headers->>'Status','') as status
  )
  select
    (status ~ '^[245]\.\d+\.\d+' or
     dcode ~* '(mailbox unavailable|user unknown|blocked|policy rejection|quota|relay access denied)' or
     p_body ~* '(delivery (?:has )?failed|undeliverable|mailbox full|550 |5\.1\.)');
$$;

