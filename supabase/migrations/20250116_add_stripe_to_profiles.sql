-- Add Stripe-related columns to profiles table
alter table public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text default 'free',
  add column if not exists subscription_current_period_end timestamptz;

-- Create index for faster lookups
create index if not exists idx_profiles_stripe_customer on public.profiles (stripe_customer_id); 