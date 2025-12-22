-- Send Queue Hardening: Queue status/attempts + timestamps + caps + logs
-- Run in Supabase SQL Editor

-- Queue status/attempts + timestamps
alter table public.send_queue
  add column if not exists attempts int default 0,
  add column if not exists last_error text,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists scheduled_at timestamptz default now(),
  add column if not exists step_id uuid references public.campaign_steps(id) on delete set null,
  add column if not exists account_id uuid references public.connected_accounts(id) on delete set null,
  add column if not exists message_id text,
  add column if not exists sent_at timestamptz;

-- Add status column if it doesn't exist, then update constraint
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'status'
  ) then
    alter table public.send_queue add column status text default 'queued';
  end if;
end $$;

-- Map mailbox_id to account_id if account_id doesn't exist but mailbox_id does
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'mailbox_id'
  ) and not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'account_id'
  ) then
    -- Copy mailbox_id to account_id for existing rows
    update public.send_queue set account_id = mailbox_id where account_id is null and mailbox_id is not null;
  end if;
end $$;

-- Update status constraint if needed (allow 'cancelled' and 'paused')
do $$
begin
  if exists (
    select 1 from pg_constraint c
    join pg_class cl on c.conrelid = cl.oid
    where cl.relname = 'send_queue'
      and c.contype = 'c'
      and c.conname like '%status%'
  ) then
    alter table public.send_queue drop constraint if exists send_queue_status_check;
  end if;
  alter table public.send_queue add constraint send_queue_status_check 
    check (status in ('queued','sending','sent','failed','cancelled','paused'));
end $$;

create index if not exists idx_send_queue_status_due
  on public.send_queue(status, next_attempt_at) where status='queued';
create index if not exists idx_send_queue_scheduled_at on public.send_queue(scheduled_at);
create index if not exists idx_send_queue_account_id on public.send_queue(account_id);

-- Ensure send_logs has account_id and provider_message_id
alter table public.send_logs
  add column if not exists account_id uuid references public.connected_accounts(id) on delete set null,
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists provider_message_id text,
  add column if not exists error_text text,
  add column if not exists queue_id uuid references public.send_queue(id) on delete set null;

-- Map mailbox_id to account_id in send_logs if needed
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_logs' and column_name = 'mailbox_id'
  ) and exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_logs' and column_name = 'account_id'
  ) then
    update public.send_logs set account_id = mailbox_id where account_id is null and mailbox_id is not null;
  end if;
end $$;

-- Update send_logs status constraint
do $$
begin
  if exists (
    select 1 from pg_constraint c
    join pg_class cl on c.conrelid = cl.oid
    where cl.relname = 'send_logs'
      and c.contype = 'c'
      and c.conname like '%status%'
  ) then
    alter table public.send_logs drop constraint if exists send_logs_status_check;
  end if;
  alter table public.send_logs add constraint send_logs_status_check 
    check (status in ('sent','failed','skipped','error'));
end $$;

create index if not exists idx_send_logs_account_id on public.send_logs(account_id);
create index if not exists idx_send_logs_sent_at on public.send_logs(sent_at) where sent_at is not null;

-- Ensure connected_accounts has daily_cap, send_start, send_end
alter table public.connected_accounts
  add column if not exists daily_cap int default 40,
  add column if not exists send_start time default '08:00',
  add column if not exists send_end time default '18:00',
  add column if not exists provider text check (provider in ('gmail','outlook')) default 'gmail',
  add column if not exists email text,
  add column if not exists access_token text,
  add column if not exists refresh_token text,
  add column if not exists provider_domain text;

-- Optional: track per-account daily counters
create or replace view public.vw_account_sends_today as
select
  account_id,
  count(*)::int as sent_count_today
from public.send_logs
where sent_at::date = current_date
  and status = 'sent'
group by account_id;

-- Convenience: enforce caps & window
create or replace view public.vw_sendable_items as
with caps as (
  select
    ca.id as account_id,
    coalesce(ca.daily_cap, 40) as daily_cap,
    coalesce(ca.send_start, '08:00')::time as window_start,
    coalesce(ca.send_end,   '18:00')::time as window_end
  from public.connected_accounts ca
),
tally as (
  select c.id as account_id, coalesce(v.sent_count_today,0) as sent_today
  from public.connected_accounts c
  left join public.vw_account_sends_today v on v.account_id = c.id
)
select q.*
from public.send_queue q
join caps on caps.account_id = coalesce(q.account_id, q.mailbox_id)
join tally t on t.account_id = caps.account_id
where q.status = 'queued'
  and coalesce(q.next_attempt_at, q.scheduled_at, now()) <= now()
  and now()::time between caps.window_start and caps.window_end
  and t.sent_today < caps.daily_cap;

-- Grant access to views
grant select on public.vw_account_sends_today to service_role, authenticated;
grant select on public.vw_sendable_items to service_role, authenticated;
