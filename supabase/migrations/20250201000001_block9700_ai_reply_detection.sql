-- Block 9700 — SmartSend AI Reply Detection v1 (Intent Labels + Auto-Mark as Replied + Stop Sequence)
-- Every time someone replies, SmartSend should automatically:
-- 1. Detect what kind of reply it is (Interested / Not Interested / Neutral / OOO / Unsubscribe / Bounce)
-- 2. Mark the lead + campaign as "replied" (no more follow-ups)
-- 3. Attach an AI-intent label to the thread & lead
-- 4. Feed this into stats + inbox UI

-- 1) Extend leads table with reply fields
alter table public.leads
  add column if not exists reply_status text default 'none';
  -- none | replied

alter table public.leads
  add column if not exists reply_intent text;
  -- interested | not_interested | neutral | out_of_office | unsubscribe | bounce | other

alter table public.leads
  add column if not exists last_reply_at timestamptz;

alter table public.leads
  add column if not exists last_reply_snippet text;

alter table public.leads
  add column if not exists do_not_contact boolean default false;

-- Create indexes for efficient querying
create index if not exists idx_leads_reply_status 
  on public.leads (reply_status) 
  where reply_status = 'replied';

create index if not exists idx_leads_reply_intent 
  on public.leads (reply_intent);

create index if not exists idx_leads_do_not_contact 
  on public.leads (do_not_contact) 
  where do_not_contact = true;

create index if not exists idx_leads_last_reply_at 
  on public.leads (last_reply_at desc) 
  where last_reply_at is not null;

-- 2) Extend smartsend_threads with intent
alter table public.smartsend_threads
  add column if not exists intent text;
  -- same values as reply_intent on leads

create index if not exists idx_smartsend_threads_intent 
  on public.smartsend_threads (intent);

-- 3) Create Reply Events Table
create table if not exists public.smartsend_reply_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  thread_id uuid references public.smartsend_threads(id) on delete set null,
  raw_subject text,
  raw_body text,
  intent text,
  is_first_reply boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_smartsend_reply_events_campaign_id 
  on public.smartsend_reply_events (campaign_id);

create index if not exists idx_smartsend_reply_events_lead_id 
  on public.smartsend_reply_events (lead_id);

create index if not exists idx_smartsend_reply_events_thread_id 
  on public.smartsend_reply_events (thread_id);

create index if not exists idx_smartsend_reply_events_intent 
  on public.smartsend_reply_events (intent);

create index if not exists idx_smartsend_reply_events_created_at 
  on public.smartsend_reply_events (created_at desc);

-- Enable RLS on smartsend_reply_events
alter table public.smartsend_reply_events enable row level security;

-- RLS policy: Users can view reply events for their campaigns
create policy "smartsend_reply_events_select_own"
  on public.smartsend_reply_events
  for select
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = smartsend_reply_events.campaign_id
        and (c.user_id = auth.uid() or c.workspace_id in (
          select workspace_id from public.workspace_members wm
          where wm.user_id = auth.uid()
        ))
    )
  );

-- RLS policy: Service role can insert reply events (via edge function)
create policy "smartsend_reply_events_insert_service"
  on public.smartsend_reply_events
  for insert
  with check (true); -- Service role bypasses RLS


































































