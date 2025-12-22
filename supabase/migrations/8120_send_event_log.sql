-- 8120 - Send event log (per attempt history)

create table if not exists public.campaign_send_events (
  id uuid primary key default gen_random_uuid(),

  queue_id uuid not null references public.campaign_send_queue(id) on delete cascade,
  campaign_id uuid not null,
  lead_id uuid,
  to_email text not null,

  -- snapshot of attempt state
  attempt integer not null,
  status text not null check (status in ('processing', 'sent', 'retry', 'failed')),

  -- metadata
  provider varchar(32),
  provider_message_id text,
  last_error text,

  -- timestamps
  created_at timestamptz not null default now()
);

-- Helpful index for dashboard / drill-down
create index if not exists idx_campaign_send_events_queue
  on public.campaign_send_events (queue_id, created_at);

create index if not exists idx_campaign_send_events_campaign
  on public.campaign_send_events (campaign_id, created_at);

































































