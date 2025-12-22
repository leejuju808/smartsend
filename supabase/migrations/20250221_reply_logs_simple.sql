-- Create reply_logs table for simple reply detection tracking
-- This table stores basic reply detection information for analytics

create table if not exists public.reply_logs (
  id uuid primary key default gen_random_uuid(),
  email_id text not null,
  sender text,
  subject text,
  snippet text,
  detected boolean default false,
  created_at timestamptz default now()
);

-- Add indexes for efficient querying
create index if not exists idx_reply_logs_email_id on public.reply_logs(email_id);
create index if not exists idx_reply_logs_detected on public.reply_logs(detected);
create index if not exists idx_reply_logs_created_at on public.reply_logs(created_at desc);
create index if not exists idx_reply_logs_sender on public.reply_logs(sender);

-- Enable RLS
alter table if exists public.reply_logs enable row level security;

-- RLS Policies: Service role can manage all logs
drop policy if exists "Service can manage reply_logs" on public.reply_logs;
create policy "Service can manage reply_logs" on public.reply_logs
  for all using (true) with check (true);

