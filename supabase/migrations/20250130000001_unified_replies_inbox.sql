-- Block 8630 — Unified Replies Inbox v1
-- This migration ensures inbound_emails table exists with required structure for the inbox feature

-- Create inbound_emails table if it doesn't exist
create table if not exists public.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  from_email text not null,
  subject text null,
  body_text text null,
  raw_json jsonb null,
  classification text null, -- 'hot' | 'warm' | 'not_interested' | 'follow_up'
  received_at timestamptz not null default now()
);

-- Add workspace_id column if it doesn't exist (for workspace-based access)
alter table public.inbound_emails
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

-- Create indexes
create index if not exists idx_inbound_emails_owner_id
  on public.inbound_emails(owner_id);

create index if not exists idx_inbound_emails_lead_id
  on public.inbound_emails(lead_id);

create index if not exists idx_inbound_received_at
  on public.inbound_emails(received_at desc);

create index if not exists idx_inbound_emails_workspace_id
  on public.inbound_emails(workspace_id)
  where workspace_id is not null;

-- Enable RLS
alter table public.inbound_emails enable row level security;

-- Drop existing policy if it exists
drop policy if exists "Users can access their own inbound emails" on public.inbound_emails;

-- RLS Policy: Users can access their own inbound emails OR emails in their workspaces
create policy "Users can access their own inbound emails"
  on public.inbound_emails
  for all
  using (
    owner_id = auth.uid()
    OR workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  )
  with check (
    owner_id = auth.uid()
    OR workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

