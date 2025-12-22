-- Campaign Completion RPC Function
-- Updates campaign status to completed when all recipients are processed

-- 05_rpc_complete_campaigns.sql
create or replace function public.smartsend_update_completed_campaigns()
returns void
language plpgsql
as $$
begin
  update public.campaigns c
     set status = 'completed'
   where c.status <> 'completed'
     and not exists (
       select 1
       from public.campaign_recipients r
       where r.campaign_id = c.id
         and r.status in ('queued','sending')
     );
end;
$$;

-- Grant execute permission to service role
grant execute on function public.smartsend_update_completed_campaigns() to service_role;