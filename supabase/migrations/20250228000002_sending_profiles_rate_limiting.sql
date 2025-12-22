-- SmartSend: Sending Profiles + Rate Limiting Schema
-- Per-user rate limits stored in sending_profiles

-- Sending profiles (per user/provider)
create table if not exists public.sending_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'gmail' check (provider in ('gmail', 'outlook')),
  email_address text not null,
  per_minute_limit int not null default 20,
  per_day_limit int not null default 300,
  oauth_access_token text,
  oauth_refresh_token text,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, provider, email_address)
);

create index if not exists sending_profiles_user_idx on public.sending_profiles(user_id);
alter table public.sending_profiles enable row level security;

create policy "sending_profiles_select_own" on public.sending_profiles
  for select using (auth.uid() = user_id);
create policy "sending_profiles_insert_own" on public.sending_profiles
  for insert with check (auth.uid() = user_id);
create policy "sending_profiles_update_own" on public.sending_profiles
  for update using (auth.uid() = user_id);

-- Enhance send_queue with exponential backoff fields
do $$ begin
  if not exists (select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'next_attempt_at') then
    alter table public.send_queue add column next_attempt_at timestamptz;
  end if;
  if not exists (select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'attempt_count') then
    alter table public.send_queue add column attempt_count int not null default 0;
  end if;
  if not exists (select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'message_id') then
    alter table public.send_queue add column message_id text;
  end if;
  if not exists (select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'thread_id') then
    alter table public.send_queue add column thread_id text;
  end if;
  if not exists (select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'to_email') then
    alter table public.send_queue add column to_email text;
  end if;
  if not exists (select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'subject') then
    alter table public.send_queue add column subject text;
  end if;
  if not exists (select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'body_html') then
    alter table public.send_queue add column body_html text;
  end if;
end $$;

create index if not exists send_queue_next_attempt_idx on public.send_queue(next_attempt_at) where status = 'queued';
create index if not exists send_queue_message_id_idx on public.send_queue(message_id) where message_id is not null;
create index if not exists send_queue_thread_id_idx on public.send_queue(thread_id) where thread_id is not null;

-- Rate limiting counters (per user, per minute/day)
create table if not exists public.send_rate_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  window_key text not null, -- 'minute:YYYYMMDDHHmm' or 'day:YYYYMMDD'
  count int not null default 0,
  window_start timestamptz not null,
  primary key(user_id, window_key)
);

create index if not exists send_rate_counters_user_window_idx on public.send_rate_counters(user_id, window_start);

-- Function to check and increment rate limit (atomic)
create or replace function public.check_and_increment_rate(
  p_user_id uuid,
  p_per_minute_limit int,
  p_per_day_limit int
)
returns table(allowed boolean, reason text, minute_count int, day_count int)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_minute_key text := 'minute:' || to_char(v_now, 'YYYYMMDDHH24MI');
  v_day_key text := 'day:' || to_char(v_now, 'YYYYMMDD');
  v_minute_count int;
  v_day_count int;
begin
  -- Initialize counters if needed
  insert into public.send_rate_counters(user_id, window_key, count, window_start)
  values 
    (p_user_id, v_minute_key, 0, date_trunc('minute', v_now)),
    (p_user_id, v_day_key, 0, date_trunc('day', v_now))
  on conflict do nothing;

  -- Get current counts
  select count into v_minute_count from public.send_rate_counters
    where user_id = p_user_id and window_key = v_minute_key;
  select count into v_day_count from public.send_rate_counters
    where user_id = p_user_id and window_key = v_day_key;

  -- Check limits
  if v_minute_count >= p_per_minute_limit then
    return query select false, format('Per-minute limit reached: %s/%s', v_minute_count, p_per_minute_limit)::text,
      v_minute_count, v_day_count;
    return;
  end if;

  if v_day_count >= p_per_day_limit then
    return query select false, format('Per-day limit reached: %s/%s', v_day_count, p_per_day_limit)::text,
      v_minute_count, v_day_count;
    return;
  end if;

  -- Increment both counters atomically
  update public.send_rate_counters
    set count = count + 1
  where user_id = p_user_id and window_key in (v_minute_key, v_day_key);

  return query select true, ''::text, v_minute_count + 1, v_day_count + 1;
end $$;

-- Cleanup old counter rows (older than 2 days)
create or replace function public.cleanup_rate_counters()
returns void
language plpgsql
as $$
begin
  delete from public.send_rate_counters
  where window_start < now() - interval '2 days';
end $$;

