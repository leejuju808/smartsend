-- Scheduling support for campaigns
alter table if exists public.campaigns
  add column if not exists scheduled_at timestamptz;

-- optional indexes for scheduler
create index if not exists idx_campaigns_status on public.campaigns(status);
create index if not exists idx_campaigns_scheduled_at on public.campaigns(scheduled_at);

