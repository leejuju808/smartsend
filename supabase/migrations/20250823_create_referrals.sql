create table if not exists public.referrals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade, -- referrer
  referred_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique(user_id, referred_id)
);

alter table public.referrals enable row level security;
drop policy if exists "Users view own referrals" on public.referrals;
create policy "Users view own referrals" on public.referrals
  for select using (auth.uid() = user_id or auth.uid() = referred_id);

