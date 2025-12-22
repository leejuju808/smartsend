-- Block 10000 - SmartSend Mailbox Safety Guard v1 (Daily Caps + Auto-Throttle)
-- Enforces per-mailbox daily send caps with safe RPC and auto-throttling

-- 1. Update smartsend_queue status constraint to include 'skipped_limit'
alter table public.smartsend_queue
  drop constraint if exists smartsend_queue_status_check;

alter table public.smartsend_queue
  add constraint smartsend_queue_status_check
  check (status in ('pending', 'processing', 'sent', 'failed', 'retry', 'skipped_limit'));

-- 2. Update smartsend_sending_accounts status constraint to include 'throttled'
alter table public.smartsend_sending_accounts
  drop constraint if exists smartsend_sending_accounts_status_check;

alter table public.smartsend_sending_accounts
  add constraint smartsend_sending_accounts_status_check
  check (status in ('connected', 'error', 'disabled', 'throttled'));

-- 2. Safe Slot Reservation Function
-- This function atomically:
-- - Resets sent_today when we cross a new day
-- - Checks daily_limit
-- - Increments sent_today if we're allowed to send
-- - Returns true if slot reserved, false if cap hit
create or replace function public.smartsend_reserve_send_slot(p_account_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  acc record;
  today date := current_date;
begin
  -- Lock row for update within this transaction
  select * into acc
  from public.smartsend_sending_accounts
  where id = p_account_id
  for update;

  if acc is null then
    return false;
  end if;

  -- Reset if it's a new day
  if acc.last_reset_date is null or acc.last_reset_date <> today then
    update public.smartsend_sending_accounts
    set last_reset_date = today,
        sent_today = 0,
        status = case 
          when status = 'throttled' then 'connected'
          else status
        end
    where id = p_account_id;

    acc.sent_today := 0;
  end if;

  -- Check limit
  if acc.sent_today >= acc.daily_limit then
    -- Over limit → mark as throttled for the day
    update public.smartsend_sending_accounts
    set status = 'throttled',
        last_reset_date = today
    where id = p_account_id;

    return false;
  end if;

  -- Reserve this send slot
  update public.smartsend_sending_accounts
  set sent_today = acc.sent_today + 1,
      last_reset_date = today,
      status = case 
        when status = 'throttled' then 'connected'
        else status
      end
  where id = p_account_id;

  return true;
end;
$$;

-- Grant execute permission to service_role
grant execute on function public.smartsend_reserve_send_slot(uuid) to service_role;

