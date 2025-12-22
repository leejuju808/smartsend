-- Auto-pause Sequences On Reply
-- Simple RPC and trigger to cancel queued sends when a lead replies

-- Create simplified mark_lead_replied RPC that matches user's signature
create or replace function public.mark_lead_replied(
  p_lead_id uuid,
  p_reply_id uuid default null
) returns void
language plpgsql
security definer
as $$
begin
  -- 1) Update lead to replied status
  update public.leads
     set status = 'replied',
         replied_at = coalesce((select created_at from public.replies where id = p_reply_id), now()),
         updated_at = now()
   where id = p_lead_id;

  -- 2) Cancel all pending queue items for this lead (auto-canceled by trigger)
  -- The trigger in 20251025_stop_followups_when_replied.sql handles this
  
  -- 3) Optional: store reply_id if needed
  -- This could be extended later if you want to track which reply triggered the pause
end
$$;

-- Grant permissions
revoke all on function public.mark_lead_replied(uuid, uuid) from public;
grant execute on function public.mark_lead_replied(uuid, uuid) to authenticated, service_role;

