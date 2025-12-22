-- Campaign pacing / account rate state

-- A) Campaign chooses a sender account (one per campaign for now)
alter table public.campaigns
  add column if not exists from_account_id uuid references public.connected_accounts(id) on delete set null;

create index if not exists idx_campaign_from_account on public.campaigns(from_account_id);

-- B) Per-account pacing state (token-bucket-ish + cooldown)
create table if not exists public.account_rate_state (
  account_id uuid primary key references public.connected_accounts(id) on delete cascade,
  updated_at timestamptz not null default now(),
  window_start timestamptz not null default now(),  -- start of current 60s window
  sent_in_window int not null default 0,            -- # sent in current window
  per_minute int not null default 20,               -- soft cap (overrideable)
  daily_date date not null default (now()::date),   -- day bucket for daily_count
  daily_count int not null default 0,               -- sent today
  daily_cap int not null default 800,               -- soft daily cap
  cooldown_until timestamptz                        -- set when provider throttles
);

create index if not exists idx_rate_state_cooldown on public.account_rate_state(cooldown_until);

-- C) Fast safety: lockable queue scan
create index if not exists idx_send_queue_due on public.send_queue(due_at);
create index if not exists idx_send_queue_campaign on public.send_queue(campaign_id, lead_id, step_no);

-- D) Helper: upsert default state for an account
create or replace function public.ensure_rate_state(
  p_account uuid,
  p_per_min int default 20,
  p_daily_cap int default 800
)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.account_rate_state(account_id, per_minute, daily_cap)
  values (p_account, greatest(p_per_min, 1), greatest(p_daily_cap, 1))
  on conflict (account_id) do update
    set per_minute = excluded.per_minute,
        daily_cap  = excluded.daily_cap;
end;
$$;

revoke all on function public.ensure_rate_state(uuid, int, int) from public;
grant execute on function public.ensure_rate_state(uuid, int, int) to service_role;

-- E) Helper: compute next allowed send time for an account
drop function if exists public.next_send_time(uuid);
create or replace function public.next_send_time(p_account uuid)
returns timestamptz
language plpgsql
stable
as $$
declare
  s record;
  now_ timestamptz := now();
  next_time timestamptz := now_;
begin
  select * into s from public.account_rate_state where account_id = p_account;

  if not found then
    -- default state (allow now)
    return now_;
  end if;

  -- respect cooldown
  if s.cooldown_until is not null and s.cooldown_until > now_ then
    next_time := s.cooldown_until;
  end if;

  -- per-minute window: if 60s window has passed, reset; else check capacity
  if s.window_start + interval '60 seconds' <= now_ then
    -- new window, allowed now (or after cooldown)
    next_time := greatest(next_time, now_);
  else
    if s.sent_in_window >= s.per_minute then
      next_time := greatest(next_time, s.window_start + interval '60 seconds');
    end if;
  end if;

  -- daily cap
  if s.daily_date = now_::date and s.daily_count >= s.daily_cap then
    next_time := greatest(next_time, (now_::date + 1)::timestamptz); -- midnight rollover
  end if;

  return next_time;
end;
$$;

-- F) Mutator: record an attempt outcome (success/throttle/soft-fail)
drop function if exists public.record_send_attempt(uuid, boolean, text, int);
create or replace function public.record_send_attempt(
  p_account uuid,
  p_success boolean,
  p_error_code text default null,       -- e.g. '429', '4.8.XXX', 'rateLimited'
  p_retry_after int default null        -- seconds if provider returns it
)
returns void
language plpgsql
security definer
as $$
declare
  s record;
  now_ timestamptz := now();
  new_cooldown timestamptz;
  bump_secs int := 0;
begin
  select * into s from public.account_rate_state where account_id = p_account for update;
  if not found then
    insert into public.account_rate_state(account_id) values (p_account)
    returning * into s;
  end if;

  -- roll window if stale
  if s.window_start + interval '60 seconds' <= now_ then
    s.window_start := now_;
    s.sent_in_window := 0;
  end if;

  if p_success then
    s.sent_in_window := s.sent_in_window + 1;
    if s.daily_date = now_::date then
      s.daily_count := s.daily_count + 1;
    else
      s.daily_date := now_::date;
      s.daily_count := 1;
    end if;
    s.cooldown_until := null; -- clear cooldown on success
  else
    -- throttles and transient failures: exponential-ish backoff
    if p_retry_after is not null and p_retry_after > 0 then
      bump_secs := p_retry_after;
    elsif p_error_code is not null and (p_error_code like '429%' or p_error_code like '4.8%') then
      -- Gmail 429 / Outlook 4.8.x -> backoff 2-10 min depending on window utilization
      bump_secs := 120 + (s.sent_in_window * 6); -- small linear component
      bump_secs := least(greatest(bump_secs, 120), 600);
    else
      -- generic soft failure -> short bump
      bump_secs := 30;
    end if;
    new_cooldown := now_ + make_interval(secs => bump_secs);
    if s.cooldown_until is null or new_cooldown > s.cooldown_until then
      s.cooldown_until := new_cooldown;
    end if;
  end if;

  update public.account_rate_state set
    updated_at = now_,
    window_start = s.window_start,
    sent_in_window = s.sent_in_window,
    daily_date = s.daily_date,
    daily_count = s.daily_count,
    cooldown_until = s.cooldown_until
  where account_id = p_account;
end;
$$;

revoke all on function public.record_send_attempt(uuid, boolean, text, int) from public;
grant execute on function public.record_send_attempt(uuid, boolean, text, int) to service_role;

-- G) Supporting RPC for SKIP LOCKED + reschedule
drop function if exists public.lock_due_rows(uuid, int, int);
create or replace function public.lock_due_rows(
  p_campaign uuid,
  p_limit int default 20,
  p_lookahead_min int default 5
)
returns table(
  id uuid,
  campaign_id uuid,
  lead_id uuid,
  step_no int,
  due_at timestamptz,
  to_email text,
  provider text,
  subject text
)
language sql
volatile
as $$
  with due as (
    select q.id, q.campaign_id, q.lead_id, q.step_no,
           q.due_at,
           l.email as to_email,
           coalesce(ca.provider, 'sim') as provider,
           (
             select subject_template
             from public.campaign_step_variants v
             where v.campaign_id = q.campaign_id
               and v.step_no = q.step_no
               and v.enabled
             order by v.weight desc
             limit 1
           ) as subject
    from public.send_queue q
    join public.campaigns c on c.id = q.campaign_id
    left join public.connected_accounts ca on ca.id = c.from_account_id
    join public.leads l on l.id = q.lead_id
    where q.campaign_id = p_campaign
      and q.due_at <= now() + make_interval(mins => greatest(p_lookahead_min, 0))
    order by q.due_at asc
    limit greatest(p_limit, 1)
    for update skip locked
  )
  select * from due;
$$;

revoke all on function public.lock_due_rows(uuid, int, int) from public;
grant execute on function public.lock_due_rows(uuid, int, int) to service_role;

drop function if exists public.reschedule_queue_row(uuid, timestamptz);
create or replace function public.reschedule_queue_row(
  p_queue_id uuid,
  p_due_at timestamptz default null
)
returns void
language plpgsql
security definer
as $$
declare
  q record;
  a uuid;
  next_at timestamptz;
begin
  select q.*, c.from_account_id into q
  from public.send_queue q
  join public.campaigns c on c.id = q.campaign_id
  where q.id = p_queue_id;

  if not found then
    return;
  end if;

  a := q.from_account_id;

  if p_due_at is null and a is not null then
    next_at := public.next_send_time(a);
  else
    next_at := coalesce(p_due_at, now() + interval '2 minutes');
  end if;

  update public.send_queue
  set due_at = next_at
  where id = p_queue_id;
end;
$$;

revoke all on function public.reschedule_queue_row(uuid, timestamptz) from public;
grant execute on function public.reschedule_queue_row(uuid, timestamptz) to service_role;

