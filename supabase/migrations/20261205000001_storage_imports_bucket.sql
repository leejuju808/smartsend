-- Storage bucket for lead import CSV files
insert into storage.buckets (id, name, public)
values ('imports', 'imports', false)
on conflict (id) do nothing;

-- RLS: allow authenticated users to upload into their own folder
create policy if not exists "imports users can write own files" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'imports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy if not exists "imports users can read own files" on storage.objects
for select to authenticated
using (
  bucket_id = 'imports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy if not exists "imports users can delete own files" on storage.objects
for delete to authenticated
using (
  bucket_id = 'imports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Service role can do everything for edge functions
create policy if not exists "imports service role full access" on storage.objects
for all to service_role
using (bucket_id = 'imports')
with check (bucket_id = 'imports');

