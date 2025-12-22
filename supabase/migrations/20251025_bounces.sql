-- Bounce Handling Migration
-- Adds bounce tracking, hard/soft bounce classification, and retry logic

create type bounce_kind as enum ('hard','soft');

-- Bounces table
create table if not exists public.email_bounces (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  email_log_id uuid,
  campaign_id uuid,
  recipient text not null,
  kind bounce_kind not null,
  smtp_status text,             -- e.g., 550 5.1.1
  diagnostic text,              -- DSN diagnostic-code / reason
  provider text,                -- gmail/outlook/smtp
  raw jsonb,
  created_at timestamptz default now()
);

create index if not exists ix_bounces_ws_recipient on public.email_bounces(workspace_id, recipient);
create index if not exists ix_bounces_kind on public.email_bounces(kind);
create index if not exists ix_bounces_email_log on public.email_bounces(email_log_id);

-- Add attempts column to email_logs for retry tracking
alter table public.email_logs add column if not exists attempts int default 0;

-- Add attempts column to send_queue for retry tracking  
alter table public.send_queue add column if not exists attempts int default 0;

-- RLS (assuming your workspace model)
alter table public.email_bounces enable row level security;
drop policy if exists "bounces_ws" on public.email_bounces;
create policy "bounces_ws" on public.email_bounces
  for all using ( true ) -- Adjust based on your auth model
  with check ( true );   -- Adjust based on your auth model 