-- 02_email_logs.sql
-- Create email_logs table for tracking reply detection events

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  message_id text,
  thread_id text,
  meta jsonb,
  created_at timestamp with time zone default now()
);

