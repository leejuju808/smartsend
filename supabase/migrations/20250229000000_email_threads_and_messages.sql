-- Thread table groups messages by conversation
create table if not exists public.email_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_email text not null,
  subject text,
  last_message_at timestamptz default now(),
  unread_count int default 0
);

-- Individual messages (sent or received)
-- Note: This may conflict with existing email_messages table, so we use 'create if not exists'
create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.email_threads(id) on delete cascade,
  from_address text not null,
  to_address text not null,
  subject text,
  body_html text,
  direction text check (direction in ('sent','received')) not null,
  sent_at timestamptz default now()
);

-- If email_messages already exists with different schema, add missing columns
alter table public.email_messages
  add column if not exists thread_id uuid,
  add column if not exists from_address text,
  add column if not exists to_address text,
  add column if not exists direction text,
  add column if not exists sent_at timestamptz default now();

-- Update thread_id to reference email_threads if it's text
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'email_messages' 
    and column_name = 'thread_id' 
    and data_type = 'text'
  ) then
    alter table public.email_messages 
      alter column thread_id type uuid using thread_id::uuid;
    alter table public.email_messages
      add constraint email_messages_thread_id_fkey 
      foreign key (thread_id) references public.email_threads(id) on delete cascade;
  end if;
end$$;

-- Add/update from_address and to_address if they're named differently
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'email_messages' 
    and column_name = 'from_email'
  ) and not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'email_messages' 
    and column_name = 'from_address'
  ) then
    alter table public.email_messages rename column from_email to from_address;
  end if;
  
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'email_messages' 
    and column_name = 'to_email'
  ) and not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'email_messages' 
    and column_name = 'to_address'
  ) then
    alter table public.email_messages rename column to_email to to_address;
  end if;
end$$;

-- Add/update direction constraint if it exists with different values
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'email_messages_direction_check'
  ) then
    alter table public.email_messages
      add constraint email_messages_direction_check
      check (direction in ('sent','received'));
  end if;
end$$;

-- Indexes
create index if not exists idx_email_messages_thread on public.email_messages(thread_id);
create index if not exists idx_email_threads_lead on public.email_threads(lead_email);
create index if not exists idx_email_threads_workspace on public.email_threads(workspace_id);
create index if not exists idx_email_threads_last_message on public.email_threads(last_message_at desc);

-- Connect existing logs to threads automatically when detected
alter table public.email_logs add column if not exists thread_id uuid references public.email_threads(id);

-- Enable RLS
alter table public.email_threads enable row level security;
alter table public.email_messages enable row level security;

-- RLS Policies for email_threads
drop policy if exists "email_threads_read_own_workspace" on public.email_threads;
create policy "email_threads_read_own_workspace"
on public.email_threads
for select
to authenticated
using (
  workspace_id in (
    select workspace_id from public.workspace_members
    where user_id = auth.uid()
  )
);

drop policy if exists "email_threads_insert_own_workspace" on public.email_threads;
create policy "email_threads_insert_own_workspace"
on public.email_threads
for insert
to authenticated
with check (
  workspace_id in (
    select workspace_id from public.workspace_members
    where user_id = auth.uid()
  )
);

drop policy if exists "email_threads_update_own_workspace" on public.email_threads;
create policy "email_threads_update_own_workspace"
on public.email_threads
for update
to authenticated
using (
  workspace_id in (
    select workspace_id from public.workspace_members
    where user_id = auth.uid()
  )
);

-- RLS Policies for email_messages
drop policy if exists "email_messages_read_own_workspace" on public.email_messages;
create policy "email_messages_read_own_workspace"
on public.email_messages
for select
to authenticated
using (
  thread_id in (
    select id from public.email_threads
    where workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  )
);

drop policy if exists "email_messages_insert_own_workspace" on public.email_messages;
create policy "email_messages_insert_own_workspace"
on public.email_messages
for insert
to authenticated
with check (
  thread_id in (
    select id from public.email_threads
    where workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  )
);

-- Grant service role access
grant all on public.email_threads to service_role;
grant all on public.email_messages to service_role;

