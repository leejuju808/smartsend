-- Link a Gmail account to a SmartSend user/org

create table if not exists gmail_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,                        -- your auth.users.id
  org_id uuid,                                  -- if you segment by org
  email_address text not null unique,
  access_token text not null,
  refresh_token text not null,
  token_expiry timestamptz not null,            -- when access token expires
  last_sync_at timestamptz,                     -- watermark for polling
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gmail_accounts_user_idx on gmail_accounts(user_id);
create unique index if not exists gmail_accounts_email_uniq on gmail_accounts(email_address);

create or replace function touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists gmail_accounts_touch on gmail_accounts;
create trigger gmail_accounts_touch before update on gmail_accounts
for each row execute function touch_updated_at();

-- Enrich emails for provider mapping (if not present already)
alter table if exists emails
  add column if not exists gmail_message_id text unique,
  add column if not exists gmail_thread_id text,
  add column if not exists received_at timestamptz,
  add column if not exists raw_headers jsonb;

-- Helpful indexes for dedupe and lookups
create index if not exists emails_gmail_thread_idx on emails(gmail_thread_id);

-- Index leads by email for quick match (optional: match to leads & campaigns)
create index if not exists leads_email_idx on leads(lower(email));

