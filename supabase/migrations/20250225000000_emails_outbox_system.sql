-- Emails Outbox System with Settings and RPCs
-- This creates send_settings, emails_outbox tables, and helper functions

-- Per-user sending settings (safe defaults)
create table if not exists public.send_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'gmail',              -- 'gmail' | 'outlook' (future)
  max_per_hour int not null default 50,                -- throttle
  daily_cap int not null default 200,
  timezone text not null default 'America/Los_Angeles',
  from_name text,
  from_email text,                                     -- optional override
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Outbox queue
create table if not exists public.emails_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  subject text not null,
  html text,                  -- one of html or text required
  text text,
  to_email text not null,
  to_name text,
  campaign_id uuid references public.campaigns(id) on delete set null,
  scheduled_at timestamptz not null default now(),     -- when it becomes sendable
  run_at timestamptz,                                   -- backoff next attempt
  attempts int not null default 0,
  max_attempts int not null default 3,
  status text not null default 'queued',                -- queued|sending|sent|failed|cancelled
  last_error text,
  sent_at timestamptz,
  message_id text,                                      -- Gmail message id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for emails_outbox
create index if not exists emails_outbox_user_sched_idx
  on public.emails_outbox (user_id, status, scheduled_at);
create index if not exists emails_outbox_run_idx
  on public.emails_outbox (status, run_at nulls first, scheduled_at);

-- RLS
alter table public.send_settings enable row level security;
alter table public.emails_outbox enable row level security;

-- RLS policies for send_settings
drop policy if exists "owner read write send_settings" on public.send_settings;
create policy "owner read write send_settings"
on public.send_settings for all
to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- RLS policies for emails_outbox
drop policy if exists "owner read outbox" on public.emails_outbox;
create policy "owner read outbox"
on public.emails_outbox for select
to authenticated using (user_id = auth.uid());

-- Inserts come from app and worker (service role). Allow user inserts of their own rows:
drop policy if exists "owner insert outbox" on public.emails_outbox;
create policy "owner insert outbox"
on public.emails_outbox for insert
to authenticated with check (user_id = auth.uid());

-- Service role can read and update all rows (for worker)
drop policy if exists "service write outbox" on public.emails_outbox;
create policy "service write outbox"
on public.emails_outbox for all
to service_role using (true) with check (true);

-- Count sent in the last hour and today
create or replace function public.sending_window_counts(p_user uuid)
returns table(hour int, day int) language sql as $$
  select
    count(*) filter (where sent_at >= now() - interval '1 hour') as hour,
    count(*) filter (where sent_at::date = now()::date) as day
  from public.emails_outbox
  where user_id = p_user and status = 'sent';
$$;

-- Atomically claim due jobs
create or replace function public.claim_outbox_batch(p_limit int)
returns setof public.emails_outbox
language plpgsql security definer as $$
declare
  r public.emails_outbox%rowtype;
begin
  for r in
    select * from public.emails_outbox
    where status = 'queued'
      and (run_at is null or run_at <= now())
      and scheduled_at <= now()
    order by scheduled_at asc
    limit p_limit
    for update skip locked
  loop
    update public.emails_outbox set status = 'sending' where id = r.id;
    return next r;
  end loop;
  return;
end;
$$;

-- Grant execute permission to service role
grant execute on function public.sending_window_counts(uuid) to service_role;
grant execute on function public.claim_outbox_batch(int) to service_role;

-- Ensure user_connections has email_address column
alter table if exists public.user_connections 
  add column if not exists email_address text;

