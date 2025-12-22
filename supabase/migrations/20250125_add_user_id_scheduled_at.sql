-- Add user_id and scheduled_at fields to email_jobs table
-- scheduled_at replaces scheduled_for for consistency with user requirements

-- Add user_id field (references auth.users)
alter table public.email_jobs
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Add scheduled_at field (rename from scheduled_for for consistency)
alter table public.email_jobs
  add column if not exists scheduled_at timestamptz;

-- Migrate existing scheduled_for data to scheduled_at
update public.email_jobs 
set scheduled_at = scheduled_for 
where scheduled_at is null and scheduled_for is not null;

-- Make scheduled_at not null after migration
alter table public.email_jobs
  alter column scheduled_at set not null;

-- Update the index to use scheduled_at instead of scheduled_for
drop index if exists email_jobs_status_scheduled_idx;
create index if not exists email_jobs_due_idx
  on public.email_jobs (status, scheduled_at);

-- Update RLS policy to include user_id check
drop policy if exists "users can read their workspace jobs" on public.email_jobs;
create policy "own rows" on public.email_jobs
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);