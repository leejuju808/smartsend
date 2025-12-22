-- Add onboarding_complete and progress_percent to profiles table
alter table public.profiles
  add column if not exists onboarding_complete boolean default false,
  add column if not exists progress_percent int default 0;

-- Create activation_stats table for tracking metrics
create table if not exists public.activation_stats (
  date date primary key,
  signups int default 0,
  activated int default 0,
  upgraded int default 0,
  retention_30d numeric default 0,
  created_at timestamptz default now()
);

-- Enable RLS on activation_stats
alter table public.activation_stats enable row level security;

-- Allow authenticated users to read activation stats
create policy "Users can view activation stats" on public.activation_stats
  for select to authenticated
  using (true);

