-- Block 8200 — SmartSend Auto-Reply Detector (AI Reply Parsing + Mark Lead as Replied)
-- Automatically detect when a lead replies to an email, update lead status, pause campaign, log the reply

-- 1. Create smartsend_replies table
create table if not exists public.smartsend_replies (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  raw_text text,
  ai_summary text,
  ai_intent text, -- replied | unsubscribe | interested | not_interested
  created_at timestamptz default now()
);

-- Create indexes for efficient querying
create index if not exists idx_smartsend_replies_lead_campaign 
  on public.smartsend_replies (lead_id, campaign_id);

create index if not exists idx_smartsend_replies_created_at 
  on public.smartsend_replies (created_at desc);

-- 2. Add "replied" status columns to leads table
alter table public.leads
  add column if not exists replied_at timestamptz;

alter table public.leads
  add column if not exists reply_status text; -- replied | interested | not_interested | unsubscribed

-- Create index for replied leads lookup
create index if not exists idx_leads_replied_at 
  on public.leads (replied_at desc) 
  where replied_at is not null;

-- Enable RLS on smartsend_replies
alter table public.smartsend_replies enable row level security;

-- RLS policy: Users can view replies for their campaigns
create policy "smartsend_replies_select_own"
  on public.smartsend_replies
  for select
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = smartsend_replies.campaign_id
        and (c.user_id = auth.uid() or c.workspace_id in (
          select workspace_id from public.workspace_members wm
          where wm.user_id = auth.uid()
        ))
    )
  );

-- Service role can insert/update (for edge functions)
create policy "smartsend_replies_service_role"
  on public.smartsend_replies
  for all
  using (true)
  with check (true);


