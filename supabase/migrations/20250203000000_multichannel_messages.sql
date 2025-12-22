-- Multi-Channel Messages System
-- Unified message model for Email, LinkedIn, WhatsApp, SMS, and future AI agents

-- 1) Channel Messages Table
create table if not exists channel_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  lead_id uuid references leads(id) on delete set null,
  channel text not null check (channel in ('email','linkedin','whatsapp','sms')),
  direction text not null check (direction in ('inbound','outbound')),
  body text,
  metadata jsonb default '{}'::jsonb,
  sent_at timestamptz default now(),
  status text default 'delivered' check (status in ('pending','sent','delivered','failed','bounced')),
  created_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_channel_messages_org on channel_messages(org_id);
create index if not exists idx_channel_messages_lead on channel_messages(lead_id);
create index if not exists idx_channel_messages_channel on channel_messages(channel);
create index if not exists idx_channel_messages_direction on channel_messages(direction);
create index if not exists idx_channel_messages_sent_at on channel_messages(sent_at desc);

-- 2) Channel Integrations Table
-- Stores OAuth tokens and connection details for each channel per org
create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  channel text not null check (channel in ('email','linkedin','whatsapp','sms')),
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  status text default 'active' check (status in ('active','inactive','expired','error')),
  config jsonb default '{}'::jsonb, -- Channel-specific config (e.g., phone number for WhatsApp)
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(org_id, channel) -- One integration per channel per org
);

-- Indexes for integrations
create index if not exists idx_integrations_org on integrations(org_id);
create index if not exists idx_integrations_channel on integrations(channel);
create index if not exists idx_integrations_status on integrations(status);

-- Updated timestamp trigger for integrations
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_integrations_updated_at on integrations;
create trigger trg_integrations_updated_at
before update on integrations
for each row execute function update_updated_at_column();

-- RLS Policies
alter table channel_messages enable row level security;
alter table integrations enable row level security;

-- Channel Messages RLS Policies
drop policy if exists "read channel_messages by org" on channel_messages;
drop policy if exists "insert channel_messages by org" on channel_messages;
drop policy if exists "update channel_messages by org" on channel_messages;

create policy "read channel_messages by org" on channel_messages
for select using (
  org_id in (select org_id from organization_members where user_id = auth.uid())
  or org_id in (select id from organizations where owner_id = auth.uid())
  or org_id in (select org_id from org_members where user_id = auth.uid())
  or org_id in (select id from orgs where owner_id = auth.uid())
);

create policy "insert channel_messages by org" on channel_messages
for insert with check (
  org_id in (select org_id from organization_members where user_id = auth.uid())
  or org_id in (select id from organizations where owner_id = auth.uid())
  or org_id in (select org_id from org_members where user_id = auth.uid())
  or org_id in (select id from orgs where owner_id = auth.uid())
);

create policy "update channel_messages by org" on channel_messages
for update using (
  org_id in (select org_id from organization_members where user_id = auth.uid())
  or org_id in (select id from organizations where owner_id = auth.uid())
  or org_id in (select org_id from org_members where user_id = auth.uid())
  or org_id in (select id from orgs where owner_id = auth.uid())
);

-- Integrations RLS Policies
drop policy if exists "read integrations by org" on integrations;
drop policy if exists "insert integrations by org" on integrations;
drop policy if exists "update integrations by org" on integrations;
drop policy if exists "delete integrations by org" on integrations;

create policy "read integrations by org" on integrations
for select using (
  org_id in (select org_id from organization_members where user_id = auth.uid())
  or org_id in (select id from organizations where owner_id = auth.uid())
  or org_id in (select org_id from org_members where user_id = auth.uid())
  or org_id in (select id from orgs where owner_id = auth.uid())
);

create policy "insert integrations by org" on integrations
for insert with check (
  org_id in (select org_id from organization_members where user_id = auth.uid())
  or org_id in (select id from organizations where owner_id = auth.uid())
  or org_id in (select org_id from org_members where user_id = auth.uid())
  or org_id in (select id from orgs where owner_id = auth.uid())
);

create policy "update integrations by org" on integrations
for update using (
  org_id in (select org_id from organization_members where user_id = auth.uid())
  or org_id in (select id from organizations where owner_id = auth.uid())
  or org_id in (select org_id from org_members where user_id = auth.uid())
  or org_id in (select id from orgs where owner_id = auth.uid())
);

create policy "delete integrations by org" on integrations
for delete using (
  org_id in (select org_id from organization_members where user_id = auth.uid())
  or org_id in (select id from organizations where owner_id = auth.uid())
  or org_id in (select org_id from org_members where user_id = auth.uid())
  or org_id in (select id from orgs where owner_id = auth.uid())
);

