-- Inbox Auto-Stop: Trigger on inbound message to set replied_at and cancel queue
-- This ensures that when an inbound message arrives, the thread is marked as replied
-- and future queue items are cancelled

-- Function to handle inbound message and auto-stop
create or replace function public.handle_inbound_auto_stop()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid;
  v_campaign uuid;
  v_lead uuid;
begin
  -- Only process inbound messages
  if NEW.direction <> 'inbound' then
    return NEW;
  end if;

  v_thread := NEW.thread_id;

  -- Get thread info
  select campaign_id, lead_id into v_campaign, v_lead
  from public.inbox_threads
  where id = v_thread;

  -- Mark thread as replied
  update public.inbox_threads
  set replied_at = coalesce(replied_at, NEW.created_at),
      stopped_by_reply = true,
      updated_at = now()
  where id = v_thread;

  -- Cancel future queue items for this thread
  if v_campaign is not null and v_lead is not null then
    perform public.cancel_future_queue_for_thread(v_thread);
  end if;

  return NEW;
end $$;

-- Drop trigger if exists and recreate
drop trigger if exists trg_inbound_auto_stop on public.inbox_messages;
create trigger trg_inbound_auto_stop
after insert on public.inbox_messages
for each row
when (NEW.direction = 'inbound')
execute function public.handle_inbound_auto_stop();

