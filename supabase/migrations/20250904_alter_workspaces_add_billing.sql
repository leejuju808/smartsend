-- Add workspace-level subscription fields
alter table if exists public.workspaces
  add column if not exists subscription_status text default 'free',
  add column if not exists seat_count int default 1,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

-- Helpful index for webhook lookups by customer id
create index if not exists idx_workspaces_stripe_customer on public.workspaces(stripe_customer_id);

