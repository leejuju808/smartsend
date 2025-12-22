-- Block 13200: File Attachments v1
-- Upload + Store Estimates, Photos, PDFs to Contact Profile & Pipeline
-- This block gives SmartSend the ability to store job files, making it a full CRM hub

-- ============================================================================
-- 1. CREATE ATTACHMENTS TABLE
-- ============================================================================

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_type text not null, -- 'image/jpeg', 'application/pdf', etc.
  file_size int not null, -- bytes
  storage_path text not null, -- path in storage bucket
  linked_to text, -- null, 'inspection', 'estimate', 'job_won', etc.
  created_at timestamptz default now(),
  
  -- Constraints
  constraint attachments_file_size_positive check (file_size > 0),
  constraint attachments_storage_path_not_empty check (length(storage_path) > 0)
);

-- Indexes for fast lookup
create index if not exists attachments_contact_idx on public.attachments(contact_id);
create index if not exists attachments_org_idx on public.attachments(org_id);
create index if not exists attachments_user_idx on public.attachments(user_id);
create index if not exists attachments_linked_to_idx on public.attachments(linked_to) where linked_to is not null;
create index if not exists attachments_created_at_idx on public.attachments(created_at desc);

-- ============================================================================
-- 2. ADD STORAGE_USED TO ORGANIZATIONS TABLE
-- ============================================================================

alter table public.organizations
  add column if not exists storage_used bigint default 0 check (storage_used >= 0);

create index if not exists idx_organizations_storage_used on public.organizations(storage_used);

-- ============================================================================
-- 3. ENABLE RLS ON ATTACHMENTS
-- ============================================================================

alter table public.attachments enable row level security;

-- View attachments: org members can view attachments for contacts in their org
create policy "attachments_view_org_members" on public.attachments
  for select using (
    exists (
      select 1 from public.org_memberships
      where org_id = attachments.org_id
        and user_id = auth.uid()
        and status = 'active'
    )
  );

-- Insert attachments: org members with upload permission (owner, manager, staff)
create policy "attachments_insert_org_members" on public.attachments
  for insert with check (
    exists (
      select 1 from public.org_memberships
      where org_id = attachments.org_id
        and user_id = auth.uid()
        and status = 'active'
        and role in ('owner', 'manager', 'staff')
    )
  );

-- Update attachments: org members with upload permission
create policy "attachments_update_org_members" on public.attachments
  for update using (
    exists (
      select 1 from public.org_memberships
      where org_id = attachments.org_id
        and user_id = auth.uid()
        and status = 'active'
        and role in ('owner', 'manager', 'staff')
    )
  );

-- Delete attachments: only owner and manager can delete
create policy "attachments_delete_owner_manager" on public.attachments
  for delete using (
    exists (
      select 1 from public.org_memberships
      where org_id = attachments.org_id
        and user_id = auth.uid()
        and status = 'active'
        and role in ('owner', 'manager')
    )
  );

-- Service role can do everything
create policy "attachments_service_role_full_access" on public.attachments
  for all to service_role
  using (true)
  with check (true);

-- ============================================================================
-- 4. HELPER FUNCTION TO UPDATE STORAGE_USED
-- ============================================================================

create or replace function public.update_org_storage_used()
returns trigger
language plpgsql
security definer
as $$
begin
  if TG_OP = 'INSERT' then
    update public.organizations
    set storage_used = storage_used + NEW.file_size
    where id = NEW.org_id;
    return NEW;
  elsif TG_OP = 'DELETE' then
    update public.organizations
    set storage_used = storage_used - OLD.file_size
    where id = OLD.org_id;
    return OLD;
  elsif TG_OP = 'UPDATE' then
    -- Handle file size changes
    update public.organizations
    set storage_used = storage_used - OLD.file_size + NEW.file_size
    where id = NEW.org_id;
    return NEW;
  end if;
  return NULL;
end;
$$;

-- Trigger to automatically update storage_used
drop trigger if exists trg_update_org_storage_used on public.attachments;
create trigger trg_update_org_storage_used
  after insert or update or delete on public.attachments
  for each row execute function public.update_org_storage_used();

-- ============================================================================
-- 5. HELPER FUNCTION TO GET STORAGE LIMIT BY PLAN
-- ============================================================================

create or replace function public.get_storage_limit(p_plan_tier text)
returns bigint
language sql
immutable
as $$
  select case p_plan_tier
    when 'starter' then 1073741824::bigint -- 1GB
    when 'growth' then 5368709120::bigint -- 5GB
    when 'domination' then 21474836480::bigint -- 20GB
    else 1073741824::bigint -- default to 1GB
  end;
$$;

-- ============================================================================
-- 6. HELPER FUNCTION TO CHECK STORAGE LIMIT
-- ============================================================================

create or replace function public.check_storage_limit(p_org_id uuid, p_file_size bigint)
returns boolean
language plpgsql
security definer
as $$
declare
  v_storage_used bigint;
  v_storage_limit bigint;
  v_plan_tier text;
begin
  select storage_used, plan_tier into v_storage_used, v_plan_tier
  from public.organizations
  where id = p_org_id;
  
  if v_storage_used is null then
    v_storage_used := 0;
  end if;
  
  v_storage_limit := public.get_storage_limit(coalesce(v_plan_tier, 'starter'));
  
  return (v_storage_used + p_file_size) <= v_storage_limit;
end;
$$;

-- ============================================================================
-- 7. CREATE STORAGE BUCKET
-- ============================================================================

-- Create storage bucket: attachments
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false, -- private bucket
  10485760, -- 10 MB limit per file
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', -- docx
    'application/msword' -- doc
  ]
)
on conflict (id) do nothing;

-- Storage policies for the attachments bucket
-- Policy: Users can upload to their org/contact folder
create policy "attachments_users_can_upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'attachments'
    and exists (
      select 1 from public.org_memberships
      where org_id::text = (storage.foldername(name))[1]
        and user_id = auth.uid()
        and status = 'active'
        and role in ('owner', 'manager', 'staff')
    )
  );

-- Policy: Users can read files in their org
create policy "attachments_users_can_read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'attachments'
    and exists (
      select 1 from public.org_memberships
      where org_id::text = (storage.foldername(name))[1]
        and user_id = auth.uid()
        and status = 'active'
    )
  );

-- Policy: Users can delete files (owner/manager only)
create policy "attachments_users_can_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'attachments'
    and exists (
      select 1 from public.org_memberships
      where org_id::text = (storage.foldername(name))[1]
        and user_id = auth.uid()
        and status = 'active'
        and role in ('owner', 'manager')
    )
  );

-- Service role can do everything
create policy "attachments_service_role_full_access"
  on storage.objects
  for all
  to service_role
  using (bucket_id = 'attachments')
  with check (bucket_id = 'attachments');

