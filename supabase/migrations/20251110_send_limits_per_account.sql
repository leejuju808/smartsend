-- Per-account send limits, usage counters, and worker helpers

-- If an older org-scoped send_limits table exists, rename it to avoid conflicts
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'send_limits'
      and column_name = 'org_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'send_limits'
      and column_name = 'account_id'
  ) then
    if not exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'org_send_limits'
    ) then
      alter table public.send_limits rename to org_send_limits;
    end if;
  end if;
end $$;

-- Per-account send limits configuration
create table if not exists public.send_limits (
  account_id uuid primary key references public.mail_accounts(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook')),
  daily_cap int not null default 150,
  hourly_cap int not null default 30,
  warmup_enabled boolean not null default true,
  warmup_day int not null default 1,
  ramp jsonb not null default '[
    {"day":1,"daily":20,"hourly":5},
    {"day":2,"daily":30,"hourly":6},
    {"day":3,"daily":40,"hourly":8},
    {"day":4,"daily":60,"hourly":10},
    {"day":5,"daily":80,"hourly":12},
    {"day":6,"daily":100,"hourly":15},
    {"day":7,"daily":120,"hourly":18},
    {"day":8,"daily":150,"hourly":20}
  ]'::jsonb,
  timezone text default 'America/Los_Angeles',
  updated_at timestamptz not null default now()
);

-- Ensure touch trigger helper exists (idempotent)
create or replace function public.tg_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Keep updated_at fresh on changes
drop trigger if exists trg_send_limits_touch on public.send_limits;
create trigger trg_send_limits_touch
  before update on public.send_limits
  for each row execute procedure public.tg_touch_updated_at();

-- Send events log (append-only)
create table if not exists public.send_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.mail_accounts(id) on delete cascade,
  provider text not null,
  message_id uuid,
  status text not null check (status in ('queued','sent','failed','blocked_quota')),
  meta jsonb
);

create index if not exists idx_send_events_acc_time on public.send_events(account_id, created_at);
create index if not exists idx_send_events_status on public.send_events(status);

-- Rolling usage windows
create or replace view public.v_send_usage_24h as
select
  account_id,
  count(*) filter (where status = 'sent') as sent_24h
from public.send_events
where created_at >= now() - interval '24 hours'
group by account_id;

create or replace view public.v_send_usage_1h as
select
  account_id,
  count(*) filter (where status = 'sent') as sent_1h
from public.send_events
where created_at >= now() - interval '1 hour'
group by account_id;

-- Effective caps helper (min of configured cap and warmup ramp if enabled)
create or replace function public.effective_caps(p_account uuid)
returns table(daily_cap int, hourly_cap int)
language plpgsql
as $$
declare
  v record;
  dcap int;
  hcap int;
  step jsonb;
begin
  select l.*, a.provider
    into v
  from public.send_limits l
  join public.mail_accounts a on a.id = l.account_id
  where l.account_id = p_account;

  if not found then
    return query select 150, 30;
    return;
  end if;

  dcap := v.daily_cap;
  hcap := v.hourly_cap;

  if coalesce(v.warmup_enabled, false) then
    select elem
      into step
    from jsonb_array_elements(v.ramp) as elem
    where (elem->>'day')::int = greatest(1, least(v.warmup_day, 365))
    limit 1;

    if step is not null then
      dcap := least(dcap, (step->>'daily')::int);
      hcap := least(hcap, (step->>'hourly')::int);
    end if;
  end if;

  return query select dcap, hcap;
end;
$$;

-- Remaining sends within windows
create or replace function public.sends_left(p_account uuid)
returns table(left_24h int, left_1h int)
language plpgsql
as $$
declare
  caps_daily int;
  caps_hourly int;
  used24 int;
  used1 int;
begin
  select daily_cap, hourly_cap into caps_daily, caps_hourly from public.effective_caps(p_account);
  select coalesce(sent_24h, 0) into used24 from public.v_send_usage_24h where account_id = p_account;
  select coalesce(sent_1h, 0) into used1 from public.v_send_usage_1h where account_id = p_account;

  caps_daily := coalesce(caps_daily, 150);
  caps_hourly := coalesce(caps_hourly, 30);

  return query select
    greatest(caps_daily - coalesce(used24, 0), 0),
    greatest(caps_hourly - coalesce(used1, 0), 0);
end;
$$;

-- Can we send N messages right now?
create or replace function public.can_send(p_account uuid, p_n int default 1)
returns boolean
language plpgsql
as $$
declare
  l24 int;
  l1 int;
begin
  select left_24h, left_1h into l24, l1 from public.sends_left(p_account);
  return (coalesce(l24, 0) >= p_n and coalesce(l1, 0) >= p_n);
end;
$$;

-- Selection helper: clamp batch size by remaining allowance
create or replace function public.select_sends_for_account(p_account uuid, p_max int default 20)
returns table(id uuid)
language plpgsql
as $$
declare
  l24 int;
  l1 int;
  grant_size int;
begin
  select left_24h, left_1h into l24, l1 from public.sends_left(p_account);
  grant_size := greatest(least(coalesce(l24, 0), coalesce(l1, 0), p_max), 0);

  if grant_size = 0 then
    return;
  end if;

  return query
    select q.id
    from public.send_queue q
    where q.account_id = p_account
      and q.status in ('queued','scheduled','retrying')
    order by coalesce(q.priority, 0) desc, q.created_at asc
    limit grant_size;
end;
$$;

-- Final guard just before sending
create or replace function public.guard_preflight_send(p_account uuid)
returns boolean
language plpgsql
as $$
begin
  return public.can_send(p_account, 1);
end;
$$;

-- Advance warmup day each morning (UTC 07:00)
create or replace function public.warmup_tick()
returns void
language plpgsql
as $$
begin
  update public.send_limits
     set warmup_day = least(coalesce(warmup_day, 1) + 1, 365),
         updated_at = now()
   where warmup_enabled = true;
end;
$$;

-- Schedule daily warmup advancement
select cron.unschedule('warmup-tick-daily')
where exists (select 1 from cron.job where jobname = 'warmup-tick-daily');

select cron.schedule(
  'warmup-tick-daily',
  '0 7 * * *',
  $$select public.warmup_tick();$$
);


