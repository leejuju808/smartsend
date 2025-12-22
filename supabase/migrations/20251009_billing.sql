-- Profiles: mirror billing state from Stripe
alter table public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text check (subscription_status in ('active','trialing','past_due','canceled','incomplete','incomplete_expired','unpaid')) default null,
  add column if not exists current_period_end timestamptz;

-- Helpful index
create index if not exists idx_profiles_subscription_status on public.profiles(subscription_status);

-- Ensure RLS remains enforced (assumes RLS was already enabled)
alter table public.profiles enable row level security;

-- Owner policy (id == auth.uid()), idempotent
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profiles' and policyname='own profile'
  ) then
    create policy "own profile" on public.profiles
      for all using (auth.uid() = id);
  end if;
end$$;

-- Soft gate helper view (read-only): exposes whether a profile can use paid features
create or replace view public.v_profile_access as
select
  id as profile_id,
  coalesce(subscription_status in ('active','trialing'), false) as is_paid,
  subscription_status,
  current_period_end
from public.profiles;

grant select on public.v_profile_access to anon, authenticated;

-- (Optional) seed a price hint table if you want to surface plan name later
create table if not exists public.plan_catalog (
  id text primary key,              -- e.g. 'price_1234'
  label text not null default 'Pro Monthly',
  created_at timestamptz default now()
);
