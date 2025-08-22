create table if not exists public.dunning_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stage text not null default 't0', -- t0=initial failure, t1=+3d, t2=+7d
  last_sent_at timestamptz not null default now()
);

comment on table public.dunning_state is 'Tracks dunning email stage per user';

