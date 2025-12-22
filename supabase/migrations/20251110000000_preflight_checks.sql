-- Preflight deliverability support tables (idempotent)
create table if not exists public.domain_auth (
  domain text primary key,
  spf_ok boolean not null default false,
  dkim_ok boolean not null default false,
  dmarc_ok boolean not null default false,
  last_checked_at timestamptz
);

create table if not exists public.preflight_checks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid references public.mail_accounts(id) on delete set null,
  message_id uuid,
  from_email text,
  to_email text,
  subject text,
  body_preview text,
  severity text not null,
  checks jsonb not null
);

comment on column public.preflight_checks.severity is 'ok|warn|fail';

create index if not exists idx_preflight_by_msg on public.preflight_checks(message_id);






