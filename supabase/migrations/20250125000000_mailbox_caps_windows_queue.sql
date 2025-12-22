-- A) Per-mailbox send controls
-- Add columns to connected_accounts for daily caps and send windows
alter table public.connected_accounts
  add column if not exists daily_cap int default 40,
  add column if not exists tz text default 'UTC',               -- IANA TZ (e.g., 'America/Los_Angeles')
  add column if not exists send_start time with time zone,      -- e.g., '09:00:00-08'
  add column if not exists send_end time with time zone,        -- e.g., '17:00:00-08'
  add column if not exists last_sent_date date,
  add column if not exists daily_sent_count int default 0;

create index if not exists idx_connected_accounts_lastdate on public.connected_accounts(last_sent_date);

-- B) Queue table extensions (if send_queue already exists, this safely extends it)
-- Ensure send_queue has all required fields
alter table public.send_queue
  add column if not exists sent_at timestamptz,
  add column if not exists attempt int not null default 0,
  add column if not exists error text;

-- Update status check constraint to include 'pending' if not already present
do $$
begin
  -- Check if constraint exists and includes 'pending'
  if exists (
    select 1 from pg_constraint c
    join pg_class cl on c.conrelid = cl.oid
    where cl.relname = 'send_queue'
      and c.contype = 'c'
      and c.conname like '%status%'
  ) then
    -- Drop old constraint if it doesn't include 'pending'
    if not exists (
      select 1 from pg_constraint c
      join pg_class cl on c.conrelid = cl.oid
      join pg_get_constraintdef(c.oid) as def(text)
      where cl.relname = 'send_queue'
        and c.contype = 'c'
        and def like '%pending%'
    ) then
      alter table public.send_queue drop constraint if exists send_queue_status_check;
      alter table public.send_queue add constraint send_queue_status_check 
        check (status in ('pending','sending','sent','failed','canceled'));
    end if;
  else
    -- Add constraint if it doesn't exist
    alter table public.send_queue add constraint send_queue_status_check 
      check (status in ('pending','sending','sent','failed','canceled'));
  end if;
end $$;

-- Ensure unique constraint on (campaign_id, lead_id) for send_queue
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.send_queue'::regclass
      and conname = 'send_queue_campaign_lead_unique'
  ) then
    alter table public.send_queue 
      add constraint send_queue_campaign_lead_unique unique (campaign_id, lead_id);
  end if;
end $$;

-- Update indexes for better query performance
create index if not exists idx_send_queue_status_time on public.send_queue(status, scheduled_at);
create index if not exists idx_send_queue_mailbox on public.send_queue(mailbox_id);
create index if not exists idx_send_queue_campaign on public.send_queue(campaign_id);

-- Touch trigger for updated_at
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin 
  new.updated_at := now(); 
  return new; 
end $$;

drop trigger if exists tr_touch_updated_send_queue on public.send_queue;
create trigger tr_touch_updated_send_queue
before update on public.send_queue
for each row execute function public.tg_touch_updated_at();

-- C) Simple send logs (extend existing if present, or create if not)
-- Ensure send_logs table has the required structure
do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'send_logs') then
    create table public.send_logs (
      id uuid primary key default gen_random_uuid(),
      queue_id uuid references public.send_queue(id) on delete set null,
      mailbox_id uuid references public.connected_accounts(id) on delete set null,
      campaign_id uuid references public.campaigns(id) on delete set null,
      lead_id uuid references public.leads(id) on delete set null,
      provider text,                 -- 'gmail' | 'outlook' | ...
      status text not null,          -- 'sent' | 'failed'
      error text,
      created_at timestamptz not null default now()
    );
  else
    -- Add missing columns if table exists
    alter table public.send_logs
      add column if not exists provider text,
      add column if not exists status text,
      add column if not exists error text;
    
    -- If status column was just added, set default for existing rows
    if exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
        and table_name = 'send_logs' 
        and column_name = 'status'
        and is_nullable = 'YES'
    ) then
      update public.send_logs set status = 'sent' where status is null;
      alter table public.send_logs alter column status set not null;
    end if;
  end if;
end $$;

-- D) Helper: reset a mailbox counter if the date rolled over in its TZ
create or replace function public.reset_mailbox_counter_if_new_day(p_mailbox uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_tz text;
  v_now_tz timestamptz;
  v_today date;
  v_last date;
begin
  select tz, last_sent_date into v_tz, v_last
  from public.connected_accounts
  where id = p_mailbox;

  if v_tz is null then v_tz := 'UTC'; end if;

  -- current time in mailbox tz
  execute format('select (now() at time zone ''UTC'') at time zone %L', v_tz) into v_now_tz;
  v_today := (v_now_tz)::date;

  if v_last is distinct from v_today then
    update public.connected_accounts
       set daily_sent_count = 0,
           last_sent_date = v_today
     where id = p_mailbox;
  end if;
end
$$;

-- E) Helper: next valid send time inside window (returns now if no window set)
create or replace function public.next_in_window(p_mailbox uuid, p_from timestamptz)
returns timestamptz
language plpgsql
security definer
as $$
declare
  v_tz text;
  v_start time with time zone;
  v_end   time with time zone;
  v_from_local timestamptz;
  v_candidate timestamptz;
begin
  select tz, send_start, send_end into v_tz, v_start, v_end
  from public.connected_accounts where id = p_mailbox;

  if v_tz is null then v_tz := 'UTC'; end if;
  if v_start is null or v_end is null then
    return p_from; -- no window configured
  end if;

  -- Convert p_from to mailbox local TZ
  execute format('select (%L at time zone ''UTC'') at time zone %L', p_from, v_tz) into v_from_local;

  -- If within window, return p_from
  if (v_from_local::time with time zone) between v_start and v_end then
    return p_from;
  end if;

  -- Otherwise, jump to next window start (same or next day)
  if (v_from_local::time with time zone) < v_start then
    -- today at start
    execute format(
      'select (date_trunc(''day'', %L at time zone %L) + (%L - time ''00:00'')) at time zone %L',
      p_from, v_tz, v_start::text, 'UTC'
    ) into v_candidate;
    return v_candidate;
  else
    -- tomorrow at start
    execute format(
      'select ((date_trunc(''day'', %L at time zone %L) + interval ''1 day'') + (%L - time ''00:00'')) at time zone %L',
      p_from, v_tz, v_start::text, 'UTC'
    ) into v_candidate;
    return v_candidate;
  end if;
end
$$;

