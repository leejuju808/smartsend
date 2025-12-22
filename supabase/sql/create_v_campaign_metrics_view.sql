-- Create or replace view for campaign metrics
create or replace view public.v_campaign_metrics as
select
  c.id as campaign_id,
  c.name,
  c.workspace_id,
  count(distinct s.id) filter (where s.status='sent') as sent_count,
  count(distinct e.id) filter (where e.event_type='open') as opens,
  count(distinct e.id) filter (where e.event_type='click') as clicks,
  count(distinct r.id) as replies,
  round(
    count(distinct r.id)::numeric / nullif(count(distinct s.id),0) * 100, 2
  ) as reply_rate
from campaigns c
left join send_logs s on s.campaign_id = c.id
left join email_events e on e.campaign_id = c.id
left join email_replies r on r.campaign_id = c.id
group by c.id, c.name, c.workspace_id; 