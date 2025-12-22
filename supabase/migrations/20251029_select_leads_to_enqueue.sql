create or replace function public.select_leads_to_enqueue(p_campaign_id uuid, p_limit int default 500)
returns table (id uuid, email text, first_name text, last_name text, company text)
language sql
as $$
  select l.id, l.email, l.first_name, l.last_name, l.company
  from public.leads l
  where l.campaign_id = p_campaign_id
    and l.status in ('queued','new')          -- not replied/failed/etc.
    and not exists (
      select 1 from public.send_queue q
      where q.lead_id = l.id
        and q.campaign_id = p_campaign_id
        and q.status in ('queued','sending','sent') -- already scheduled/sent
    )
  order by l.created_at asc
  limit greatest(1, p_limit);
$$;

grant execute on function public.select_leads_to_enqueue(uuid, int) to anon, authenticated, service_role;















