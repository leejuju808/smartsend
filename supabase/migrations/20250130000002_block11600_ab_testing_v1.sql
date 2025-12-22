-- Block 11600 — Campaign Variants & A/B Testing v1
-- Subject Line Variants + Step Variants + Automatic Split + Analytics
-- 
-- This migration adds A/B testing capabilities to campaign steps:
-- - Users can create two versions (A and B) of subject lines and email body content
-- - SmartSend automatically splits sends and tracks which variant wins
-- - Analytics show variant-level performance metrics

-- 1. Extend campaign_steps table with variant columns
-- ─────────────────────────────────────────────────────────────

alter table public.campaign_steps
  add column if not exists subject_b text,
  add column if not exists body_html_template_b text,
  add column if not exists enable_variant boolean default false,
  add column if not exists variant_split int default 50 check (variant_split >= 0 and variant_split <= 100);

-- Add comment for clarity
comment on column public.campaign_steps.subject_b is 'Variant B subject line for A/B testing';
comment on column public.campaign_steps.body_html_template_b is 'Variant B body content for A/B testing';
comment on column public.campaign_steps.enable_variant is 'Whether A/B testing is enabled for this step';
comment on column public.campaign_steps.variant_split is 'Percentage split for variant A (0-100). Remaining goes to variant B';

-- 2. Add variant tracking to send_queue
-- ─────────────────────────────────────────────────────────────

alter table public.send_queue
  add column if not exists variant_used text default 'A' check (variant_used in ('A', 'B'));

-- Add index for variant analytics queries
create index if not exists idx_send_queue_variant on public.send_queue(campaign_id, step_no, variant_used) 
  where variant_used is not null;

-- Add comment
comment on column public.send_queue.variant_used is 'Which variant (A or B) was used for this send';

-- 3. Create view for variant-level analytics
-- ─────────────────────────────────────────────────────────────

create or replace view public.campaign_step_variant_stats as
select
  cs.campaign_id,
  cs.step_no,
  sq.variant_used,
  count(*) filter (where sq.status in ('sent', 'completed', 'dispatched')) as deliveries,
  count(*) filter (where sq.status in ('sent', 'completed', 'dispatched') and exists (
    select 1 from public.normalized_messages nm
    where nm.linked_thread_id = sq.thread_id
    and nm.direction = 'inbound'
    and nm.sent_at >= coalesce(sq.created_at, sq.scheduled_at, now() - interval '30 days')
  )) as replies,
  count(*) filter (where sq.status in ('sent', 'completed', 'dispatched') and exists (
    select 1 from public.normalized_messages nm
    join public.leads l on l.email = nm.from_email
    where nm.linked_thread_id = sq.thread_id
    and nm.direction = 'inbound'
    and nm.sent_at >= coalesce(sq.created_at, sq.scheduled_at, now() - interval '30 days')
    and (coalesce(nm.ai_label, '') = 'positive' or l.status = 'hot')
  )) as hot_leads,
  count(*) filter (where sq.status in ('sent', 'completed', 'dispatched') and exists (
    select 1 from public.normalized_messages nm
    join public.leads l on l.email = nm.from_email
    where nm.linked_thread_id = sq.thread_id
    and nm.direction = 'inbound'
    and nm.sent_at >= coalesce(sq.created_at, sq.scheduled_at, now() - interval '30 days')
    and l.status = 'warm'
  )) as warm_leads,
  count(*) filter (where sq.status in ('sent', 'completed', 'dispatched') and exists (
    select 1 from public.campaign_leads cl
    join public.leads l on l.id = cl.lead_id
    where cl.campaign_id = cs.campaign_id
    and cl.lead_id = sq.lead_id
    and (cl.status = 'estimate_requested' or l.status = 'estimate_requested')
  )) as estimate_requests
from public.campaign_steps cs
join public.send_queue sq on sq.campaign_id = cs.campaign_id and sq.step_no = cs.step_no
where cs.enable_variant = true
  and sq.variant_used is not null
group by cs.campaign_id, cs.step_no, sq.variant_used;

-- Add helpful comment
comment on view public.campaign_step_variant_stats is 'Variant-level performance metrics for A/B testing';

-- 4. Create function to calculate variant winner
-- ─────────────────────────────────────────────────────────────

create or replace function public.get_variant_winner(
  p_campaign_id uuid,
  p_step_no int,
  p_metric text default 'reply_rate'
)
returns table (
  variant text,
  metric_value numeric,
  improvement_pct numeric
)
language plpgsql
as $$
declare
  variant_a_stats record;
  variant_b_stats record;
  variant_a_rate numeric;
  variant_b_rate numeric;
begin
  -- Get stats for variant A
  select 
    deliveries,
    replies,
    hot_leads,
    case when deliveries > 0 then (replies::numeric / deliveries) * 100 else 0 end as reply_rate,
    case when deliveries > 0 then (hot_leads::numeric / deliveries) * 100 else 0 end as hot_rate
  into variant_a_stats
  from public.campaign_step_variant_stats
  where campaign_id = p_campaign_id
    and step_no = p_step_no
    and variant_used = 'A';

  -- Get stats for variant B
  select 
    deliveries,
    replies,
    hot_leads,
    case when deliveries > 0 then (replies::numeric / deliveries) * 100 else 0 end as reply_rate,
    case when deliveries > 0 then (hot_leads::numeric / deliveries) * 100 else 0 end as hot_rate
  into variant_b_stats
  from public.campaign_step_variant_stats
  where campaign_id = p_campaign_id
    and step_no = p_step_no
    and variant_used = 'B';

  -- Determine winner based on metric
  if p_metric = 'reply_rate' then
    variant_a_rate := coalesce(variant_a_stats.reply_rate, 0);
    variant_b_rate := coalesce(variant_b_stats.reply_rate, 0);
  elsif p_metric = 'hot_rate' then
    variant_a_rate := coalesce(variant_a_stats.hot_rate, 0);
    variant_b_rate := coalesce(variant_b_stats.hot_rate, 0);
  else
    variant_a_rate := coalesce(variant_a_stats.reply_rate, 0);
    variant_b_rate := coalesce(variant_b_stats.reply_rate, 0);
  end if;

  -- Return winner
  if variant_a_rate > variant_b_rate and coalesce(variant_a_stats.deliveries, 0) >= 10 then
    return query select 
      'A'::text as variant,
      variant_a_rate as metric_value,
      case when variant_b_rate > 0 
        then ((variant_a_rate - variant_b_rate) / variant_b_rate) * 100
        else variant_a_rate
      end as improvement_pct;
  elsif variant_b_rate > variant_a_rate and coalesce(variant_b_stats.deliveries, 0) >= 10 then
    return query select 
      'B'::text as variant,
      variant_b_rate as metric_value,
      case when variant_a_rate > 0 
        then ((variant_b_rate - variant_a_rate) / variant_a_rate) * 100
        else variant_b_rate
      end as improvement_pct;
  else
    -- No clear winner yet (not enough data or tie)
    return;
  end if;
end;
$$;

-- 5. Ensure RLS policies respect variant data
-- ─────────────────────────────────────────────────────────────

-- Variant data inherits RLS from campaign_steps and send_queue
-- No additional policies needed as existing RLS covers this

-- 6. Add helpful indexes for analytics queries
-- ─────────────────────────────────────────────────────────────

create index if not exists idx_campaign_steps_variant_enabled 
  on public.campaign_steps(campaign_id, step_no) 
  where enable_variant = true;

