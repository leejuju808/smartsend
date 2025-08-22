-- Create referrals mapping and bonus credit column
create table if not exists public.referrals (
  referrer_id uuid references auth.users(id) on delete cascade,
  referred_id uuid references auth.users(id) on delete cascade,
  created_at timestamp with time zone default now(),
  constraint referrals_pkey primary key (referrer_id, referred_id)
);

alter table public.profiles
  add column if not exists bonus_credit integer default 0;

