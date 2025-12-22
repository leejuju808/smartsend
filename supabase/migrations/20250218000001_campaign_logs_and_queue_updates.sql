-- campaign_logs: record every send attempt
create table if not exists public.campaign_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  event text not null,             -- queued | sending | sent | failed
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_campaign_logs_campaign on public.campaign_logs(campaign_id);
create index if not exists idx_campaign_logs_lead on public.campaign_logs(lead_id);
create index if not exists idx_campaign_logs_event on public.campaign_logs(event);
create index if not exists idx_campaign_logs_created_at on public.campaign_logs(created_at desc);

-- Add helpful columns to send_queue
alter table public.send_queue
  add column if not exists updated_at timestamptz default now(),
  add column if not exists provider text,          -- 'gmail' | 'outlook' | etc.
  add column if not exists message_id text,        -- provider message id (if sent)
  add column if not exists state text default 'queued', -- 'queued' | 'sending' | 'sent' | 'failed'
  add column if not exists last_error text,
  add column if not exists attempt int default 0,
  add column if not exists scheduled_at timestamptz;

-- Update existing status column to use state if needed
-- Ensure scheduled_at is properly set
update public.send_queue
set scheduled_at = coalesce(scheduled_at, created_at)
where scheduled_at is null;

-- RLS for campaign_logs
alter table public.campaign_logs enable row level security;

create policy "campaign_logs_select_workspace" on public.campaign_logs
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = (
        select workspace_id from campaigns where id = campaign_logs.campaign_id
      ) and wm.user_id = auth.uid()
    )
  );

create policy "campaign_logs_insert_service" on public.campaign_logs
  for insert to service_role with check (true);