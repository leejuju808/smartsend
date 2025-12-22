-- Block 9800 — Settings & Workspace Config
-- Organization Settings, Sending Domains, Team Roles, Billing, Preferences

-- ============================================================================
-- 1. Organization Settings Table
-- ============================================================================

create table if not exists public.org_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  business_name text,
  industry text default 'Roofing',
  logo_url text,
  business_address text,
  timezone text default 'America/Los_Angeles',
  default_lead_status text default 'new',
  default_task_offset_hours int default 24,
  notification_hot_lead boolean default true,
  notification_reply boolean default true,
  notification_task_due boolean default true,
  notification_campaign_error boolean default true,
  default_task_reminder_hours int default 9, -- e.g., 9 AM next day
  default_contact_view text default 'table', -- 'table' or 'card'
  default_reply_inbox_sort text default 'newest', -- 'newest' or 'intent'
  default_work_hours_start time default '09:00:00',
  default_work_hours_end time default '17:00:00',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_org_settings_org on public.org_settings(org_id);

-- Trigger to update updated_at
create or replace function update_org_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_update_org_settings_updated_at on public.org_settings;
create trigger trg_update_org_settings_updated_at
  before update on public.org_settings
  for each row
  execute function update_org_settings_updated_at();

-- ============================================================================
-- 2. Email Credentials Table (for OAuth Gmail/Outlook)
-- ============================================================================

create table if not exists public.email_credentials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('gmail', 'outlook')),
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  email_address text not null,
  display_name text,
  verified boolean default false,
  daily_send_limit int default 500,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_email_credentials_org on public.email_credentials(org_id);
create index if not exists idx_email_credentials_provider on public.email_credentials(provider);
create unique index if not exists idx_email_credentials_org_provider_email on public.email_credentials(org_id, provider, email_address);

-- Trigger to update updated_at
drop trigger if exists trg_update_email_credentials_updated_at on public.email_credentials;
create trigger trg_update_email_credentials_updated_at
  before update on public.email_credentials
  for each row
  execute function update_org_settings_updated_at();

-- ============================================================================
-- 3. Update org_memberships to support required roles
-- ============================================================================

-- Ensure role constraint includes 'owner', 'manager', 'agent'
-- Note: The existing table may already have different roles, so we'll add a check
do $$
begin
  -- Add check constraint if it doesn't exist
  if not exists (
    select 1 from pg_constraint 
    where conname = 'org_memberships_role_check' 
    and conrelid = 'public.org_memberships'::regclass
  ) then
    alter table public.org_memberships
      add constraint org_memberships_role_check 
      check (role in ('owner', 'admin', 'manager', 'member', 'agent', 'viewer'));
  end if;
end $$;

-- Add invited_at and accepted_at columns if they don't exist
alter table public.org_memberships
  add column if not exists invited_at timestamptz,
  add column if not exists accepted_at timestamptz;

-- ============================================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================================

alter table public.org_settings enable row level security;
alter table public.email_credentials enable row level security;

-- Org Settings: Members can read, owners/admins can update
drop policy if exists "org_members_read_settings" on public.org_settings;
create policy "org_members_read_settings" on public.org_settings
  for select using (
    exists(
      select 1 from public.org_memberships m
      where m.org_id = org_settings.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
    )
  );

drop policy if exists "org_owners_admins_update_settings" on public.org_settings;
create policy "org_owners_admins_update_settings" on public.org_settings
  for update using (
    exists(
      select 1 from public.org_memberships m
      where m.org_id = org_settings.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin', 'manager')
    )
  );

drop policy if exists "org_owners_admins_insert_settings" on public.org_settings;
create policy "org_owners_admins_insert_settings" on public.org_settings
  for insert with check (
    exists(
      select 1 from public.org_memberships m
      where m.org_id = org_settings.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin', 'manager')
    )
  );

-- Email Credentials: Members can read, owners/admins can manage
drop policy if exists "org_members_read_email_credentials" on public.email_credentials;
create policy "org_members_read_email_credentials" on public.email_credentials
  for select using (
    exists(
      select 1 from public.org_memberships m
      where m.org_id = email_credentials.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
    )
  );

drop policy if exists "org_owners_admins_manage_email_credentials" on public.email_credentials;
create policy "org_owners_admins_manage_email_credentials" on public.email_credentials
  for all using (
    exists(
      select 1 from public.org_memberships m
      where m.org_id = email_credentials.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin', 'manager')
    )
  ) with check (
    exists(
      select 1 from public.org_memberships m
      where m.org_id = email_credentials.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin', 'manager')
    )
  );

-- ============================================================================
-- 5. Helper Functions
-- ============================================================================

-- Get org settings (with defaults)
create or replace function public.get_org_settings(p_org_id uuid)
returns table (
  org_id uuid,
  business_name text,
  industry text,
  logo_url text,
  business_address text,
  timezone text,
  default_lead_status text,
  default_task_offset_hours int,
  notification_hot_lead boolean,
  notification_reply boolean,
  notification_task_due boolean,
  notification_campaign_error boolean,
  default_task_reminder_hours int,
  default_contact_view text,
  default_reply_inbox_sort text,
  default_work_hours_start time,
  default_work_hours_end time
) language sql stable as $$
  select 
    coalesce(s.org_id, p_org_id) as org_id,
    s.business_name,
    coalesce(s.industry, 'Roofing') as industry,
    s.logo_url,
    s.business_address,
    coalesce(s.timezone, 'America/Los_Angeles') as timezone,
    coalesce(s.default_lead_status, 'new') as default_lead_status,
    coalesce(s.default_task_offset_hours, 24) as default_task_offset_hours,
    coalesce(s.notification_hot_lead, true) as notification_hot_lead,
    coalesce(s.notification_reply, true) as notification_reply,
    coalesce(s.notification_task_due, true) as notification_task_due,
    coalesce(s.notification_campaign_error, true) as notification_campaign_error,
    coalesce(s.default_task_reminder_hours, 9) as default_task_reminder_hours,
    coalesce(s.default_contact_view, 'table') as default_contact_view,
    coalesce(s.default_reply_inbox_sort, 'newest') as default_reply_inbox_sort,
    coalesce(s.default_work_hours_start, '09:00:00'::time) as default_work_hours_start,
    coalesce(s.default_work_hours_end, '17:00:00'::time) as default_work_hours_end
  from public.organizations o
  left join public.org_settings s on s.org_id = o.id
  where o.id = p_org_id;
$$;

grant execute on function public.get_org_settings(uuid) to authenticated;

-- Check if user is org owner or admin
create or replace function public.is_org_owner_or_admin(p_org_id uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from public.org_memberships
    where org_id = p_org_id
    and user_id = auth.uid()
    and status = 'active'
    and role in ('owner', 'admin', 'manager')
  );
$$;

grant execute on function public.is_org_owner_or_admin(uuid) to authenticated;

-- ============================================================================
-- 6. Comments
-- ============================================================================

comment on table public.org_settings is 'Organization workspace settings and preferences';
comment on table public.email_credentials is 'OAuth email credentials for Gmail/Outlook sending';
comment on function public.get_org_settings(uuid) is 'Get org settings with defaults';
comment on function public.is_org_owner_or_admin(uuid) is 'Check if user is owner/admin/manager of org';





























































