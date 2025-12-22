-- Block 15900 — Smart Reply Inbox v1
-- All Homeowner Replies in One Place, Sorted by Money
-- This is the "talk to people who actually replied" block

-- ============================================================================
-- 1. ENSURE INTENT_LABEL COLUMN EXISTS WITH CORRECT CONSTRAINT
-- ============================================================================

-- Add intent_label column if it doesn't exist
alter table public.email_messages
  add column if not exists intent_label text;

-- Update constraint to match spec (hot_lead, warm_lead, follow_up, not_interested, unsubscribe, unknown)
-- First drop existing constraint if it exists
do $$
begin
  -- Drop old constraint if it exists
  if exists (
    select 1 from pg_constraint 
    where conname = 'email_messages_intent_label_check'
  ) then
    alter table public.email_messages drop constraint email_messages_intent_label_check;
  end if;
end $$;

-- Add new constraint with the correct values
alter table public.email_messages
  add constraint email_messages_intent_label_check check (
    intent_label in (
      'hot_lead',
      'warm_lead',
      'follow_up',
      'not_interested',
      'unsubscribe',
      'unknown'
    )
  );

-- Set default to 'unknown' if not set
alter table public.email_messages
  alter column intent_label set default 'unknown';

-- ============================================================================
-- 2. ADD HANDLED COLUMN
-- ============================================================================

alter table public.email_messages
  add column if not exists handled boolean not null default false;

-- Index for filtering unhandled messages
create index if not exists idx_email_messages_handled 
  on public.email_messages(workspace_id, handled, created_at desc)
  where handled = false and direction in ('inbound', 'in');

-- ============================================================================
-- 3. ENSURE REQUIRED COLUMNS EXIST
-- ============================================================================

-- Ensure workspace_id exists (should already exist from Block 14200)
alter table public.email_messages
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

-- Ensure contact_id exists (should already exist from Block 14200)
alter table public.email_messages
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;

-- Ensure campaign_id exists (should already exist)
alter table public.email_messages
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;

-- Ensure direction column exists with correct values
alter table public.email_messages
  add column if not exists direction text check (direction in ('inbound', 'outbound', 'in', 'out'));

-- Ensure body column exists (may be body_text or body)
alter table public.email_messages
  add column if not exists body text;

-- If body doesn't exist but body_text does, create a computed column or use body_text
-- We'll use body_text if body is null in queries

-- ============================================================================
-- 4. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for inbox queries: workspace + direction + intent + created_at
create index if not exists idx_email_messages_inbox_query
  on public.email_messages(workspace_id, direction, intent_label, created_at desc)
  where workspace_id is not null and direction in ('inbound', 'in');

-- Index for contact lookups
create index if not exists idx_email_messages_contact_workspace
  on public.email_messages(contact_id, workspace_id, created_at desc)
  where contact_id is not null and workspace_id is not null;

-- ============================================================================
-- 5. ADD is_default COLUMN TO workspace_members IF IT DOESN'T EXIST
-- ============================================================================

alter table public.workspace_members
  add column if not exists is_default boolean default false;

-- Set first workspace as default if none is set
update public.workspace_members wm1
set is_default = true
where not exists (
  select 1 from public.workspace_members wm2
  where wm2.user_id = wm1.user_id and wm2.is_default = true
)
and wm1.workspace_id = (
  select workspace_id
  from public.workspace_members
  where user_id = wm1.user_id
  order by created_at asc
  limit 1
);

-- ============================================================================
-- 6. HELPER FUNCTION TO GET DEFAULT WORKSPACE FOR USER
-- ============================================================================

create or replace function public.get_default_workspace_id(p_user_id uuid)
returns uuid
language sql
stable
as $$
  select workspace_id
  from public.workspace_members
  where user_id = p_user_id
    and is_default = true
  limit 1;
$$;

