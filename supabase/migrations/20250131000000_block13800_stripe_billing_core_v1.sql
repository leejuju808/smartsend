-- Block 13800 — Stripe Billing Core v1 (Plans + Subscriptions + Limits)
-- Adds billing fields to workspaces table for Stripe integration

alter table public.workspaces
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists plan_key text check (
    plan_key in ('free', 'starter', 'growth', 'domination')
  ) default 'free',
  add column if not exists email_limit_monthly integer default 0,
  add column if not exists email_used_this_period integer default 0,
  add column if not exists billing_period_ends_at timestamptz;

-- Create index on stripe_customer_id for webhook lookups
create index if not exists idx_workspaces_stripe_customer_id 
  on public.workspaces(stripe_customer_id);

-- Create index on plan_key for filtering
create index if not exists idx_workspaces_plan_key 
  on public.workspaces(plan_key);

-- Postgres function for atomic email usage increment
create or replace function increment_email_usage(
  p_workspace_id uuid,
  p_count integer
)
returns void
language plpgsql
as $$
begin
  update public.workspaces
  set email_used_this_period = coalesce(email_used_this_period, 0) + p_count
  where id = p_workspace_id;
end;
$$;

grant execute on function increment_email_usage(uuid, integer) to authenticated;



























































