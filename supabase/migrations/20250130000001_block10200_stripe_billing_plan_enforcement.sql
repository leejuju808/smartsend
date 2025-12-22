-- Block 10200 — Stripe Billing & Plan Enforcement (Subscriptions + Email Limits)
-- Implements Stripe subscription billing with plan-based limits enforcement

-- ============================================
-- 1) Org Billing Table
-- ============================================

create table if not exists public.org_billing (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_plan text not null default 'trial' check (current_plan in ('trial', 'starter', 'growth', 'domination')),
  subscription_status text not null default 'trialing' check (subscription_status in ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_org_billing_stripe_customer on public.org_billing(stripe_customer_id);
create index if not exists idx_org_billing_stripe_subscription on public.org_billing(stripe_subscription_id);
create index if not exists idx_org_billing_status on public.org_billing(subscription_status);

comment on table public.org_billing is 'Stripe billing information and subscription status per organization';
comment on column public.org_billing.current_plan is 'Current subscription plan: trial, starter, growth, domination';
comment on column public.org_billing.subscription_status is 'Stripe subscription status';

-- ============================================
-- 2) Org Usage Tracking Table
-- ============================================

create table if not exists public.org_usage (
  org_id uuid not null references public.organizations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  emails_sent int not null default 0,
  campaigns_created int not null default 0,
  primary key (org_id, period_start),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_org_usage_org_period on public.org_usage(org_id, period_start desc);
create index if not exists idx_org_usage_period on public.org_usage(period_start, period_end);

comment on table public.org_usage is 'Monthly usage tracking per organization, aligned with billing periods';

-- ============================================
-- 3) Plan Limits Configuration Function
-- ============================================

create or replace function public.get_plan_limits(p_plan text)
returns table (
  max_active_campaigns integer,
  monthly_email_limit integer
)
language sql
stable
as $$
  select
    case lower(coalesce(p_plan, 'trial'))
      when 'trial' then 1
      when 'starter' then 1
      when 'growth' then 3
      when 'domination' then null::integer  -- unlimited
      else 1
    end as max_active_campaigns,
    case lower(coalesce(p_plan, 'trial'))
      when 'trial' then 200
      when 'starter' then 500
      when 'growth' then 2000
      when 'domination' then 10000
      else 200
    end as monthly_email_limit;
$$;

comment on function public.get_plan_limits(text) is 'Returns plan limits for max_active_campaigns and monthly_email_limit';

-- ============================================
-- 4) Get Org Billing Info Helper
-- ============================================

create or replace function public.get_org_billing_info(p_org_id uuid)
returns table (
  org_id uuid,
  current_plan text,
  subscription_status text,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  max_active_campaigns integer,
  monthly_email_limit integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_billing record;
  v_limits record;
begin
  -- Get billing info
  select * into v_billing
  from public.org_billing
  where org_id = p_org_id;

  -- Default to trial if no billing record
  if v_billing is null then
    return query select
      p_org_id,
      'trial'::text,
      'trialing'::text,
      null::text,
      null::text,
      null::timestamptz,
      null::timestamptz,
      (select max_active_campaigns from public.get_plan_limits('trial')),
      (select monthly_email_limit from public.get_plan_limits('trial'));
    return;
  end if;

  -- Get plan limits
  select * into v_limits
  from public.get_plan_limits(v_billing.current_plan);

  return query select
    v_billing.org_id,
    v_billing.current_plan,
    v_billing.subscription_status,
    v_billing.stripe_customer_id,
    v_billing.stripe_subscription_id,
    v_billing.current_period_start,
    v_billing.current_period_end,
    v_limits.max_active_campaigns,
    v_limits.monthly_email_limit;
end;
$$;

grant execute on function public.get_org_billing_info(uuid) to authenticated, service_role;

-- ============================================
-- 5) Check Campaign Limit Helper
-- ============================================

create or replace function public.can_org_create_campaign(p_org_id uuid)
returns table (
  allowed boolean,
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
  v_active_count integer;
begin
  -- Get billing info
  select * into v_billing
  from public.get_org_billing_info(p_org_id);

  -- Count active campaigns
  select count(*)::integer into v_active_count
  from public.campaigns
  where org_id = p_org_id
    and status in ('active', 'running', 'scheduled');

  -- Check if subscription is active
  if v_billing.subscription_status not in ('active', 'trialing') then
    return query select false, v_active_count, v_billing.max_active_campaigns, v_billing.current_plan;
    return;
  end if;

  -- Check campaign limit
  if v_billing.max_active_campaigns is null then
    -- Unlimited
    return query select true, v_active_count, null::integer, v_billing.current_plan;
  else
    return query select
      (v_active_count < v_billing.max_active_campaigns) as allowed,
      v_active_count,
      v_billing.max_active_campaigns,
      v_billing.current_plan;
  end if;
end;
$$;

grant execute on function public.can_org_create_campaign(uuid) to authenticated, service_role;

-- ============================================
-- 6) Check Email Sending Limit Helper
-- ============================================

create or replace function public.can_org_send_emails(
  p_org_id uuid,
  p_emails_to_send integer default 1
)
returns table (
  allowed boolean,
  current_count integer,
  limit_amount integer,
  remaining integer,
  plan text,
  period_start date,
  period_end date
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_billing record;
  v_usage record;
  v_period_start date;
  v_period_end date;
  v_current_count integer;
begin
  -- Get billing info
  select * into v_billing
  from public.get_org_billing_info(p_org_id);

  -- Check if subscription is active
  if v_billing.subscription_status not in ('active', 'trialing') then
    return query select
      false,
      0,
      v_billing.monthly_email_limit,
      0,
      v_billing.current_plan,
      null::date,
      null::date;
    return;
  end if;

  -- Determine billing period (use current_period_start/end if available, else calendar month)
  if v_billing.current_period_start is not null then
    v_period_start := date_trunc('day', v_billing.current_period_start)::date;
    v_period_end := date_trunc('day', v_billing.current_period_end)::date;
  else
    v_period_start := date_trunc('month', now())::date;
    v_period_end := (date_trunc('month', now()) + interval '1 month - 1 day')::date;
  end if;

  -- Get or create usage record
  select * into v_usage
  from public.org_usage
  where org_id = p_org_id
    and period_start = v_period_start;

  if v_usage is null then
    -- Create new usage record
    insert into public.org_usage (org_id, period_start, period_end, emails_sent, campaigns_created)
    values (p_org_id, v_period_start, v_period_end, 0, 0)
    returning * into v_usage;
  end if;

  v_current_count := coalesce(v_usage.emails_sent, 0);

  -- Check limit
  if v_billing.monthly_email_limit is null then
    -- Unlimited
    return query select
      true,
      v_current_count,
      null::integer,
      null::integer,
      v_billing.current_plan,
      v_period_start,
      v_period_end;
  else
    return query select
      (v_current_count + p_emails_to_send <= v_billing.monthly_email_limit) as allowed,
      v_current_count,
      v_billing.monthly_email_limit,
      greatest(v_billing.monthly_email_limit - v_current_count, 0),
      v_billing.current_plan,
      v_period_start,
      v_period_end;
  end if;
end;
$$;

grant execute on function public.can_org_send_emails(uuid, integer) to authenticated, service_role;

-- ============================================
-- 7) Increment Email Usage Helper
-- ============================================

create or replace function public.increment_org_email_usage(
  p_org_id uuid,
  p_count integer default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_billing record;
  v_period_start date;
  v_period_end date;
begin
  -- Get billing info
  select * into v_billing
  from public.get_org_billing_info(p_org_id);

  -- Determine billing period
  if v_billing.current_period_start is not null then
    v_period_start := date_trunc('day', v_billing.current_period_start)::date;
    v_period_end := date_trunc('day', v_billing.current_period_end)::date;
  else
    v_period_start := date_trunc('month', now())::date;
    v_period_end := (date_trunc('month', now()) + interval '1 month - 1 day')::date;
  end if;

  -- Upsert usage record
  insert into public.org_usage (org_id, period_start, period_end, emails_sent, campaigns_created)
  values (p_org_id, v_period_start, v_period_end, p_count, 0)
  on conflict (org_id, period_start)
  do update set
    emails_sent = org_usage.emails_sent + p_count,
    updated_at = now();
end;
$$;

grant execute on function public.increment_org_email_usage(uuid, integer) to authenticated, service_role;

-- ============================================
-- 8) RLS Policies
-- ============================================

alter table public.org_billing enable row level security;
alter table public.org_usage enable row level security;

-- Org billing: visible to org members
create policy "org_billing_select_member"
on public.org_billing for select
using (exists(
  select 1 from public.org_members
  where org_id = org_billing.org_id
    and user_id = auth.uid()
));

-- Org usage: visible to org members
create policy "org_usage_select_member"
on public.org_usage for select
using (exists(
  select 1 from public.org_members
  where org_id = org_usage.org_id
    and user_id = auth.uid()
));

-- Service role can do everything
grant all on public.org_billing to service_role;
grant all on public.org_usage to service_role;

-- ============================================
-- 9) Trigger for updated_at
-- ============================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_org_billing_updated_at
before update on public.org_billing
for each row
execute function public.set_updated_at();

create trigger trg_org_usage_updated_at
before update on public.org_usage
for each row
execute function public.set_updated_at();

-- ============================================
-- Block 10200 Database Schema Complete
-- ============================================





























































