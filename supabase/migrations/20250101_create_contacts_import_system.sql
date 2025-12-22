-- Contacts table (single-tenant; adjust if you have workspaces)
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  name text,
  company text,
  tags jsonb default '[]'::jsonb,
  last_source text default 'import',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_contacts_touch on public.contacts;
create trigger trg_contacts_touch before update on public.contacts
for each row execute function public.touch_updated_at();

-- Suppression emails table
create table if not exists public.suppression_emails (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  reason text default 'manual',
  created_at timestamptz default now()
);

-- Create indexes for performance
create index if not exists idx_contacts_email on public.contacts(email);
create index if not exists idx_contacts_created_at on public.contacts(created_at);
create index if not exists idx_suppression_emails_email on public.suppression_emails(email);

-- Enable RLS
alter table public.contacts enable row level security;
alter table public.suppression_emails enable row level security;

-- Basic policies (adjust based on your auth system)
create policy "Allow all operations on contacts" on public.contacts for all using (true);
create policy "Allow all operations on suppression_emails" on public.suppression_emails for all using (true); 