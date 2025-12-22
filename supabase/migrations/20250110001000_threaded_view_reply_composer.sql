-- Threaded View + Reply Composer
-- Minimal schema for threads and messages with org-scoped access

-- 1. Create threads table if it doesn't already exist with the new schema
create table if not exists threads_new (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  lead_email text not null,
  subject text,
  last_message_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'replied', 'archived')),
  created_at timestamptz not null default now()
);

-- 2. Create messages table if it doesn't already exist with the new schema  
create table if not exists messages_new (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references threads_new(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  from_email text not null,
  to_email text[] not null,
  body_text text,
  body_html text,
  external_provider text,        -- 'gmail' | 'outlook'
  external_id text,              -- provider msg id
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Indexes for performance
create index if not exists idx_threads_new_org_last on threads_new(org_id, last_message_at desc);
create index if not exists idx_threads_new_org_status on threads_new(org_id, status);
create index if not exists idx_threads_new_campaign on threads_new(campaign_id);
create index if not exists idx_threads_new_lead on threads_new(lead_id);
create index if not exists idx_messages_new_thread_time on messages_new(thread_id, sent_at asc);
create index if not exists idx_messages_new_external on messages_new(external_id) where external_id is not null;

-- RLS
alter table threads_new enable row level security;
alter table messages_new enable row level security;

-- Helper function to check org membership
create or replace function is_org_member(_org_id uuid, _user_id uuid default auth.uid())
returns boolean 
language sql 
stable
as $$
  select exists(
    select 1 from public.org_members
    where org_id = _org_id and user_id = _user_id
  );
$$;

-- RLS Policies for threads_new
drop policy if exists "read threads by org" on threads_new;
create policy "read threads by org" on threads_new
  for select using (is_org_member(org_id));

drop policy if exists "insert threads by org" on threads_new;
create policy "insert threads by org" on threads_new
  for insert with check (is_org_member(org_id));

drop policy if exists "update threads by org" on threads_new;
create policy "update threads by org" on threads_new
  for update using (is_org_member(org_id));

-- RLS Policies for messages_new
drop policy if exists "read messages by org" on messages_new;
create policy "read messages by org" on messages_new
  for select using (is_org_member(org_id));

drop policy if exists "insert outbound messages" on messages_new;
create policy "insert outbound messages" on messages_new
  for insert with check (is_org_member(org_id));

-- Add comments
comment on table threads_new is 'Email conversation threads, org-scoped';
comment on table messages_new is 'Individual messages in threads, supports inbound/outbound';
comment on column messages_new.to_email is 'Array of recipient emails';
comment on column messages_new.external_provider is 'Email provider: gmail or outlook';
comment on column messages_new.external_id is 'Provider message ID for threading';

