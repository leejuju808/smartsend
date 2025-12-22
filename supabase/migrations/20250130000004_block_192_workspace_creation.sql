-- Block 192 — Guided Workspace Creation
-- Extends workspaces schema with branding + sending defaults
-- Creates workspace_settings key-value table
-- Sets up storage bucket for workspace logos

-- 192.1 — Extend public.workspaces schema
-- Note: name column already exists, so we skip it
alter table public.workspaces
add column if not exists slug text,
add column if not exists logo_url text,
add column if not exists sending_timezone text default 'America/Los_Angeles',
add column if not exists default_daily_send_cap integer default 200,
add column if not exists default_sending_window_start time default '08:00',
add column if not exists default_sending_window_end time default '17:00';

-- Optional: index on slug for future multi-workspace routing
create unique index if not exists workspaces_slug_unique
on public.workspaces (slug)
where slug is not null;

-- 192.2 — Workspace settings seed table (key-value style)
-- Note: There's already a workspace_settings table with different structure
-- We'll create a new one with key-value pairs for onboarding settings
create table if not exists public.workspace_settings_kv (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists workspace_settings_kv_workspace_id_idx
on public.workspace_settings_kv (workspace_id);

create unique index if not exists workspace_settings_kv_workspace_key_unique
on public.workspace_settings_kv (workspace_id, key);

-- RLS for workspace_settings_kv
alter table public.workspace_settings_kv enable row level security;

create policy "workspace_settings_kv_select"
on public.workspace_settings_kv
for select
to authenticated
using (
  exists (
    select 1 from public.workspace_members
    where workspace_id = workspace_settings_kv.workspace_id
    and user_id = auth.uid()
  )
);

create policy "workspace_settings_kv_insert"
on public.workspace_settings_kv
for insert
to authenticated
with check (
  exists (
    select 1 from public.workspace_members
    where workspace_id = workspace_settings_kv.workspace_id
    and user_id = auth.uid()
    and role in ('owner', 'admin')
  )
);

create policy "workspace_settings_kv_update"
on public.workspace_settings_kv
for update
to authenticated
using (
  exists (
    select 1 from public.workspace_members
    where workspace_id = workspace_settings_kv.workspace_id
    and user_id = auth.uid()
    and role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1 from public.workspace_members
    where workspace_id = workspace_settings_kv.workspace_id
    and user_id = auth.uid()
    and role in ('owner', 'admin')
  )
);

-- 192.3 — Storage bucket for workspace logo
-- Create bucket workspace-assets (public read ok, writes locked via RLS)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'workspace-assets',
  'workspace-assets',
  true, -- public read
  5242880, -- 5 MB limit
  array['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml']
)
on conflict (id) do nothing;

-- Storage policies for workspace-assets bucket
-- Upload policy: authenticated users can upload to their workspace folder
create policy "workspace_logo_upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'workspace-assets'
  and (storage.foldername(name))[1] in (
    select id::text from public.workspaces
    where id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
      and role in ('owner', 'admin')
    )
  )
);

-- Update policy: authenticated users can update their workspace logo
create policy "workspace_logo_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'workspace-assets'
  and (storage.foldername(name))[1] in (
    select id::text from public.workspaces
    where id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
      and role in ('owner', 'admin')
    )
  )
)
with check (
  bucket_id = 'workspace-assets'
  and (storage.foldername(name))[1] in (
    select id::text from public.workspaces
    where id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
      and role in ('owner', 'admin')
    )
  )
);

-- Select policy: public read for workspace logos
create policy "workspace_logo_select"
on storage.objects
for select
to public
using (bucket_id = 'workspace-assets');

-- Update onboarding_step constraint to include 'workspace' step
alter table public.workspaces
drop constraint if exists workspaces_onboarding_step_check;

alter table public.workspaces
add constraint workspaces_onboarding_step_check
check (onboarding_step in ('welcome', 'workspace', 'connect_email', 'first_upload', 'map_columns', 'import_preview', 'finished'));

