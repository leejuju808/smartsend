-- Campaign Steps Analytics
-- Add views and helpers for step-level metrics

-- View to show step-level performance metrics
create or replace view public.v_campaign_step_metrics as
select
  cs.campaign_id,
  cs.step_number,
  cs.subject,
  cs.delay_days,
  
  -- Count of unique leads at this step
  count(distinct lss.lead_id) as total_recipients,
  
  -- Send metrics
  count(*) filter (where lss.state = 'sent') as sent_count,
  count(*) filter (where lss.state = 'queued') as queued_count,
  count(*) filter (where lss.state = 'pending') as pending_count,
  count(*) filter (where lss.state = 'canceled') as canceled_count,
  
  -- Performance metrics (requires joining with send_logs or email_tracking)
  avg(case when lss.sent_at is not null then 1 else 0 end) as send_rate
  
from public.campaign_steps cs
left join public.lead_step_states lss 
  on lss.campaign_id = cs.campaign_id 
  and lss.step_number = cs.step_number
where cs.active = true
group by cs.campaign_id, cs.step_number, cs.subject, cs.delay_days;

comment on view public.v_campaign_step_metrics is 
  'Aggregated metrics per campaign step showing send volumes and rates';

-- Enable RLS on the view by using security_invoker
alter view public.v_campaign_step_metrics set (security_invoker = on);

-- Helper function to get step stats for a specific campaign
create or replace function get_campaign_step_stats(p_campaign_id uuid)
returns table (
  step_number int,
  subject text,
  delay_days int,
  total_recipients bigint,
  sent_count bigint,
  queued_count bigint,
  pending_count bigint,
  canceled_count bigint,
  send_rate numeric
) as $$
begin
  return query
  select 
    csm.step_number,
    csm.subject,
    csm.delay_days,
    csm.total_recipients,
    csm.sent_count,
    csm.queued_count,
    csm.pending_count,
    csm.canceled_count,
    csm.send_rate
  from public.v_campaign_step_metrics csm
  where csm.campaign_id = p_campaign_id
  order by csm.step_number;
end;
$$ language plpgsql security definer;










