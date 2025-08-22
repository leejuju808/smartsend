-- Create campaigns table (idempotent)
create table if not exists public.campaigns (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  subject text not null,
  body text not null,
  status text default 'scheduled',
  created_at timestamp with time zone default now()
);

-- Index for filtering by user
create index if not exists campaigns_user_id_idx on public.campaigns(user_id);

