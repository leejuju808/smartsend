-- Block 16600 — Plan Selection & Stripe Checkout v1
-- Add plan_renews_at column to workspaces for subscription renewal tracking

alter table public.workspaces
  add column if not exists plan_renews_at timestamptz;

comment on column public.workspaces.plan_renews_at is
  'When the current subscription period ends and renews (from Stripe subscription.current_period_end)';
















