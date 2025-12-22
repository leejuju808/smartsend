-- Harden meetings table + indexes (id already exists from prior step)
create extension if not exists "uuid-ossp";

-- Ensure core columns exist
alter table if exists public.meetings
  add column if not exists status text default 'pending' check (status in ('pending','sent','accepted','declined'));

-- Helpful indexes for UI filters
create index if not exists idx_meetings_status on public.meetings(status);
create index if not exists idx_meetings_created_at on public.meetings(created_at desc);
create index if not exists idx_meetings_contact_email on public.meetings(contact_email);

-- (Optional) Enable RLS later when you wire auth
-- alter table public.meetings enable row level security;
-- create policy "read-own" on public.meetings for select to authenticated using (true);
-- ^ tighten when you add owner_id
