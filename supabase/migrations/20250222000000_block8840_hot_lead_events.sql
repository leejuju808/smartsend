-- Block 8840 — Hot Lead Alerts + "Today's Hot Leads" Rail
-- Never Miss a Roof Job Again
--
-- This block creates a simple event log system that tracks when leads become "hot".
-- Any time a homeowner is classified as HOT → they show up in a "Today's Hot Leads" rail + alert badge.

-- ============================================================================
-- 1. HOT_LEAD_EVENTS TABLE
-- ============================================================================

create table if not exists public.hot_lead_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  inbound_email_id uuid references public.inbound_emails(id) on delete set null,
  inbound_message_id uuid references public.inbound_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  was_seen boolean not null default false
);

-- Indexes for fast queries
create index if not exists hot_lead_events_owner_created_idx
  on public.hot_lead_events(owner_id, created_at desc);

create index if not exists hot_lead_events_lead_idx
  on public.hot_lead_events(lead_id);

create index if not exists hot_lead_events_unseen_idx
  on public.hot_lead_events(owner_id, was_seen, created_at desc)
  where was_seen = false;

-- Enable RLS
alter table public.hot_lead_events enable row level security;

-- RLS Policy: Users can only access their own hot lead events
create policy "Users can access their own hot lead events"
  on public.hot_lead_events
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

























































