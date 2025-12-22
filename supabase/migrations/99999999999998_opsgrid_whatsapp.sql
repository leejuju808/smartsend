-- OpsGrid WhatsApp → CRM Integration
-- Create tables for contacts and messages

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  name text,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists contacts_phone_idx on public.contacts(phone);
create index if not exists contacts_workspace_idx on public.contacts(workspace_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  provider text not null,
  payload jsonb default '{}'::jsonb,
  text text,
  from_phone text,
  to_phone text,
  message_id text,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  created_at timestamptz default now()
);

create index if not exists messages_contact_idx on public.messages(contact_id, created_at desc);
create index if not exists messages_direction_idx on public.messages(direction, created_at desc);
create index if not exists messages_workspace_idx on public.messages(workspace_id, created_at desc);

-- RLS policies
alter table public.contacts enable row level security;
alter table public.messages enable row level security;

drop policy if exists "contacts_read" on public.contacts;
create policy "contacts_read" on public.contacts for select using (true);

drop policy if exists "messages_read" on public.messages;
create policy "messages_read" on public.messages for select using (true);

-- Writes use service role (no policy needed)

-- Updated timestamp trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_contacts_updated_at on public.contacts;
create trigger trg_contacts_updated_at
before update on public.contacts
for each row execute procedure public.set_updated_at();
