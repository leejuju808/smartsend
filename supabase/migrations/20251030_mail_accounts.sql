-- Minimal sending account table for worker
create table if not exists public.mail_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  provider text not null check (provider in ('gmail','outlook')),
  from_email text not null,
  access_token text not null,
  refresh_token text,
  provider_user_id text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_mail_accounts_ws on public.mail_accounts(workspace_id);


