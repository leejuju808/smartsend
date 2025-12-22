-- Create reply_inbox view for convenient access to detected replies
create or replace view public.reply_inbox as
select
  l.id as lead_id,
  l.email,
  l.first_name,
  l.last_name,
  c.name as campaign_name,
  cl.id as log_id,
  cl.details->>'subject' as subject,
  cl.details->>'snippet' as message,
  cl.details->>'from_email' as from_email,
  cl.details->>'classification' as classification,
  cl.details->>'summary' as summary,
  cl.created_at as replied_at
from campaign_logs cl
join leads l on cl.lead_id = l.id
join campaigns c on cl.campaign_id = c.id
where cl.event_type = 'reply_detected'
order by cl.created_at desc;

-- Grant access to authenticated users
grant select on public.reply_inbox to authenticated;
