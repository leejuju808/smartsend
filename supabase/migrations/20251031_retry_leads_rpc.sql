-- Create retry_leads RPC function
-- This function retries leads for re-queuing
create or replace function public.retry_leads(_lead_ids uuid[], _actor uuid)
returns int
language plpgsql
security definer
as $$
declare
  updated_count int := 0;
begin
  -- Update leads to re-queue them
  update public.leads l
  set status = 'queued', 
      send_attempts = l.send_attempts + 1, 
      updated_at = now()
  where l.id = any(_lead_ids)
    and l.status in ('failed', 'sending', 'bounced');

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- Optional: log to campaign_logs if the table exists
  -- Note: This assumes campaign_logs table exists with appropriate structure
  -- If not, comment out this section
  /*
  insert into public.campaign_logs (campaign_id, lead_id, type, message, created_by)
  select l.campaign_id, l.id, 'retry', 'Re-enqueued by user', _actor
  from public.leads l
  where l.id = any(_lead_ids) and l.status = 'queued';
  */

  return updated_count;
end;
$$;

grant execute on function public.retry_leads(uuid[], uuid) to authenticated;

