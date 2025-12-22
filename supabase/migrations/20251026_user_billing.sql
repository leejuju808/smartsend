-- Link Stripe customer/subscription to auth users
alter table if exists public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists plan text default 'free'; -- 'free' | 'basic' | 'pro'

create table if not exists public.billing_subscriptions (
  id text primary key,             -- stripe subscription id
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id text not null,       -- stripe customer id
  price_id text not null,          -- stripe price id
  status text not null,            -- trialing | active | past_due | canceled | unpaid | incomplete...
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  canceled_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_billing_subscriptions_user on public.billing_subscriptions(user_id);

-- RLS: users can read their own subscription row
alter table public.billing_subscriptions enable row level security;
create policy "user can read own sub"
  on public.billing_subscriptions
  for select using (auth.uid() = user_id);

-- Helper: set plan on profiles by price_id
create or replace function public.plan_from_price(p_price text)
returns text language sql immutable as $$
  select case
    when p_price = current_setting('app.stripe_price_basic', true) then 'basic'
    when p_price = current_setting('app.stripe_price_pro', true) then 'pro'
    else 'free'
  end;
$$;

-- Sync profile plan by price_id
create or replace function public.sync_profile_plan(p_user_id uuid, p_price_id text)
returns void language plpgsql security definer as $$
begin
  update public.profiles
     set plan = public.plan_from_price(p_price_id)
   where id = p_user_id;
end; $$;

revoke all on function public.sync_profile_plan(uuid, text) from public;
grant execute on function public.sync_profile_plan(uuid, text) to service_role;
