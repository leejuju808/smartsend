-- Block 8100 - SmartSend Campaign Flow Optimizer (Reliable Queue + Scheduler Sync)
-- Creates reliable queue table and adds scheduler fields to campaigns

-- 1. Create smartsend_queue table
create table if not exists public.smartsend_queue (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'retry')),
  attempts int not null default 0,
  scheduled_at timestamptz not null,
  processed_at timestamptz,
  error text,
  created_at timestamptz default now()
);

-- Create indexes for efficient querying
create index if not exists idx_smartsend_queue_campaign_status_scheduled 
  on public.smartsend_queue (campaign_id, status, scheduled_at);

create index if not exists idx_smartsend_queue_status_scheduled 
  on public.smartsend_queue (status, scheduled_at) 
  where status = 'pending';

create index if not exists idx_smartsend_queue_lead 
  on public.smartsend_queue (lead_id);

-- 2. Add scheduler fields to campaigns table
alter table public.campaigns
  add column if not exists next_run timestamptz,
  add column if not exists send_interval_seconds int default 60;

-- Create index for scheduler queries
create index if not exists idx_campaigns_status_next_run 
  on public.campaigns (status, next_run) 
  where status = 'running';

-- 3. RPC function to get next lead for a campaign
create or replace function public.smartsend_get_next_lead(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  next_lead jsonb;
begin
  select to_jsonb(l.*)
  into next_lead
  from public.leads l
  where l.campaign_id = p_campaign_id
    and l.status = 'pending'
    and not exists (
      -- Exclude leads already in queue
      select 1 
      from public.smartsend_queue q 
      where q.lead_id = l.id 
        and q.status in ('pending', 'processing', 'retry')
    )
  order by l.created_at asc
  limit 1;

  return next_lead;
end;
$$;

-- Grant execute permission
grant execute on function public.smartsend_get_next_lead(uuid) to service_role, authenticated;

-- Enable RLS on smartsend_queue
alter table public.smartsend_queue enable row level security;

-- RLS policies for smartsend_queue
-- Users can read queue items for their campaigns
create policy "smartsend_queue_select_own"
  on public.smartsend_queue
  for select
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = smartsend_queue.campaign_id
        and (c.user_id = auth.uid() or c.workspace_id in (
          select workspace_id from public.workspace_members wm
          where wm.user_id = auth.uid()
        ))
    )
  );

-- Service role can insert/update (for edge functions)
create policy "smartsend_queue_service_role"
  on public.smartsend_queue
  for all
  using (true)
  with check (true);

