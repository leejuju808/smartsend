-- Block 8530 — Subscription Status + Plan Limits
-- Add current_plan, subscription_status, and email to billing_customers table

-- Ensure billing_customers table exists with required columns
create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  current_plan text not null default 'starter',               -- 'starter' | 'growth' | 'domination'
  subscription_status text not null default 'no_subscription', -- 'active' | 'past_due' | 'canceled' | 'no_subscription' | 'pending_checkout'
  email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  unique (stripe_customer_id)
);

-- Add columns if they don't exist (for existing tables)
do $$
begin
  -- Add current_plan if it doesn't exist
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'billing_customers' 
    and column_name = 'current_plan'
  ) then
    alter table public.billing_customers 
      add column current_plan text not null default 'starter';
  end if;

  -- Add subscription_status if it doesn't exist
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'billing_customers' 
    and column_name = 'subscription_status'
  ) then
    alter table public.billing_customers 
      add column subscription_status text not null default 'no_subscription';
  end if;

  -- Add email if it doesn't exist
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'billing_customers' 
    and column_name = 'email'
  ) then
    alter table public.billing_customers 
      add column email text null;
  end if;

  -- Add updated_at if it doesn't exist
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'billing_customers' 
    and column_name = 'updated_at'
  ) then
    alter table public.billing_customers 
      add column updated_at timestamptz not null default now();
  end if;
end $$;

-- Create indexes
create unique index if not exists billing_customers_user_id_idx
  on public.billing_customers(user_id);

create index if not exists billing_customers_customer_id_idx
  on public.billing_customers(stripe_customer_id);

-- Create or replace updated_at trigger function
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Create trigger for updated_at
drop trigger if exists trg_billing_customers_updated_at on public.billing_customers;
create trigger trg_billing_customers_updated_at
  before update on public.billing_customers
  for each row
  execute function public.set_updated_at();

-- Enable RLS (if not already enabled)
alter table public.billing_customers enable row level security;

-- Drop existing policies if they exist and recreate
drop policy if exists "Users can view own billing customer" on public.billing_customers;
drop policy if exists "Service role can manage billing customers" on public.billing_customers;

-- RLS Policies
create policy "Users can view own billing customer" on public.billing_customers
  for select
  using (auth.uid() = user_id);

create policy "Service role can manage billing customers" on public.billing_customers
  for all
  using (auth.jwt() ->> 'role' = 'service_role');

























































