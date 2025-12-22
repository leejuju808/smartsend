-- 14_sender_identities.sql
create table if not exists sender_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('domain','address')) default 'domain',
  display_name text,                 -- e.g. "Julian at SmartSend"
  from_email text not null,          -- e.g. "julian@smartsend.ai"
  provider_id text,                  -- e.g. Resend domain id
  status text not null default 'pending', -- pending | verified | failed
  dns jsonb not null default '[]',   -- [{type, name, value, status}]
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique(user_id, from_email)
);

alter table sender_identities enable row level security;

create policy "own identities" on sender_identities
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- only one default per user
create or replace function enforce_single_default_sender()
returns trigger language plpgsql as $$
begin
  if NEW.is_default then
    update sender_identities set is_default = false where user_id = NEW.user_id and id <> NEW.id;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_single_default_sender on sender_identities;
create trigger trg_single_default_sender
before insert or update on sender_identities
for each row execute function enforce_single_default_sender();