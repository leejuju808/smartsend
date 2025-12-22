-- Block 11300 — Campaign Performance Dashboard v2
-- Step-Level Analytics + Lead Outcomes + Revenue Estimates
-- This migration adds campaign_step_id to messages, job_value to contacts, and creates performance views

-- 1. Add campaign_step_id to messages table
-- This tracks which step a reply came from
alter table public.messages
  add column if not exists campaign_step_id uuid null;

-- Add index for performance
create index if not exists idx_messages_campaign_step 
  on public.messages(campaign_step_id) 
  where campaign_step_id is not null;

-- Add comment
comment on column public.messages.campaign_step_id is 
  'References the campaign step (sequence_step_id or campaign_step_id) that triggered this message/reply';

-- 2. Add job_value to contacts table for revenue tracking
alter table public.contacts
  add column if not exists job_value numeric(12,2) null;

-- Add comment
comment on column public.contacts.job_value is 
  'Estimated or actual job value in dollars for this contact/opportunity';

-- 3. Add customer status/tagging to contacts if not exists
-- This helps track which contacts became customers
alter table public.contacts
  add column if not exists is_customer boolean not null default false,
  add column if not exists estimate_booked boolean not null default false;

-- Add comments
comment on column public.contacts.is_customer is 
  'True if this contact has become a paying customer (won job)';
comment on column public.contacts.estimate_booked is 
  'True if this contact has booked an estimate/appointment';

-- 4. Create campaign_performance_view for step-level analytics
-- This view aggregates performance metrics per campaign and step
create or replace view public.campaign_performance_view as
with step_sends as (
  -- Count sends per step from send_queue
  select 
    sq.campaign_id,
    coalesce(
      sq.step_id::text,
      sq.campaign_step_id::text,
      case when sq.step_no is not null then sq.step_no::text else null end
    ) as step_id_key,
    sq.step_no,
    count(*) as deliveries
  from public.send_queue sq
  where sq.status in ('sent', 'completed')
  group by sq.campaign_id, coalesce(
    sq.step_id::text,
    sq.campaign_step_id::text,
    case when sq.step_no is not null then sq.step_no::text else null end
  ), sq.step_no
),
step_replies as (
  -- Count replies per step from messages/reply_threads
  select 
    rt.campaign_id,
    m.campaign_step_id::text as step_id,
    count(distinct rt.lead_id) as replies,
    count(distinct case when rt.latest_intent = 'hot' then rt.lead_id end) as hot_leads,
    count(distinct case when rt.latest_intent = 'warm' then rt.lead_id end) as warm_leads
  from public.reply_threads rt
  left join public.messages m on m.id = rt.latest_message_id
  where m.campaign_step_id is not null
  group by rt.campaign_id, m.campaign_step_id::text
  
  union all
  
  -- Fallback: if campaign_step_id not available, use step from send_queue
  select 
    rt.campaign_id,
    coalesce(sq.step_id::text, sq.campaign_step_id::text, sq.step_no::text) as step_id,
    count(distinct rt.lead_id) as replies,
    count(distinct case when rt.latest_intent = 'hot' then rt.lead_id end) as hot_leads,
    count(distinct case when rt.latest_intent = 'warm' then rt.lead_id end) as warm_leads
  from public.reply_threads rt
  left join public.send_queue sq on sq.campaign_id = rt.campaign_id 
    and sq.lead_id = rt.lead_id
    and sq.status in ('sent', 'completed')
  where rt.campaign_id is not null
    and (sq.step_id is not null or sq.campaign_step_id is not null or sq.step_no is not null)
  group by rt.campaign_id, coalesce(sq.step_id::text, sq.campaign_step_id::text, sq.step_no::text)
),
step_customers as (
  -- Count customers per step (contacts marked as customer)
  select 
    cm.campaign_id,
    coalesce(sq.step_id::text, sq.campaign_step_id::text, sq.step_no::text) as step_id,
    count(distinct case when c.is_customer then c.id end) as customers
  from public.campaign_members cm
  left join public.contacts c on c.id = cm.lead_id
  left join public.send_queue sq on sq.campaign_id = cm.campaign_id 
    and sq.lead_id = cm.lead_id
  where c.is_customer = true
  group by cm.campaign_id, coalesce(sq.step_id::text, sq.campaign_step_id::text, sq.step_no::text)
),
step_revenue as (
  -- Sum revenue per step
  select 
    cm.campaign_id,
    coalesce(sq.step_id::text, sq.campaign_step_id::text, sq.step_no::text) as step_id,
    coalesce(sum(c.job_value), 0) as revenue
  from public.campaign_members cm
  left join public.contacts c on c.id = cm.lead_id
  left join public.send_queue sq on sq.campaign_id = cm.campaign_id 
    and sq.lead_id = cm.lead_id
  where c.is_customer = true and c.job_value is not null
  group by cm.campaign_id, coalesce(sq.step_id::text, sq.campaign_step_id::text, sq.step_no::text)
)
select 
  c.id as campaign_id,
  c.name as campaign_name,
  coalesce(ss.step_id_key, '00000000-0000-0000-0000-000000000000') as step_id,
  coalesce(ss.step_no, 1) as step_no,
  coalesce(ss.deliveries, 0) as deliveries,
  coalesce(sr.replies, 0) as replies,
  coalesce(sr.hot_leads, 0) as hot_leads,
  coalesce(sr.warm_leads, 0) as warm_leads,
  coalesce(sc.customers, 0) as customers,
  coalesce(srev.revenue, 0) as revenue
from public.campaigns c
left join step_sends ss on ss.campaign_id = c.id
left join step_replies sr on sr.campaign_id = c.id and sr.step_id::text = ss.step_id_key
left join step_customers sc on sc.campaign_id = c.id and sc.step_id::text = ss.step_id_key
left join step_revenue srev on srev.campaign_id = c.id and srev.step_id::text = ss.step_id_key;

-- Grant access
grant select on public.campaign_performance_view to authenticated, anon;

-- Add comment
comment on view public.campaign_performance_view is 
  'Campaign performance metrics aggregated by step: deliveries, replies, hot/warm leads, customers, revenue';

-- 5. Create view for campaign-level totals (for comparison)
create or replace view public.campaign_totals_view as
select 
  c.id as campaign_id,
  c.name as campaign_name,
  c.workspace_id,
  c.created_at,
  
  -- Total contacts
  (select count(*) from public.campaign_members cm where cm.campaign_id = c.id) as total_contacts,
  
  -- Delivered
  (select count(*) from public.send_queue sq 
   where sq.campaign_id = c.id and sq.status in ('sent', 'completed')) as delivered,
  
  -- Replies
  (select count(distinct rt.lead_id) from public.reply_threads rt 
   where rt.campaign_id = c.id) as replies,
  
  -- Unique hot leads
  (select count(distinct rt.lead_id) from public.reply_threads rt 
   where rt.campaign_id = c.id and rt.latest_intent = 'hot') as unique_hot_leads,
  
  -- Warm leads
  (select count(distinct rt.lead_id) from public.reply_threads rt 
   where rt.campaign_id = c.id and rt.latest_intent = 'warm') as warm_leads,
  
  -- Estimate requests (contacts with estimate_booked = true)
  (select count(distinct cm.lead_id) from public.campaign_members cm
   join public.contacts ct on ct.id = cm.lead_id
   where cm.campaign_id = c.id and ct.estimate_booked = true) as estimate_requests,
  
  -- Jobs won (customers)
  (select count(distinct cm.lead_id) from public.campaign_members cm
   join public.contacts ct on ct.id = cm.lead_id
   where cm.campaign_id = c.id and ct.is_customer = true) as jobs_won,
  
  -- Estimated revenue
  (select coalesce(sum(ct.job_value), 0) from public.campaign_members cm
   join public.contacts ct on ct.id = cm.lead_id
   where cm.campaign_id = c.id and ct.is_customer = true and ct.job_value is not null) as estimated_revenue
   
from public.campaigns c;

-- Grant access
grant select on public.campaign_totals_view to authenticated, anon;

-- Add comment
comment on view public.campaign_totals_view is 
  'Campaign-level totals: contacts, delivered, replies, hot/warm leads, estimates, jobs won, revenue';

-- 6. Create view for lead journeys (contact-level journey tracking)
create or replace view public.lead_journey_view as
select 
  cm.campaign_id,
  cm.lead_id as contact_id,
  c.email,
  c.first_name,
  c.last_name,
  
  -- Step journey
  sq.step_no,
  sq.status as step_status,
  sq.sent_at as step_sent_at,
  
  -- Reply info
  rt.latest_intent,
  rt.last_message_at as replied_at,
  m.campaign_step_id as reply_step_id,
  
  -- Outcomes
  c.is_customer,
  c.estimate_booked,
  c.job_value,
  
  -- Status summary
  case 
    when c.is_customer then 'Customer'
    when c.estimate_booked then 'Estimate Booked'
    when rt.latest_intent = 'hot' then 'Hot Lead'
    when rt.latest_intent = 'warm' then 'Warm Lead'
    when rt.latest_intent is not null then 'Replied'
    else 'No Reply'
  end as outcome_status
  
from public.campaign_members cm
left join public.contacts c on c.id = cm.lead_id
left join public.send_queue sq on sq.campaign_id = cm.campaign_id and sq.lead_id = cm.lead_id
left join public.reply_threads rt on rt.campaign_id = cm.campaign_id and rt.lead_id = cm.lead_id
left join public.messages m on m.id = rt.latest_message_id;

-- Grant access
grant select on public.lead_journey_view to authenticated, anon;

-- Add comment
comment on view public.lead_journey_view is 
  'Contact-level journey through campaign: steps sent, replies, outcomes, revenue';

-- 7. Add indexes for performance
create index if not exists idx_send_queue_campaign_step 
  on public.send_queue(campaign_id, step_no, status);
  
create index if not exists idx_reply_threads_campaign_intent 
  on public.reply_threads(campaign_id, latest_intent);
  
create index if not exists idx_contacts_customer 
  on public.contacts(is_customer, estimate_booked) 
  where is_customer = true or estimate_booked = true;

-- 8. Function to update campaign_step_id on reply_threads when messages are linked
-- This ensures reply_threads.latest_message_id points to a message with campaign_step_id
-- Note: This is a helper function that can be called when processing replies
create or replace function public.update_reply_thread_campaign_step()
returns trigger
language plpgsql
as $$
declare
  v_campaign_step_id uuid;
begin
  -- When a reply_thread is updated with latest_message_id, try to get campaign_step_id from the message
  if new.latest_message_id is not null and new.campaign_id is not null then
    -- Get campaign_step_id from the message
    select m.campaign_step_id into v_campaign_step_id
    from public.messages m
    where m.id = new.latest_message_id;
    
    -- If message doesn't have campaign_step_id, try to get it from send_queue
    if v_campaign_step_id is null and new.lead_id is not null then
      select sq.campaign_step_id into v_campaign_step_id
      from public.send_queue sq
      where sq.campaign_id = new.campaign_id
        and sq.lead_id = new.lead_id
        and sq.status in ('sent', 'completed')
        and sq.campaign_step_id is not null
      order by sq.sent_at desc nulls last, sq.scheduled_at desc
      limit 1;
      
      -- If found, update the message
      if v_campaign_step_id is not null then
        update public.messages
        set campaign_step_id = v_campaign_step_id
        where id = new.latest_message_id
          and campaign_step_id is null;
      end if;
    end if;
  end if;
  
  return new;
end;
$$;

-- Create trigger to automatically update messages when reply_threads are updated
drop trigger if exists trg_update_reply_thread_campaign_step on public.reply_threads;
create trigger trg_update_reply_thread_campaign_step
  after insert or update of latest_message_id on public.reply_threads
  for each row
  execute function public.update_reply_thread_campaign_step();

-- Backfill: Update existing messages linked to reply_threads
do $$
declare
  v_updated_count int;
begin
  -- Update messages that are linked to reply_threads but missing campaign_step_id
  with reply_messages as (
    select distinct
      rt.latest_message_id as message_id,
      rt.campaign_id,
      rt.lead_id,
      sq.campaign_step_id
    from public.reply_threads rt
    left join public.messages m on m.id = rt.latest_message_id
    left join lateral (
      select sq.campaign_step_id
      from public.send_queue sq
      where sq.campaign_id = rt.campaign_id
        and sq.lead_id = rt.lead_id
        and sq.status in ('sent', 'completed')
        and sq.campaign_step_id is not null
      order by sq.sent_at desc nulls last, sq.scheduled_at desc
      limit 1
    ) sq on true
    where rt.latest_message_id is not null
      and rt.campaign_id is not null
      and m.campaign_step_id is null
      and sq.campaign_step_id is not null
  )
  update public.messages m
  set campaign_step_id = rm.campaign_step_id
  from reply_messages rm
  where m.id = rm.message_id
    and m.campaign_step_id is null;
  
  get diagnostics v_updated_count = row_count;
  raise notice 'Updated % reply messages with campaign_step_id', v_updated_count;
end $$;

