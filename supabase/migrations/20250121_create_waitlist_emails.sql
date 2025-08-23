create table if not exists public.waitlist_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  type text not null,                 -- 'welcome', 'case_study', 'trial_invite'
  sent_at timestamptz default now(),
  unique (email, type)
);

-- Add index for performance
create index if not exists idx_waitlist_emails_email_type on public.waitlist_emails(email, type);
create index if not exists idx_waitlist_emails_sent_at on public.waitlist_emails(sent_at); 