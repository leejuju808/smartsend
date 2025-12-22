-- Ensure campaign_logs table exists with minimal fields for reply detection logs
create table if not exists public.campaign_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  event text, -- normalized event name (e.g., 'reply', 'reply_ignored', 'reply_unmatched')
  type text,  -- backward/alternative column name used in some code paths
  meta jsonb default '{}',
  created_at timestamptz not null default now()
);

-- Backward-compatible index for pagination by campaign
create index if not exists campaign_logs_campaign_idx on public.campaign_logs(campaign_id, created_at desc);


