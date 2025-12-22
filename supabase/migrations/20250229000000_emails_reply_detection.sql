-- SmartSend: Emails table with reply detection fields
-- Extends emails table with message_id, thread_id, has_replied, last_reply_at, lead_name, user_id

-- Ensure emails table exists with all required columns
alter table if exists public.emails add column if not exists message_id text;
alter table if exists public.emails add column if not exists thread_id text;
alter table if exists public.emails add column if not exists has_replied boolean default false;
alter table if exists public.emails add column if not exists last_reply_at timestamptz;
alter table if exists public.emails add column if not exists lead_name text;
alter table if exists public.emails add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- If emails table doesn't exist yet, create it
create table if not exists public.emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  lead_name text,
  subject text,
  body_html text,
  body_text text,
  message_id text,              -- Provider Message-ID when sent
  thread_id text,               -- Provider thread_id (Gmail/Outlook)
  has_replied boolean default false,
  last_reply_at timestamptz,
  status text default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for efficient lookups
create index if not exists idx_emails_message_id on public.emails(message_id);
create index if not exists idx_emails_thread_id on public.emails(thread_id);
create index if not exists idx_emails_user_id on public.emails(user_id);
create index if not exists idx_emails_has_replied on public.emails(has_replied);
create index if not exists idx_emails_last_reply_at on public.emails(last_reply_at desc nulls last);

-- Enable RLS
alter table public.emails enable row level security;

-- RLS policies: users can only see their own emails
create policy "users_select_own_emails" on public.emails
  for select to authenticated
  using (auth.uid() = user_id);

-- Service role can manage all emails (for webhooks/edge functions)
create policy "service_role_manages_emails" on public.emails
  for all to service_role
  using (true) with check (true);

