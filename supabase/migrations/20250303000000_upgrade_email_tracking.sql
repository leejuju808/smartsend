-- Upgrade email tracking to support comprehensive event types and better analytics
-- This extends the existing email_events table to match the full specification

-- 1) Create enum for email event types
-- Note: not currently used, but available for future use
create type if not exists email_event_type as enum (
  'sent', 'delivered', 'open', 'click', 'bounced', 'replied'
);

-- 2) Add missing columns to email_logs if they don't exist
alter table public.email_logs
  add column if not exists message_id text,
  add column if not exists opened_at timestamptz,
  add column if not exists clicked_at timestamptz,
  add column if not exists click_url text;

-- 3) Migrate existing email_events to use new structure if needed
-- Add missing columns to email_events
alter table public.email_events
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null,
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists message_id text,
  add column if not exists meta jsonb default '{}'::jsonb;

-- 4) If the table was created with bigserial, we'll keep it
-- But update the check constraint to support new event types
alter table public.email_events
  drop constraint if exists email_events_event_type_check;

-- Recreate check constraint with all event types
-- Using 'open' and 'click' to match existing codebase convention
alter table public.email_events
  add constraint email_events_event_type_check 
  check (event_type in ('sent','delivered','open','click','bounced','replied'));

-- 5) Create tracked_links table if it doesn't exist
create table if not exists public.tracked_links (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  message_id text,
  target_url text not null,
  created_at timestamptz not null default now()
);

-- 6) Indexes for performance
create index if not exists idx_email_events_campaign on public.email_events(campaign_id, created_at desc);
create index if not exists idx_email_events_lead on public.email_events(lead_id, created_at desc);
create index if not exists idx_email_events_type on public.email_events(event_type, created_at desc);
create index if not exists idx_email_events_message_id on public.email_events(message_id, created_at desc);

create index if not exists idx_tracked_links_token on public.tracked_links(token);
create index if not exists idx_tracked_links_campaign on public.tracked_links(campaign_id);

-- 7) RLS policies for tracked_links
alter table public.tracked_links enable row level security;

drop policy if exists "links readable by owner" on public.tracked_links;
create policy "links readable by owner"
on public.tracked_links for select to authenticated
using (
  exists (select 1 from public.campaigns c where c.id = tracked_links.campaign_id and c.user_id = auth.uid())
  or exists (select 1 from public.email_logs el where el.campaign_id = tracked_links.campaign_id and el.user_id = auth.uid())
);

-- Allow service role to insert links
drop policy if exists "service write links" on public.tracked_links;
create policy "service write links"
on public.tracked_links for all to service_role using (true) with check (true);

-- 8) Helper functions for analytics
create or replace function public.count_events(cid uuid, etype text)
returns table(count bigint) language sql stable as $$
  select count(*)::bigint from public.email_events 
  where campaign_id = cid and event_type = etype
$$;

create or replace function public.count_distinct_leads_by_type(cid uuid, etype text)
returns table(count bigint) language sql stable as $$
  select count(distinct lead_id)::bigint from public.email_events 
  where campaign_id = cid and event_type = etype
$$;

-- Grant permissions
grant execute on function public.count_events(uuid, text) to authenticated, anon;
grant execute on function public.count_distinct_leads_by_type(uuid, text) to authenticated, anon;

