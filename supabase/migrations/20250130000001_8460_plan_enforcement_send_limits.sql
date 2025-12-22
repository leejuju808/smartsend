-- Block 8460 — Plan Enforcement & Send Limits (Free vs Pro)
-- Makes SmartSend respect plans so free users can't blast 10,000 emails
-- Adds daily send limits per plan and enforcement logic

-- ============================================
-- 1) Update plan_limits table with daily_send_limit
-- ============================================

-- Add daily_send_limit column if it doesn't exist
alter table public.plan_limits 
  add column if not exists daily_send_limit integer;

-- Seed default daily limits (idempotent-style)
-- Note: This will update existing rows if they exist, or insert if they don't
insert into public.plan_limits (plan, daily_send_limit, monthly_send_limit)
values
  ('free', 50, 1500),
  ('pro', 500, 15000)
on conflict (plan) do update
set
  daily_send_limit = EXCLUDED.daily_send_limit,
  monthly_send_limit = COALESCE(EXCLUDED.monthly_send_limit, plan_limits.monthly_send_limit);

-- Ensure monthly_send_limit is preserved if it already exists
-- Update only daily_send_limit for existing rows that don't have it
update public.plan_limits
set daily_send_limit = case
  when plan = 'free' then 50
  when plan = 'pro' then 500
  when plan = 'team' then 2000
  else 50
end
where daily_send_limit is null;

-- ============================================
-- 2) Create user_daily_send_stats view
-- ============================================
-- This counts how many emails an owner has sent today (UTC-based)

create or replace view public.user_daily_send_stats as
select
  c.owner_id as user_id,
  date_trunc('day', cs.sent_at) as day,
  count(*) as sends_today
from public.campaign_sends cs
join public.campaigns c
  on c.id = cs.campaign_id
where cs.sent_at is not null
  and c.owner_id is not null
group by
  c.owner_id,
  date_trunc('day', cs.sent_at);

-- Create index on campaign_sends for faster daily stats queries
create index if not exists idx_campaign_sends_sent_at_day 
  on public.campaign_sends(date_trunc('day', sent_at)) 
  where sent_at is not null;

-- Grant access to authenticated users (they can see their own stats via RLS)
grant select on public.user_daily_send_stats to authenticated;

-- ============================================
-- 3) Helper function: get_user_daily_send_count
-- ============================================
-- Returns the number of sends a user has made today (UTC)

create or replace function public.get_user_daily_send_count(p_user_id uuid, p_date date default current_date)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  select coalesce(sum(sends_today), 0) into v_count
  from public.user_daily_send_stats
  where user_id = p_user_id
    and day = date_trunc('day', p_date::timestamptz);
  
  return v_count;
end;
$$;

grant execute on function public.get_user_daily_send_count(uuid, date) to authenticated, service_role;

-- ============================================
-- 4) Helper function: check_daily_send_limit
-- ============================================
-- Returns whether a user can send N more emails today
-- Returns: (can_send boolean, sends_today integer, daily_limit integer, remaining integer)

create or replace function public.check_daily_send_limit(
  p_user_id uuid,
  p_count integer default 1,
  p_date date default current_date
)
returns table(
  can_send boolean,
  sends_today integer,
  daily_limit integer,
  remaining integer,
  effective_plan text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_status text;
  v_limit integer;
  v_sends_today integer;
begin
  -- Get profile plan + status
  select plan, plan_status into v_plan, v_status
  from public.profiles
  where id = p_user_id;
  
  -- Default to free if no profile found
  if v_plan is null then
    v_plan := 'free';
    v_status := 'inactive';
  end if;
  
  -- Treat non-active paid plans as free
  if v_plan != 'free' and v_status not in ('active', 'trialing') then
    v_plan := 'free';
  end if;
  
  -- Lookup daily limit
  select daily_send_limit into v_limit
  from public.plan_limits
  where plan = v_plan;
  
  -- Fallback defaults
  if v_limit is null then
    v_limit := case when v_plan = 'pro' then 500 else 50 end;
  end if;
  
  -- Count sends today
  v_sends_today := public.get_user_daily_send_count(p_user_id, p_date);
  
  -- Return result
  return query select
    (v_sends_today + p_count <= v_limit) as can_send,
    v_sends_today as sends_today,
    v_limit as daily_limit,
    greatest(v_limit - v_sends_today, 0) as remaining,
    v_plan as effective_plan;
end;
$$;

grant execute on function public.check_daily_send_limit(uuid, integer, date) to authenticated, service_role;

-- ============================================
-- Block 8460 Complete
-- ============================================
-- Plan Enforcement & Send Limits is now live:
-- ✓ plan_limits table with daily_send_limit
-- ✓ user_daily_send_stats view for daily send tracking
-- ✓ Helper functions for checking limits
-- ✓ Ready for enforcement in Edge Functions

