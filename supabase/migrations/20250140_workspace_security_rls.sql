-- Workspace Security & RLS Implementation
-- Replace app.set_workspace with proper membership-based RLS

-- 1) Update workspace tables with proper structure
alter table if exists public.workspaces 
  add column if not exists created_by uuid references auth.users(id),
  alter column created_by set not null;

-- Update existing workspaces to set created_by if null
update public.workspaces 
set created_by = owner_id 
where created_by is null and owner_id is not null;

-- Drop old owner_id column if it exists
alter table if exists public.workspaces 
  drop column if exists owner_id;

-- 2) Create proper workspace_role enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'workspace_role') then
    create type public.workspace_role as enum ('owner','admin','member','viewer');
  end if;
end $$;

-- 3) Update workspace_members table
alter table if exists public.workspace_members 
  alter column role type public.workspace_role using (role::public.workspace_role),
  alter column role set not null,
  alter column role set default 'member',
  add column if not exists invited_at timestamptz,
  add column if not exists joined_at timestamptz not null default now();

-- 4) Create workspace_invites table
create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email citext not null,
  role public.workspace_role not null default 'member',
  token text not null,
  created_at timestamptz not null default now(),
  redeemed_by uuid references auth.users(id),
  redeemed_at timestamptz,
  unique (workspace_id, email)
);

-- 5) Role helper functions
create or replace function app.role_rank(r public.workspace_role)
returns int language sql immutable as $$
  select case r
    when 'owner' then 4
    when 'admin' then 3
    when 'member' then 2
    when 'viewer' then 1
  end; $$;

create or replace function app.is_member(p_ws uuid, p_min_role public.workspace_role)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_ws
      and m.user_id = auth.uid()
      and app.role_rank(m.role) >= app.role_rank(p_min_role)
  ); $$;

-- 6) Default workspace helper
create or replace function app.ensure_personal_workspace()
returns uuid language plpgsql security definer as $$
declare ws uuid;
begin
  select w.id into ws from public.workspaces w
  join public.workspace_members m on m.workspace_id = w.id and m.user_id = auth.uid()
  where w.name = 'Personal' and w.created_by = auth.uid() limit 1;
  if ws is null then
    insert into public.workspaces(name, created_by) values ('Personal', auth.uid()) returning id into ws;
    insert into public.workspace_members(workspace_id, user_id, role) values (ws, auth.uid(), 'owner')
    on conflict do nothing;
  end if;
  return ws;
end $$;

-- 7) Enable RLS on all workspace-scoped tables
alter table if exists public.workspaces enable row level security;
alter table if exists public.workspace_members enable row level security;
alter table if exists public.workspace_invites enable row level security;

-- 8) Workspace RLS policies
drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member" on public.workspaces
  for select using ( app.is_member(id, 'viewer') );

create policy "workspaces_insert_owner" on public.workspaces
  for insert with check ( created_by = auth.uid() );

create policy "workspaces_update_owner" on public.workspaces
  for update using ( created_by = auth.uid() );

create policy "workspaces_delete_owner" on public.workspaces
  for delete using ( created_by = auth.uid() );

-- 9) Workspace members RLS policies
drop policy if exists "workspace_members_select_self" on public.workspace_members;
create policy "workspace_members_select_self" on public.workspace_members
  for select using ( user_id = auth.uid() );

create policy "workspace_members_admin_iud" on public.workspace_members
  for all using ( app.is_member(workspace_id, 'admin') )
  with check ( app.is_member(workspace_id, 'admin') );

-- 10) Workspace invites RLS policies
create policy "workspace_invites_select_member" on public.workspace_invites
  for select using ( app.is_member(workspace_id, 'viewer') );

create policy "workspace_invites_admin_iud" on public.workspace_invites
  for all using ( app.is_member(workspace_id, 'admin') )
  with check ( app.is_member(workspace_id, 'admin') );

-- 11) Update existing RLS policies to use app.is_member
-- Contacts
drop policy if exists "contacts_select_member" on public.contacts;
drop policy if exists "contacts_mutate_member" on public.contacts;

create policy "contacts_select_member" on public.contacts
  for select using ( app.is_member(workspace_id, 'viewer') );

create policy "contacts_mutate_member" on public.contacts
  for all using ( app.is_member(workspace_id, 'member') )
  with check ( app.is_member(workspace_id, 'member') );

-- Campaigns
drop policy if exists "campaigns_select_member" on public.campaigns;
drop policy if exists "campaigns_mutate_member" on public.campaigns;

create policy "campaigns_select_member" on public.campaigns
  for select using ( app.is_member(workspace_id, 'viewer') );

create policy "campaigns_mutate_member" on public.campaigns
  for all using ( app.is_member(workspace_id, 'member') )
  with check ( app.is_member(workspace_id, 'member') );

-- Campaign contacts
drop policy if exists "campaign_contacts_member" on public.campaign_contacts;

create policy "campaign_contacts_member" on public.campaign_contacts
  for all using ( app.is_member(workspace_id, 'member') )
  with check ( app.is_member(workspace_id, 'member') );

-- Sequences
alter table if exists public.sequences enable row level security;
drop policy if exists "sequences_select_member" on public.sequences;
drop policy if exists "sequences_mutate_member" on public.sequences;

create policy "sequences_select_member" on public.sequences
  for select using ( app.is_member(workspace_id, 'viewer') );

create policy "sequences_mutate_member" on public.sequences
  for all using ( app.is_member(workspace_id, 'member') )
  with check ( app.is_member(workspace_id, 'member') );

-- Sequence steps
alter table if exists public.sequence_steps enable row level security;
create policy "sequence_steps_member" on public.sequence_steps
  for all using ( app.is_member(workspace_id, 'member') )
  with check ( app.is_member(workspace_id, 'member') );

-- Sequence subscribers
alter table if exists public.sequence_subscribers enable row level security;
create policy "sequence_subscribers_member" on public.sequence_subscribers
  for all using ( app.is_member(workspace_id, 'member') )
  with check ( app.is_member(workspace_id, 'member') );

-- Send policies (admin+)
alter table if exists public.send_policies enable row level security;
create policy "send_policies_select_member" on public.send_policies
  for select using ( app.is_member(workspace_id, 'viewer') );

create policy "send_policies_admin_iud" on public.send_policies
  for all using ( app.is_member(workspace_id, 'admin') )
  with check ( app.is_member(workspace_id, 'admin') );

-- Send counters (viewer select, admin+ update)
alter table if exists public.send_counters enable row level security;
create policy "send_counters_select_member" on public.send_counters
  for select using ( app.is_member(workspace_id, 'viewer') );

create policy "send_counters_admin_iud" on public.send_counters
  for all using ( app.is_member(workspace_id, 'admin') )
  with check ( app.is_member(workspace_id, 'admin') );

-- Sending audit (viewer select, admin+ update)
alter table if exists public.sending_audit enable row level security;
create policy "sending_audit_select_member" on public.sending_audit
  for select using ( app.is_member(workspace_id, 'viewer') );

create policy "sending_audit_admin_iud" on public.sending_audit
  for all using ( app.is_member(workspace_id, 'admin') )
  with check ( app.is_member(workspace_id, 'admin') );

-- Delivery events (viewer select, admin+ update)
alter table if exists public.delivery_events enable row level security;
create policy "delivery_events_select_member" on public.delivery_events
  for select using ( app.is_member(workspace_id, 'viewer') );

create policy "delivery_events_admin_iud" on public.delivery_events
  for all using ( app.is_member(workspace_id, 'admin') )
  with check ( app.is_member(workspace_id, 'admin') );

-- Open events (viewer select, admin+ update)
alter table if exists public.open_events enable row level security;
create policy "open_events_select_member" on public.open_events
  for select using ( app.is_member(workspace_id, 'viewer') );

create policy "open_events_admin_iud" on public.open_events
  for all using ( app.is_member(workspace_id, 'admin') )
  with check ( app.is_member(workspace_id, 'admin') );

-- Click events (viewer select, admin+ update)
alter table if exists public.click_events enable row level security;
create policy "click_events_select_member" on public.click_events
  for select using ( app.is_member(workspace_id, 'viewer') );

create policy "click_events_admin_iud" on public.click_events
  for all using ( app.is_member(workspace_id, 'admin') )
  with check ( app.is_member(workspace_id, 'admin') );

-- Tracking events (viewer select, admin+ update)
alter table if exists public.tracking_events enable row level security;
create policy "tracking_events_select_member" on public.tracking_events
  for select using ( app.is_member(workspace_id, 'viewer') );

create policy "tracking_events_admin_iud" on public.tracking_events
  for all using ( app.is_member(workspace_id, 'admin') )
  with check ( app.is_member(workspace_id, 'admin') );

-- Suppressions (member+ IUD, viewer select)
alter table if exists public.suppressions enable row level security;
create policy "suppressions_select_member" on public.suppressions
  for select using ( app.is_member(workspace_id, 'viewer') );

create policy "suppressions_mutate_member" on public.suppressions
  for all using ( app.is_member(workspace_id, 'member') )
  with check ( app.is_member(workspace_id, 'member') );

-- Unsubscribe tokens (member+ IUD, viewer select)
alter table if exists public.unsubscribe_tokens enable row level security;
create policy "unsubscribe_tokens_select_member" on public.unsubscribe_tokens
  for select using ( app.is_member(workspace_id, 'viewer') );

create policy "unsubscribe_tokens_mutate_member" on public.unsubscribe_tokens
  for all using ( app.is_member(workspace_id, 'member') )
  with check ( app.is_member(workspace_id, 'member') );

-- Inbound messages (member+ IUD, viewer select)
alter table if exists public.inbound_messages enable row level security;
create policy "inbound_messages_select_member" on public.inbound_messages
  for select using ( app.is_member(workspace_id, 'viewer') );

create policy "inbound_messages_mutate_member" on public.inbound_messages
  for all using ( app.is_member(workspace_id, 'member') )
  with check ( app.is_member(workspace_id, 'member') );

-- Reply intents (member+ IUD, viewer select)
alter table if exists public.reply_intents enable row level security;
create policy "reply_intents_select_member" on public.reply_intents
  for select using ( app.is_member(workspace_id, 'viewer') );

create policy "reply_intents_mutate_member" on public.reply_intents
  for all using ( app.is_member(workspace_id, 'member') )
  with check ( app.is_member(workspace_id, 'member') );

-- Auto stop events (member+ IUD, viewer select)
alter table if exists public.auto_stop_events enable row level security;
create policy "auto_stop_events_select_member" on public.auto_stop_events
  for select using ( app.is_member(workspace_id, 'viewer') );

create policy "auto_stop_events_mutate_member" on public.auto_stop_events
  for all using ( app.is_member(workspace_id, 'member') )
  with check ( app.is_member(workspace_id, 'member') );

-- Providers (member+ IUD, viewer select)
alter table if exists public.providers enable row level security;
create policy "providers_select_member" on public.providers
  for select using ( app.is_member(workspace_id, 'viewer') );

create policy "providers_mutate_member" on public.providers
  for all using ( app.is_member(workspace_id, 'member') )
  with check ( app.is_member(workspace_id, 'member') );

-- Domain risk (member+ IUD, viewer select)
alter table if exists public.domain_risk enable row level security;
create policy "domain_risk_select_member" on public.domain_risk
  for select using ( app.is_member(workspace_id, 'viewer') );

create policy "domain_risk_mutate_member" on public.domain_risk
  for all using ( app.is_member(workspace_id, 'member') )
  with check ( app.is_member(workspace_id, 'member') );

-- Mailboxes (member+ IUD, viewer select)
alter table if exists public.mailboxes enable row level security;
create policy "mailboxes_select_member" on public.mailboxes
  for select using ( app.is_member(workspace_id, 'viewer') );

create policy "mailboxes_mutate_member" on public.mailboxes
  for all using ( app.is_member(workspace_id, 'member') )
  with check ( app.is_member(workspace_id, 'member') );

-- Domain daily usage (member+ IUD, viewer select)
alter table if exists public.domain_daily_usage enable row level security;
create policy "domain_daily_usage_select_member" on public.domain_daily_usage
  for select using ( app.is_member(workspace_id, 'viewer') );

create policy "domain_daily_usage_mutate_member" on public.domain_daily_usage
  for all using ( app.is_member(workspace_id, 'member') )
  with check ( app.is_member(workspace_id, 'member') );

-- 12) Create indexes for performance
create index if not exists idx_workspace_members_workspace_role on public.workspace_members(workspace_id, role);
create index if not exists idx_workspace_invites_workspace_email on public.workspace_invites(workspace_id, email);
create index if not exists idx_workspace_invites_token on public.workspace_invites(token);

-- 13) Backfill: ensure all users have a personal workspace
select app.ensure_personal_workspace() from auth.users;

-- 14) Grant necessary permissions
grant usage on schema public to authenticated;
grant all on public.workspaces to authenticated;
grant all on public.workspace_members to authenticated;
grant all on public.workspace_invites to authenticated;
grant all on public.contacts to authenticated;
grant all on public.campaigns to authenticated;
grant all on public.campaign_contacts to authenticated;
grant all on public.sequences to authenticated;
grant all on public.sequence_steps to authenticated;
grant all on public.sequence_subscribers to authenticated;
grant all on public.send_policies to authenticated;
grant all on public.send_counters to authenticated;
grant all on public.sending_audit to authenticated;
grant all on public.delivery_events to authenticated;
grant all on public.open_events to authenticated;
grant all on public.click_events to authenticated;
grant all on public.tracking_events to authenticated;
grant all on public.suppressions to authenticated;
grant all on public.unsubscribe_tokens to authenticated;
grant all on public.inbound_messages to authenticated;
grant all on public.reply_intents to authenticated;
grant all on public.auto_stop_events to authenticated;
grant all on public.providers to authenticated;
grant all on public.domain_risk to authenticated;
grant all on public.mailboxes to authenticated;
grant all on public.domain_daily_usage to authenticated; 