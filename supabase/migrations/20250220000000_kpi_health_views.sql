-- KPI & Health Views (Idempotent)
-- Run in Supabase SQL editor

-- A) Sends today / Due now
create or replace view public.kpi_send_activity as
select
  a.id as account_id,
  a.email_address,
  -- sends today
  (select count(*) from public.send_logs s
    where s.account_id=a.id and s.status='sent'
      and s.created_at::date = (now() at time zone 'utc')::date) as sends_today,
  -- due now
  (select count(*) from public.send_queue q
    where q.account_id=a.id and q.status='queued' and coalesce(q.scheduled_for, q.scheduled_at)<=now()) as due_now
from public.connected_accounts a
where a.user_id = auth.uid();

-- B) Reply rate (last 7d)
create or replace view public.kpi_reply_rate_7d as
select
  c.id as campaign_id,
  c.name,
  -- contacts touched last 7d
  count(distinct sl.lead_id) filter (where sl.status='sent' and sl.created_at>=now()-interval '7 days') as contacted_7d,
  -- replies last 7d
  count(distinct t.lead_id) filter (where t.replied_at>=now()-interval '7 days') as replied_7d,
  round(100.0 * count(distinct t.lead_id) filter (where t.replied_at>=now()-interval '7 days')
      / nullif(count(distinct sl.lead_id) filter (where sl.status='sent' and sl.created_at>=now()-interval '7 days'),0),2) as reply_rate_pct_7d
from public.campaigns c
left join public.inbox_threads t on t.campaign_id=c.id
left join public.send_logs sl on sl.campaign_id=c.id
where c.user_id = auth.uid()
group by 1,2
order by reply_rate_pct_7d desc nulls last;

-- C) Deliverability snapshot (last 7d)
create or replace view public.kpi_deliverability_7d as
select
  c.id as campaign_id,
  c.name,
  count(*) filter (where sl.reason='bounce' or sl.reason='bounced' or sl.kind='bounce') as bounces_7d,
  count(*) filter (where sl.reason='unsubscribe' or sl.reason='unsubscribed' or sl.kind='unsubscribe') as unsub_7d
from public.campaigns c
left join public.suppression_list sl
  on (sl.account_id=c.account_id or sl.workspace_id in (select workspace_id from public.workspace_members where user_id=auth.uid()))
  and sl.created_at>=now()-interval '7 days'
where c.user_id = auth.uid()
group by 1,2
order by bounces_7d desc nulls last;

-- D) Billing usage
create or replace view public.kpi_billing_overview as
select
  bo.billing_account_id,
  bo.plan_code,
  bo.status,
  bo.current_period_start,
  bo.current_period_end,
  bo.monthly_send_cap,
  bo.sends_used,
  (bo.monthly_send_cap - bo.sends_used) as sends_left
from public.billing_overview bo
join public.billing_accounts ba on ba.id=bo.billing_account_id
where ba.user_id = auth.uid();

-- E) Sender health (from previous slice, scoped to owner)
create or replace view public.kpi_sender_health as
select *
from public.sender_health sh
join public.connected_accounts a on a.id=sh.account_id
where a.user_id = auth.uid();

-- F) Queue issues: failed in last 24h
create or replace view public.kpi_failures_24h as
select
  s.campaign_id, c.name as campaign, s.lead_id, l.email, s.step_no,
  coalesce(s.error, s.error_message) as error_message, s.created_at
from public.send_logs s
join public.campaigns c on c.id=s.campaign_id
join public.leads l on l.id=s.lead_id
where s.status='failed' and s.created_at>=now()-interval '24 hours'
  and c.user_id = auth.uid()
order by s.created_at desc;

-- G) Worker heartbeat table + view
create table if not exists public.system_heartbeats (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  worker text not null,               -- e.g., 'send-tick'
  last_ok_at timestamptz not null default now(),
  meta jsonb default '{}'::jsonb,
  unique(worker)
);

create or replace view public.kpi_heartbeats as
select worker, last_ok_at, meta
from public.system_heartbeats;

-- RLS policies for system_heartbeats (read-only for authenticated users)
alter table public.system_heartbeats enable row level security;

create policy "Allow authenticated users to read heartbeats"
  on public.system_heartbeats
  for select
  to authenticated
  using (true);

-- Service role can insert/update (for workers)
create policy "Service role can manage heartbeats"
  on public.system_heartbeats
  for all
  to service_role
  using (true)
  with check (true);

