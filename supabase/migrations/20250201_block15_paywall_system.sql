-- Block 15: Launch Mode (Stripe + Paywall/Gating)
-- Usage tracking and effective subscription view

-- Create usage_sends table for daily send limits
create table if not exists public.usage_sends (
  user_id uuid not null references auth.users(id) on delete cascade,
  d date not null,  -- date (YYYY-MM-DD)
  sent_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, d)
);

create index if not exists idx_usage_sends_user_date on public.usage_sends(user_id, d desc);

-- RLS for usage_sends
alter table public.usage_sends enable row level security;

create policy "Users can view own usage"
  on public.usage_sends
  for select
  using (auth.uid() = user_id);

-- Service role can manage all usage (for incrementing)
create policy "Service role can manage usage"
  on public.usage_sends
  for all
  using (auth.role() = 'service_role');

-- Add daily_send_limit to profiles if using profiles-based tracking
do $$ begin
  alter table public.profiles add column if not exists daily_send_limit int not null default 50;
exception when duplicate_column then null; end $$;

-- Ensure v_billing_effective exists or recreate it
drop view if exists public.v_billing_effective;
create or replace view public.v_billing_effective as
select
  id,
  email,
  subscription_status,
  stripe_customer_id,
  stripe_subscription_id,
  current_period_end,
  plan_nickname,
  price_id,
  daily_send_limit,
  case 
    when subscription_status in ('active', 'trialing') then true
    else false
  end as is_paid,
  case 
    when subscription_status in ('active', 'trialing') then 1000000 -- unlimited
    else 200 -- free cap
  end as monthly_send_cap
from public.profiles;

grant select on public.v_billing_effective to anon, authenticated, service_role;

comment on view public.v_billing_effective is 'Effective billing state computed from profiles';

