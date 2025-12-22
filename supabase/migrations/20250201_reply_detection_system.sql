-- Reply Detection System: States, Fields, Queue, and Logs
-- This migration sets up the complete reply detection infrastructure

-- 1. Reply state enum
do $$ begin
  create type reply_state as enum ('none','suspected','confirmed');
exception when duplicate_object then null;
end $$;

-- 2. Lead-level reply tracking (on campaign_leads)
alter table if exists public.campaign_leads
  add column if not exists replied_at timestamptz,
  add column if not exists reply_state reply_state default 'none',
  add column if not exists last_incoming_at timestamptz;

-- Also add to leads table for consistency (if exists)
alter table if exists public.leads
  add column if not exists reply_state reply_state default 'none',
  add column if not exists last_incoming_at timestamptz;

-- 3. Email-level flags (on emails table)
alter table if exists public.emails
  add column if not exists is_reply boolean default false,       -- AI decision
  add column if not exists classification jsonb;                  -- raw classifier output

-- 4. Minimal job queue for new incoming emails
create table if not exists public.reply_jobs (
  id bigserial primary key,
  email_id uuid not null references public.emails(id) on delete cascade,
  status text not null default 'pending',         -- pending|processing|done|error
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(email_id)
);

create index if not exists idx_reply_jobs_status on public.reply_jobs(status) where status = 'pending';
create index if not exists idx_reply_jobs_created on public.reply_jobs(created_at);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists reply_jobs_set_updated_at on public.reply_jobs;
create trigger reply_jobs_set_updated_at
before update on public.reply_jobs
for each row execute function public.set_updated_at();

-- 5. Enqueue a job whenever we insert an incoming email
create or replace function public.enqueue_reply_job()
returns trigger language plpgsql as $$
begin
  if new.is_incoming is true then
    insert into public.reply_jobs (email_id)
    values (new.id)
    on conflict (email_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists emails_enqueue_reply_job on public.emails;
create trigger emails_enqueue_reply_job
after insert on public.emails
for each row execute function public.enqueue_reply_job();

-- 6. Campaign log helper (optional but useful in dashboards)
create table if not exists public.campaign_logs (
  id bigserial primary key,
  campaign_id uuid,
  lead_id uuid references public.leads(id) on delete set null,
  email_id uuid references public.emails(id) on delete set null,
  event text not null,            -- sent|bounce|open|click|incoming|reply_confirmed|reply_suspected
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_campaign_logs_campaign on public.campaign_logs(campaign_id);
create index if not exists idx_campaign_logs_lead on public.campaign_logs(lead_id);
create index if not exists idx_campaign_logs_event on public.campaign_logs(event);
create index if not exists idx_campaign_logs_created on public.campaign_logs(created_at desc);

-- RLS (quick)
-- Jobs are processed by edge function; app doesn't need client read
alter table public.reply_jobs enable row level security;

drop policy if exists "org can view own jobs" on public.reply_jobs;
create policy "org can view own jobs"
on public.reply_jobs for select
using (true);

-- Edge fn can mutate jobs (secure at function key boundary)
drop policy if exists "edge fn can mutate jobs" on public.reply_jobs;
create policy "edge fn can mutate jobs"
on public.reply_jobs for all
using (true) with check (true);

-- Campaign logs RLS (if needed, adjust to your auth model)
alter table public.campaign_logs enable row level security;

drop policy if exists "users can view own logs" on public.campaign_logs;
create policy "users can view own logs"
on public.campaign_logs for select
using (true);  -- Adjust based on your auth model

