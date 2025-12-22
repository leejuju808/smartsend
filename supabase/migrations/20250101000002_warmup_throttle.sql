-- Email sender accounts (Gmail or Outlook) with throttle config
create table if not exists sender_accounts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  provider text check (provider in ('gmail','outlook')) not null,
  email text not null,
  -- hard caps
  hourly_cap int default 40,          -- max messages/hour
  daily_cap int default 300,          -- max messages/day
  -- warm-up ramp
  warmup_enabled boolean default true,
  warmup_start date default current_date,
  warmup_initial_daily int default 20,
  warmup_increment int default 20,    -- daily increase
  warmup_max_daily int default 200,   -- clamp
  -- pacing
  min_gap_seconds int default 45,     -- min seconds between sends from this account
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, email)
);

create index if not exists idx_sender_accounts_user on sender_accounts(user_id);

-- Rolling counters (fast checks without scanning logs)
create table if not exists send_counters (
  account_id uuid references sender_accounts(id) on delete cascade,
  period text check (period in ('hour','day')) not null,
  bucket ts timestamptz not null,   -- truncate to hour/day
  count int not null default 0,
  primary key (account_id, period, bucket)
);

-- Helper to truncate to hour/day (Postgres)
create or replace function bucket_trunc(ts timestamptz, p text)
returns timestamptz language sql immutable as $$
  select case when p = 'hour' then date_trunc('hour', ts)
              when p = 'day'  then date_trunc('day', ts)
              else ts end;
$$;

-- When an outbound log row is inserted, bump counters.
-- Assumes campaign_logs has: id, created_at, provider, subject, snippet, lead_id, message_id, thread_id
-- And you store sender account id on campaign_logs as sender_account_id (add if missing)
alter table campaign_logs add column if not exists sender_account_id uuid references sender_accounts(id);

create or replace function bump_send_counters()
returns trigger language plpgsql as $$
declare
  b_hour timestamptz := bucket_trunc(coalesce(new.created_at, now()), 'hour');
  b_day  timestamptz := bucket_trunc(coalesce(new.created_at, now()), 'day');
begin
  if new.sender_account_id is null then
    return new; -- nothing to bump if we didn't log the account id
  end if;

  insert into send_counters(account_id, period, bucket, count)
  values (new.sender_account_id, 'hour', b_hour, 1)
  on conflict (account_id, period, bucket) do update set count = send_counters.count + 1;

  insert into send_counters(account_id, period, bucket, count)
  values (new.sender_account_id, 'day', b_day, 1)
  on conflict (account_id, period, bucket) do update set count = send_counters.count + 1;

  return new;
end;
$$;

drop trigger if exists trg_bump_send_counters on campaign_logs;
create trigger trg_bump_send_counters
after insert on campaign_logs
for each row
when (new.direction is null or new.direction = 'outbound')  -- if you use direction; otherwise remove WHEN
execute function bump_send_counters();

-- Compute today's warm-up cap for an account (clamped)
create or replace function sender_today_cap(account uuid)
returns int language sql stable as $$
  with cfg as (
    select warmup_enabled, warmup_start, warmup_initial_daily, warmup_increment, warmup_max_daily, daily_cap
    from sender_accounts where id = account
  )
  select case
    when (select warmup_enabled from cfg) is false
      then (select daily_cap from cfg)
    else
      least(
        (select warmup_max_daily from cfg),
        (select warmup_initial_daily from cfg) +
        greatest(0, (current_date - (select warmup_start from cfg))) * (select warmup_increment from cfg)
      )
  end as cap;
$$;