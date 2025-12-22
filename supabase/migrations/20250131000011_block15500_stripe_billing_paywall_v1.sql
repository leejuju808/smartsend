-- Block 15500 — Billing & Stripe Paywall v1
-- Real Subscriptions, Real Upgrades, Real Money
-- This migration adds Stripe billing fields to workspaces table

-- Add missing Stripe billing fields to workspaces
alter table public.workspaces
  add column if not exists stripe_price_id text,
  add column if not exists billing_status text check (
    billing_status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired')
  ),
  add column if not exists trial_ends_at timestamptz;

-- Ensure existing Stripe fields exist (from block 13800)
alter table public.workspaces
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

-- Create index on stripe_price_id for lookups
create index if not exists idx_workspaces_stripe_price_id 
  on public.workspaces(stripe_price_id) 
  where stripe_price_id is not null;

-- Create index on billing_status for filtering
create index if not exists idx_workspaces_billing_status 
  on public.workspaces(billing_status) 
  where billing_status is not null;



























































