-- Inbox + Reply State System
-- Tracks inbound messages and auto-marks leads as replied with classification

-- =====================================================
-- 0. Add event type to send_logs
-- =====================================================
-- Update send_logs to allow 'auto_mark_replied' event
alter table public.send_logs drop constraint if exists send_logs_event_check;
alter table public.send_logs add constraint send_logs_event_check 
  check (event in ('enqueued','reserved','sent','failed','canceled','retry','auto_mark_replied'));

-- =====================================================
-- 1. Lead reply state columns
-- =====================================================
-- Add to campaign_leads (flattened) since send_queue references campaign_leads
alter table public.campaign_leads
  add column if not exists replied_at timestamptz,
  add column if not exists reply_label text check (reply_label in (
    'positive','neutral','negative','ooh','unsubscribe','bounce','unknown'
  ));

create index if not exists idx_campaign_leads_replied_at on public.campaign_leads(replied_at);

-- =====================================================
-- 2. Inbox messages (normalized)
-- =====================================================
create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  mailbox_id uuid references public.connected_accounts(id) on delete set null,
  lead_id uuid references public.campaign_leads(id) on delete set null,

  provider text not null check (provider in ('gmail','outlook')),
  provider_msg_id text not null,
  provider_thread_id text,
  direction text not null check (direction in ('in','out')),

  from_email text,
  to_email text,
  subject text,
  body_text text,
  body_html text,

  received_at timestamptz not null default now(),
  classified jsonb not null default '{}'::jsonb,
  is_reply boolean not null default false,
  reply_label text check (reply_label in ('positive','neutral','negative','ooh','unsubscribe','bounce','unknown'))
);

create unique index if not exists uq_inbox_provider_msg on public.inbox_messages(provider, provider_msg_id);
create index if not exists idx_inbox_user_received on public.inbox_messages(user_id, received_at desc);
create index if not exists idx_inbox_campaign on public.inbox_messages(campaign_id);
create index if not exists idx_inbox_lead on public.inbox_messages(lead_id);

-- =====================================================
-- 3. RLS (members can view; only service writes)
-- =====================================================
alter table public.inbox_messages enable row level security;

create policy "inbox.select.members"
on public.inbox_messages for select
using (
  user_id = auth.uid() or
  (campaign_id is not null and public.can_view_campaign(campaign_id))
);

-- no client writes
revoke all on table public.inbox_messages from anon, authenticated;

-- =====================================================
-- 4. Helper: mark replied atomically + activity/log
-- =====================================================
create or replace function public.mark_lead_replied(
  p_user uuid, p_campaign uuid, p_lead uuid, p_label text, p_msg_id text
) returns void
language plpgsql
security definer
as $$
begin
  -- Update campaign_leads (flattened, matches send_queue.lead_id)
  update public.campaign_leads
     set replied = true,
         replied_at = coalesce(replied_at, now()),
         reply_label = coalesce(reply_label, p_label)
   where id = p_lead and campaign_id = p_campaign;

  -- optional: cancel future queued sends for this lead
  delete from public.send_queue
   where lead_id = p_lead and campaign_id = p_campaign;

  -- log event
  insert into public.send_logs (user_id, campaign_id, lead_id, event, detail)
  values (p_user, p_campaign, p_lead, 'auto_mark_replied',
          jsonb_build_object('label', p_label, 'provider_msg_id', p_msg_id));
end;
$$;

revoke all on function public.mark_lead_replied(uuid,uuid,uuid,text,text) from public;
grant execute on function public.mark_lead_replied(uuid,uuid,uuid,text,text) to service_role;
