-- Create feedback table for in-app feedback widget
create table if not exists public.feedback (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating int not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamp with time zone default now()
);

alter table public.feedback enable row level security;

-- Policies: users can insert/select their own feedback
drop policy if exists "Users can insert own feedback" on public.feedback;
drop policy if exists "Users can view own feedback" on public.feedback;

create policy "Users can insert own feedback" on public.feedback
  for insert
  with check (auth.uid() = user_id);

create policy "Users can view own feedback" on public.feedback
  for select
  using (auth.uid() = user_id);

