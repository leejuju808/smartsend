-- Block 417: Subscription Enforcement v1
-- Stripe Plans, Seat Limits, Feature Gating, Usage Limits

-- 1) Ensure subscriptions table exists (using workspace_billing_subscriptions as base)
-- Add plan_key column if it doesn't exist (alias for plan_code)
alter table if exists workspace_billing_subscriptions
  add column if not exists plan_key text;

-- Update plan_key from plan_code if needed
update workspace_billing_subscriptions
set plan_key = lower(plan_code)
where plan_key is null and plan_code is not null;

-- Create index for plan_key lookups
create index if not exists idx_subscriptions_workspace
  on workspace_billing_subscriptions(workspace_id);

create index if not exists idx_subscriptions_plan_key
  on workspace_billing_subscriptions(plan_key);

-- 2) Helper function to get workspace subscription with defaults
create or replace function get_workspace_subscription(p_workspace_id uuid)
returns table (
  plan_key text,
  status text,
  current_period_end timestamptz,
  seats_allowed integer,
  daily_sends integer,
  max_leads integer,
  warmup boolean,
  experiments boolean,
  analytics boolean,
  domains integer
) language plpgsql stable as $$
declare
  v_sub record;
begin
  select 
    coalesce(plan_key, lower(plan_code), 'free') as plan_key,
    coalesce(status, 'inactive') as status,
    current_period_end
  into v_sub
  from workspace_billing_subscriptions
  where workspace_id = p_workspace_id
  limit 1;

  -- Return defaults if no subscription found
  if v_sub is null then
    return query select 
      'free'::text,
      'inactive'::text,
      null::timestamptz,
      1::integer,      -- seats
      500::integer,    -- daily_sends
      5000::integer,   -- max_leads
      false::boolean, -- warmup
      false::boolean, -- experiments
      true::boolean,  -- analytics
      2::integer;      -- domains
  else
    -- Map plan_key to limits (will be enforced in application code)
    return query select 
      v_sub.plan_key,
      v_sub.status,
      v_sub.current_period_end,
      case v_sub.plan_key
        when 'starter' then 1
        when 'pro' then 3
        when 'agency' then 10
        else 1
      end::integer,
      case v_sub.plan_key
        when 'starter' then 500
        when 'pro' then 5000
        when 'agency' then 20000
        else 500
      end::integer,
      case v_sub.plan_key
        when 'starter' then 5000
        when 'pro' then 50000
        when 'agency' then null::integer
        else 5000
      end::integer,
      case v_sub.plan_key
        when 'pro' then true
        when 'agency' then true
        else false
      end::boolean,
      case v_sub.plan_key
        when 'pro' then true
        when 'agency' then true
        else false
      end::boolean,
      true::boolean,
      case v_sub.plan_key
        when 'starter' then 2
        when 'pro' then 10
        when 'agency' then 50
        else 2
      end::integer;
  end if;
end;
$$;

-- 3) RLS: Ensure workspace members can read subscriptions
drop policy if exists workspace_billing_subscriptions_members on workspace_billing_subscriptions;
create policy workspace_billing_subscriptions_members on workspace_billing_subscriptions
  for select to authenticated
  using (
    exists (
      select 1 from workspace_members
      where workspace_id = workspace_billing_subscriptions.workspace_id
      and user_id = auth.uid()
    )
  );



