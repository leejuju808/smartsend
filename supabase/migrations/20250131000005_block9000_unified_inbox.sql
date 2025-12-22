-- Block 9000 — SmartSend Unified Inbox (Reply Threads + Lead Conversation History)
-- Turn SmartSend into a TRUE cold email OS by giving every user a real inbox inside their dashboard

-- 1. Create smartsend_threads table
-- Every lead gets its own "thread" per campaign
create table if not exists public.smartsend_threads (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  last_message_at timestamptz default now(),
  status text default 'open' check (status in ('open', 'handled', 'archived')),
  ai_summary text,
  created_at timestamptz default now(),
  unique(lead_id, campaign_id)
);

-- Create indexes for efficient querying
create index if not exists idx_smartsend_threads_campaign_id 
  on public.smartsend_threads (campaign_id);

create index if not exists idx_smartsend_threads_lead_id 
  on public.smartsend_threads (lead_id);

create index if not exists idx_smartsend_threads_last_message_at 
  on public.smartsend_threads (last_message_at desc);

create index if not exists idx_smartsend_threads_status 
  on public.smartsend_threads (status);

-- 2. Create smartsend_thread_messages table
-- Holds every inbound/outbound message
create table if not exists public.smartsend_thread_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.smartsend_threads(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  subject text,
  body text,
  sent_at timestamptz default now()
);

-- Create indexes for efficient querying
create index if not exists idx_smartsend_thread_messages_thread_id 
  on public.smartsend_thread_messages (thread_id);

create index if not exists idx_smartsend_thread_messages_sent_at 
  on public.smartsend_thread_messages (sent_at desc);

create index if not exists idx_smartsend_thread_messages_direction 
  on public.smartsend_thread_messages (direction);

-- Enable RLS on both tables
alter table public.smartsend_threads enable row level security;
alter table public.smartsend_thread_messages enable row level security;

-- RLS policy: Users can view threads for their campaigns
create policy "smartsend_threads_select_own"
  on public.smartsend_threads
  for select
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = smartsend_threads.campaign_id
        and (c.user_id = auth.uid() or c.workspace_id in (
          select workspace_id from public.workspace_members wm
          where wm.user_id = auth.uid()
        ))
    )
  );

-- RLS policy: Users can insert threads for their campaigns
create policy "smartsend_threads_insert_own"
  on public.smartsend_threads
  for insert
  with check (
    exists (
      select 1 from public.campaigns c
      where c.id = smartsend_threads.campaign_id
        and (c.user_id = auth.uid() or c.workspace_id in (
          select workspace_id from public.workspace_members wm
          where wm.user_id = auth.uid()
        ))
    )
  );

-- RLS policy: Users can update threads for their campaigns
create policy "smartsend_threads_update_own"
  on public.smartsend_threads
  for update
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = smartsend_threads.campaign_id
        and (c.user_id = auth.uid() or c.workspace_id in (
          select workspace_id from public.workspace_members wm
          where wm.user_id = auth.uid()
        ))
    )
  );

-- RLS policy: Users can view messages for their threads
create policy "smartsend_thread_messages_select_own"
  on public.smartsend_thread_messages
  for select
  using (
    exists (
      select 1 from public.smartsend_threads st
      join public.campaigns c on c.id = st.campaign_id
      where st.id = smartsend_thread_messages.thread_id
        and (c.user_id = auth.uid() or c.workspace_id in (
          select workspace_id from public.workspace_members wm
          where wm.user_id = auth.uid()
        ))
    )
  );

-- RLS policy: Users can insert messages for their threads
create policy "smartsend_thread_messages_insert_own"
  on public.smartsend_thread_messages
  for insert
  with check (
    exists (
      select 1 from public.smartsend_threads st
      join public.campaigns c on c.id = st.campaign_id
      where st.id = smartsend_thread_messages.thread_id
        and (c.user_id = auth.uid() or c.workspace_id in (
          select workspace_id from public.workspace_members wm
          where wm.user_id = auth.uid()
        ))
    )
  );








