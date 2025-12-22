-- Send Queue MVP: Core tables for scheduling and sending emails
-- Outbound send logs
create table if not exists public.send_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  lead_id uuid,
  campaign_id uuid not null,
  provider text not null default 'gmail',
  thread_id text,
  provider_message_id text,
  subject text,
  body text not null,
  sent_at timestamptz default now(),
  error text
);
create index if not exists idx_send_logs_lead on public.send_logs(lead_id);
create index if not exists idx_send_logs_ws on public.send_logs(workspace_id);
create index if not exists idx_send_logs_campaign on public.send_logs(campaign_id);

-- Queue items
create table if not exists public.send_queue (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid not null,
  lead_id uuid,
  subject text not null,
  body text not null,
  scheduled_at timestamptz not null,
  attempts int not null default 0,
  last_attempt_at timestamptz,
  status text not null default 'pending', -- pending|sending|sent|failed
  error text
);
create index if not exists idx_send_queue_sched on public.send_queue(status, scheduled_at);
create index if not exists idx_send_queue_ws on public.send_queue(workspace_id);
create index if not exists idx_send_queue_campaign on public.send_queue(campaign_id);

-- Enable RLS
alter table public.send_logs enable row level security;
alter table public.send_queue enable row level security;

-- RLS policies for send_logs
drop policy if exists "send_logs_select_workspace" on public.send_logs;
create policy "send_logs_select_workspace" on public.send_logs
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = send_logs.workspace_id and wm.user_id = auth.uid()
    )
  );

drop policy if exists "send_logs_insert_service" on public.send_logs;
create policy "send_logs_insert_service" on public.send_logs
  for insert to service_role with check (true);

-- RLS policies for send_queue
drop policy if exists "send_queue_select_workspace" on public.send_queue;
create policy "send_queue_select_workspace" on public.send_queue
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = send_queue.workspace_id and wm.user_id = auth.uid()
    )
  );

drop policy if exists "send_queue_insert_workspace" on public.send_queue;
create policy "send_queue_insert_workspace" on public.send_queue
  for insert with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = send_queue.workspace_id and wm.user_id = auth.uid()
    )
  );

drop policy if exists "send_queue_update_service" on public.send_queue;
create policy "send_queue_update_service" on public.send_queue
  for update to service_role using (true) with check (true); 