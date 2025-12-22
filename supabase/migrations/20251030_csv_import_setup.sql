-- CSV Import Setup: Unique constraint and storage bucket for error CSVs

-- Ensure unique per campaign (using index if constraint not applicable)
create unique index if not exists leads_campaign_email_uniq_idx on public.leads (campaign_id, lower(email)) where campaign_id is not null;
create index if not exists leads_campaign_idx on public.leads (campaign_id);

-- Storage bucket for uploads and error CSVs
insert into storage.buckets (id, name, public) values ('app-uploads', 'app-uploads', false)
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

-- Allow service role to manage storage (for error CSV generation)
create policy if not exists "service role can manage uploads" on storage.objects
for all to service_role
using (bucket_id = 'app-uploads');

