-- Referral & Affiliate System Migration
-- Creates referrals table and adds referral_credits support

-- Create referrals table with the requested schema
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_email text not null,
  referred_user_id uuid references auth.users(id) on delete set null,
  status text default 'pending' check (status in ('pending', 'activated', 'rewarded')),
  reward_amount numeric default 0,
  created_at timestamptz default now()
);

-- Create indexes for performance
create index if not exists idx_referrals_referrer_id on public.referrals(referrer_id);
create index if not exists idx_referrals_referred_email on public.referrals(referred_email);
create index if not exists idx_referrals_status on public.referrals(status);
create index if not exists idx_referrals_referred_user_id on public.referrals(referred_user_id);

-- Ensure referral_credits column exists on profiles (numeric instead of int for consistency)
alter table public.profiles
  add column if not exists referral_credits numeric default 0;

-- Create or replace function to increment user credit
create or replace function public.increment_user_credit(user_id uuid, amount numeric)
returns void
language sql
security definer
as $$
  update public.profiles
  set referral_credits = coalesce(referral_credits, 0) + amount
  where id = user_id;
$$;

-- Enable RLS
alter table public.referrals enable row level security;

-- RLS Policy: Users can view their own referrals (where they are the referrer)
drop policy if exists "Users view own referrals" on public.referrals;
create policy "Users view own referrals" on public.referrals
  for select
  using (auth.uid() = referrer_id);

-- Service role bypasses RLS, so we don't need insert/update policies for it
-- But we can allow authenticated users to insert referrals for themselves if needed
-- For now, API endpoints will use service role which bypasses RLS

-- Grant necessary permissions
grant select on public.referrals to authenticated;
grant execute on function public.increment_user_credit to authenticated;

