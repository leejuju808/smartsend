-- CSV Lead Import Complete Migration
-- This migration ensures all necessary columns, constraints, and storage setup for CSV import

-- 1) Add attempts and max_attempts columns to leads if they don't exist
alter table public.leads 
  add column if not exists attempts int not null default 0,
  add column if not exists max_attempts int not null default 3;

-- 2) Add user_id if it doesn't exist (some schemas might not have it)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'user_id') then
    alter table public.leads add column user_id uuid references auth.users(id) on delete cascade;
  end if;
end $$;

-- 3) Ensure campaign_id exists
alter table public.leads 
  add column if not exists campaign_id uuid;

-- 4) Add missing status values to check constraint
alter table public.leads 
  drop constraint if exists leads_status_check;
  
alter table public.leads 
  add constraint leads_status_check 
  check (status in ('new', 'queued', 'sending', 'sent', 'failed', 'replied', 'bounced', 'unsubscribed'));

-- 5) Create unique constraint per campaign + email (case-insensitive)
drop index if exists leads_campaign_email_uniq;
create unique index if not exists leads_campaign_email_uniq 
  on public.leads (campaign_id, lower(email)) 
  where campaign_id is not null;

-- Create separate unique index if campaign_id is null (user-level uniqueness)
drop index if exists leads_user_email_uniq;
create unique index if not exists leads_user_email_uniq 
  on public.leads (user_id, lower(email)) 
  where user_id is not null and campaign_id is null;

-- 6) Add necessary indexes for performance
create index if not exists leads_campaign_idx on public.leads(campaign_id);
create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_email_idx on public.leads(email);

-- 7) Storage bucket for uploads (idempotent)
insert into storage.buckets (id, name, public) 
values ('app-uploads', 'app-uploads', false)
on conflict (id) do nothing;

-- 8) Storage policies for RLS
drop policy if exists "uploads owners can write" on storage.objects;
create policy if not exists "uploads owners can write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'app-uploads'
    and (storage.foldername(name))[1] = 'imports'
  );

drop policy if exists "owners can read their own files" on storage.objects;
create policy if not exists "owners can read their own files" on storage.objects
  for select to authenticated
  using (bucket_id = 'app-uploads');

-- 9) Retry leads RPC function
create or replace function public.retry_leads(_lead_ids uuid[], _actor uuid)
returns int
language plpgsql
security definer
as $$
declare
  updated_count int := 0;
begin
  update public.leads l
  set status = 'queued', attempts = l.attempts + 1, updated_at = now()
  where l.id = any(_lead_ids)
    and l.status in ('failed', 'sending', 'bounced')
    and l.attempts < l.max_attempts;

  get diagnostics updated_count = row_count;

  return updated_count;
end;
$$;

grant execute on function public.retry_leads(uuid[], uuid) to authenticated;

-- 10) Helper function to normalize email on insert/update
create or replace function public.normalize_lead_email()
returns trigger language plpgsql as $$
begin
  if new.email is not null then 
    new.email := lower(trim(new.email)); 
  end if;
  return new;
end $$;

drop trigger if exists trg_leads_normalize_email on public.leads;
create trigger trg_leads_normalize_email
  before insert or update on public.leads
  for each row execute function public.normalize_lead_email();

-- 11) Ensure updated_at trigger exists
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_leads_updated_at on public.leads;
create trigger trg_leads_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- Done!

