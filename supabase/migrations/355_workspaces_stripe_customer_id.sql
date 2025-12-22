-- Block 355: Stripe Billing Upgrade CTA v1
-- Ensure stripe_customer_id exists on workspaces table

alter table workspaces
add column if not exists stripe_customer_id text;

create index if not exists workspaces_stripe_customer_id_idx
  on workspaces (stripe_customer_id);





