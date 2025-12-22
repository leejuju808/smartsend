-- =========================================================
-- Block 9100 — Billing Guard v1
-- (Enforce Plan Limits + Stripe Sync + Lock Features Automatically)
-- =========================================================

-- A) Add billing fields to accounts table
alter table public.accounts
  add column if not exists current_plan text not null default 'starter'
    check (current_plan in ('starter', 'growth', 'domination', 'locked')),
  add column if not exists plan_email_limit int not null default 500,
  add column if not exists plan_campaign_limit int not null default 1,
  add column if not exists plan_features jsonb not null default '{}',
  add column if not exists email_usage_month int not null default 0,
  add column if not exists email_usage_reset_at timestamptz default date_trunc('month', now());

comment on column public.accounts.current_plan is
  'Current subscription plan: starter | growth | domination | locked';
comment on column public.accounts.plan_email_limit is
  'Monthly email send limit for current plan';
comment on column public.accounts.plan_campaign_limit is
  'Maximum number of active campaigns allowed for current plan';
comment on column public.accounts.plan_features is
  'JSON object containing feature flags for current plan';
comment on column public.accounts.email_usage_month is
  'Number of emails sent this month (resets monthly)';
comment on column public.accounts.email_usage_reset_at is
  'Timestamp when email usage was last reset (start of current month)';

create index if not exists idx_accounts_current_plan on public.accounts(current_plan);
create index if not exists idx_accounts_email_usage_reset on public.accounts(email_usage_reset_at);

-- B) Helper function: Get plan configuration
create or replace function public.get_plan_config(p_plan text)
returns jsonb
language sql
stable
as $$
  select case lower(coalesce(p_plan, 'starter'))
    when 'starter' then jsonb_build_object(
      'email_limit', 500,
      'campaign_limit', 1,
      'features', jsonb_build_object(
        'ai_personalization', 'basic',
        'follow_up_brain', false,
        'revenue_dashboard', false
      )
    )
    when 'growth' then jsonb_build_object(
      'email_limit', 2000,
      'campaign_limit', 3,
      'features', jsonb_build_object(
        'ai_personalization', 'advanced',
        'follow_up_brain', true,
        'revenue_dashboard', false
      )
    )
    when 'domination' then jsonb_build_object(
      'email_limit', 999999999, -- essentially unlimited
      'campaign_limit', 999999999,
      'features', jsonb_build_object(
        'ai_personalization', 'advanced',
        'follow_up_brain', true,
        'revenue_dashboard', true
      )
    )
    when 'locked' then jsonb_build_object(
      'email_limit', 0,
      'campaign_limit', 0,
      'features', jsonb_build_object(
        'ai_personalization', 'none',
        'follow_up_brain', false,
        'revenue_dashboard', false
      )
    )
    else jsonb_build_object(
      'email_limit', 500,
      'campaign_limit', 1,
      'features', jsonb_build_object(
        'ai_personalization', 'basic',
        'follow_up_brain', false,
        'revenue_dashboard', false
      )
    )
  end;
$$;

comment on function public.get_plan_config(text) is
  'Returns plan configuration (limits and features) for a given plan tier';

-- C) Function: Update account plan and sync limits/features
create or replace function public.update_account_plan(
  p_account_id uuid,
  p_plan text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config jsonb;
begin
  v_config := public.get_plan_config(p_plan);
  
  update public.accounts
  set
    current_plan = p_plan,
    plan_email_limit = (v_config->>'email_limit')::int,
    plan_campaign_limit = (v_config->>'campaign_limit')::int,
    plan_features = v_config->'features'
  where id = p_account_id;
end;
$$;

comment on function public.update_account_plan(uuid, text) is
  'Updates account plan and syncs limits/features from plan config';

-- D) Function: Check if account can create campaign
create or replace function public.can_create_campaign(p_account_id uuid)
returns table (
  allowed boolean,
  reason text,
  current_count int,
  max_allowed int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_limit int;
  v_current int;
begin
  -- Get account plan and limit
  select a.current_plan, a.plan_campaign_limit
  into v_plan, v_limit
  from public.accounts a
  where a.id = p_account_id;
  
  if v_plan is null then
    v_plan := 'starter';
    v_limit := 1;
  end if;
  
  -- If locked, deny immediately
  if v_plan = 'locked' then
    return query select false, 'account_locked'::text, 0, 0;
    return;
  end if;
  
  -- Count current active campaigns for this account
  -- Try multiple join strategies based on schema variations
  v_current := 0;
  
  -- Strategy 1: Direct account_id on campaigns table
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'campaigns' 
    and column_name = 'account_id'
  ) then
    select count(*)::int
    into v_current
    from public.campaigns c
    where c.account_id = p_account_id
      and (c.status is null or c.status not in ('archived', 'deleted'));
  end if;
  
  -- Strategy 2: Join via owner_user_id (if campaigns has user_id)
  if v_current = 0 and exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'campaigns' 
    and column_name = 'user_id'
  ) then
    select count(*)::int
    into v_current
    from public.campaigns c
    join public.accounts a on a.owner_user_id = c.user_id
    where a.id = p_account_id
      and (c.status is null or c.status not in ('archived', 'deleted'));
  end if;
  
  -- Strategy 3: Join via owner_user_id (if campaigns has owner_id)
  if v_current = 0 and exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'campaigns' 
    and column_name = 'owner_id'
  ) then
    select count(*)::int
    into v_current
    from public.campaigns c
    join public.accounts a on a.owner_user_id = c.owner_id
    where a.id = p_account_id
      and (c.status is null or c.status not in ('archived', 'deleted'));
  end if;
  
  v_current := coalesce(v_current, 0);
  
  if v_current >= v_limit then
    return query select 
      false, 
      'campaign_limit_reached'::text,
      v_current,
      v_limit;
  else
    return query select 
      true, 
      null::text,
      v_current,
      v_limit;
  end if;
end;
$$;

comment on function public.can_create_campaign(uuid) is
  'Checks if account can create a new campaign based on plan limits';

-- E) Function: Check if account can send emails
create or replace function public.can_send_emails(
  p_account_id uuid,
  p_emails_to_send int default 1
)
returns table (
  allowed boolean,
  reason text,
  current_count int,
  max_allowed int,
  remaining int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_limit int;
  v_usage int;
  v_reset_at timestamptz;
  v_now timestamptz := now();
  v_start_of_month timestamptz;
begin
  -- Get account plan and usage
  select 
    a.current_plan,
    a.plan_email_limit,
    a.email_usage_month,
    a.email_usage_reset_at
  into v_plan, v_limit, v_usage, v_reset_at
  from public.accounts a
  where a.id = p_account_id;
  
  if v_plan is null then
    v_plan := 'starter';
    v_limit := 500;
    v_usage := 0;
  end if;
  
  -- If locked, deny immediately
  if v_plan = 'locked' then
    return query select false, 'account_locked'::text, 0, 0, 0;
    return;
  end if;
  
  -- Check if we need to reset monthly usage
  v_start_of_month := date_trunc('month', v_now);
  
  if v_reset_at is null or v_reset_at < v_start_of_month then
    -- Reset usage for new month
    update public.accounts
    set 
      email_usage_month = 0,
      email_usage_reset_at = v_start_of_month
    where id = p_account_id;
    v_usage := 0;
  end if;
  
  v_usage := coalesce(v_usage, 0);
  
  if (v_usage + p_emails_to_send) > v_limit then
    return query select 
      false,
      'email_limit_reached'::text,
      v_usage,
      v_limit,
      greatest(v_limit - v_usage, 0);
  else
    return query select 
      true,
      null::text,
      v_usage,
      v_limit,
      greatest(v_limit - v_usage, 0);
  end if;
end;
$$;

comment on function public.can_send_emails(uuid, int) is
  'Checks if account can send N emails based on monthly plan limits';

-- F) Function: Increment email usage after successful send
create or replace function public.increment_email_usage(
  p_account_id uuid,
  p_count int default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_start_of_month timestamptz := date_trunc('month', v_now);
begin
  -- Reset if needed, then increment
  update public.accounts
  set 
    email_usage_month = case
      when email_usage_reset_at is null or email_usage_reset_at < v_start_of_month then
        p_count -- Reset to p_count for new month
      else
        email_usage_month + p_count
    end,
    email_usage_reset_at = case
      when email_usage_reset_at is null or email_usage_reset_at < v_start_of_month then
        v_start_of_month
      else
        email_usage_reset_at
    end
  where id = p_account_id;
end;
$$;

comment on function public.increment_email_usage(uuid, int) is
  'Increments email usage counter for account (handles monthly reset automatically)';

-- G) Function: Check if account has feature access
create or replace function public.has_feature(
  p_account_id uuid,
  p_feature_name text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_features jsonb;
begin
  -- Get account plan and features
  select a.current_plan, a.plan_features
  into v_plan, v_features
  from public.accounts a
  where a.id = p_account_id;
  
  if v_plan is null or v_plan = 'locked' then
    return false;
  end if;
  
  if v_features is null then
    v_features := '{}'::jsonb;
  end if;
  
  -- Check feature in plan_features JSON
  return coalesce((v_features->>p_feature_name)::boolean, false);
end;
$$;

comment on function public.has_feature(uuid, text) is
  'Checks if account has access to a specific feature based on plan_features';

-- H) Monthly email usage reset cron job (using pg_cron)
-- Note: This requires pg_cron extension to be enabled in Supabase
-- If pg_cron is not available, set up a Supabase Edge Function cron job instead
-- This runs on the 1st of each month at midnight UTC
do $$
begin
  -- Only schedule if pg_cron extension exists
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'reset-monthly-email-usage',
      '0 0 1 * *', -- 1st of every month at midnight UTC
      $$
        update public.accounts
        set 
          email_usage_month = 0,
          email_usage_reset_at = date_trunc('month', now())
        where email_usage_reset_at < date_trunc('month', now());
      $$
    );
  else
    raise notice 'pg_cron extension not found. Please set up monthly reset via Supabase Edge Function cron job.';
  end if;
end $$;

-- I) Trigger: Auto-update plan limits when plan changes
create or replace function public._trg_update_plan_limits()
returns trigger
language plpgsql
as $$
begin
  -- If plan changed, update limits and features
  if OLD.current_plan is distinct from NEW.current_plan then
    perform public.update_account_plan(NEW.id, NEW.current_plan);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_update_plan_limits on public.accounts;
create trigger trg_update_plan_limits
  before update of current_plan on public.accounts
  for each row
  execute function public._trg_update_plan_limits();

-- J) Initialize existing accounts with default plan config
do $$
declare
  v_account record;
begin
  for v_account in select id from public.accounts where current_plan is null loop
    perform public.update_account_plan(v_account.id, 'starter');
  end loop;
end;
$$;

