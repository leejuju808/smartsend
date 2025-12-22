-- Email Sync System: Provider IDs, Uniques, and Upsert Helpers
-- Idempotent migration - safe to run multiple times

-- A) Provider ids on messages and threads + uniques for dedupe

alter table public.inbox_messages
  add column if not exists provider_message_id text,
  add column if not exists headers jsonb default '{}'::jsonb;

create unique index if not exists uq_messages_provider_id
  on public.inbox_messages(provider_message_id)
  where provider_message_id is not null;

alter table public.inbox_threads
  add column if not exists provider_thread_id text;

create index if not exists idx_threads_provider_thread
  on public.inbox_threads(provider, provider_thread_id);

-- B) Lightweight sender/recipient columns (optional but handy)

alter table public.inbox_messages
  add column if not exists from_name text,
  add column if not exists to_name text;

-- Add body_text if missing (for text-only messages)
alter table public.inbox_messages
  add column if not exists body_text text;

-- C) Heuristic stitcher: find or create a thread for an inbound

create or replace function public.stitch_thread_for_inbound(
  p_provider text,
  p_provider_thread_id text,
  p_to_email text,          -- our connected account email (recipient)
  p_from_email text,        -- lead email (sender)
  p_subject text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid;
  v_campaign uuid;
  v_lead uuid;
  v_account_id uuid;
begin
  -- 1) If we already have the provider thread, use it
  select id into v_thread
    from public.inbox_threads
    where provider = p_provider and provider_thread_id = p_provider_thread_id
    limit 1;
  if v_thread is not null then
    return v_thread;
  end if;

  -- 2) Resolve lead by email (tenant-unique per owner)
  select id into v_lead from public.leads where email = p_from_email limit 1;

  -- 3) Resolve campaign using most recent sent_log to this lead/account
  select sl.campaign_id
    into v_campaign
    from public.send_logs sl
    join public.connected_accounts a on a.id = sl.account_id
    where sl.lead_id = v_lead
      and a.from_email = p_to_email
    order by sl.created_at desc
    limit 1;

  -- 4) Find account
  select id into v_account_id
    from public.connected_accounts a
    where a.from_email = p_to_email
    limit 1;

  if v_account_id is null then
    -- No account found, return null
    return null;
  end if;

  -- 5) Create thread
  insert into public.inbox_threads (campaign_id, account_id, lead_id, subject, provider, provider_thread_id, updated_at)
  values (v_campaign, v_account_id, v_lead, coalesce(p_subject, '(no subject)'), p_provider, p_provider_thread_id, now())
  returning id into v_thread;

  return v_thread;
end $$;

-- D) Upsert inbound message (returns inbox_messages.id)

create or replace function public.upsert_inbound_message(
  p_thread uuid,
  p_provider_message_id text,
  p_from_email text,
  p_to_email text,
  p_subject text,
  p_body_html text,
  p_body_text text,
  p_headers jsonb default '{}'::jsonb,
  p_created_at timestamptz default now()
) returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  -- dedupe by provider_message_id
  if p_provider_message_id is not null then
    select id into v_id from public.inbox_messages where provider_message_id = p_provider_message_id;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  insert into public.inbox_messages(
    thread_id, direction, provider_message_id,
    from_email, to_email, subject,
    body_html, body_text, headers,
    created_at
  )
  values (
    p_thread, 'inbound', p_provider_message_id,
    p_from_email, p_to_email, p_subject,
    p_body_html, p_body_text, p_headers,
    p_created_at
  )
  returning id into v_id;

  -- bump thread freshness
  update public.inbox_threads set updated_at = greatest(updated_at, p_created_at) where id = p_thread;

  return v_id;
end $$;

