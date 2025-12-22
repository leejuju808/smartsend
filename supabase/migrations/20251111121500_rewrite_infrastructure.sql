set search_path = public, pg_temp;

-- A) Shared resources config payload (Block 29 reference)
alter table if exists public.shared_resources
  add column if not exists config jsonb not null default '{}'::jsonb;

-- B) Rewrites log --------------------------------------------------------------
create table if not exists public.rewrite_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  input text not null,
  variables jsonb,
  preset_id uuid references public.shared_resources(id) on delete cascade,
  config jsonb not null,
  output text,
  status text not null default 'queued' check (status in ('queued','done','failed','blocked')),
  reason text
);

create index if not exists idx_rewrite_jobs_account_time
  on public.rewrite_jobs(account_id, created_at desc);

-- C) Token policy (allow-list) -------------------------------------------------
create table if not exists public.token_whitelist (
  token text primary key
);

insert into public.token_whitelist(token) values
  ('{{first_name}}'),('{{last_name}}'),('{{company}}'),('{{title}}'),
  ('{{sender.first_name}}'),('{{sender.signature}}'),
  ('{{meeting.link}}'),('{{unsubscribe.link}}')
on conflict do nothing;

-- D) Row level security -------------------------------------------------------
alter table if exists public.rewrite_jobs enable row level security;

drop policy if exists "rj_select_own" on public.rewrite_jobs;
create policy "rj_select_own" on public.rewrite_jobs
  for select using (
    account_id in (
      select account_id from public.team_members where user_id = auth.uid()
    )
  );

drop policy if exists "rj_insert_own" on public.rewrite_jobs;
create policy "rj_insert_own" on public.rewrite_jobs
  for insert with check (
    account_id in (
      select account_id from public.team_members where user_id = auth.uid()
    )
  );

drop policy if exists "rj_update_own" on public.rewrite_jobs;
create policy "rj_update_own" on public.rewrite_jobs
  for update using (user_id = auth.uid());

-- E) Rate limiting helpers ----------------------------------------------------
create extension if not exists pg_stat_statements;

create or replace view public.rewrite_usage_5m as
select user_id, count(*) as n
from public.rewrite_jobs
where created_at >= now() - interval '5 minutes'
group by user_id;

