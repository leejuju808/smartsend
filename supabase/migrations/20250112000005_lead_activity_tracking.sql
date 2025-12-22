-- 05_lead_activity_tracking.sql
-- Add sentiment and summary columns to lead_activity
-- Create email_events table for tracking email engagement

alter table public.lead_activity add column if not exists sentiment text; -- 'positive' | 'neutral' | 'negative'

alter table public.lead_activity add column if not exists summary text;

-- Optional: add activity triggers from email events
create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  lead_id uuid not null references public.leads(id) on delete cascade,
  campaign_id uuid,
  event_type text not null, -- 'open' | 'click' | 'reply'
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_events_lead on public.email_events(lead_id);
create index if not exists idx_email_events_type on public.email_events(event_type);
create index if not exists idx_email_events_created on public.email_events(created_at desc);

-- Enable RLS on email_events
alter table public.email_events enable row level security;

-- RLS policy for email_events (users can see events for leads they have access to)
drop policy if exists "email_events_select" on public.email_events;
create policy "email_events_select" on public.email_events
  for select using (
    exists (
      select 1 from public.leads 
      where leads.id = email_events.lead_id
    )
  );

drop policy if exists "email_events_insert" on public.email_events;
create policy "email_events_insert" on public.email_events
  for insert with check (
    exists (
      select 1 from public.leads 
      where leads.id = email_events.lead_id
    )
  );

