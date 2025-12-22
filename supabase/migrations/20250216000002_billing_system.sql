-- Billing System Migration
-- Creates billing_customers, user_subscriptions, plan_limits tables and related functions

-- 1. Billing customers table
create table if not exists billing_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text unique not null,
  created_at timestamptz default now()
);

-- 2. User subscriptions table
create table if not exists user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_subscription_id text unique not null,
  plan text not null check (plan in ('free','starter','pro')),
  status text not null check (status in ('trialing','active','past_due','canceled','incomplete')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Plan limits table
create table if not exists plan_limits (
  plan text primary key,
  daily_sends int not null,
  monthly_sends int not null,
  active_campaigns int not null
);

-- Insert plan limits
insert into plan_limits(plan, daily_sends, monthly_sends, active_campaigns) values
  ('free', 25, 500, 1)
  on conflict (plan) do nothing;

insert into plan_limits(plan, daily_sends, monthly_sends, active_campaigns) values
  ('starter', 200, 4000, 3)
  on conflict (plan) do nothing;

insert into plan_limits(plan, daily_sends, monthly_sends, active_campaigns) values
  ('pro', 1000, 20000, 10)
  on conflict (plan) do nothing;

-- 4. RLS Policies
alter table billing_customers enable row level security;
alter table user_subscriptions enable row level security;

create policy "owner read billing" on billing_customers 
  for select using (user_id = auth.uid());

create policy "owner read subs" on user_subscriptions 
  for select using (user_id = auth.uid());

-- 5. Function to get campaign owner user_id
create or replace function public.get_campaign_owner(p_campaign_id uuid)
returns uuid language plpgsql security definer as $$
declare
  v_workspace_id uuid;
  v_owner_id uuid;
begin
  -- Get workspace_id from campaign
  select workspace_id into v_workspace_id
  from public.campaigns
  where id = p_campaign_id;

  if v_workspace_id is null then
    raise exception 'Campaign not found or no workspace';
  end if;

  -- Get owner_id from workspace
  select owner_id into v_owner_id
  from public.workspaces
  where id = v_workspace_id;

  if v_owner_id is null then
    raise exception 'Workspace owner not found';
  end if;

  return v_owner_id;
end;
$$;

grant execute on function public.get_campaign_owner(uuid) to authenticated;
grant execute on function public.get_campaign_owner(uuid) to service_role;

-- 6. Function to get user usage and plan
create or replace function public.get_user_usage(p_user uuid)
returns table(daily int, monthly int, plan text, status text) 
language plpgsql stable as $$
declare
  v_daily int := 0;
  v_monthly int := 0;
  v_plan text := 'free';
  v_status text := 'active';
begin
  -- Get subscription plan and status
  select s.plan, s.status into v_plan, v_status
  from user_subscriptions s
  where s.user_id = p_user
  order by updated_at desc
  limit 1;
  
  v_plan := coalesce(v_plan, 'free');
  v_status := coalesce(v_status, 'active');

  -- Count daily and monthly sends
  select 
    coalesce(sum(case when cl.sent_at::date = now()::date then 1 else 0 end), 0),
    coalesce(sum(case when date_trunc('month', cl.sent_at) = date_trunc('month', now()) then 1 else 0 end), 0)
  into v_daily, v_monthly
  from campaign_leads cl
  join campaigns c on c.id = cl.campaign_id
  join workspaces w on w.id = c.workspace_id
  where w.owner_id = p_user and cl.state = 'Sent' and cl.sent_at is not null;

  return query select v_daily, v_monthly, v_plan, v_status;
end;
$$;

grant execute on function public.get_user_usage(uuid) to authenticated;
grant execute on function public.get_user_usage(uuid) to service_role;

-- 7. Indexes for performance
create index if not exists idx_billing_customers_user_id on billing_customers(user_id);
create index if not exists idx_billing_customers_stripe_id on billing_customers(stripe_customer_id);
create index if not exists idx_user_subscriptions_user_id on user_subscriptions(user_id);
create index if not exists idx_user_subscriptions_stripe_id on user_subscriptions(stripe_subscription_id);
create index if not exists idx_campaign_leads_sent_at on campaign_leads(sent_at) where sent_at is not null;

