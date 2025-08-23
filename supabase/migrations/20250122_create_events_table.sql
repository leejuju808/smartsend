create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  event text not null,
  meta jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_events_user on public.events (user_id);
create index if not exists idx_events_event on public.events (event); 