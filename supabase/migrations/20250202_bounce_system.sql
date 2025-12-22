-- Bounce Detection and Tracking System
-- Tracks bounce events and updates lead status to prevent future sends

-- Create bounces table (if not exists from previous migration)
create table if not exists public.bounces (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete cascade,
  provider text check (provider in ('gmail','outlook')) not null,
  message_id text,          -- outbound message id that bounced (if known)
  thread_id text,           -- gmail threadId or outlook conversationId
  bounce_type text,         -- 'hard' | 'soft' | 'unknown'
  reason text,              -- parsed summary
  raw_snippet text,         -- short excerpt for UI
  created_at timestamptz default now()
);

create index if not exists idx_bounces_lead on bounces(lead_id);
alter table bounces enable row level security;

-- RLS: owners see bounces for their leads
drop policy if exists "bounces_select_own" on bounces;
create policy if not exists "bounces_select_own"
on bounces for select
using (exists(select 1 from leads l where l.id = bounces.lead_id and l.owner_id = auth.uid()));

-- Add bounced_at column to leads table
alter table leads add column if not exists bounced_at timestamptz;

-- Update leads status enum if needed (check first if status is already properly typed)
-- If leads.status is text, the update will work directly
-- If it's an enum, you may need to alter the enum type first
-- Uncomment below if status column needs to support 'Bounced' value:
-- DO $$ BEGIN
--   CREATE TYPE lead_status_enum AS ENUM ('Active', 'Replied', 'Bounced');
-- EXCEPTION WHEN duplicate_object THEN null;
-- END $$;
-- ALTER TABLE leads ALTER COLUMN status TYPE lead_status_enum USING status::text::lead_status_enum;

-- Optional: domain suppression table
create table if not exists suppressed_domains (
  domain text primary key,
  reason text,
  created_at timestamptz default now()
);

alter table suppressed_domains enable row level security;
drop policy if exists "suppressed_domains_select_all" on suppressed_domains;
create policy "suppressed_domains_select_all" on suppressed_domains for select using (true);
