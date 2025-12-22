-- =========================================================
-- Block 8570 — Campaign Send Queue (Turn "Active" Campaigns Into Real Outbound Emails)
-- =========================================================

-- Add columns to outbound_emails table for sequenced sends
alter table public.outbound_emails
  add column if not exists step_index integer;

alter table public.outbound_emails
  add column if not exists scheduled_at timestamptz;

-- Update status column if it exists, otherwise add it
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'outbound_emails' 
    and column_name = 'status'
  ) then
    -- Column exists, update constraint if needed
    alter table public.outbound_emails
      drop constraint if exists outbound_emails_status_check;
  else
    -- Column doesn't exist, add it
    alter table public.outbound_emails
      add column status text not null default 'pending';
  end if;
end $$;

-- Ensure status constraint allows our values
alter table public.outbound_emails
  drop constraint if exists outbound_emails_status_check;

alter table public.outbound_emails
  add constraint outbound_emails_status_check
  check (status in ('pending', 'sent', 'failed', 'canceled', 'sending', 'cancelled'));

-- Ensure lead_id exists (may already exist from other migrations)
alter table public.outbound_emails
  add column if not exists lead_id uuid references public.leads(id) on delete cascade;

-- Make existing required fields nullable to support simpler structure
-- This allows inserts without campaign_contact_id, contact_id, step_id
do $$
begin
  -- Make campaign_contact_id nullable if constraint allows
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'outbound_emails' 
    and column_name = 'campaign_contact_id'
    and is_nullable = 'NO'
  ) then
    alter table public.outbound_emails
      alter column campaign_contact_id drop not null;
  end if;

  -- Make contact_id nullable if constraint allows
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'outbound_emails' 
    and column_name = 'contact_id'
    and is_nullable = 'NO'
  ) then
    alter table public.outbound_emails
      alter column contact_id drop not null;
  end if;

  -- Make step_id nullable if constraint allows
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'outbound_emails' 
    and column_name = 'step_id'
    and is_nullable = 'NO'
  ) then
    alter table public.outbound_emails
      alter column step_id drop not null;
  end if;

  -- Make workspace_id nullable if constraint allows (we'll get it from campaign)
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'outbound_emails' 
    and column_name = 'workspace_id'
    and is_nullable = 'NO'
  ) then
    alter table public.outbound_emails
      alter column workspace_id drop not null;
  end if;
end $$;

-- Ensure body_text exists (may be called 'body' in some migrations)
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'outbound_emails' 
    and column_name = 'body_text'
  ) then
    alter table public.outbound_emails add column body_text text;
    -- Copy from 'body' if it exists
    if exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'outbound_emails' 
      and column_name = 'body'
    ) then
      update public.outbound_emails set body_text = body where body_text is null;
    end if;
  end if;
end $$;

-- Create indexes for performance
create index if not exists idx_outbound_emails_campaign_lead
  on public.outbound_emails(campaign_id, lead_id);

create index if not exists idx_outbound_emails_scheduled_status
  on public.outbound_emails(scheduled_at, status);

create index if not exists idx_outbound_emails_campaign_step
  on public.outbound_emails(campaign_id, step_index);

-- Add constraint for status values
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'outbound_emails_status_check'
  ) then
    alter table public.outbound_emails
      add constraint outbound_emails_status_check
      check (status in ('pending', 'sent', 'failed', 'canceled'));
  end if;
end $$;

