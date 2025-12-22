-- Create a helper function to atomically retry failed campaign logs
-- This function resets failed logs to queued status and increments retry_count

-- First, ensure we have the necessary columns on campaign_logs
alter table public.campaign_logs 
  add column if not exists retry_count int not null default 0,
  add column if not exists last_error text;

-- Create or replace a helper function to atomically flip failed -> queued
-- and increment retry_count. It returns the count updated.
create or replace function public.retry_campaign_logs(p_ids uuid[])
returns integer
language plpgsql
security definer
as $$
declare
  v_count int;
begin
  update public.campaign_logs cl
  set
    event_type = 'queued',
    last_error = null,
    retry_count = coalesce(retry_count, 0) + 1,
    updated_at = now()
  where cl.id = any (p_ids)
    and cl.event_type = 'send_failed';

  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

-- Make sure RLS allows the service role to run this
revoke all on function public.retry_campaign_logs(uuid[]) from public;
grant execute on function public.retry_campaign_logs(uuid[]) to service_role;
grant execute on function public.retry_campaign_logs(uuid[]) to authenticated;

-- Add updated_at column if it doesn't exist
alter table public.campaign_logs 
  add column if not exists updated_at timestamptz default now();

-- Create trigger to update updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_campaign_logs_updated_at on public.campaign_logs;
create trigger trg_campaign_logs_updated_at
  before update on public.campaign_logs
  for each row
  execute function public.touch_updated_at();
