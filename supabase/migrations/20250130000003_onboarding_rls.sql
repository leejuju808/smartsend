-- Block 191.6 — RLS policy for onboarding import

-- Ensure RLS is enabled on leads table
alter table public.leads enable row level security;

-- Drop existing onboarding_import policy if it exists
drop policy if exists "onboarding_import" on public.leads;

-- Create policy for onboarding import
-- Allows authenticated users to insert leads with their workspace_id
create policy "onboarding_import"
on public.leads
for insert
to authenticated
with check (
  workspace_id in (
    select workspace_id 
    from public.workspace_members 
    where user_id = auth.uid()
  )
);

-- Ensure lead_uploads storage bucket exists
insert into storage.buckets (id, name, public)
values ('lead_uploads', 'lead_uploads', false)
on conflict (id) do nothing;

-- Drop existing policies if they exist
drop policy if exists "onboarding_upload_write" on storage.objects;
drop policy if exists "onboarding_upload_read" on storage.objects;

-- Policy for writing onboarding uploads
create policy "onboarding_upload_write"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'lead_uploads'
  and (storage.foldername(name))[1] in (
    select workspace_id::text 
    from public.workspace_members 
    where user_id = auth.uid()
  )
);

-- Policy for reading onboarding uploads
create policy "onboarding_upload_read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'lead_uploads'
  and (storage.foldername(name))[1] in (
    select workspace_id::text 
    from public.workspace_members 
    where user_id = auth.uid()
  )
);

