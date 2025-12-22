-- Block 112: Quota-Aware Send Dispatcher
-- Ensures SmartSend respects Gmail/Outlook daily send limits

-- Create send_quota_trackers table
create table if not exists public.send_quota_trackers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook')),
  date date not null default current_date,
  sent_count integer not null default 0,
  quota_limit integer not null default 2000, -- default Gmail daily cap
  reset_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, date, provider)
);

-- Create index for efficient quota lookups
create index if not exists idx_send_quota_trackers_account_provider_date 
  on public.send_quota_trackers(account_id, provider, date);

-- Create index for reset_at queries (for cleanup/auto-reset)
create index if not exists idx_send_quota_trackers_reset_at 
  on public.send_quota_trackers(reset_at);

-- Enable RLS
alter table public.send_quota_trackers enable row level security;

-- RLS policy: service role can do everything
create policy "service_role_full_access" on public.send_quota_trackers
  for all
  to service_role
  using (true)
  with check (true);

-- RLS policy: authenticated users can read their own account quotas
-- (assuming accounts table has user_id or similar relationship)
-- Adjust based on your accounts table structure
create policy "users_read_own_quotas" on public.send_quota_trackers
  for select
  to authenticated
  using (
    exists (
      select 1 from public.accounts a
      where a.id = send_quota_trackers.account_id
      -- Add your user_id relationship check here based on accounts table structure
    )
  );

-- Function to update updated_at timestamp
create or replace function public.update_send_quota_trackers_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger to auto-update updated_at
create trigger trg_send_quota_trackers_updated_at
  before update on public.send_quota_trackers
  for each row
  execute function public.update_send_quota_trackers_updated_at();















