-- Reply tracking and suppression system
-- Per lead per campaign status tracking + lightweight inbox table

-- Add reply tracking columns to campaign_leads
alter table public.campaign_leads
  add column if not exists replied_at timestamptz,
  add column if not exists last_reply_snippet text,
  add column if not exists thread_id text,         -- provider thread/msg id for linkage
  add column if not exists provider_email text;     -- the mailbox that received reply

-- Create lightweight inbox table for UI/debug
create table if not exists public.replies_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  provider_email text not null,         -- your connected Gmail/Outlook address
  thread_id text,                       -- Gmail threadId / Outlook conversationId
  message_id text,                      -- Gmail id / Outlook id
  from_email text not null,
  subject text,
  snippet text,
  received_at timestamptz not null default now()
);

-- Indexes for fast linkage
create index if not exists idx_campaign_leads_status on public.campaign_leads(campaign_id, lead_id, replied_at);
create index if not exists idx_replies_inbox_user_received on public.replies_inbox(user_id, received_at desc);
create index if not exists idx_replies_inbox_campaign_lead on public.replies_inbox(campaign_id, lead_id);

-- RLS for replies_inbox
alter table public.replies_inbox enable row level security;

drop policy if exists sel_replies_inbox on public.replies_inbox;
create policy sel_replies_inbox on public.replies_inbox
  for select using (user_id = auth.uid());

drop policy if exists ins_replies_inbox on public.replies_inbox;
create policy ins_replies_inbox on public.replies_inbox
  for insert with check (user_id = auth.uid());

-- RPC function for campaign reply counts
create or replace function public.get_campaign_reply_counts(c_id uuid)
returns table (replied_count int, total int) 
language sql stable 
security definer
as $$
  select
    count(*) filter (where replied_at is not null)::int as replied_count,
    count(*)::int as total
  from public.campaign_leads
  where campaign_id = c_id 
    and exists (
      select 1 from public.campaigns c 
      where c.id = campaign_leads.campaign_id 
      and c.user_id = auth.uid()
    );
$$;

