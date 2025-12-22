-- SQL function for rolling up sender metrics from yesterday
-- This aggregates outcomes from scheduled_messages and send_queue

create or replace function public.rollup_sender_metrics_yesterday()
returns table (
  account_id uuid,
  mailbox_email text,
  day date,
  sends int,
  bounces int,
  complaints int,
  unsubscribes int,
  opens int,
  replies int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  yesterday_date date := (now() at time zone 'utc')::date - interval '1 day';
begin
  return query
  with message_outcomes as (
    -- Aggregate from scheduled_messages (if it has outcome tracking)
    select
      c.account_id::uuid as account_id,
      coalesce(sm.from_email, sq.from_email, 'unknown'::text) as mailbox_email,
      yesterday_date as day,
      count(*) filter (where sm.status = 'sent' or sq.status = 'sent')::int as sends,
      count(*) filter (where sm.bounced = true or sq.bounced = true)::int as bounces,
      count(*) filter (where sm.complained = true or sq.complained = true)::int as complaints,
      count(*) filter (where sm.unsubscribed = true or sq.unsubscribed = true)::int as unsubscribes,
      count(*) filter (where sm.opened = true or sq.opened = true)::int as opens,
      count(*) filter (where sm.replied = true or sq.replied = true)::int as replies
    from public.scheduled_messages sm
    left join public.send_queue sq on sq.id = sm.id
    left join public.campaigns c on c.id = coalesce(sm.campaign_id, sq.campaign_id)
    where 
      (sm.sent_at::date = yesterday_date or sq.sent_at::date = yesterday_date)
      and c.account_id is not null
    group by c.account_id, coalesce(sm.from_email, sq.from_email, 'unknown'::text)
    
    union all
    
    -- Also aggregate from send_queue directly if it has the fields
    select
      c.account_id::uuid as account_id,
      coalesce(sq.from_email, 'unknown'::text) as mailbox_email,
      yesterday_date as day,
      count(*) filter (where sq.status = 'sent')::int as sends,
      count(*) filter (where sq.bounced = true)::int as bounces,
      count(*) filter (where sq.complained = true)::int as complaints,
      count(*) filter (where sq.unsubscribed = true)::int as unsubscribes,
      count(*) filter (where sq.opened = true)::int as opens,
      count(*) filter (where sq.replied = true)::int as replies
    from public.send_queue sq
    left join public.campaigns c on c.id = sq.campaign_id
    where 
      sq.sent_at::date = yesterday_date
      and c.account_id is not null
      and not exists (
        select 1 from public.scheduled_messages sm2 where sm2.id = sq.id
      )
    group by c.account_id, coalesce(sq.from_email, 'unknown'::text)
  )
  select
    account_id,
    mailbox_email,
    day,
    sum(sends)::int as sends,
    sum(bounces)::int as bounces,
    sum(complaints)::int as complaints,
    sum(unsubscribes)::int as unsubscribes,
    sum(opens)::int as opens,
    sum(replies)::int as replies
  from message_outcomes
  group by account_id, mailbox_email, day;
end;
$$;

-- Grant execute permission
grant execute on function public.rollup_sender_metrics_yesterday() to service_role;
revoke execute on function public.rollup_sender_metrics_yesterday() from public;















