-- Block 414: Campaign Analytics v1
-- Creates RPC functions for campaign analytics (event stats, step stats, timeseries)

-- 0.1 Event counts per campaign
create or replace function campaign_event_stats (p_campaign_id uuid)
returns jsonb
language sql
security definer
as $$
  select jsonb_build_object(
    'sent', (select count(*) from email_events where campaign_id = p_campaign_id and event_type = 'sent'),
    'delivered', (select count(*) from email_events where campaign_id = p_campaign_id and event_type = 'delivered'),
    'open', (select count(*) from email_events where campaign_id = p_campaign_id and event_type = 'opened'),
    'click', (select count(*) from email_events where campaign_id = p_campaign_id and event_type = 'clicked'),
    'reply', (select count(*) from email_events where campaign_id = p_campaign_id and event_type = 'replied'),
    'bounce', (select count(*) from email_events where campaign_id = p_campaign_id and event_type = 'bounced')
  );
$$;

-- 0.2 Step-level stats
-- Note: This function handles cases where step_id may not exist in email_events
-- It joins with send_queue to get step information
create or replace function campaign_step_stats (p_campaign_id uuid)
returns table (
  step_id uuid,
  step_order int,
  subject text,
  sent int,
  delivered int,
  opened int,
  clicked int,
  replied int
)
language sql
security definer
as $$
  select 
    s.id as step_id,
    s.step_number as step_order,
    coalesce(
      (select subject from templates where id = s.template_id),
      'No subject'
    ) as subject,
    (select count(*) from send_queue sq 
     where sq.campaign_id = p_campaign_id 
     and (sq.step_no = s.step_number or (sq.step_id = s.id))
     and sq.status = 'sent') as sent,
    (select count(*) from email_events e 
     where e.campaign_id = p_campaign_id 
     and (
       (e.step_id = s.id) or 
       ((e.meta->>'step_no')::int = s.step_number) or
       exists (
         select 1 from send_queue sq2 
         where sq2.campaign_id = p_campaign_id 
         and sq2.step_no = s.step_number
         and sq2.id::text = e.email_id
       )
     )
     and e.event_type = 'delivered') as delivered,
    (select count(*) from email_events e 
     where e.campaign_id = p_campaign_id 
     and (
       (e.step_id = s.id) or 
       ((e.meta->>'step_no')::int = s.step_number) or
       exists (
         select 1 from send_queue sq2 
         where sq2.campaign_id = p_campaign_id 
         and sq2.step_no = s.step_number
         and sq2.id::text = e.email_id
       )
     )
     and e.event_type = 'opened') as opened,
    (select count(*) from email_events e 
     where e.campaign_id = p_campaign_id 
     and (
       (e.step_id = s.id) or 
       ((e.meta->>'step_no')::int = s.step_number) or
       exists (
         select 1 from send_queue sq2 
         where sq2.campaign_id = p_campaign_id 
         and sq2.step_no = s.step_number
         and sq2.id::text = e.email_id
       )
     )
     and e.event_type = 'clicked') as clicked,
    (select count(*) from email_events e 
     where e.campaign_id = p_campaign_id 
     and (
       (e.step_id = s.id) or 
       ((e.meta->>'step_no')::int = s.step_number) or
       exists (
         select 1 from send_queue sq2 
         where sq2.campaign_id = p_campaign_id 
         and sq2.step_no = s.step_number
         and sq2.id::text = e.email_id
       )
     )
     and e.event_type = 'replied') as replied
  from campaign_steps s
  where s.campaign_id = p_campaign_id
  order by s.step_number asc;
$$;

-- 0.3 Time-series activity (daily)
create or replace function campaign_timeseries (p_campaign_id uuid)
returns table (
  event_date date,
  sent int,
  opened int,
  clicked int,
  replied int
)
language sql
security definer
as $$
  select
    date_trunc('day', created_at)::date as event_date,
    count(*) filter (where event_type = 'sent') as sent,
    count(*) filter (where event_type = 'opened') as opened,
    count(*) filter (where event_type = 'clicked') as clicked,
    count(*) filter (where event_type = 'replied') as replied
  from email_events
  where campaign_id = p_campaign_id
  group by 1
  order by 1;
$$;

-- Grant execute permissions to authenticated users
grant execute on function campaign_event_stats(uuid) to authenticated;
grant execute on function campaign_step_stats(uuid) to authenticated;
grant execute on function campaign_timeseries(uuid) to authenticated;

