-- Unique lead per campaign by email (case-insensitive)
create unique index if not exists leads_campaign_email_uidx
on public.leads (campaign_id, lower(email));

-- Helpful filter indexes
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_campaign_created_idx on public.leads (campaign_id, created_at desc);

-- Retry failed sends RPC
create or replace function public.retry_failed_sends(p_campaign_id uuid, p_lead_ids uuid[])
returns void
language plpgsql
security definer
as $$
begin
  update public.leads
     set status = 'queued',
         attempt_count = coalesce(attempt_count,0) + 1,
         updated_at = now()
   where campaign_id = p_campaign_id
     and id = any(p_lead_ids)
     and status = 'failed'
     and coalesce(attempt_count,0) < coalesce(max_attempts,3);
end;
$$;


