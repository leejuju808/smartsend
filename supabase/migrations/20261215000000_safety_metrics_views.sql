-- Safety Metrics Views
-- Normalizes safety events (reply-cancel + suppression-cancel) for analytics

-- A) Normalize safety events (reply-cancel + suppression-cancel)
create or replace view public.v_safety_events as
with reply as (
  select
    date_trunc('day', a.created_at)::date as day,
    a.campaign_id,
    'reply_stop'::text as kind,
    (a.meta->>'canceled')::int as count
  from public.audit_logs a
  where a.action = 'auto.cancel_followups'
),
suppress as (
  select
    date_trunc('day', q.updated_at)::date as day,
    q.campaign_id,
    'suppression'::text as kind,
    count(*)::int as count
  from public.send_queue q
  where q.status = 'canceled'
    and (
      coalesce(q.last_error, '') ilike 'suppressed:%'
      or coalesce(q.error, '') ilike 'suppressed:%'
    )
  group by 1,2
)
select * from reply
union all
select * from suppress;

-- B) Easy rollups
create or replace view public.v_safety_stats_7d as
select day, campaign_id, kind, sum(count) as count
from public.v_safety_events
where day >= (current_date - interval '6 days')::date
group by 1,2,3
order by day asc;

create or replace view public.v_safety_stats_14d as
select day, campaign_id, kind, sum(count) as count
from public.v_safety_events
where day >= (current_date - interval '13 days')::date
group by 1,2,3
order by day asc;

create or replace view public.v_safety_stats_30d as
select day, campaign_id, kind, sum(count) as count
from public.v_safety_events
where day >= (current_date - interval '29 days')::date
group by 1,2,3
order by 1,2,3;

-- C) CSV export source
create or replace view public.v_suppression_export as
select email, reason, last_seen
from public.suppressed_recipients
order by last_seen desc;

-- RLS: If RLS is on, ensure policies allow reads
-- Note: Views inherit RLS from underlying tables, so we ensure base tables have proper policies

-- Ensure audit_logs has read policy for authenticated users
do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'audit_logs'
  ) then
    -- Check if RLS is enabled
    if exists (
      select 1 from pg_tables t
      join pg_class c on c.relname = t.tablename
      where t.schemaname = 'public' and t.tablename = 'audit_logs'
      and c.relrowsecurity = true
    ) then
      -- Create policy if it doesn't exist
      if not exists (
        select 1 from pg_policies 
        where schemaname = 'public' 
        and tablename = 'audit_logs' 
        and policyname = 'sel_audit'
      ) then
        create policy sel_audit on public.audit_logs 
        for select to authenticated using (true);
      end if;
    else
      -- Enable RLS if not enabled
      alter table public.audit_logs enable row level security;
      create policy sel_audit on public.audit_logs 
      for select to authenticated using (true);
    end if;
  end if;
end $$;

-- Ensure send_queue has read policy for authenticated users
do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'send_queue'
  ) then
    -- Check if RLS is enabled
    if exists (
      select 1 from pg_tables t
      join pg_class c on c.relname = t.tablename
      where t.schemaname = 'public' and t.tablename = 'send_queue'
      and c.relrowsecurity = true
    ) then
      -- Create policy if it doesn't exist (check for queue_read or sel_queue)
      if not exists (
        select 1 from pg_policies 
        where schemaname = 'public' 
        and tablename = 'send_queue' 
        and policyname in ('sel_queue', 'queue_read')
      ) then
        create policy sel_queue on public.send_queue 
        for select to authenticated using (true);
      end if;
    else
      -- Enable RLS if not enabled
      alter table public.send_queue enable row level security;
      create policy sel_queue on public.send_queue 
      for select to authenticated using (true);
    end if;
  end if;
end $$;

-- Grant access to views
grant select on public.v_safety_events to authenticated;
grant select on public.v_safety_stats_7d to authenticated;
grant select on public.v_safety_stats_14d to authenticated;
grant select on public.v_safety_stats_30d to authenticated;
grant select on public.v_suppression_export to authenticated;

