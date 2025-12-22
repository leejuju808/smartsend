-- Inbound ingest + AI labeling helpers (idempotent)
-- Run in Supabase SQL editor

-- A) Fast text search extension ------------------------------------------------
create extension if not exists pg_trgm;
create extension if not exists "uuid-ossp";

-- B) Lightweight AI labeler (rule-based MVP; swap later with LLM) --------------
create or replace function public.detect_ai_label(p_text text)
returns text
language sql
immutable
as $$
  select case
    when p_text is null or length(trim(p_text)) = 0 then 'noise'
    when p_text ~* '(mail delivery|undeliverable|returned mail|bounce|address not found|550 |5\.1\.)' then 'noise'
    when p_text ~* '(out of office|auto[- ]?reply|vacation responder|ooo)' then 'reply-ooo'
    when p_text ~* '(wrong person|not the right person|try support@|contact our vendor)' then 'reply-oos'
    when p_text ~* '(unsubscribe|remove me|stop emailing|do not contact)' then 'reply-negative'
    when p_text ~* '(not interested|no thanks|please stop)' then 'reply-negative'
    when p_text ~* '(interested|let.?s talk|call|book|schedule|this week|demo|send details|pricing)' then 'reply-positive'
    when p_text ~* '(who are you|what is this|more info|how does|can you|do you)' then 'reply-neutral'
    else 'reply-neutral'
  end;
$$;

-- C) Provider account state helpers --------------------------------------------
alter table public.connected_accounts
  add column if not exists last_poll_at timestamptz,
  add column if not exists meta jsonb default '{}'::jsonb;

create index if not exists idx_accounts_provider
  on public.connected_accounts(provider);

-- Ensure dead letter queue exists for poller failure logging
create table if not exists public.dead_letter_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text,
  payload jsonb,
  meta jsonb default '{}'::jsonb
);

-- D) Inbound ingest RPC --------------------------------------------------------
create or replace function public.ingest_inbound_message(
  p_provider text,
  p_account uuid,
  p_provider_thread_id text,
  p_provider_message_id text,
  p_from_email text,
  p_to_email text,
  p_subject text,
  p_html text,
  p_text text,
  p_headers jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid;
  v_lead uuid;
  v_campaign uuid;
  v_ai text;
  v_msg uuid;
begin
  -- 1) Resolve thread by provider_thread_id if present
  if p_provider_thread_id is not null then
    select id, campaign_id, lead_id into v_thread, v_campaign, v_lead
    from public.inbox_threads
    where provider = p_provider
      and provider_thread_id = p_provider_thread_id
      and (account_id = p_account or p_account is null)
    limit 1;
  end if;

  -- 2) Fallback: try resolve by recipient lead email (to_email)
  if v_thread is null and p_to_email is not null then
    select l.id, l.campaign_id
      into v_lead, v_campaign
    from public.leads l
    where lower(l.email) = lower(p_to_email)
    order by l.created_at desc
    limit 1;

    if v_lead is not null then
      -- create a thread if missing
      insert into public.inbox_threads(campaign_id, lead_id, account_id, provider, provider_thread_id, subject, updated_at)
      values (v_campaign, v_lead, p_account, p_provider, p_provider_thread_id, coalesce(p_subject,''), now())
      returning id into v_thread;
    end if;
  end if;

  if v_thread is null then
    -- cannot resolve; create an orphan thread bucket (optional)
    insert into public.inbox_threads(campaign_id, lead_id, account_id, provider, provider_thread_id, subject, updated_at)
    values (null, null, p_account, p_provider, p_provider_thread_id, coalesce(p_subject,''), now())
    returning id into v_thread;
  end if;

  -- 3) Label
  v_ai := public.detect_ai_label(coalesce(p_text, p_html, p_subject));

  -- 4) Insert inbound message (idempotent on provider_message_id)
  insert into public.inbox_messages(
    thread_id, direction, created_at, html, text, from_email, to_email,
    ai_label, provider_message_id, headers
  )
  values (
    v_thread, 'inbound', now(), p_html, p_text, p_from_email, p_to_email,
    v_ai, p_provider_message_id, p_headers
  )
  on conflict (provider_message_id) do nothing
  returning id into v_msg;

  -- 5) Touch thread
  update public.inbox_threads
    set updated_at = now(),
        replied_at = case
          when v_ai not in ('reply-ooo','noise') then coalesce(replied_at, now())
          else replied_at
        end,
        stopped_by_reply = case
          when v_ai not in ('reply-ooo','noise') then true
          else stopped_by_reply
        end
  where id = v_thread;

  -- 6) If this is a real reply (not bounce/ooo/unsub), cancel pending future
  if v_ai not in ('reply-ooo','noise') then
    perform public.cancel_future_queue_for_thread(v_thread);
  end if;

  return v_msg;
end;
$$;


