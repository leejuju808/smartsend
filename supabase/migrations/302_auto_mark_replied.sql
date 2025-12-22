-- Block 302 — Auto-Mark as Replied
-- Auto-mark leads as replied, stop sequences, and pause campaigns on reply

-- 1. Leads: mark replied + last reply time
alter table public.leads
  add column if not exists replied boolean default false,
  add column if not exists last_replied_at timestamptz;

-- Add index for faster queries
create index if not exists idx_leads_replied on public.leads(replied) where replied = true;
create index if not exists idx_leads_last_replied_at on public.leads(last_replied_at desc) where last_replied_at is not null;

-- 2. Campaign lead status (ensure status column exists and supports our values)
-- Note: campaign_leads.status may already exist with different values
-- We'll add our values to the check constraint if needed
do $$
begin
  -- Check if status column exists
  if exists (
    select 1 from information_schema.columns 
    where table_name = 'campaign_leads' and column_name = 'status'
  ) then
    -- Try to alter the constraint to include our new values
    -- If constraint exists, we'll need to drop and recreate it
    if exists (
      select 1 from information_schema.table_constraints tc
      join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name
      where tc.table_name = 'campaign_leads' 
      and tc.constraint_type = 'CHECK'
      and ccu.column_name = 'status'
    ) then
      -- Drop existing constraint if it's too restrictive
      alter table public.campaign_leads drop constraint if exists campaign_leads_status_check;
    end if;
    
    -- Add our status values (will work if column allows text)
    -- Note: This is additive - existing values remain valid
  else
    -- Add status column if it doesn't exist
    alter table public.campaign_leads add column status text default 'active';
  end if;
end $$;

-- Ensure status defaults to 'active' for existing rows
update public.campaign_leads set status = 'active' where status is null;

-- Add index for status queries
create index if not exists idx_campaign_leads_status on public.campaign_leads(campaign_id, status) where status in ('active', 'replied', 'unsubscribed', 'completed');

-- 3. Sequence enrollments status (ensure status column supports our values)
do $$
begin
  -- Check if status column exists
  if exists (
    select 1 from information_schema.columns 
    where table_name = 'sequence_enrollments' and column_name = 'status'
  ) then
    -- Try to alter the constraint to include our new values
    if exists (
      select 1 from information_schema.table_constraints tc
      join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name
      where tc.table_name = 'sequence_enrollments' 
      and tc.constraint_type = 'CHECK'
      and ccu.column_name = 'status'
    ) then
      -- Drop existing constraint if it's too restrictive
      alter table public.sequence_enrollments drop constraint if exists sequence_enrollments_status_check;
    end if;
  else
    -- Add status column if it doesn't exist
    alter table public.sequence_enrollments add column status text default 'active';
  end if;
end $$;

-- Ensure status defaults to 'active' for existing rows
update public.sequence_enrollments set status = 'active' where status is null;

-- Add index for status queries
create index if not exists idx_sequence_enrollments_status on public.sequence_enrollments(lead_id, status) where status in ('active', 'stopped_due_to_reply', 'stopped_due_to_unsubscribe', 'completed');

-- 4. Add workspace_id to email_replies if not exists (for easier lookup)
alter table public.email_replies
  add column if not exists workspace_id uuid references workspaces(id) on delete set null,
  add column if not exists lead_id uuid references leads(id) on delete set null,
  add column if not exists campaign_id uuid references campaigns(id) on delete set null,
  add column if not exists sequence_id uuid,
  add column if not exists received_at timestamptz default now();

-- Indexes for email_replies
create index if not exists idx_email_replies_workspace_id on public.email_replies(workspace_id);
create index if not exists idx_email_replies_lead_id on public.email_replies(lead_id);
create index if not exists idx_email_replies_campaign_id on public.email_replies(campaign_id);
create index if not exists idx_email_replies_received_at on public.email_replies(received_at desc);

-- 5. Optional: billing_events table if it doesn't exist (for analytics)
create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete set null,
  type text not null,
  detail text,
  created_at timestamptz default now()
);

create index if not exists idx_billing_events_workspace on public.billing_events(workspace_id, created_at desc);
create index if not exists idx_billing_events_type on public.billing_events(type);

-- Enable RLS on billing_events
alter table public.billing_events enable row level security;

-- RLS policy for billing_events
drop policy if exists "Service can manage billing_events" on public.billing_events;
create policy "Service can manage billing_events" on public.billing_events
  for all using (true) with check (true);

drop policy if exists "Users can view billing_events" on public.billing_events;
create policy "Users can view billing_events" on public.billing_events
  for select using (
    exists (
      select 1 from workspace_members wm
      where wm.workspace_id = billing_events.workspace_id
      and wm.user_id = auth.uid()
    )
  );







