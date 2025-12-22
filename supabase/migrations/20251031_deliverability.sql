-- Global suppression (user-level do-not-contact)

create table if not exists public.suppressions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  reason text not null default 'unsubscribe', -- unsubscribe|bounce|complaint|manual
  created_at timestamptz not null default now(),
  unique (user_id, email)
);

alter table public.suppressions enable row level security;

create policy "own_suppressions" on public.suppressions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Optional: store bounces/complaints from providers

create table if not exists public.delivery_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  campaign_id uuid,
  lead_id uuid,
  email text,
  event text not null,        -- bounce|complaint|delivered|opened|clicked
  detail jsonb,
  created_at timestamptz not null default now()
);

alter table public.delivery_events enable row level security;

create policy "own_delivery_events" on public.delivery_events
  for select using (auth.uid() = user_id);

-- Indexes for performance
create index if not exists idx_suppressions_user_email on public.suppressions(user_id, email);
create index if not exists idx_delivery_events_user on public.delivery_events(user_id);
create index if not exists idx_delivery_events_campaign on public.delivery_events(campaign_id);

