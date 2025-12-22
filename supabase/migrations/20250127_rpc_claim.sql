-- Campaign Queue RPC Functions
-- PostgreSQL functions for safely claiming and processing campaign recipients

-- 04_rpc_claim.sql
-- Uses SKIP LOCKED pattern to safely claim rows for this tick
create or replace function public.smartsend_claim_due_recipients(p_limit int default 50)
returns table (id uuid, campaign_id uuid, recipient text, subject text, body text)
language plpgsql
as $$
begin
  return query
  with cte as (
    select r.*
    from public.campaign_recipients r
    join public.campaigns c on c.id = r.campaign_id
    where r.status = 'queued'
      and r.scheduled_at <= now()
      and c.status in ('scheduled','sending')
    order by r.scheduled_at asc
    limit p_limit
    for update skip locked
  )
  update public.campaign_recipients r
     set status = 'sending'
  from cte
  where r.id = cte.id
  returning r.id, r.campaign_id, r.recipient, r.subject, r.body;
end;
$$;

-- Grant execute permission to service role
grant execute on function public.smartsend_claim_due_recipients(int) to service_role;