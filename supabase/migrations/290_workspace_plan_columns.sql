-- Block 290: Billing Plan Upgrade Flow
-- Ensure workspace has plan column and stripe_customer_id

alter table workspaces
  add column if not exists plan text default 'starter',
  add column if not exists stripe_customer_id text;

-- Create index for webhook lookups
create index if not exists idx_workspaces_stripe_customer on workspaces(stripe_customer_id);








