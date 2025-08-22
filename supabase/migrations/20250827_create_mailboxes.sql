create table if not exists public.mailboxes (
  owner uuid primary key references public.profiles(id) on delete cascade,
  provider text not null,
  from_email text not null,
  from_name text,
  -- SMTP creds (use app passwords)
  smtp_host text,
  smtp_port int,
  smtp_secure boolean,
  smtp_user text,
  smtp_pass text,
  -- Gmail OAuth tokens
  gmail_refresh_token text,
  gmail_access_token text,
  gmail_token_expiry timestamptz,
  verified boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists idx_mailboxes_verified on public.mailboxes(verified);

