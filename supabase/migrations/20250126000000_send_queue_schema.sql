-- Send Queue Schema with cancellation support
-- This table manages the email send queue with status tracking and cancellation support

create table if not exists public.send_queue (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid not null,
  lead_id uuid not null,
  email_template_id uuid,
  scheduled_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','scheduled','sending','sent','canceled','failed')),
  reason_canceled text,
  canceled_at timestamptz,
  created_at timestamptz not null default now()
);

-- Index for fetching due items efficiently
create index if not exists send_queue_workspace_scheduled_idx
  on public.send_queue(workspace_id, scheduled_at)
  where status in ('pending','scheduled');

-- Index for lead/campaign lookups (for cancellation queries)
create index if not exists send_queue_lead_campaign_idx
  on public.send_queue(lead_id, campaign_id);

-- Enable RLS
alter table public.send_queue enable row level security;

-- RLS: reads - user must belong to the same workspace
create policy "read send_queue in workspace"
on public.send_queue for select
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = send_queue.workspace_id 
    and wm.user_id = auth.uid()
  )
);

-- RLS: writes from app (enqueue/cancel) done by service role
create policy "service writes send_queue"
on public.send_queue for all
to service_role using (true) with check (true); 