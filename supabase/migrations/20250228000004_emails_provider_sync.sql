-- base columns if not present
alter table public.emails
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists from_email text,
  add column if not exists subject text,
  add column if not exists preview text,
  add column if not exists body text,
  add column if not exists status text default 'open' check (status in ('open','replied','snoozed','closed')),
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- provider linkage
alter table public.emails
  add column if not exists provider text check (provider in ('gmail','outlook')),
  add column if not exists provider_message_id text,
  add column if not exists provider_thread_id text;

-- keep one row per provider message per user
create unique index if not exists emails_user_provider_msg_uniq
  on public.emails (user_id, provider, provider_message_id);

-- ordering & filtering
create index if not exists emails_user_updated_idx
  on public.emails (user_id, updated_at desc);

-- simple updated_at trigger
create or replace function public.fn_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_touch_emails on public.emails;
create trigger trg_touch_emails
before update on public.emails
for each row execute function public.fn_touch_updated_at();

-- RLS (owner-only)
alter table public.emails enable row level security;
drop policy if exists "emails_owner_all" on public.emails;
create policy "emails_owner_all" on public.emails
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

