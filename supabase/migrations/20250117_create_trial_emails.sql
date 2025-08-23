-- Create trial_emails table to track trial expired email sends
create table if not exists public.trial_emails (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  type text not null check (type in ('trial_expired')),
  created_at timestamptz default now(),
  unique(user_id, type)
);

-- Add index for performance
create index if not exists idx_trial_emails_user_type on public.trial_emails(user_id, type);
create index if not exists idx_trial_emails_created_at on public.trial_emails(created_at); 