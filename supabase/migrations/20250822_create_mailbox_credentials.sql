-- Mailbox credentials per user
create table if not exists public.mailboxes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('gmail','smtp')),
  -- Gmail
  gmail_refresh_token text,
  gmail_email text,
  -- SMTP
  smtp_host text,
  smtp_port int,
  smtp_username text,
  smtp_password text,
  from_name text,
  from_email text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.mailboxes enable row level security;

drop policy if exists "Users manage own mailbox" on public.mailboxes;
create policy "Users manage own mailbox" on public.mailboxes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

