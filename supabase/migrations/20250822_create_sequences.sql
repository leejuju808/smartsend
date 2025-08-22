create table if not exists public.sequences (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  status text not null default 'draft',
  address text not null,
  steps jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.sequences enable row level security;
drop policy if exists "Users manage own sequences" on public.sequences;
create policy "Users manage own sequences" on public.sequences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

