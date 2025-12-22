-- Helper RPC to bump attempts for failures
create or replace function public.increment_attempts_for(p_lead_ids uuid[])
returns void language sql security definer as $$
  update public.leads
     set send_attempts = send_attempts + 1,
         updated_at = now()
   where id = any(p_lead_ids);
$$;

revoke all on function public.increment_attempts_for(uuid[]) from public;

