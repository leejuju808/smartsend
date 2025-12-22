-- Ensure campaigns has max_attempts (idempotent)
alter table if exists public.campaigns
  add column if not exists max_attempts int not null default 3;

-- Secure retry function with ownership checks; respects campaign.max_attempts
create or replace function public.retry_failed_leads(
  p_campaign_id uuid,
  p_lead_ids uuid[],
  p_max_attempts int default null -- accepted for back-compat; ignored in favor of campaign setting
)
returns table(lead_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_max int;
begin
  -- Ownership + config lookup
  select owner_id, max_attempts into v_owner, v_max
  from public.campaigns
  where id = p_campaign_id;

  if v_owner is null then
    raise exception 'Campaign not found';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'Not authorized to modify this campaign';
  end if;

  return query
  with eligible as (
    select id
    from public.leads
    where campaign_id = p_campaign_id
      and id = any(p_lead_ids)
      and status in ('failed','sent')
      and attempts < coalesce(v_max, 3)
  ), upd as (
    update public.leads l
       set status = 'queued',
           attempts = l.attempts + 1,
           updated_at = now()
     where l.id in (select id from eligible)
     returning l.id
  )
  insert into public.campaign_logs (campaign_id, lead_id, event, meta)
  select p_campaign_id, id, 'retry_queued', jsonb_build_object('by', auth.uid(), 'at', now())
  from upd
  returning id as lead_id;
end;
$$;

revoke all on function public.retry_failed_leads(uuid, uuid[], int) from public;
grant execute on function public.retry_failed_leads(uuid, uuid[], int) to authenticated;


