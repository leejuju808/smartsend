-- Enum for high-signal triage labels
do $$ begin
  create type triage_label as enum ('interested','not_now','meeting_request','pricing','unsubscribe','other');
exception when duplicate_object then null; end $$;

-- Add columns on threads to hold the latest triage decision
alter table public.threads
  add column if not exists triage triage_label default null,
  add column if not exists triage_score numeric(3,2),
  add column if not exists last_triage_at timestamptz;

-- Optional: per-email triage (useful for audits)
create table if not exists public.email_triage (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null,
  email_id uuid not null references public.emails(id) on delete cascade,
  label triage_label not null,
  score numeric(3,2) not null,
  created_at timestamptz not null default now()
);
alter table public.email_triage enable row level security;

create policy "members read triage"
on public.email_triage for select
using (exists (select 1 from public.emails e
               where e.id = email_triage.email_id
                 and is_member(e.project_id)));

create policy "insert triage (worker)"
on public.email_triage for insert with check (true);

