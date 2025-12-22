-- Migration for Gmail Connect + Send + Reply Poller
-- Adds org_id support to oauth_connections and creates gmail_state table

-- Add org_id to oauth_connections if it doesn't exist
alter table if exists public.oauth_connections
  add column if not exists org_id uuid references public.organizations(id) on delete cascade;

-- Create index for org_id lookups
create index if not exists idx_oauth_connections_org_id 
  on public.oauth_connections(org_id) where org_id is not null;

-- Add replied_at and last_message_snippet to campaign_leads if they don't exist
alter table if exists public.campaign_leads
  add column if not exists replied_at timestamptz,
  add column if not exists last_message_snippet text;

-- Create gmail_state table for tracking polling state
create table if not exists public.gmail_state (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider_email text not null,
  last_history_id text,  -- Gmail API history ID for incremental polling
  last_polled_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, provider_email)
);

create index if not exists idx_gmail_state_org_email 
  on public.gmail_state(org_id, provider_email);

alter table public.gmail_state enable row level security;

-- RLS policies for gmail_state
create policy "org members can view gmail_state"
  on public.gmail_state for select
  using (exists (
    select 1 from public.org_members om
    where om.org_id = gmail_state.org_id
    and om.user_id = auth.uid()
  ));

create policy "org admins can manage gmail_state"
  on public.gmail_state for all
  using (exists (
    select 1 from public.org_members om
    where om.org_id = gmail_state.org_id
    and om.user_id = auth.uid()
    and om.role = 'admin'
  ))
  with check (exists (
    select 1 from public.org_members om
    where om.org_id = gmail_state.org_id
    and om.user_id = auth.uid()
    and om.role = 'admin'
  ));

-- Update timestamp trigger for gmail_state
create trigger update_gmail_state_updated_at
  before update on public.gmail_state
  for each row
  execute function public.handle_updated_at();

