-- Block 8900 — Stripe Checkout Billing (Starter / Growth / Domination Plans)
-- Add billing columns to accounts table

alter table public.accounts
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_price_id text,
  add column if not exists subscription_status text,
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;

comment on column public.accounts.stripe_customer_id is
  'Stripe customer id for this account.';

comment on column public.accounts.stripe_subscription_id is
  'Stripe subscription id for this account.';

comment on column public.accounts.stripe_price_id is
  'Stripe price id for the active subscription.';

comment on column public.accounts.subscription_status is
  'Stripe subscription status (active, trialing, past_due, canceled, etc).';

comment on column public.accounts.owner_user_id is
  'Owner user id for this account.';

create index if not exists idx_accounts_owner_user_id on public.accounts(owner_user_id);
create index if not exists idx_accounts_stripe_customer_id on public.accounts(stripe_customer_id);






























































