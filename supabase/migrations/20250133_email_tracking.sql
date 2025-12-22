-- Email tracking events table (for pixel and click tracking)
-- This extends the existing email_events table with tracking-specific fields
alter table public.email_events add column if not exists workspace_id uuid;
alter table public.email_events add column if not exists lead_id uuid references public.leads(id) on delete cascade;
alter table public.email_events add column if not exists url text;
alter table public.email_events add column if not exists occurred_at timestamptz default now();

-- Add campaign_id to email_sends table for tracking
alter table public.email_sends add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;

-- Add tracking-specific indexes
create index if not exists idx_email_events_ws_time on public.email_events(workspace_id, occurred_at desc);
create index if not exists idx_email_events_lead on public.email_events(lead_id, occurred_at desc);

-- Update the existing policy to handle workspace access
drop policy if exists "email_events_own" on public.email_events;
create policy if not exists "email_events_workspace_access" on public.email_events 
  for all using (
    user_id = auth.uid() or
    workspace_id in (
      select id from public.workspaces 
      where user_id = auth.uid() 
      or id in (
        select workspace_id from public.workspace_members 
        where user_id = auth.uid()
      )
    )
  );