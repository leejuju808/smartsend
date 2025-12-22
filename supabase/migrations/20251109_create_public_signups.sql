-- Launch tracking: public_signups table for source attribution
-- Created: 2025-11-09 for SmartSend launch visibility engine

create table if not exists public.public_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text, -- 'twitter', 'ph', 'li', 'reddit', 'direct', etc.
  beta boolean default false, -- true if from beta=true signup
  created_at timestamptz default now()
);

create index if not exists idx_public_signups_email on public.public_signups(email);
create index if not exists idx_public_signups_source on public.public_signups(source);
create index if not exists idx_public_signups_created_at on public.public_signups(created_at desc);

-- Optional: Add comment
comment on table public.public_signups is 'Tracks public signups from launch channels for attribution';

