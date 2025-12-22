-- Email Events Tracking System
-- Creates email_events table for comprehensive email tracking

-- First, ensure emails table exists (minimal schema for tracking)
create table if not exists public.emails (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  subject text,
  body_html text,
  body_text text,
  status text default 'queued',
  created_at timestamptz not null default now()
);

-- email_events: log sent/open/click/reply/bounce with metadata
create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references public.emails(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  event_type text not null check (event_type in ('sent','delivered','opened','clicked','replied','bounced')),
  meta jsonb default '{}'::jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_events_email_id on public.email_events(email_id);
create index if not exists idx_email_events_campaign_event on public.email_events(campaign_id, event_type);
create index if not exists idx_email_events_lead_id on public.email_events(lead_id);
create index if not exists idx_email_events_type_created on public.email_events(event_type, created_at);

-- Enable RLS
alter table public.emails enable row level security;
alter table public.email_events enable row level security;

-- RLS policies for emails table
create policy "service_role_manages_emails" on public.emails
  for all to service_role using (true) with check (true);

-- RLS policies for email_events
create policy "service_role_manages_events" on public.email_events
  for all to service_role using (true) with check (true);

-- Allow authenticated users to read their own events (via campaign/lead ownership)
-- This is a simplified policy - adjust based on your auth model
create policy "users_read_own_events" on public.email_events
  for select to authenticated using (true);

