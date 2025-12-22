-- Create lists and email_jobs tables for campaign composer
-- This migration creates the missing tables needed by the campaign composer

-- Lists table for organizing contacts
create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Email jobs table for queuing emails
create table if not exists public.email_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid,
  to_email text not null,
  subject text not null,
  body_html text,
  body_text text,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  tracking_token text,
  from_email text,
  error_message text,
  created_at timestamptz not null default now()
);

-- Create indexes for performance
create index if not exists idx_lists_user_id on public.lists(user_id);
create index if not exists idx_email_jobs_user_id on public.email_jobs(user_id);
create index if not exists idx_email_jobs_status_scheduled on public.email_jobs(status, scheduled_at);
create index if not exists idx_email_jobs_campaign_id on public.email_jobs(campaign_id);

-- Enable RLS
alter table public.lists enable row level security;
alter table public.email_jobs enable row level security;

-- Create RLS policies
create policy "lists: users can manage their own lists"
  on public.lists for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "email_jobs: users can manage their own email jobs"
  on public.email_jobs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Create updated_at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin 
  new.updated_at = now(); 
  return new; 
end;
$$ language plpgsql security definer;

-- Apply updated_at trigger to lists table
drop trigger if exists lists_set_updated_at on public.lists;
create trigger lists_set_updated_at
  before update on public.lists
  for each row execute function public.set_updated_at();