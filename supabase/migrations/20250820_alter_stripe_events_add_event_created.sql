alter table if exists public.stripe_events
  add column if not exists event_created_at timestamptz;
