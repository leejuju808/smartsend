-- Block 12000 — Multi-Identity Sending v1
-- Add Multiple From-Addresses + Per-Campaign Sender Selection
-- Allows organizations to connect multiple sending identities and choose which identity sends each campaign

-- ============================================================================
-- 1. Extend email_credentials table for multi-identity support
-- ============================================================================

-- Add identity_name and is_primary columns
alter table public.email_credentials
  add column if not exists identity_name text,  -- e.g., "Owner", "Office", "Claims"
  add column if not exists is_primary boolean default false;

-- Create index for primary identity lookups
create index if not exists idx_email_credentials_org_primary 
  on public.email_credentials(org_id, is_primary) 
  where is_primary = true;

-- Create index for identity lookups by org
create index if not exists idx_email_credentials_org_active 
  on public.email_credentials(org_id, verified) 
  where verified = true;

-- ============================================================================
-- 2. Function to ensure only one primary identity per org
-- ============================================================================

create or replace function public.enforce_single_primary_identity()
returns trigger
language plpgsql
as $$
begin
  -- If this identity is being set as primary, unset all other primaries for this org
  if NEW.is_primary = true then
    update public.email_credentials
    set is_primary = false
    where org_id = NEW.org_id
      and id != NEW.id
      and is_primary = true;
  end if;
  return NEW;
end;
$$;

-- Create trigger to enforce single primary identity
drop trigger if exists trg_enforce_single_primary_identity on public.email_credentials;
create trigger trg_enforce_single_primary_identity
  before insert or update on public.email_credentials
  for each row
  when (NEW.is_primary = true)
  execute function public.enforce_single_primary_identity();

-- ============================================================================
-- 3. Add sending_identity_id to campaigns table
-- ============================================================================

alter table public.campaigns
  add column if not exists sending_identity_id uuid 
    references public.email_credentials(id) on delete set null;

-- Create index for campaign identity lookups
create index if not exists idx_campaigns_sending_identity 
  on public.campaigns(sending_identity_id) 
  where sending_identity_id is not null;

-- ============================================================================
-- 4. Add sending_identity_id to messages table
-- ============================================================================

-- Check if messages table exists and add column
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'messages'
  ) then
    alter table public.messages
      add column if not exists sending_identity_id uuid 
        references public.email_credentials(id) on delete set null;
    
    -- Create index for message identity lookups
    create index if not exists idx_messages_sending_identity 
      on public.messages(sending_identity_id) 
      where sending_identity_id is not null;
  end if;
end $$;

-- Also check for send_queue table (alternative messages table)
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'send_queue'
  ) then
    alter table public.send_queue
      add column if not exists sending_identity_id uuid 
        references public.email_credentials(id) on delete set null;
    
    create index if not exists idx_send_queue_sending_identity 
      on public.send_queue(sending_identity_id) 
      where sending_identity_id is not null;
  end if;
end $$;

-- Also check for send_logs table
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'send_logs'
  ) then
    alter table public.send_logs
      add column if not exists sending_identity_id uuid 
        references public.email_credentials(id) on delete set null;
    
    create index if not exists idx_send_logs_sending_identity 
      on public.send_logs(sending_identity_id) 
      where sending_identity_id is not null;
  end if;
end $$;

-- ============================================================================
-- 5. Add sending_identity_id to reply_threads (for inbox identity tracking)
-- ============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'reply_threads'
  ) then
    alter table public.reply_threads
      add column if not exists sending_identity_id uuid 
        references public.email_credentials(id) on delete set null;
    
    create index if not exists idx_reply_threads_sending_identity 
      on public.reply_threads(sending_identity_id) 
      where sending_identity_id is not null;
  end if;
end $$;

-- ============================================================================
-- 6. Helper function to get primary identity for an org
-- ============================================================================

create or replace function public.get_primary_identity(p_org_id uuid)
returns uuid
language sql
stable
as $$
  select id
  from public.email_credentials
  where org_id = p_org_id
    and is_primary = true
    and verified = true
  limit 1;
$$;

grant execute on function public.get_primary_identity(uuid) to authenticated;

-- ============================================================================
-- 7. Helper function to get all active identities for an org
-- ============================================================================

create or replace function public.get_org_identities(p_org_id uuid)
returns table (
  id uuid,
  identity_name text,
  display_name text,
  email_address text,
  provider text,
  is_primary boolean,
  verified boolean,
  daily_send_limit int,
  created_at timestamptz
)
language sql
stable
as $$
  select 
    ec.id,
    ec.identity_name,
    ec.display_name,
    ec.email_address,
    ec.provider,
    ec.is_primary,
    ec.verified,
    ec.daily_send_limit,
    ec.created_at
  from public.email_credentials ec
  where ec.org_id = p_org_id
    and ec.verified = true
  order by ec.is_primary desc, ec.created_at asc;
$$;

grant execute on function public.get_org_identities(uuid) to authenticated;

-- ============================================================================
-- 8. Comments
-- ============================================================================

comment on column public.email_credentials.identity_name is 'Human-readable name for this identity (e.g., "Owner", "Office", "Claims")';
comment on column public.email_credentials.is_primary is 'Whether this is the primary sending identity for the organization';
comment on column public.campaigns.sending_identity_id is 'The email_credentials identity used to send this campaign';
comment on column public.messages.sending_identity_id is 'The email_credentials identity used to send this message';
comment on function public.get_primary_identity(uuid) is 'Get the primary sending identity for an organization';
comment on function public.get_org_identities(uuid) is 'Get all active sending identities for an organization';




























































