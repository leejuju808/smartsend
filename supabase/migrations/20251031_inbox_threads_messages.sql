-- Threads tie a lead to a conversation

create table if not exists threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  subject text,
  last_message_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Individual messages in a thread

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references threads(id) on delete cascade,
  direction text not null check (direction in ('in','out')), -- in = lead -> us, out = us -> lead
  from_email text not null,
  to_email text not null,
  subject text,
  body_text text,
  body_html text,
  external_id text, -- provider id/messageId
  created_at timestamptz default now()
);

-- (Optional) store provider auth for the user

create table if not exists email_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook','mock')),
  email text not null,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz default now()
);

-- Helpful indexes

create index on threads (user_id, last_message_at desc);
create index on messages (thread_id, created_at asc);

-- RLS

alter table threads enable row level security;
alter table messages enable row level security;
alter table email_accounts enable row level security;

create policy "own threads" on threads
  for all using (auth.uid() = user_id);

create policy "own messages via thread" on messages
  for all using (exists (select 1 from threads t where t.id = thread_id and t.user_id = auth.uid()));

create policy "own email account" on email_accounts
  for all using (auth.uid() = user_id);

