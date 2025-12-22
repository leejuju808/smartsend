-- Block 12700 — Payment Enforcement v1
-- Stripe Webhooks + Plan Limits + Auto-Lock + Upgrade Flows
-- This block ensures SmartSend locks accounts when unpaid, enforces plan limits, and enables frictionless upgrades

-- ============================================
-- 1) Extend Organizations Table with Billing Columns
-- ============================================

alter table public.organizations
  add column if not exists plan_tier text default 'starter' check (plan_tier in ('starter', 'growth', 'domination')),
  add column if not exists subscription_status text default 'active' check (subscription_status in ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'payment_action_required')),
  add column if not exists emails_sent_this_period int default 0,
  add column if not exists campaign_count int default 0,
  add column if not exists period_renews_at timestamptz,
  add column if not exists billing_customer_id text,
  add column if not exists billing_subscription_id text,
  add column if not exists lockout_warning_sent_at timestamptz,
  add column if not exists lockout_grace_period_ends_at timestamptz;

create index if not exists idx_organizations_billing_customer on public.organizations(billing_customer_id);
create index if not exists idx_organizations_billing_subscription on public.organizations(billing_subscription_id);
create index if not exists idx_organizations_subscription_status on public.organizations(subscription_status);

comment on column public.organizations.plan_tier is 'Current subscription plan: starter, growth, domination';
comment on column public.organizations.subscription_status is 'Stripe subscription status - determines account access';
comment on column public.organizations.emails_sent_this_period is 'Emails sent in current billing period';
comment on column public.organizations.campaign_count is 'Current number of active campaigns';
comment on column public.organizations.lockout_grace_period_ends_at is 'When grace period ends - after this, account is locked';

-- ============================================
-- 2) Daily Safety Cap Tracking Table
-- ============================================

create table if not exists public.org_daily_usage (
  org_id uuid not null references public.organizations(id) on delete cascade,
  usage_date date not null default current_date,
  emails_sent_today int not null default 0,
  primary key (org_id, usage_date),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_org_daily_usage_org_date on public.org_daily_usage(org_id, usage_date desc);

comment on table public.org_daily_usage is 'Daily email sending usage per organization for safety caps';

-- ============================================
-- 3) Plan Limits Configuration (Enhanced)
-- ============================================

create or replace function public.get_plan_limits_v2(p_plan text)
returns table (
  max_active_campaigns integer,
  monthly_email_limit integer,
  daily_safety_cap integer
)
language sql
stable
as $$
  select
    case lower(coalesce(p_plan, 'starter'))
      when 'starter' then 1
      when 'growth' then 3
      when 'domination' then null::integer  -- unlimited
      else 1
    end as max_active_campaigns,
    case lower(coalesce(p_plan, 'starter'))
      when 'starter' then 500
      when 'growth' then 2000
      when 'domination' then 10000
      else 500
    end as monthly_email_limit,
    case lower(coalesce(p_plan, 'starter'))
      when 'starter' then 50
      when 'growth' then 150
      when 'domination' then 400
      else 50
    end as daily_safety_cap;
$$;

comment on function public.get_plan_limits_v2(text) is 'Returns plan limits including daily safety caps';

-- ============================================
-- 4) Check Daily Safety Cap Helper
-- ============================================

create or replace function public.can_org_send_today(
  p_org_id uuid,
  p_emails_to_send integer default 1
)
returns table (
  allowed boolean,
  current_count integer,
  daily_limit integer,
  remaining integer,
  plan text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_billing record;
  v_daily_usage record;
  v_limits record;
  v_today date;
  v_current_count integer;
begin
  -- Get billing info
  select * into v_billing
  from public.get_org_billing_info(p_org_id);

  -- Check if subscription is active
  if v_billing.subscription_status not in ('active', 'trialing') then
    return query select false, 0, 0, 0, v_billing.current_plan;
    return;
  end if;

  -- Get daily limits
  select * into v_limits
  from public.get_plan_limits_v2(v_billing.current_plan);

  v_today := current_date;

  -- Get or create daily usage record
  select * into v_daily_usage
  from public.org_daily_usage
  where org_id = p_org_id
    and usage_date = v_today;

  if v_daily_usage is null then
    -- Create new daily usage record
    insert into public.org_daily_usage (org_id, usage_date, emails_sent_today)
    values (p_org_id, v_today, 0)
    returning * into v_daily_usage;
  end if;

  v_current_count := coalesce(v_daily_usage.emails_sent_today, 0);

  -- Check daily limit
  return query select
    (v_current_count + p_emails_to_send <= v_limits.daily_safety_cap) as allowed,
    v_current_count,
    v_limits.daily_safety_cap,
    greatest(v_limits.daily_safety_cap - v_current_count, 0),
    v_billing.current_plan;
end;
$$;

grant execute on function public.can_org_send_today(uuid, integer) to authenticated, service_role;

-- ============================================
-- 5) Increment Daily Usage Helper
-- ============================================

create or replace function public.increment_org_daily_usage(
  p_org_id uuid,
  p_count integer default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date;
begin
  v_today := current_date;

  -- Upsert daily usage record
  insert into public.org_daily_usage (org_id, usage_date, emails_sent_today)
  values (p_org_id, v_today, p_count)
  on conflict (org_id, usage_date)
  do update set
    emails_sent_today = org_daily_usage.emails_sent_today + p_count,
    updated_at = now();
end;
$$;

grant execute on function public.increment_org_daily_usage(uuid, integer) to authenticated, service_role;

-- ============================================
-- 6) Check Account Lockout Status
-- ============================================

create or replace function public.is_org_locked(p_org_id uuid)
returns table (
  is_locked boolean,
  reason text,
  grace_period_ends_at timestamptz,
  subscription_status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org record;
  v_now timestamptz;
begin
  v_now := now();

  -- Get org billing info
  select 
    o.subscription_status,
    o.lockout_grace_period_ends_at,
    o.lockout_warning_sent_at
  into v_org
  from public.organizations o
  where o.id = p_org_id;

  if v_org is null then
    return query select true, 'org_not_found', null::timestamptz, null::text;
    return;
  end if;

  -- Check subscription status
  if v_org.subscription_status in ('unpaid', 'past_due', 'incomplete_expired') then
    -- Check if grace period has ended
    if v_org.lockout_grace_period_ends_at is not null and v_now > v_org.lockout_grace_period_ends_at then
      return query select true, 'payment_required', v_org.lockout_grace_period_ends_at, v_org.subscription_status;
      return;
    elsif v_org.lockout_grace_period_ends_at is null then
      -- Set grace period if not set (3 days from now)
      update public.organizations
      set lockout_grace_period_ends_at = v_now + interval '3 days'
      where id = p_org_id;
      
      return query select false, 'grace_period_active', v_now + interval '3 days', v_org.subscription_status;
      return;
    else
      -- Still in grace period
      return query select false, 'grace_period_active', v_org.lockout_grace_period_ends_at, v_org.subscription_status;
      return;
    end if;
  end if;

  -- Account is not locked
  return query select false, 'active', null::timestamptz, v_org.subscription_status;
end;
$$;

grant execute on function public.is_org_locked(uuid) to authenticated, service_role;

-- ============================================
-- 7) Feature Access Check Helper
-- ============================================

create or replace function public.can_org_access_feature(
  p_org_id uuid,
  p_feature text
)
returns table (
  allowed boolean,
  plan text,
  required_plan text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_billing record;
  v_required_plan text;
begin
  -- Get billing info
  select * into v_billing
  from public.get_org_billing_info(p_org_id);

  -- Check if subscription is active
  if v_billing.subscription_status not in ('active', 'trialing') then
    return query select false, v_billing.current_plan, 'active_subscription';
    return;
  end if;

  -- Map feature to required plan
  v_required_plan := case lower(p_feature)
    when 'revenue_dashboard' then 'domination'
    when 'advanced_ai' then 'growth'
    when 'multi_identity_rotation' then 'domination'
    when 'pipeline' then 'growth'
    when 'snooze' then 'growth'
    else 'starter'
  end;

  -- Check plan tier
  if v_required_plan = 'domination' and v_billing.current_plan != 'domination' then
    return query select false, v_billing.current_plan, v_required_plan;
    return;
  elsif v_required_plan = 'growth' and not (v_billing.current_plan in ('growth', 'domination')) then
    return query select false, v_billing.current_plan, v_required_plan;
    return;
  end if;

  -- Feature is allowed
  return query select true, v_billing.current_plan, v_required_plan;
end;
$$;

grant execute on function public.can_org_access_feature(uuid, text) to authenticated, service_role;

-- ============================================
-- 8) Comprehensive Plan Check Middleware Function
-- ============================================

create or replace function public.check_plan_limit(
  p_org_id uuid,
  p_action text
)
returns table (
  allowed boolean,
  reason text,
  message text,
  upgrade_required boolean,
  current_count integer,
  max_allowed integer,
  plan text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_billing record;
  v_lockout record;
  v_campaign_check record;
  v_email_check record;
  v_daily_check record;
  v_feature_check record;
begin
  -- Check account lockout first
  select * into v_lockout
  from public.is_org_locked(p_org_id);

  if v_lockout.is_locked then
    return query select
      false,
      'account_locked',
      'Your SmartSend account has been locked due to payment issues. Please update your payment method to resume sending.',
      true,
      null::integer,
      null::integer,
      v_lockout.subscription_status;
    return;
  end if;

  -- Get billing info
  select * into v_billing
  from public.get_org_billing_info(p_org_id);

  -- Route to appropriate check based on action
  case lower(p_action)
    when 'create_campaign' then
      select * into v_campaign_check
      from public.can_org_create_campaign(p_org_id);
      
      if not v_campaign_check.allowed then
        return query select
          false,
          'campaign_limit',
          format('Your %s plan allows %s active campaign%s. Upgrade to create more campaigns.', 
            v_campaign_check.plan, 
            coalesce(v_campaign_check.max_allowed::text, 'unlimited'),
            case when coalesce(v_campaign_check.max_allowed, 0) = 1 then '' else 's' end),
          true,
          v_campaign_check.current_count,
          v_campaign_check.max_allowed,
          v_campaign_check.plan;
        return;
      end if;

    when 'send_email' then
      -- Check monthly limit
      select * into v_email_check
      from public.can_org_send_emails(p_org_id, 1);
      
      if not v_email_check.allowed then
        return query select
          false,
          'email_limit',
          format('You''ve reached your %s plan monthly email limit (%s/%s). Upgrade to send more emails.', 
            v_email_check.plan,
            v_email_check.current_count,
            v_email_check.limit_amount),
          true,
          v_email_check.current_count,
          v_email_check.limit_amount,
          v_email_check.plan;
        return;
      end if;

      -- Check daily safety cap
      select * into v_daily_check
      from public.can_org_send_today(p_org_id, 1);
      
      if not v_daily_check.allowed then
        return query select
          false,
          'daily_limit',
          format('You''ve reached your daily safety cap (%s/%s emails). This limit resets tomorrow.', 
            v_daily_check.current_count,
            v_daily_check.daily_limit),
          false,
          v_daily_check.current_count,
          v_daily_check.daily_limit,
          v_daily_check.plan;
        return;
      end if;

    when 'access_revenue_dashboard' then
      select * into v_feature_check
      from public.can_org_access_feature(p_org_id, 'revenue_dashboard');
      
      if not v_feature_check.allowed then
        return query select
          false,
          'feature_access',
          format('Revenue Dashboard is available on Domination plan. Your current plan: %s.', v_feature_check.plan),
          true,
          null::integer,
          null::integer,
          v_feature_check.plan;
        return;
      end if;

    when 'access_advanced_ai' then
      select * into v_feature_check
      from public.can_org_access_feature(p_org_id, 'advanced_ai');
      
      if not v_feature_check.allowed then
        return query select
          false,
          'feature_access',
          format('Advanced AI features are available on Growth or Domination plans. Your current plan: %s.', v_feature_check.plan),
          true,
          null::integer,
          null::integer,
          v_feature_check.plan;
        return;
      end if;

    when 'access_pipeline' then
      select * into v_feature_check
      from public.can_org_access_feature(p_org_id, 'pipeline');
      
      if not v_feature_check.allowed then
        return query select
          false,
          'feature_access',
          format('Pipeline features are available on Growth or Domination plans. Your current plan: %s.', v_feature_check.plan),
          true,
          null::integer,
          null::integer,
          v_feature_check.plan;
        return;
      end if;

    else
      -- Unknown action - allow by default but log
      return query select true, 'unknown_action', 'Action check not implemented', false, null::integer, null::integer, v_billing.current_plan;
      return;
  end case;

  -- All checks passed
  return query select true, 'allowed', 'Action allowed', false, null::integer, null::integer, v_billing.current_plan;
end;
$$;

grant execute on function public.check_plan_limit(uuid, text) to authenticated, service_role;

-- ============================================
-- 9) Sync Organizations Billing from org_billing Table
-- ============================================

create or replace function public.sync_org_billing_to_organizations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Update organizations table when org_billing changes
  update public.organizations
  set
    plan_tier = new.current_plan,
    subscription_status = new.subscription_status,
    billing_customer_id = new.stripe_customer_id,
    billing_subscription_id = new.stripe_subscription_id,
    period_renews_at = new.current_period_end
  where id = new.org_id;
  
  return new;
end;
$$;

-- Create trigger to sync org_billing changes to organizations
drop trigger if exists trg_sync_org_billing on public.org_billing;
create trigger trg_sync_org_billing
after insert or update on public.org_billing
for each row
execute function public.sync_org_billing_to_organizations();

-- ============================================
-- 10) RLS Policies for Daily Usage
-- ============================================

alter table public.org_daily_usage enable row level security;

create policy "org_daily_usage_select_member"
on public.org_daily_usage for select
using (exists(
  select 1 from public.org_members
  where org_id = org_daily_usage.org_id
    and user_id = auth.uid()
));

grant all on public.org_daily_usage to service_role;

-- ============================================
-- 11) Trigger for updated_at on org_daily_usage
-- ============================================

create trigger trg_org_daily_usage_updated_at
before update on public.org_daily_usage
for each row
execute function public.set_updated_at();

-- ============================================
-- Block 12700 Database Schema Complete
-- ============================================




























































