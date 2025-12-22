-- Pause sequences on reply: cancel pending sends and log to campaign_logs
-- This trigger fires when a lead's status changes to 'Replied' or 'replied'

-- Ensure campaign_logs has meta column for tracking
alter table public.campaign_logs
  add column if not exists meta jsonb default '{}'::jsonb;

-- Ensure send_queue has reason_canceled and canceled_at if they don't exist
alter table public.send_queue
  add column if not exists reason_canceled text,
  add column if not exists canceled_at timestamptz;

-- Trigger function: when a lead becomes Replied, cancel all pending queue items
create or replace function pause_sequences_on_lead_reply()
returns trigger language plpgsql security definer as $$
declare
  cancelled_count int;
  new_status_text text;
  old_status_text text;
begin
  -- Convert status to text for comparison (handles both enum and text types)
  new_status_text := lower(NEW.status::text);
  old_status_text := coalesce(lower(OLD.status::text), '');
  
  -- Handle both 'Replied' and 'replied' status (case-insensitive comparison)
  if new_status_text = 'replied' and old_status_text != 'replied' then
    
    -- Cancel all pending and scheduled items for this lead
    update public.send_queue
      set status = 'canceled',
          reason_canceled = 'Auto-canceled: lead replied',
          canceled_at = now()
    where lead_id = NEW.id
      and status in ('pending', 'scheduled');

    get diagnostics cancelled_count = row_count;

    -- Log to campaign_logs (handle both 'event' and 'event_type' columns)
    if cancelled_count > 0 then
      -- Try inserting with 'event' column first, fallback to 'event_type' if it doesn't exist
      begin
        insert into public.campaign_logs (lead_id, event, meta)
        values (
          NEW.id,
          'Sequences paused (lead replied)',
          jsonb_build_object(
            'source', 'db_trigger',
            'cancelled_count', cancelled_count,
            'replied_at', coalesce(NEW.replied_at, now())
          )
        );
      exception when others then
        -- Fallback: try with event_type column
        insert into public.campaign_logs (lead_id, event_type, meta)
        values (
          NEW.id,
          'Sequences paused (lead replied)',
          jsonb_build_object(
            'source', 'db_trigger',
            'cancelled_count', cancelled_count,
            'replied_at', coalesce(NEW.replied_at, now())
          )
        );
      end;
    end if;
  end if;
  return NEW;
end $$;

-- Drop existing trigger if it exists
drop trigger if exists trg_pause_sequences_on_lead_reply on public.leads;

-- Create trigger that fires on status update
create trigger trg_pause_sequences_on_lead_reply
  after update of status on public.leads
  for each row 
  execute function pause_sequences_on_lead_reply();

