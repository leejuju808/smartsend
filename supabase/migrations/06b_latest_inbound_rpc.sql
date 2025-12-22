-- 06b_latest_inbound_rpc.sql

create or replace function public.get_latest_inbound_for_leads(p_lead_ids uuid[])
returns table(lead_id uuid, subject text, body text, created_at timestamptz)
language sql stable as $$
  with lead_emails as (
    select id as lead_id, email from public.leads where id = any(p_lead_ids)
  ),
  latest as (
    select distinct on (le.lead_id)
      le.lead_id,
      im.subject, im.body, im.created_at
    from lead_emails le
    join public.inbound_messages im on im.from_email = le.email
    order by le.lead_id, im.created_at desc
  )
  select * from latest;
$$;

grant execute on function public.get_latest_inbound_for_leads(uuid[]) to anon, authenticated;


