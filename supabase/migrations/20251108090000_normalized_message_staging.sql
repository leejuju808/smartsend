-- 1) SQL — normalized staging (idempotent)

-- A) Normalized, linkable message staging (safe to expose read-only in app)

create table if not exists public.normalized_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook')),
  provider_message_id text not null,
  provider_thread_id text,
  internet_message_id text,
  subject text,
  from_email citext,
  to_emails citext[],
  sent_at timestamptz,
  direction text not null check (direction in ('inbound','outbound')),
  body_preview text,
  payload_id uuid not null references public.provider_message_payloads(id) on delete cascade,
  linked_thread_id uuid,
  link_status text not null default 'unlinked' check (link_status in ('unlinked','linked','skipped','error')),
  link_error text
);

create index if not exists idx_nm_account_time on public.normalized_messages(account_id, sent_at desc);
create index if not exists idx_nm_provider_mid on public.normalized_messages(provider, provider_message_id);
create index if not exists idx_nm_inet_mid on public.normalized_messages(internet_message_id);
create index if not exists idx_nm_thread on public.normalized_messages(provider_thread_id);

-- unique per account+provider message
create unique index if not exists uq_nm_account_provider_mid
  on public.normalized_messages(account_id, provider, provider_message_id);


-- B) Mark parse state on payloads

alter table public.provider_message_payloads
  add column if not exists parsed_at timestamptz,
  add column if not exists parse_error text;


-- C) RLS (readable; writes are service-role from Edge)

alter table public.normalized_messages enable row level security;

drop policy if exists "nm_read" on public.normalized_messages;
create policy "nm_read" on public.normalized_messages
for select to authenticated
using (true);

-- Do not allow inserts/updates from clients; Edge/service role only.



