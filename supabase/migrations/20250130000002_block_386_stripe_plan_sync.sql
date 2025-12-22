-- Block 386: Stripe → Plan Tier Sync v1
-- Add workspace billing columns for Stripe subscription sync

alter table public.workspaces
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists plan_tier text not null default 'free';

create index if not exists idx_workspaces_stripe_customer_id
  on public.workspaces (stripe_customer_id);

create index if not exists idx_workspaces_stripe_subscription_id
  on public.workspaces (stripe_subscription_id);





