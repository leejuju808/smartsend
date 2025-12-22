-- Suppression System Migration
-- Global suppression tables (scope by user_id for per-user campaigns, or use workspace_id if team-shared)

-- 1) Suppressed emails table
create table if not exists public.suppressed_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email citext not null,
  reason text not null, -- 'bounce','complaint','manual','seed','role'
  source text,          -- 'provider', 'gmail_webhook', 'import', etc.
  created_at timestamptz not null default now(),
  unique (user_id, email)
);

-- 2) Suppressed domains table
create table if not exists public.suppressed_domains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  domain citext not null,
  reason text not null, -- 'complaint_cluster','manual','seed','role'
  source text,
  created_at timestamptz not null default now(),
  unique (user_id, domain)
);

-- 3) Speed lookups in sender path
create index if not exists idx_supp_email_user_email on public.suppressed_emails(user_id, email);
create index if not exists idx_supp_domain_user_domain on public.suppressed_domains(user_id, domain);

-- 4) Tie bounces/complaints to suppression via indexes (optional MVP uses edge function)
-- Ensure bounce_logs and complaint_logs tables exist and have lead_id
create index if not exists idx_bounces_lead on public.bounce_logs(lead_id, created_at desc);
create index if not exists idx_complaints_lead on public.complaint_logs(lead_id, created_at desc);

-- 5) RLS policies for suppressed_emails
alter table public.suppressed_emails enable row level security;

create policy "suppressed_emails read own" on public.suppressed_emails
  for select using (auth.uid() = user_id);

create policy "suppressed_emails insert own" on public.suppressed_emails
  for insert with check (auth.uid() = user_id);

create policy "suppressed_emails delete own" on public.suppressed_emails
  for delete using (auth.uid() = user_id);

-- 6) RLS policies for suppressed_domains
alter table public.suppressed_domains enable row level security;

create policy "suppressed_domains read own" on public.suppressed_domains
  for select using (auth.uid() = user_id);

create policy "suppressed_domains insert own" on public.suppressed_domains
  for insert with check (auth.uid() = user_id);

create policy "suppressed_domains delete own" on public.suppressed_domains
  for delete using (auth.uid() = user_id);

-- 7) Service role can manage suppressions (for webhooks)
create policy "suppressed_emails service role" on public.suppressed_emails
  for all to service_role using (true) with check (true);

create policy "suppressed_domains service role" on public.suppressed_domains
  for all to service_role using (true) with check (true);

