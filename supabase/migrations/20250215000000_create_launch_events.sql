-- Launch Events Table for tracking demo clicks, signups, upgrades, and other conversion events
-- Used for internal analytics and launch metrics

create table if not exists public.launch_events (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  source text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Index for querying events by type
create index if not exists idx_launch_events_event on public.launch_events(event);
create index if not exists idx_launch_events_created_at on public.launch_events(created_at desc);

-- Index for querying by source
create index if not exists idx_launch_events_source on public.launch_events(source) where source is not null;

-- Enable RLS if needed (optional - remove if you want public access from API routes)
-- alter table public.launch_events enable row level security;
-- create policy "Allow insert from authenticated users" on public.launch_events
--   for insert to authenticated with check (true);

