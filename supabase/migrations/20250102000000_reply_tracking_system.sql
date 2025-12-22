-- Reply Tracking System: DB schema for tracking email replies
-- 1) Add reply fields to send_logs
-- 2) Create account_mail_sync for polling state
-- 3) Create lead_activity for activity feed
-- 4) Create RPC function to mark replies
-- 5) Create view for address matching

-- ============================================================================
-- 1. Add reply columns to send_logs
-- ============================================================================

alter table public.send_logs
  add column if not exists replied_at timestamptz,
  add column if not exists reply_source text check (reply_source in ('gmail','outlook')),
  add column if not exists reply_message_id text,     -- provider id of the reply
  add column if not exists thread_id text,            -- conversation/thread id when known (provider thread/conversation id)
  add column if not exists in_reply_to_id text,       -- from reply headers for debugging
  add column if not exists reply_summary text;        -- short snippet we'll store

-- Ensure message_id exists (may already exist from previous migrations)
alter table public.send_logs
  add column if not exists message_id text;

-- Create indexes for reply matching
create index if not exists idx_send_logs_msgid on public.send_logs(message_id) where message_id is not null;
create index if not exists idx_send_logs_replied on public.send_logs(replied_at) where replied_at is not null;

-- ============================================================================
-- 2. Per account sync state (poll cursors)
-- ============================================================================

create table if not exists public.account_mail_sync (
  account_id uuid primary key references public.connected_accounts(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook')),
  last_checked_at timestamptz default now(),
  gmail_history_id text,        -- optional, if you adopt Gmail History API later
  outlook_delta_link text       -- Graph delta link (optional)
);

create index if not exists idx_account_mail_sync_last_checked on public.account_mail_sync(last_checked_at);

-- ============================================================================
-- 3. Lightweight lead activity feed (optional but useful)
-- ============================================================================

create table if not exists public.lead_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  send_log_id uuid references public.send_logs(id) on delete cascade,
  type text not null check (type in ('sent','open','click','reply')),
  occurred_at timestamptz not null default now(),
  meta jsonb default '{}'::jsonb,
  unique(send_log_id, type)  -- prevent duplicate activity entries per send_log
);

create index if not exists idx_lead_activity_lead on public.lead_activity(lead_id, occurred_at desc);
create index if not exists idx_lead_activity_user on public.lead_activity(user_id, occurred_at desc);

-- RLS for lead_activity
alter table public.lead_activity enable row level security;

drop policy if exists "lead_activity_select_own" on public.lead_activity;
create policy "lead_activity_select_own" on public.lead_activity
  for select
  using (user_id = auth.uid());

-- ============================================================================
-- 4. RPC function: mark_send_as_replied (idempotent)
-- ============================================================================

create or replace function public.mark_send_as_replied(
  p_send_log_id uuid,
  p_source text,
  p_reply_message_id text,
  p_in_reply_to_id text,
  p_thread_id text,
  p_summary text
) returns void language plpgsql as $$
declare
  v_user_id uuid;
  v_lead_id uuid;
  v_campaign_id uuid;
begin
  -- Update send_logs (only if not already marked)
  update public.send_logs
     set replied_at = coalesce(replied_at, now()),
         reply_source = coalesce(reply_source, p_source),
         reply_message_id = coalesce(reply_message_id, p_reply_message_id),
         in_reply_to_id = coalesce(in_reply_to_id, p_in_reply_to_id),
         thread_id = coalesce(thread_id, p_thread_id),
         reply_summary = coalesce(reply_summary, p_summary)
   where id = p_send_log_id
   returning user_id, lead_id, campaign_id into v_user_id, v_lead_id, v_campaign_id;

  -- Insert activity if we got the IDs
  if v_user_id is not null and v_lead_id is not null then
    insert into public.lead_activity(user_id, lead_id, campaign_id, send_log_id, type, occurred_at, meta)
    values (
      v_user_id,
      v_lead_id,
      v_campaign_id,
      p_send_log_id,
      'reply',
      now(),
      jsonb_build_object('source', p_source, 'summary', p_summary, 'thread_id', p_thread_id)
    )
    on conflict do nothing; -- prevent duplicates if called multiple times
  end if;
end;
$$;

grant execute on function public.mark_send_as_replied(uuid, text, text, text, text, text) to service_role;

-- ============================================================================
-- 5. Helper SQL view: quick mapping for match-by-address
-- ============================================================================

create or replace view public.v_send_address_map as
select
  sl.id as send_log_id,
  sl.message_id,
  lower(coalesce(sl.recipient_email, '')) as lead_email,
  sl.sent_at,
  sl.user_id,
  sl.campaign_id,
  sl.lead_id,
  ca.email_address as from_email
from public.send_logs sl
left join public.send_queue sq on sq.lead_id = sl.lead_id and sq.campaign_id = sl.campaign_id
left join public.connected_accounts ca on sq.account_id = ca.id
where sl.recipient_email is not null;

-- Grant select on view
grant select on public.v_send_address_map to service_role, authenticated;

