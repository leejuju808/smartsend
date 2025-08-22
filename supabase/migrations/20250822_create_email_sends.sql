-- Outbox for queued sends
create table if not exists public.email_sends (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  inbox_id uuid,
  to_email text not null,
  subject text not null,
  body text not null,
  status text not null default 'queued', -- queued|sent|failed
  failure_reason text,
  scheduled_at timestamptz default now(),
  sent_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.email_sends enable row level security;
drop policy if exists "Users manage own sends" on public.email_sends;
create policy "Users manage own sends" on public.email_sends for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

