-- Add attempt tracking column (idempotent)
alter table if exists public.leads
  add column if not exists send_attempts int not null default 0;

-- Retry failed leads RPC
create or replace function public.retry_failed_leads(
  p_campaign_id uuid,
  p_lead_ids uuid[],
  p_max_attempts int default 3
)
returns table (lead_id uuid, retried boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with up as (
    update public.leads l
    set status = 'queued',
        send_attempts = l.send_attempts + 1,
        updated_at = now()
    where l.campaign_id = p_campaign_id
      and l.id = any(p_lead_ids)
      and l.status = 'failed'
      and l.send_attempts < p_max_attempts
    returning l.id
  ),
  log as (
    insert into public.campaign_logs (campaign_id, lead_id, event_type, meta)
    select p_campaign_id, id, 'retry_queued', jsonb_build_object('source','bulk_retry')
    from up
    returning lead_id
  )
  select id as lead_id, true as retried from up;
end $$;

revoke all on function public.retry_failed_leads(uuid, uuid[], int) from public;

