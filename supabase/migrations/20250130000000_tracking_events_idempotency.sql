-- Tighten tracking_events with idempotency guard and helper fields

-- Ensure tracking_events table exists with all required fields
create table if not exists public.tracking_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  send_log_id uuid not null references public.send_logs(id) on delete cascade,
  type text not null check (type in ('open','click')),
  url text,                          -- only for clicks
  ip inet,
  ua text
);

-- Add missing columns if they don't exist
alter table public.tracking_events
  add column if not exists url text,
  add column if not exists ip inet,
  add column if not exists ua text;

-- Idempotency guard: prevent duplicate rapid-fire events we don't want
-- (same send_log_id + type + url + minute bucket)
create extension if not exists btree_gist;

-- Add minute_bucket generated column (if not exists)
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'tracking_events' 
    and column_name = 'minute_bucket'
  ) then
    alter table public.tracking_events
      add column minute_bucket timestamptz generated always as (date_trunc('minute', created_at)) stored;
  end if;
end $$;

-- Create unique index for deduplication
create unique index if not exists uq_te_dedupe
  on public.tracking_events(send_log_id, type, coalesce(url, ''), minute_bucket);

-- Additional indexes for performance
create index if not exists idx_te_sendlog on public.tracking_events(send_log_id);
create index if not exists idx_te_type on public.tracking_events(type);

