-- Block 14200 — Reply Detection + Intent Classification v1
-- Auto-Tag Replies → Update Lead Status → Log to Timeline
-- This turns SmartSend from "email sender" into "this thing tells me who's ready to buy."

-- ============================================================================
-- 1. ADD INTENT FIELDS TO email_messages TABLE
-- ============================================================================

-- Add intent classification fields
alter table public.email_messages
  add column if not exists intent_label text check (
    intent_label in (
      'hot_lead',
      'warm_lead',
      'follow_up',
      'not_interested',
      'out_of_office',
      'wrong_contact',
      'unsubscribe',
      'other'
    )
  ),
  add column if not exists intent_confidence numeric,
  add column if not exists intent_raw jsonb,
  add column if not exists is_processed_for_intent boolean default false;

-- Ensure body_text exists (for plain text version of email body)
alter table public.email_messages
  add column if not exists body_text text;

-- Add contact_id if it doesn't exist (we'll derive it from lead_id or from_email if needed)
alter table public.email_messages
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;

-- Add workspace_id if it doesn't exist (we'll derive it from campaign or team if needed)
alter table public.email_messages
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

-- Indexes for efficient querying
create index if not exists idx_email_messages_intent_processed 
  on public.email_messages(direction, is_processed_for_intent) 
  where direction = 'inbound' and is_processed_for_intent = false;

create index if not exists idx_email_messages_intent_label 
  on public.email_messages(intent_label) 
  where intent_label is not null;

create index if not exists idx_email_messages_contact_id 
  on public.email_messages(contact_id) 
  where contact_id is not null;

create index if not exists idx_email_messages_workspace_id 
  on public.email_messages(workspace_id) 
  where workspace_id is not null;

-- ============================================================================
-- 2. DATABASE TRIGGER FOR NEW INBOUND EMAILS
-- ============================================================================

-- Function to notify on new inbound emails
create or replace function public.notify_new_inbound_email()
returns trigger
language plpgsql
as $$
begin
  if (NEW.direction = 'inbound' or NEW.direction = 'in') then
    perform pg_notify('new_inbound_email', NEW.id::text);
  end if;
  return NEW;
end;
$$;

-- Drop existing trigger if it exists
drop trigger if exists on_new_inbound_email on public.email_messages;

-- Create trigger
create trigger on_new_inbound_email
after insert on public.email_messages
for each row
execute function public.notify_new_inbound_email();

-- ============================================================================
-- 3. HELPER FUNCTION TO DERIVE contact_id AND workspace_id
-- ============================================================================

-- Function to populate contact_id and workspace_id from existing data
create or replace function public.derive_email_message_context()
returns trigger
language plpgsql
as $$
declare
  v_contact_id uuid;
  v_workspace_id uuid;
  v_lead_email text;
begin
  -- Skip if already set
  if NEW.contact_id is not null and NEW.workspace_id is not null then
    return NEW;
  end if;

  -- Try to get workspace_id from campaign
  if NEW.campaign_id is not null then
    select workspace_id into v_workspace_id
    from public.campaigns
    where id = NEW.campaign_id
    limit 1;
  end if;

  -- Try to get workspace_id from team_id (if team_id exists)
  if v_workspace_id is null and NEW.team_id is not null then
    -- Assuming teams table has workspace_id or we can derive it
    -- This is a placeholder - adjust based on your actual schema
    select workspace_id into v_workspace_id
    from public.teams
    where id = NEW.team_id
    limit 1;
  end if;

  -- Try to get contact_id from lead_id
  if NEW.lead_id is not null then
    -- Get email from lead
    select email into v_lead_email
    from public.leads
    where id = NEW.lead_id
    limit 1;

    -- Find contact by email and workspace
    if v_lead_email is not null and v_workspace_id is not null then
      select id into v_contact_id
      from public.contacts
      where lower(email) = lower(v_lead_email)
        and workspace_id = v_workspace_id
      limit 1;
    end if;
  end if;

  -- Try to get contact_id from from_email
  if v_contact_id is null and NEW.from_email is not null and v_workspace_id is not null then
    select id into v_contact_id
    from public.contacts
    where lower(email) = lower(NEW.from_email)
      and workspace_id = v_workspace_id
    limit 1;
  end if;

  -- Update the record
  NEW.contact_id = coalesce(NEW.contact_id, v_contact_id);
  NEW.workspace_id = coalesce(NEW.workspace_id, v_workspace_id);

  return NEW;
end;
$$;

-- Trigger to auto-populate contact_id and workspace_id
drop trigger if exists derive_email_message_context_trigger on public.email_messages;
create trigger derive_email_message_context_trigger
before insert or update on public.email_messages
for each row
execute function public.derive_email_message_context();

-- ============================================================================
-- 4. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for finding unprocessed inbound messages
create index if not exists idx_email_messages_unprocessed_inbound
  on public.email_messages(created_at)
  where (direction = 'inbound' or direction = 'in')
    and is_processed_for_intent = false;

-- Index for intent-based queries
create index if not exists idx_email_messages_workspace_intent
  on public.email_messages(workspace_id, intent_label, created_at desc)
  where workspace_id is not null and intent_label is not null;



























































