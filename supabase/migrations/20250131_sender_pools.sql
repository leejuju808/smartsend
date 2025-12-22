-- Sender Pool Management System
-- Connected sender accounts (per user/org)

create table if not exists sender_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook','smtp')),
  email citext not null,
  display_name text,
  oauth_json jsonb,      -- tokens/refresh (encrypted at rest via Vault/KMS if possible)
  smtp_json jsonb,       -- {host,port,user,pass,ssl}
  daily_cap int not null default 150,   -- safety cap per inbox
  per_min_cap int not null default 6,   -- throttle per minute
  warmup boolean not null default true, -- if true, lower dynamic cap
  cooldown_until timestamptz,           -- backoff window if bounce spike
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create unique index if not exists uniq_sender_email_org on sender_accounts(org_id, email);
alter table sender_accounts enable row level security;

create policy "org senders rw" on sender_accounts 
  for all 
  using (is_org_member(org_id)) 
  with check (is_org_member(org_id));

-- Optional: logical pools (e.g., "Default Pool")
create table if not exists sender_pools (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  strategy text not null default 'round_robin' check (strategy in ('round_robin','weighted','least_loaded')),
  quiet_hours jsonb,  -- {start:"21:00", end:"06:30", tz:"America/Los_Angeles"}
  created_at timestamptz default now()
);

alter table sender_pools enable row level security;

create policy "org pools rw" on sender_pools 
  for all 
  using (is_org_member(org_id)) 
  with check (is_org_member(org_id));

create table if not exists sender_pool_members (
  pool_id uuid not null references sender_pools(id) on delete cascade,
  sender_id uuid not null references sender_accounts(id) on delete cascade,
  weight int not null default 1,
  primary key (pool_id, sender_id)
);

alter table sender_pool_members enable row level security;

create policy "org pool members rw" on sender_pool_members 
  for all 
  using (
    exists(select 1 from sender_pools p join sender_accounts s on s.org_id=p.org_id
           where p.id = sender_pool_members.pool_id and s.id = sender_pool_members.sender_id
             and is_org_member(p.org_id))
  ) with check (
    exists(select 1 from sender_pools p where p.id = sender_pool_members.pool_id and is_org_member(p.org_id))
  );

-- Campaign chooses a pool
alter table campaigns add column if not exists sender_pool_id uuid references sender_pools(id) on delete set null;

-- Send quotas (rolling counters)
create table if not exists sender_usage (
  sender_id uuid not null references sender_accounts(id) on delete cascade,
  day date not null,
  sent_count int not null default 0,
  minute_bucket timestamptz not null,  -- floor to minute
  minute_count int not null default 0,
  primary key (sender_id, day, minute_bucket)
);

create index if not exists idx_sender_usage_day on sender_usage(sender_id, day);
create index if not exists idx_sender_usage_min on sender_usage(sender_id, minute_bucket);

alter table sender_usage enable row level security;

create policy "usage ro in org" on sender_usage 
  for select 
  using (
    exists(select 1 from sender_accounts a where a.id = sender_usage.sender_id and is_org_member(a.org_id))
  );

create policy "usage rw in org" on sender_usage 
  for all 
  using (
    exists(select 1 from sender_accounts a where a.id = sender_usage.sender_id and is_org_member(a.org_id))
  ) with check (
    exists(select 1 from sender_accounts a where a.id = sender_usage.sender_id and is_org_member(a.org_id))
  );

-- Helper function for atomic increments
create or replace function increment_sender_usage(p_sender uuid, p_day date, p_minute timestamptz)
returns void language plpgsql as $$
begin
  insert into sender_usage (sender_id, day, minute_bucket, sent_count, minute_count)
  values (p_sender, p_day, p_minute, 1, 1)
  on conflict (sender_id, day, minute_bucket) do update
  set sent_count = sender_usage.sent_count + 1,
      minute_count = sender_usage.minute_count + 1;
end $$;

