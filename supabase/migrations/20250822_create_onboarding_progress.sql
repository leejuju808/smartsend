-- Onboarding progress table linked to profiles (auth.users)
create table if not exists public.onboarding_progress (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  connected_mailbox boolean default false not null,
  imported_leads boolean default false not null,
  launched_sequence boolean default false not null,
  updated_at timestamptz default now() not null,
  created_at timestamptz default now() not null
);

alter table public.onboarding_progress enable row level security;

drop policy if exists "Users can manage own onboarding" on public.onboarding_progress;
create policy "Users can manage own onboarding" on public.onboarding_progress
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

