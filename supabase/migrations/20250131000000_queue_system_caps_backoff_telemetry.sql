-- Queue System: Caps, Backoff, Telemetry
-- Idempotent migration for queue operational fields, caps, backoff helpers, and telemetry

-- A) Connected account sending caps
alter table public.connected_accounts
  add column if not exists send_concurrency int default 3,   -- max parallel sends for this account
  add column if not exists per_minute_cap   int default 60;  -- soft cap; telemetry will help throttle

-- B) Send queue operational fields
-- Ensure run_at exists (may be scheduled_at or scheduled_for)
do $$ begin
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' and table_name = 'send_queue' and column_name = 'run_at') then
    -- Use scheduled_for if it exists, else scheduled_at, else now()
    if exists (select 1 from information_schema.columns 
               where table_schema = 'public' and table_name = 'send_queue' and column_name = 'scheduled_for') then
      alter table public.send_queue add column run_at timestamptz;
      update public.send_queue set run_at = scheduled_for where run_at is null;
      alter table public.send_queue alter column run_at set default now();
    elsif exists (select 1 from information_schema.columns 
                  where table_schema = 'public' and table_name = 'send_queue' and column_name = 'scheduled_at') then
      alter table public.send_queue add column run_at timestamptz;
      update public.send_queue set run_at = scheduled_at where run_at is null;
      alter table public.send_queue alter column run_at set default now();
    else
      alter table public.send_queue add column run_at timestamptz default now();
    end if;
  end if;
end $$;

alter table public.send_queue
  add column if not exists attempts int default 0,
  add column if not exists last_error text,
  add column if not exists last_error_at timestamptz,
  add column if not exists locked_at timestamptz;                   -- ephemeral lock timestamp

-- Update status column constraint if it doesn't already include the new values
do $$ 
begin
  -- Add new status values if status column exists
  if exists (select 1 from information_schema.columns 
             where table_schema = 'public' and table_name = 'send_queue' and column_name = 'status') then
    -- We'll update the constraint separately - drop and recreate if needed
    -- For now, just ensure the column accepts the new values
    null; -- constraint update handled below
  else
    alter table public.send_queue add column status text default 'scheduled';
  end if;
end $$;

-- Ensure we have subject_template and body_html_template columns for rendering
alter table public.send_queue
  add column if not exists subject_template text,
  add column if not exists body_html_template text,
  add column if not exists to_email text,
  add column if not exists provider text check (provider in ('gmail','outlook','other')),
  add column if not exists provider_thread_id text;

-- Update existing status values to match new enum (if needed)
do $$ 
begin
  -- Map old status values to new ones
  update public.send_queue 
  set status = case 
    when status in ('queued', 'pending') then 'scheduled'
    when status = 'sending' then 'running'
    when status not in ('scheduled','running','sent','failed','deferred') then 'scheduled'
    else status
  end
  where status not in ('scheduled','running','sent','failed','deferred');
end $$;

-- Ensure status constraint includes all valid values
do $$
begin
  -- Drop existing constraint if it exists
  if exists (select 1 from pg_constraint where conname = 'send_queue_status_check') then
    alter table public.send_queue drop constraint send_queue_status_check;
  end if;
  -- Add new constraint
  alter table public.send_queue add constraint send_queue_status_check 
    check (status in ('scheduled','running','sent','failed','deferred'));
end $$;

create index if not exists idx_send_queue_status_runat on public.send_queue(status, run_at);
create index if not exists idx_send_queue_account on public.send_queue(account_id) where status in ('scheduled','running');

-- C) Telemetry tables
create table if not exists public.provider_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid references public.connected_accounts(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook','other')),
  kind text not null,                    -- 'sent','error','rate_limit','auth_error','retry_scheduled'
  detail jsonb default '{}'::jsonb
);
create index if not exists idx_provider_events_account on public.provider_events(account_id, created_at desc);

create table if not exists public.rate_limit_windows (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.connected_accounts(id) on delete cascade,
  window_start timestamptz not null,
  window_key text not null,          -- e.g., 'per_minute'
  count int not null default 0
);
create index if not exists idx_rlw_account_window on public.rate_limit_windows(account_id, window_start desc);

-- D) Backoff helper (exponential with jitter)
create or replace function public.next_backoff_after(p_attempts int)
returns interval language sql immutable as $$
  -- cap at ~30 minutes (base 2^attempts * 30s)
  select make_interval(secs => least(1800, round(power(2, greatest(0, p_attempts)) * 30)::int));
$$;

-- E) Locker: claim rows for an account using SKIP LOCKED
create or replace function public.claim_queue_for_account(
  p_account uuid,
  p_limit int
)
returns setof public.send_queue
language plpgsql
security definer
as $$
begin
  return query
  with cte as (
    select id
    from public.send_queue
    where account_id = p_account
      and status = 'scheduled'
      and run_at <= now()
    order by coalesce(scheduled_for, scheduled_at, run_at, created_at) nulls first, created_at nulls last
    for update skip locked
    limit p_limit
  )
  update public.send_queue q
     set status = 'running', locked_at = now()
  from cte
  where q.id = cte.id
  returning q.*;
end $$;

