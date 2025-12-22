-- API Keys and Usage Tracking System
-- Drop existing api_keys table if it exists and recreate with new schema
drop table if exists api_keys cascade;

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  key_hash text not null,                 -- store hash only
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table api_keys enable row level security;
create policy "own keys" on api_keys
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists api_usage_minute (
  key_id uuid not null references api_keys(id) on delete cascade,
  window_start timestamptz not null,      -- truncated to minute
  count int not null default 0,
  primary key (key_id, window_start)
);

-- helper to bump usage atomically
create or replace function api_usage_inc(p_key_id uuid)
returns int
language plpgsql security definer as $$
declare v_now timestamptz := date_trunc('minute', now());
declare v_count int;
begin
  insert into api_usage_minute(key_id, window_start, count)
    values (p_key_id, v_now, 1)
  on conflict (key_id, window_start)
    do update set count = api_usage_minute.count + 1
  returning count into v_count;
  return v_count;
end $$;

-- Add indexes for performance
create index if not exists idx_api_keys_user_id on api_keys(user_id);
create index if not exists idx_api_keys_key_hash on api_keys(key_hash);
create index if not exists idx_api_usage_minute_key_id on api_usage_minute(key_id);
create index if not exists idx_api_usage_minute_window on api_usage_minute(window_start);