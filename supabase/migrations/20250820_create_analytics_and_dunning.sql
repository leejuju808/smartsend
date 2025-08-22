-- Event sink for key funnels (server-only writes)
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  name text not null,
  context jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_analytics_events_user_time on public.analytics_events (user_id, created_at desc);

-- Dunning sends to avoid duplicates
create table if not exists public.dunning_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  template text not null,
  sent_at timestamptz not null default now(),
  unique (profile_id, template)
);

-- Helpful for admin queries
alter table if exists public.profiles add column if not exists subscription_updated_at timestamptz;
create index if not exists idx_profiles_status_time on public.profiles (subscription_status, subscription_updated_at desc);
