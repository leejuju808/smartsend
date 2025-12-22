create table if not exists public.user_presence (
  user_id uuid primary key,
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_presence_last_seen on public.user_presence(last_seen_at);

