-- Create email_sends table for tracking delivery status
create table if not exists public.email_sends (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.email_jobs(id) on delete cascade,
  provider_id text,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.email_sends enable row level security;

-- Service role can do anything
create policy "service role full on email_sends"
on public.email_sends
as permissive
for all
to service_role
using (true)
with check (true);

-- Users can read their own sends through job relationship
create policy "users read own sends"
on public.email_sends
for select
to authenticated
using (
  exists (
    select 1 from public.email_jobs j 
    where j.id = email_sends.job_id 
    and j.user_id = auth.uid()
  )
);

-- Create indexes for performance
create index if not exists email_sends_job_idx on public.email_sends(job_id);
create index if not exists email_sends_provider_idx on public.email_sends(provider_id);
create index if not exists email_sends_delivered_idx on public.email_sends(delivered_at);