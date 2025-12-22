-- Ensure profiles table exists with a subscription mirror field.
create table if not exists public.profiles (
  id uuid primary key,               -- auth.uid()
  email citext unique,
  full_name text,
  subscription_status text default 'free' check (subscription_status in ('free','trialing','active','past_due','canceled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_id text,                      -- your Stripe PRICE id mirrored
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- Basic RLS: users can read their own profile
drop policy if exists "read_own_profile" on public.profiles;
create policy "read_own_profile" on public.profiles
for select to authenticated
using (auth.uid() = id);

-- Only service role updates profiles (webhooks, server actions)
revoke insert, update, delete on public.profiles from anon, authenticated;

create index if not exists idx_profiles_email on public.profiles (email);
create index if not exists idx_profiles_stripe_customer on public.profiles (stripe_customer_id);
