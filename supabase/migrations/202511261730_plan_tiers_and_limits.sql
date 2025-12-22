-- Block 8520 — Plan-Based Email Limits (Enforce Monthly Send Caps per Account)
-- Goal: nobody can send more emails than their plan allows.
-- Starter → 500 emails/month
-- Growth → 2,000 emails/month  
-- Domination → unlimited (or very high cap you choose)

-- 1. Add plan_tier to accounts
alter table public.accounts
  add column if not exists plan_tier text
    check (plan_tier in ('starter', 'growth', 'domination'))
    default 'starter';

comment on column public.accounts.plan_tier is
  'SmartSend subscription tier: starter | growth | domination';

-- 2. Helper: get monthly email limit based on plan
create or replace function public.get_plan_monthly_email_limit(p_plan_tier text)
returns integer
language sql
as $$
  select case lower(coalesce(p_plan_tier, 'starter'))
    when 'starter' then 500     -- PLAN 1
    when 'growth' then 2000     -- PLAN 2
    when 'domination' then 1000000000 -- essentially unlimited
    else 500
  end;
$$;

-- 3. Core function: can this account send N more emails this month?
-- Note: We link email_messages -> campaigns -> workspace_id -> accounts
-- Adjust the join logic based on your actual schema relationships
create or replace function public.can_account_send_emails(
  p_account_id uuid,
  p_emails_to_send integer default 1
)
returns table (
  allowed boolean,
  plan_tier text,
  monthly_limit integer,
  current_count integer,
  remaining integer
)
language plpgsql
as $$
declare
  v_plan_tier text;
  v_limit integer;
  v_current integer;
  v_start_of_month timestamptz := date_trunc('month', now());
  v_end_of_month   timestamptz := (date_trunc('month', now()) + interval '1 month');
begin
  -- Get plan_tier
  select a.plan_tier
  into v_plan_tier
  from public.accounts a
  where a.id = p_account_id;

  if v_plan_tier is null then
    v_plan_tier := 'starter';
  end if;

  v_limit := public.get_plan_monthly_email_limit(v_plan_tier);

  -- Count sent emails this month
  -- Primary: count from send_queue (has account_id directly)
  -- Fallback: count from email_messages linking via campaigns if send_queue doesn't have sent_at
  
  -- Try send_queue first (most direct relationship)
  select count(*)::integer
  into v_current
  from public.send_queue sq
  where sq.account_id = p_account_id
    and sq.state = 'sent'
    and (
      -- If send_queue has sent_at column, use it
      (exists (select 1 from information_schema.columns 
               where table_schema = 'public' and table_name = 'send_queue' and column_name = 'sent_at')
       and sq.sent_at is not null
       and sq.sent_at >= v_start_of_month
       and sq.sent_at < v_end_of_month)
      -- Otherwise use created_at when state = 'sent'
      or (not exists (select 1 from information_schema.columns 
                      where table_schema = 'public' and table_name = 'send_queue' and column_name = 'sent_at')
          and sq.created_at >= v_start_of_month
          and sq.created_at < v_end_of_month)
    );

  -- Fallback: count from email_messages if send_queue count is 0 or doesn't exist
  if v_current = 0 or v_current is null then
    select count(*)::integer
    into v_current
    from public.email_messages em
    where em.direction = 'out'
      and em.sent_at is not null
      and em.sent_at >= v_start_of_month
      and em.sent_at < v_end_of_month
      and exists (
        -- Link via campaigns -> account_id
        select 1
        from public.campaigns c
        where c.id = em.campaign_id
          and (
            -- If campaigns has account_id directly
            (exists (select 1 from information_schema.columns 
                     where table_schema = 'public' and table_name = 'campaigns' and column_name = 'account_id')
             and c.account_id = p_account_id)
            -- Or link via send_queue
            or exists (
              select 1
              from public.send_queue sq2
              where sq2.campaign_id = em.campaign_id
                and sq2.account_id = p_account_id
            )
          )
      );
  end if;

  -- Ensure v_current is not null
  if v_current is null then
    v_current := 0;
  end if;

  return query
  select
    (v_current + p_emails_to_send) <= v_limit as allowed,
    v_plan_tier                         as plan_tier,
    v_limit                             as monthly_limit,
    v_current                           as current_count,
    greatest(v_limit - v_current, 0)    as remaining;
end;
$$;

comment on function public.can_account_send_emails(uuid, integer) is
  'Check if an account can send N more emails this month based on plan_tier and monthly usage.';

