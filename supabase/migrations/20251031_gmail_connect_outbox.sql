-- Connected email accounts
create table if not exists public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  provider text not null check (provider in ('gmail')),
  email text not null,
  access_token text not null,
  refresh_token text not null,
  token_expiry timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, provider, email)
);

-- Outbox queue (provider-agnostic)
create table if not exists public.outbox (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  lead_id uuid not null,
  thread_id uuid,
  to_email text not null,
  subject text,
  body_text text not null,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed')),
  attempt int not null default 0,
  max_attempts int not null default 3,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists idx_outbox_status on public.outbox(status, created_at);

-- Provider ↔ internal ids map
create table if not exists public.provider_messages (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_message_id text not null,
  provider_thread_id text,
  email_message_id uuid, -- FK to email_messages when inserted
  lead_id uuid,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (provider, provider_message_id)
);

-- Indexes
create index if not exists idx_provider_messages_provider_msgid on public.provider_messages(provider, provider_message_id);
create index if not exists idx_provider_messages_thread on public.provider_messages(provider_thread_id);
create index if not exists idx_provider_messages_lead on public.provider_messages(lead_id);
create index if not exists idx_connected_accounts_workspace on public.connected_accounts(workspace_id, provider);
create index if not exists idx_outbox_account on public.outbox(account_id, status);

-- RLS policies
alter table public.connected_accounts enable row level security;
alter table public.outbox enable row level security;
alter table public.provider_messages enable row level security;

-- Connected accounts policies
do $$
begin
  if not exists (select 1 from pg_policies where tablename='connected_accounts' and policyname='workspace_members_read') then
    create policy workspace_members_read on public.connected_accounts
      for select using (
        workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
      );
  end if;
  
  if not exists (select 1 from pg_policies where tablename='connected_accounts' and policyname='workspace_members_insert') then
    create policy workspace_members_insert on public.connected_accounts
      for insert with check (
        workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
      );
  end if;
  
  if not exists (select 1 from pg_policies where tablename='connected_accounts' and policyname='workspace_members_update') then
    create policy workspace_members_update on public.connected_accounts
      for update using (
        workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
      );
  end if;
  
  if not exists (select 1 from pg_policies where tablename='connected_accounts' and policyname='workspace_members_delete') then
    create policy workspace_members_delete on public.connected_accounts
      for delete using (
        workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
      );
  end if;
end$$;

-- Outbox policies (service role writes, workspace members read)
do $$
begin
  if not exists (select 1 from pg_policies where tablename='outbox' and policyname='workspace_members_read') then
    create policy workspace_members_read on public.outbox
      for select using (
        workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
      );
  end if;
  
  if not exists (select 1 from pg_policies where tablename='outbox' and policyname='service_role_all') then
    create policy service_role_all on public.outbox
      for all to service_role using (true) with check (true);
  end if;
end$$;

-- Provider messages policies
do $$
begin
  if not exists (select 1 from pg_policies where tablename='provider_messages' and policyname='workspace_members_read') then
    create policy workspace_members_read on public.provider_messages
      for select using (
        account_id in (
          select id from public.connected_accounts 
          where workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
        )
      );
  end if;
  
  if not exists (select 1 from pg_policies where tablename='provider_messages' and policyname='service_role_all') then
    create policy service_role_all on public.provider_messages
      for all to service_role using (true) with check (true);
  end if;
end$$;

