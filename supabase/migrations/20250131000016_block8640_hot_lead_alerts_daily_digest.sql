-- Block 8640 — Hot Lead Alerts + Daily Digest
-- Instant alerts for Hot Leads + Daily Email Digest
-- So roofers never miss money

-- ============================================================================
-- 1. NOTIFICATION SETTINGS TABLE
-- ============================================================================

create table if not exists public.notification_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  notify_hot_leads boolean not null default true,
  notify_daily_digest boolean not null default true,
  digest_hour_local integer not null default 18, -- 6PM local
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists notification_settings_owner_id_idx
  on public.notification_settings(owner_id);

-- Enable RLS
alter table public.notification_settings enable row level security;

-- RLS Policy: Users can only access their own notification settings
create policy "Users can access their own notification settings"
  on public.notification_settings
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ============================================================================
-- 2. ADD alert_sent COLUMN TO inbound_emails
-- ============================================================================

alter table public.inbound_emails
  add column if not exists alert_sent boolean not null default false;

-- Index for efficient querying of unalerted hot leads
create index if not exists idx_inbound_emails_hot_unalerted
  on public.inbound_emails(owner_id, classification, alert_sent, received_at)
  where classification = 'hot' and alert_sent = false;

-- ============================================================================
-- 3. TRIGGER FOR updated_at
-- ============================================================================

-- Create trigger function if it doesn't exist
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Create trigger for notification_settings
drop trigger if exists trg_notification_settings_updated_at on public.notification_settings;
create trigger trg_notification_settings_updated_at
  before update on public.notification_settings
  for each row
  execute function public.set_updated_at();

























































