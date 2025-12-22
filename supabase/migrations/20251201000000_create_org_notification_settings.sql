-- =========================================================
-- Block 21388 — SmartSend Weekly Roofing Hot Jobs Email Summary
-- Create notification settings table for organizations
-- =========================================================

create table if not exists public.organization_notification_settings (
  org_id uuid primary key references public.organizations (id) on delete cascade,

  weekly_hot_jobs_enabled boolean not null default true,
  weekly_hot_jobs_email text, -- if null, fall back to org owner email

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_timestamp_org_notification_settings()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_org_notification_settings_set_timestamp
  on public.organization_notification_settings;

create trigger trg_org_notification_settings_set_timestamp
before update on public.organization_notification_settings
for each row execute procedure public.set_timestamp_org_notification_settings();

alter table public.organization_notification_settings enable row level security;

-- Helper function to check org membership
create or replace function public.is_org_member(_org_id uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from public.org_members
    where org_id = _org_id and user_id = auth.uid()
  );
$$;

create policy "org members can read their notification settings"
on public.organization_notification_settings
for select
using ( public.is_org_member(org_id) );

create policy "org members can update their notification settings"
on public.organization_notification_settings
for update
using ( public.is_org_member(org_id) )
with check ( public.is_org_member(org_id) );

comment on table public.organization_notification_settings is 'Settings for organization-level notifications, including weekly hot jobs email summaries';
comment on column public.organization_notification_settings.weekly_hot_jobs_enabled is 'Whether to send weekly hot jobs email summary';
comment on column public.organization_notification_settings.weekly_hot_jobs_email is 'Email address to send weekly hot jobs summary to. If null, falls back to org owner email';

