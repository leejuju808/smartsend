-- AI Labeler Hook: Add is_human and is_auto flags to inbox_messages
-- This allows the AI labeler to classify emails and only trigger cancel_followups
-- for human replies (not ooo/unsubscribe/bounce)

-- Add is_human column (default true for backward compatibility)
alter table public.inbox_messages
  add column if not exists is_human boolean default true;

-- Add is_auto column as generated column (always NOT is_human)
alter table public.inbox_messages
  add column if not exists is_auto boolean generated always as (not is_human) stored;

-- Create index for efficient filtering
create index if not exists idx_inbox_messages_is_human on public.inbox_messages(is_human);

-- Update the trigger to only fire on human messages (not auto-replies like ooo/unsubscribe/bounce)
create or replace function public.tg_on_inbound_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_canceled int;
  v_campaign_id uuid;
  v_thread_id uuid;
  v_stop_on_reply boolean;
begin
  -- Only act on inbound human messages (not auto-replies like ooo/unsubscribe/bounce)
  if new.direction = 'in' and new.is_human = true then
    v_thread_id := new.thread_id;
    
    -- Get campaign_id and check stop_on_reply setting
    select t.campaign_id, coalesce(c.stop_on_reply, true)
      into v_campaign_id, v_stop_on_reply
    from public.inbox_threads t
    left join public.campaigns c on c.id = t.campaign_id
    where t.id = v_thread_id;
    
    -- Only stop if campaign wants it (default true)
    if v_stop_on_reply then
      -- mark thread as replied if first time
      update public.inbox_threads
         set replied_at = coalesce(replied_at, new.sent_at),
             stopped_by_reply = true
       where id = v_thread_id
         and replied_at is null;

      -- cancel any pending future sends for this lead in this campaign
      v_canceled := public.cancel_future_queue_for_thread(v_thread_id);

      -- audit log with telemetry count (for tracking auto.cancel_followups)
      if v_campaign_id is not null and v_canceled > 0 then
        insert into public.audit_logs(campaign_id, thread_id, action, meta)
        values (
          v_campaign_id,
          v_thread_id,
          'auto.cancel_followups',
          jsonb_build_object('canceled', v_canceled)
        );
      end if;
    end if;
  end if;

  return new;
end
$$;

