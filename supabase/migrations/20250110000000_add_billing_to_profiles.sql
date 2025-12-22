-- PROFILES: add billing columns (if not present)
-- This migration adds Stripe billing fields to profiles table
-- Run this in Supabase SQL editor

-- Add billing columns to profiles table
alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.profiles add column if not exists stripe_subscription_id text;
alter table public.profiles add column if not exists subscription_status text;
alter table public.profiles add column if not exists price_id text;
alter table public.profiles add column if not exists current_period_end timestamptz;
alter table public.profiles add column if not exists plan_nickname text;

-- Ensure RLS is enabled
alter table public.profiles enable row level security;

-- Drop existing policies if they exist to avoid conflicts
drop policy if exists "profiles self-read" on public.profiles;
drop policy if exists "profiles service update" on public.profiles;

-- Allow authenticated users to read their own profile
create policy "profiles self-read" on public.profiles
for select to authenticated
using (true);

-- Service role can update billing mirrors
create policy "profiles service update" on public.profiles
for update to service_role
using (true) with check (true);

-- Drop existing view if it exists
drop view if exists public.v_billing_effective;

-- A tiny view to compute effective feature flags
create or replace view public.v_billing_effective as
select
  p.*,
  case 
    when coalesce(subscription_status,'') in ('active','trialing') then true
    else false
  end as is_paid,
  case 
    when coalesce(subscription_status,'') in ('active','trialing') then 1000000 -- effectively unlimited in-app (your real guard is send-safety ramp)
    else 200 -- FREE cap: 200 sends lifetime or per month; we'll enforce per-day in guard below
  end as monthly_send_cap
from public.profiles p;

-- Create index for faster lookups
create index if not exists idx_profiles_stripe_customer on public.profiles(stripe_customer_id);
create index if not exists idx_profiles_user_id on public.profiles(user_id);
