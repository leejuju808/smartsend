-- Storage bucket for CSV imports and error reports
insert into storage.buckets (id, name, public)
values ('app-uploads', 'app-uploads', false)
on conflict (id) do nothing;

-- RLS: allow authenticated users to upload into their own prefix
create policy if not exists "uploads owners can write" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'app-uploads'
  and (storage.foldername(name))[1] = 'imports'
);

create policy if not exists "owners can read their own files" on storage.objects
for select to authenticated
using (
  bucket_id = 'app-uploads'
);

create policy if not exists "owners can delete their own files" on storage.objects
for delete to authenticated
using (
  bucket_id = 'app-uploads'
);

-- Service role can do everything for edge functions
create policy if not exists "service role full access" on storage.objects
for all to service_role
using (true)
with check (true);

