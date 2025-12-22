-- Send Queue and Logs Tables
-- Matches exact specification: send_queue references leads(id), send_logs for audit trail

-- Ensure send_queue table has the exact schema specified
create table if not exists public.send_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  mailbox_id uuid not null references public.connected_accounts(id) on delete cascade,
  step_no int not null default 1,
  scheduled_at timestamptz not null,
  status text not null check (status in ('queued','sending','sent','failed','skipped')) default 'queued',
  last_error text,
  created_at timestamptz default now()
);

create index if not exists idx_send_queue_due on public.send_queue (status, scheduled_at);
create index if not exists idx_send_queue_campaign on public.send_queue (campaign_id);
create index if not exists idx_send_queue_lead on public.send_queue (lead_id);

-- Ensure send_logs table exists with specified schema
create table if not exists public.send_logs (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references public.send_queue(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  mailbox_id uuid references public.connected_accounts(id) on delete cascade,
  sent_at timestamptz default now(),
  status text check (status in ('sent','failed','skipped')),
  error text
);

create index if not exists idx_send_logs_queue on public.send_logs (queue_id);
create index if not exists idx_send_logs_campaign on public.send_logs (campaign_id);

-- Enable RLS if not already enabled
alter table public.send_queue enable row level security;
alter table public.send_logs enable row level security;

-- RLS policies for send_queue (read access for authorized users)
drop policy if exists send_queue_select on public.send_queue;
create policy send_queue_select on public.send_queue
  for select using (
    exists (
      select 1 from public.campaigns c
      where c.id = send_queue.campaign_id
      and (c.user_id = auth.uid() or can_view_campaign(c.id))
    )
  );

-- RLS policies for send_logs
drop policy if exists send_logs_select on public.send_logs;
create policy send_logs_select on public.send_logs
  for select using (
    exists (
      select 1 from public.campaigns c
      where c.id = send_logs.campaign_id
      and (c.user_id = auth.uid() or can_view_campaign(c.id))
    )
  );

-- Grant service role full access for writes (edge functions, API routes)
grant all on public.send_queue to service_role;
grant all on public.send_logs to service_role;






