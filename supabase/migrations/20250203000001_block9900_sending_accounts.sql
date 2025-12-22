-- Block 9900 - SmartSend Sending Accounts v1 (Gmail / Outlook + From-Email Management)
-- Creates sending accounts table and wires into campaigns + queue

-- 1. Create smartsend_sending_accounts table
create table if not exists public.smartsend_sending_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gmail', 'outlook')),
  from_email text not null,
  from_name text,
  provider_account_id text, -- e.g. Gmail userId or MS object id
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  daily_limit int default 400,
  sent_today int default 0,
  last_reset_date date,
  status text default 'connected' check (status in ('connected', 'error', 'disabled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, from_email)
);

-- Create indexes
create index if not exists idx_smartsend_sending_accounts_user_id 
  on public.smartsend_sending_accounts (user_id);

create index if not exists idx_smartsend_sending_accounts_status 
  on public.smartsend_sending_accounts (status) 
  where status = 'connected';

-- 2. Add sending_account_id to campaigns table
alter table public.campaigns
  add column if not exists sending_account_id uuid references public.smartsend_sending_accounts(id) on delete set null;

create index if not exists idx_campaigns_sending_account_id 
  on public.campaigns (sending_account_id);

-- 3. Add sending_account_id to smartsend_queue table
alter table public.smartsend_queue
  add column if not exists sending_account_id uuid references public.smartsend_sending_accounts(id) on delete set null;

create index if not exists idx_smartsend_queue_sending_account_id 
  on public.smartsend_queue (sending_account_id);

-- 4. Enable RLS on smartsend_sending_accounts
alter table public.smartsend_sending_accounts enable row level security;

-- RLS policies for smartsend_sending_accounts
-- Users can read/write their own sending accounts
create policy "smartsend_sending_accounts_select_own"
  on public.smartsend_sending_accounts
  for select
  using (user_id = auth.uid());

create policy "smartsend_sending_accounts_insert_own"
  on public.smartsend_sending_accounts
  for insert
  with check (user_id = auth.uid());

create policy "smartsend_sending_accounts_update_own"
  on public.smartsend_sending_accounts
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "smartsend_sending_accounts_delete_own"
  on public.smartsend_sending_accounts
  for delete
  using (user_id = auth.uid());

-- Service role can do everything (for edge functions)
create policy "smartsend_sending_accounts_service_role"
  on public.smartsend_sending_accounts
  for all
  using (true)
  with check (true);

-- 5. Function to reset daily counters (can be called by cron)
create or replace function public.smartsend_reset_daily_counters()
returns void
language plpgsql
security definer
as $$
begin
  update public.smartsend_sending_accounts
  set sent_today = 0,
      last_reset_date = current_date
  where last_reset_date is null 
     or last_reset_date < current_date;
end;
$$;

grant execute on function public.smartsend_reset_daily_counters() to service_role;

-- 6. Trigger to update updated_at timestamp
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_smartsend_sending_accounts_updated_at
before update on public.smartsend_sending_accounts
for each row
execute function public.set_updated_at();


































































