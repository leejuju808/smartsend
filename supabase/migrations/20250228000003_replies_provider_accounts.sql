-- 001_replies_provider_accounts.sql

-- provider accounts

create table if not exists public.provider_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook')),
  email_address text not null unique,
  access_token text,
  refresh_token text,
  expires_at bigint, -- unix secs
  created_at timestamptz default now()
);

-- replies table

create table if not exists public.replies (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,                -- references emails.id (keep loose for now)
  to_email text not null,
  body text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- thread status fields on emails (add if missing)
alter table public.emails
  add column if not exists status text default 'open' check (status in ('open','replied','snoozed','closed')),
  add column if not exists replied_at timestamptz;

-- trigger: mark email replied when a reply is inserted
create or replace function public.fn_mark_email_replied()
returns trigger language plpgsql as $$
begin
  update public.emails
    set status = 'replied',
        replied_at = now()
  where id = new.thread_id;
  return new;
end; $$;

drop trigger if exists trg_mark_email_replied on public.replies;
create trigger trg_mark_email_replied
after insert on public.replies
for each row execute function public.fn_mark_email_replied();

-- RLS
alter table public.provider_accounts enable row level security;
alter table public.replies enable row level security;

drop policy if exists "provider_accounts_owner" on public.provider_accounts;
create policy "provider_accounts_owner" on public.provider_accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "replies_owner" on public.replies;
create policy "replies_owner" on public.replies
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

