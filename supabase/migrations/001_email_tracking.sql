-- Email tracking events table
-- Run this in Supabase SQL editor

-- Create email_events table
create table if not exists email_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  job_id uuid references send_jobs(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  sequence_id uuid references sequences(id) on delete set null,
  enrollment_id uuid references sequence_enrollments(id) on delete set null,
  type text not null check (type in ('open','click')),
  url text,                 -- for clicks
  user_agent text,
  ip inet,
  created_at timestamptz default now()
);

-- Create indexes for performance
create index if not exists idx_email_events_org_time on email_events(org_id, created_at desc);
create index if not exists idx_email_events_job on email_events(job_id);
create index if not exists idx_email_events_type on email_events(type);
create index if not exists idx_email_events_created_at on email_events(created_at desc);