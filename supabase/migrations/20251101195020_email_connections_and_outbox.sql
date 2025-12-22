-- Email Connections and Outbox for Reply Composer
-- Creates email_connections table for connected mailboxes per org
-- Creates email_outbox table for outgoing message queue

-- Connected mailboxes per org
create table if not exists public.email_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  provider text not null check (provider in ('gmail','outlook')),
  account_email text not null,
  account_name text,
  -- OAuth tokens or reference to vault (keep minimal for demo; rotate w/ refresh tokens)
  access_token text,           -- short-lived (for demo only)
  refresh_token text,          -- if available
  token_expiry timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_conn_org on public.email_connections(org_id);

-- Outgoing queue (persist what we send)
create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  thread_id uuid not null references public.email_threads(id) on delete cascade,
  connection_id uuid not null references public.email_connections(id) on delete restrict,
  to_emails text[] not null,
  cc_emails text[] default '{}',
  bcc_emails text[] default '{}',
  subject text,
  body_html text,
  raw_mime text,                -- optional, for exact provider payload
  status text not null default 'queued' check (status in ('queued','sent','failed')),
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists idx_outbox_org on public.email_outbox(org_id);
create index if not exists idx_outbox_thread on public.email_outbox(thread_id);
create index if not exists idx_outbox_status on public.email_outbox(status);

-- RLS
alter table public.email_connections enable row level security;
alter table public.email_outbox enable row level security;

-- RLS Policies for email_connections
drop policy if exists "org only conns" on public.email_connections;
create policy "org only conns" on public.email_connections
  for select using (
    org_id::text = coalesce(
      (auth.jwt() ->> 'org_id'),
      (select org_id::text from public.profiles where id = auth.uid() limit 1)
    )
  );

-- RLS Policies for email_outbox
drop policy if exists "org only outbox select" on public.email_outbox;
create policy "org only outbox select" on public.email_outbox
  for select using (
    org_id::text = coalesce(
      (auth.jwt() ->> 'org_id'),
      (select org_id::text from public.profiles where id = auth.uid() limit 1)
    )
  );

drop policy if exists "org insert outbox" on public.email_outbox;
create policy "org insert outbox" on public.email_outbox
  for insert with check (
    org_id::text = coalesce(
      (auth.jwt() ->> 'org_id'),
      (select org_id::text from public.profiles where id = auth.uid() limit 1)
    )
  );

drop policy if exists "org update outbox" on public.email_outbox;
create policy "org update outbox" on public.email_outbox
  for update using (
    org_id::text = coalesce(
      (auth.jwt() ->> 'org_id'),
      (select org_id::text from public.profiles where id = auth.uid() limit 1)
    )
  );

-- Grant service role access
grant all on public.email_connections to service_role;
grant all on public.email_outbox to service_role;

