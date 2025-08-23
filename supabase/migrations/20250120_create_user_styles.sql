-- Create user styles and sent samples tables for email style learning
-- Stores per-user style features (rolling aggregates)
create table if not exists public.user_styles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  style jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- Optional: log last N sent messages for audit/iteration
create table if not exists public.sent_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  to_email text,
  subject text,
  body text,
  created_at timestamptz default now()
);

create index if not exists idx_sent_samples_user on public.sent_samples(user_id);

-- Add a toggle in profiles
alter table public.profiles
  add column if not exists learn_from_sent boolean default true;

-- Enable RLS on new tables
alter table public.user_styles enable row level security;
alter table public.sent_samples enable row level security;

-- Policies for user_styles
create policy "users can read own styles" on public.user_styles
  for select using (auth.uid() = user_id);

create policy "users can insert own styles" on public.user_styles
  for insert with check (auth.uid() = user_id);

create policy "users can update own styles" on public.user_styles
  for update using (auth.uid() = user_id);

-- Policies for sent_samples
create policy "users can read own samples" on public.sent_samples
  for select using (auth.uid() = user_id);

create policy "users can insert own samples" on public.sent_samples
  for insert with check (auth.uid() = user_id);

create policy "users can delete own samples" on public.sent_samples
  for delete using (auth.uid() = user_id); 