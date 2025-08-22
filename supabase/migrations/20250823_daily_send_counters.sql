-- Daily send counters and atomic reserve/release
-- Daily counters (one row per user per day)
create table if not exists public.daily_send_counters (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null default current_date,
  count int not null default 0,
  primary key (user_id, day)
);

-- Reserve N sends without exceeding a limit (atomic upsert)
create or replace function public.reserve_daily_sends(p_user uuid, p_n int, p_limit int)
returns table(ok boolean, new_count int)
language plpgsql
as $$
declare v_count int;
begin
  insert into public.daily_send_counters(user_id, day, count)
  values (p_user, current_date, 0)
  on conflict (user_id, day) do nothing;

  update public.daily_send_counters
     set count = count + p_n
   where user_id = p_user
     and day = current_date
     and count + p_n <= p_limit
  returning count into v_count;

  if v_count is null then
    return query select false, (select count from public.daily_send_counters where user_id=p_user and day=current_date);
  else
    return query select true, v_count;
  end if;
end $$;

-- Release (decrement) after a failed send (never below 0)
create or replace function public.release_daily_sends(p_user uuid, p_n int)
returns void language sql as $$
  update public.daily_send_counters
     set count = greatest(0, count - p_n)
   where user_id = p_user and day = current_date;
$$;

-- Quiet-hours + timezone on profile
alter table public.profiles
  add column if not exists tz text default 'America/Los_Angeles',
  add column if not exists quiet_start int default 21,   -- 21:00 local
  add column if not exists quiet_end int default 6;      -- 06:00 local

