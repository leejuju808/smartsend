-- Mail ingest schema: accounts, provider dedupe, webhook log, thread helpers

-- 1) Normalize mail_accounts to store OAuth + provider metadata
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'mail_accounts'
      and column_name = 'from_email'
  ) then
    alter table public.mail_accounts rename column from_email to email;
  end if;
exception
  when duplicate_column then
    null;
end
$$;

alter table if exists public.mail_accounts
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists email text,
  add column if not exists expires_at timestamptz,
  add column if not exists scope text,
  add column if not exists provider_meta jsonb,
  alter column provider set not null,
  alter column access_token set not null;

-- ensure email column is required for uniqueness
alter table if exists public.mail_accounts
  alter column email set not null;

create unique index if not exists mail_accounts_provider_email_unique
  on public.mail_accounts (provider, lower(email));

-- 2) Durable provider message store with idempotent dedupe
create table if not exists public.provider_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider text not null,
  provider_thread_id text,
  provider_message_id text not null,
  internet_message_id text,
  from_email text,
  to_emails text[],
  subject text,
  snippet text,
  received_at timestamptz,
  payload jsonb,
  dedupe_key text generated always as (
    coalesce(internet_message_id, provider || ':' || provider_message_id)
  ) stored
);

create unique index if not exists provider_messages_dedupe_key_idx
  on public.provider_messages (dedupe_key);

-- 3) Lightweight webhook intake log
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null,
  event_type text,
  body jsonb,
  handled boolean not null default false,
  error text
);

create index if not exists idx_webhook_events_handled
  on public.webhook_events (handled, created_at);

-- 4) Provider thread to internal thread mapping
create table if not exists public.thread_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  provider text not null,
  provider_thread_id text not null,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  unique (provider, provider_thread_id)
);

-- 5) Helper to ensure thread exists for a campaign + email
create or replace function public.ensure_thread_for_email(p_campaign uuid, p_email text)
returns uuid
language plpgsql
as $$
declare
  v_lead uuid;
  v_thread uuid;
begin
  select id
    into v_lead
    from public.leads
    where email = lower(p_email)
    limit 1;

  if v_lead is null then
    insert into public.leads (first_name, email, company)
    values (
      split_part(p_email, '@', 1),
      lower(p_email),
      null
    )
    returning id into v_lead;
  end if;

  select id
    into v_thread
    from public.inbox_threads
    where lead_id = v_lead
    limit 1;

  if v_thread is null then
    insert into public.inbox_threads (campaign_id, lead_id)
    values (p_campaign, v_lead)
    returning id into v_thread;
  end if;

  return v_thread;
end;
$$;

-- 6) Schedule token refresh edge function every 10 minutes
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('mail-token-refresh');
exception
  when undefined_object then
    null;
end;
$$;

select cron.schedule(
  'mail-token-refresh',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/refresh-tokens',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

