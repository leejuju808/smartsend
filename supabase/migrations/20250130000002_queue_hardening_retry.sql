-- Queue hardening + retry system + failure logs (idempotent)
-- Extends send_queue with retry logic, dead letter handling, and comprehensive failure logging

-- 1. Extend enum (or use text + check)
do $$ begin
  if not exists (select 1 from pg_type where typname = 'send_status') then
    create type send_status as enum ('pending','sending','sent','failed','retry_scheduled','dead_letter');
  end if;
exception when duplicate_object then null; end $$;

-- 2. Queue columns (safe-add)
-- First, try to alter status column if it exists and is text
do $$ 
begin
  -- Check if status column exists and is text type
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'send_queue' 
    and column_name = 'status'
    and data_type = 'text'
  ) then
    -- Try to convert text status to enum (will fail gracefully if values don't match)
    begin
      alter table public.send_queue
        alter column status type send_status using 
          case status
            when 'queued' then 'pending'::send_status
            when 'running' then 'sending'::send_status
            when 'scheduled' then 'retry_scheduled'::send_status
            else status::send_status
          end;
    exception when others then
      -- If conversion fails, keep as text and add check constraint
      alter table public.send_queue
        add constraint send_queue_status_check_new
        check (status in ('pending','sending','sent','failed','retry_scheduled','dead_letter'))
        not valid;
    end;
  end if;
end $$;

-- Add retry-related columns
alter table if exists public.send_queue
  add column if not exists attempt_count int not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_error text,
  add column if not exists locked_by uuid,
  add column if not exists locked_at timestamptz,
  add column if not exists provider text,
  add column if not exists to text,
  add column if not exists subject text,
  add column if not exists body_html text;

-- Ensure attempt_count defaults to 0 for existing rows
update public.send_queue
set attempt_count = coalesce(attempt_count, 0)
where attempt_count is null;

-- 3. Indexes for fast pick-up
create index if not exists idx_send_queue_retry
  on public.send_queue (status, next_attempt_at)
  where status in ('failed', 'retry_scheduled');

create index if not exists idx_send_queue_locked
  on public.send_queue (locked_at)
  where locked_at is not null;

create index if not exists idx_send_queue_pending
  on public.send_queue (status, created_at)
  where status = 'pending';

-- 4. Failure log table
-- Check if accounts table exists, otherwise use connected_accounts
do $$
declare
  accounts_table_exists boolean;
  accounts_table_name text;
begin
  -- Check which accounts table exists
  select exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'accounts'
  ) into accounts_table_exists;
  
  if accounts_table_exists then
    accounts_table_name := 'accounts';
  else
    accounts_table_name := 'connected_accounts';
  end if;

  -- Create send_fail_logs table
  execute format('
    create table if not exists public.send_fail_logs (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      queue_id uuid not null references public.send_queue(id) on delete cascade,
      account_id uuid not null references public.%I(id) on delete cascade,
      provider text not null check (provider in (''gmail'',''outlook'')),
      error_code text,
      error_message text,
      attempt int not null,
      is_transient boolean not null default true
    )', accounts_table_name);
end $$;

create index if not exists idx_send_fail_logs_queue on public.send_fail_logs(queue_id);
create index if not exists idx_send_fail_logs_account on public.send_fail_logs(account_id, created_at);

-- 5. Optional view: active dead letters
create or replace view public.v_dead_letters as
select q.*
from public.send_queue q
where q.status = 'dead_letter'::text or q.status::text = 'dead_letter';

-- 6. RLS for send_fail_logs
alter table public.send_fail_logs enable row level security;

-- Drop existing policy if it exists
drop policy if exists "fail_logs_by_account" on public.send_fail_logs;

-- Create RLS policy (adapts to accounts or connected_accounts schema)
do $$
declare
  accounts_table_exists boolean;
  owner_col_name text;
begin
  -- Check which accounts table exists and what owner column it has
  select exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'accounts'
  ) into accounts_table_exists;
  
  if accounts_table_exists then
    -- Check if accounts has owner_id or user_id
    if exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'accounts' 
      and column_name = 'owner_id'
    ) then
      owner_col_name := 'owner_id';
    else
      owner_col_name := 'user_id';
    end if;
    
    execute format('
      create policy "fail_logs_by_account"
      on public.send_fail_logs
      for select using (
        exists (
          select 1 from public.accounts a
          where a.id = send_fail_logs.account_id
            and a.%I = auth.uid()
        )
      )', owner_col_name);
  else
    -- Use connected_accounts with user_id
    execute format('
      create policy "fail_logs_by_account"
      on public.send_fail_logs
      for select using (
        exists (
          select 1 from public.connected_accounts ca
          where ca.id = send_fail_logs.account_id
            and ca.user_id = auth.uid()
        )
      )');
  end if;
end $$;

-- 7. Helper function: compute next backoff
create or replace function public.compute_backoff_seconds(
  p_attempt int,
  p_base_sec int default 60,
  p_max_sec int default 3600
) returns int
language plpgsql
stable
as $$
declare
  v_backoff int;
begin
  -- Exponential backoff: 2^attempt * base_sec, capped at max_sec, with jitter
  v_backoff := least(p_max_sec, p_base_sec * power(2, greatest(p_attempt - 1, 0)));
  -- Add jitter: random 0-2 seconds
  v_backoff := v_backoff + floor(random() * 3)::int;
  return v_backoff;
end
$$;

-- 8. Helper function: check if error is permanent
create or replace function public.is_permanent_error(
  p_error_code text,
  p_error_message text
) returns boolean
language plpgsql
immutable
as $$
declare
  v_code text := lower(coalesce(p_error_code, ''));
  v_msg text := lower(coalesce(p_error_message, ''));
begin
  -- Common permanent error signals
  return (
    v_code ~ 'invalidrecipient|invalid_from|policy_violation|spf_fail|dmarc_fail|550|554' or
    v_msg ~ 'user unknown|mailbox unavailable|blocked|bounced|invalid address|550|554'
  );
end
$$;

-- 9. Optional RPC: "retry now" button for a single message
create or replace function public.force_retry_once(q_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.send_queue
  set status = 'retry_scheduled',
      next_attempt_at = now(),
      locked_at = null
  where id = q_id 
    and status in ('failed','dead_letter','retry_scheduled');
end; $$;

