-- Provider linkage columns and sync cursor helpers (idempotent)

-- A) Provider IDs on threads/messages for clean linking
alter table public.inbox_threads
  add column if not exists provider text,
  add column if not exists provider_thread_id text,
  add column if not exists account_id uuid,
  add column if not exists subject text;

create index if not exists idx_threads_provider_thread on public.inbox_threads(provider, provider_thread_id);
create index if not exists idx_threads_account on public.inbox_threads(account_id);

alter table public.normalized_messages
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists provider_thread_id text;

create index if not exists idx_nm_provider_msg on public.normalized_messages(provider, provider_message_id);
create index if not exists idx_nm_provider_thread on public.normalized_messages(provider, provider_thread_id);

-- B) Accounts table (safe to create if not present)
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider text not null check (provider in ('gmail','outlook')),
  email_address text not null,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  provider_meta jsonb not null default '{}'::jsonb
);

create unique index if not exists ux_accounts_email_provider on public.accounts(provider, email_address);

-- C) Sync cursor store per account
create table if not exists public.mail_sync_state (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  provider text not null,
  cursor text,
  last_synced_at timestamptz,
  error text
);

-- If the table already existed with a different structure, ensure required columns and constraints exist
alter table public.mail_sync_state
  add column if not exists provider text,
  add column if not exists cursor text,
  add column if not exists last_synced_at timestamptz,
  add column if not exists error text;

-- Ensure provider column has expected check (allow null rows until backfilled)
alter table public.mail_sync_state
  drop constraint if exists mail_sync_state_provider_check;
alter table public.mail_sync_state
  add constraint mail_sync_state_provider_check check (provider in ('gmail','outlook'));

delete from public.mail_sync_state;

-- Align foreign key to accounts table
do $$
declare
  fk_name text;
begin
  select tc.constraint_name
    into fk_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
  where tc.table_schema = 'public'
    and tc.table_name = 'mail_sync_state'
    and tc.constraint_type = 'FOREIGN KEY'
  limit 1;

  if fk_name is not null then
    execute format('alter table public.mail_sync_state drop constraint %I', fk_name);
  end if;
end $$;

alter table public.mail_sync_state
  add constraint mail_sync_state_account_fk
  foreign key (account_id)
  references public.accounts(id)
  on delete cascade;

create unique index if not exists ux_mail_sync_state_account on public.mail_sync_state(account_id);

-- D) Helper function: get-or-create thread by provider-thread id
create or replace function public.upsert_thread_from_provider(
  p_account uuid,
  p_provider text,
  p_provider_thread_id text,
  p_subject text,
  p_lead_email text
) returns uuid
language plpgsql
as $$
declare
  v_thread uuid;
  v_lead uuid;
  v_campaign uuid;
begin
  -- naive lead lookup by email (extend to multi-campaign rules as needed)
  select id into v_lead
  from public.leads
  where lower(email) = lower(p_lead_email)
  limit 1;

  if v_lead is null then
    insert into public.leads(email, name)
    values (p_lead_email, null)
    returning id into v_lead;
  end if;

  -- pick a campaign (MVP: most recent campaign for this lead; fallback: NULL)
  select campaign_id into v_campaign
  from public.campaign_leads
  where lead_id = v_lead
  order by created_at desc
  limit 1;

  select id into v_thread
  from public.inbox_threads
  where provider = p_provider
    and provider_thread_id = p_provider_thread_id
    and account_id = p_account
  limit 1;

  if v_thread is null then
    insert into public.inbox_threads (
      campaign_id, lead_id, provider, provider_thread_id,
      account_id, subject, needs_reply, created_at
    ) values (
      v_campaign, v_lead, p_provider, p_provider_thread_id,
      p_account, p_subject, false, now()
    )
    returning id into v_thread;
  else
    update public.inbox_threads
      set subject = coalesce(subject, p_subject)
    where id = v_thread;
  end if;

  return v_thread;
end$$;

-- E) Idempotent insert for normalized_messages by provider id
create or replace function public.ensure_normalized_message(
  p_thread uuid,
  p_provider text,
  p_provider_message_id text,
  p_provider_thread_id text,
  p_direction text,
  p_subject text,
  p_body_text text,
  p_body_html text,
  p_sent_at timestamptz
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id
    into v_id
  from public.normalized_messages
  where provider = p_provider
    and provider_message_id = p_provider_message_id
  limit 1;

  if v_id is null then
    insert into public.normalized_messages(
      linked_thread_id, provider, provider_message_id, provider_thread_id,
      direction, subject, body_text, body_html, sent_at
    ) values (
      p_thread, p_provider, p_provider_message_id, p_provider_thread_id,
      p_direction, p_subject, p_body_text, p_body_html, p_sent_at
    )
    returning id into v_id;
  end if;

  return v_id;
end$$;

