-- LinkedIn Integration Migration
-- Extends integrations table for channel-based OAuth integrations and creates channel_messages table

-- Extend integrations table to support channel-based integrations (LinkedIn, WhatsApp, etc.)
-- Add channel column if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'integrations' and column_name = 'channel'
  ) then
    alter table public.integrations add column channel text;
    -- Update existing integrations to set channel from type
    update public.integrations set channel = type where channel is null;
  end if;
  
  -- Add access_token column for OAuth tokens (stored separately from config for security)
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'integrations' and column_name = 'access_token'
  ) then
    alter table public.integrations add column access_token text;
  end if;
  
  -- Add expires_at for token expiration
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'integrations' and column_name = 'expires_at'
  ) then
    alter table public.integrations add column expires_at timestamptz;
  end if;
end $$;

-- Create index for channel lookups
create index if not exists idx_integrations_channel on public.integrations(channel);
create index if not exists idx_integrations_channel_org on public.integrations(org_id, channel);

-- Create channel_messages table for cross-channel message logging
create table if not exists public.channel_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  channel text not null, -- 'email', 'linkedin', 'whatsapp', etc.
  direction text not null check (direction in ('outbound', 'inbound')),
  body text not null,
  subject text, -- for email/LinkedIn
  status text default 'sent', -- 'sent', 'delivered', 'failed', 'pending'
  external_message_id text, -- provider's message ID
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create indexes for channel_messages
create index if not exists idx_channel_messages_org on public.channel_messages(org_id, created_at desc);
create index if not exists idx_channel_messages_lead on public.channel_messages(lead_id);
create index if not exists idx_channel_messages_channel on public.channel_messages(channel, created_at desc);
create index if not exists idx_channel_messages_status on public.channel_messages(status);

-- Enable RLS
alter table public.channel_messages enable row level security;

-- RLS policies for channel_messages
create policy "Users can view channel_messages for their workspace" on public.channel_messages
  for select using (
    org_id in (
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
  );

create policy "Service role can insert channel_messages" on public.channel_messages
  for insert with check (true);

create policy "Service role can update channel_messages" on public.channel_messages
  for update using (true);

-- Update automation_rules to support LinkedIn reply events
do $$
begin
  -- Alter the check constraint to include reply_linkedin
  alter table public.automation_rules 
    drop constraint if exists automation_rules_event_type_check;
  
  alter table public.automation_rules 
    add constraint automation_rules_event_type_check 
    check (event_type is null or event_type in ('open', 'click', 'reply', 'bounce', 'reply_linkedin'));
end $$;

