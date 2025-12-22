-- Extend v_replies view to include provider info
create or replace view v_replies as
select
  r.id as reply_id,
  r.created_at as replied_at,
  r.from_email,
  r.subject,
  r.snippet,
  l.id as lead_id,
  l.email as lead_email,
  l.first_name,
  l.last_name,
  l.owner_id,
  l.status as lead_status,
  c.id as campaign_id,
  c.name as campaign_name,
  -- provider from the most recent outbound log for this lead
  (select cl.provider 
   from campaign_logs cl 
   where cl.lead_id = l.id 
   order by cl.created_at desc 
   limit 1) as provider
from replies r
join leads l on l.id = r.lead_id
left join campaigns c on c.id = (
  select campaign_id 
  from campaign_logs cl2 
  where cl2.lead_id = l.id 
  order by cl2.created_at desc 
  limit 1
);
