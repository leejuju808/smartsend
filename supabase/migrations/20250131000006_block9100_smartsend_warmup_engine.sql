-- Block 9100: SmartSend Domain Warmup Engine v1
-- Mailbox Warmup Settings + Daily Drip Worker

-- 1) Warmup Settings per Mailbox
-- Attached to (user_id, from_email) since campaigns use campaigns.from_email

create table if not exists smartsend_warmup_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_email text not null,
  is_enabled boolean default false,
  max_per_day int default 30, -- upper cap
  start_per_day int default 5, -- first day
  ramp_per_day int default 2,  -- add this many emails daily until max_per_day
  current_per_day int default 5,
  last_sent_date date,
  sent_today int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, from_email)
);

create index if not exists idx_warmup_accounts_user on smartsend_warmup_accounts (user_id);
create index if not exists idx_warmup_accounts_enabled on smartsend_warmup_accounts (is_enabled) where is_enabled = true;

-- 2) Warmup Log Table
-- Tracks each warmup email

create table if not exists smartsend_warmup_logs (
  id uuid primary key default gen_random_uuid(),
  warmup_account_id uuid not null references smartsend_warmup_accounts(id) on delete cascade,
  from_email text not null,
  to_email text not null,
  subject text,
  body text,
  status text not null default 'pending', -- pending | sent | failed
  error text,
  sent_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_warmup_logs_account_created on smartsend_warmup_logs (warmup_account_id, created_at);
create index if not exists idx_warmup_logs_status on smartsend_warmup_logs (status, created_at);

-- RLS Policies
alter table smartsend_warmup_accounts enable row level security;
alter table smartsend_warmup_logs enable row level security;

-- Users can only see/modify their own warmup accounts
create policy warmup_accounts_select on smartsend_warmup_accounts
  for select using (auth.uid() = user_id);

create policy warmup_accounts_insert on smartsend_warmup_accounts
  for insert with check (auth.uid() = user_id);

create policy warmup_accounts_update on smartsend_warmup_accounts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy warmup_accounts_delete on smartsend_warmup_accounts
  for delete using (auth.uid() = user_id);

-- Users can only see logs for their own warmup accounts
create policy warmup_logs_select on smartsend_warmup_logs
  for select using (
    exists (
      select 1 from smartsend_warmup_accounts
      where smartsend_warmup_accounts.id = smartsend_warmup_logs.warmup_account_id
      and smartsend_warmup_accounts.user_id = auth.uid()
    )
  );

-- Service role can insert logs (for worker function)
create policy warmup_logs_insert_service on smartsend_warmup_logs
  for insert to service_role with check (true);

-- Service role can update warmup accounts (for worker function)
create policy warmup_accounts_update_service on smartsend_warmup_accounts
  for update to service_role using (true) with check (true);

-- Trigger for updated_at
create trigger trg_warmup_accounts_updated_at
before update on smartsend_warmup_accounts
for each row
execute function set_updated_at();








