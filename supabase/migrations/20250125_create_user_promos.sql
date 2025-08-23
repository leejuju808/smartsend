-- Create user_promos table for tracking time-boxed promotions
create table if not exists public.user_promos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  promotion_code_id text not null,            -- stripe promotion_code id
  coupon_id text not null,                    -- stripe coupon id (reference)
  percent_off int,                            -- for UI display
  created_at timestamptz default now(),
  expires_at timestamptz not null,
  redeemed boolean default false
);

-- Add foreign key constraint to profiles table
alter table public.user_promos 
  add constraint fk_user_promos_user_id 
  foreign key (user_id) references public.profiles(id) on delete cascade;

-- Create index for efficient user lookups
create index if not exists idx_user_promos_user on public.user_promos(user_id);

-- Create index for expired promotions cleanup
create index if not exists idx_user_promos_expires on public.user_promos(expires_at);

-- Add RLS policies
alter table public.user_promos enable row level security;

-- Users can only see their own promotions
create policy "Users can view own promotions" on public.user_promos
  for select using (auth.uid() = user_id);

-- Only admins can insert/update promotions
create policy "Only admins can manage promotions" on public.user_promos
  for all using (auth.role() = 'service_role'); 