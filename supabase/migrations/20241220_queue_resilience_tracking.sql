-- Queue resilience
alter table send_queue
  add column if not exists next_attempt_at timestamptz default now(),
  add column if not exists retry_count int default 0,
  add column if not exists max_retries int default 5,
  add column if not exists provider_status text,
  add column if not exists delivered_at timestamptz,
  add column if not exists opened_at timestamptz;

-- Optional: workspace-level defaults
create table if not exists workspace_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid, -- link to your workspace/users table if you have it
  from_email text not null default 'SmartSend <noreply@yourdomain.com>',
  daily_quota int not null default 1000,
  created_at timestamptz default now()
);

-- Helpful index
create index if not exists idx_queue_status_nextattempt
  on send_queue (status, next_attempt_at);

-- Expand logs a bit
alter table send_logs
  add column if not exists event text,          -- sent | delivered | opened | bounced | failed
  add column if not exists meta jsonb;          -- raw webhook bits