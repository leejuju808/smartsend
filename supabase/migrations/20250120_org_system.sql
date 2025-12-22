-- Organizations
create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- Members
create table if not exists org_members (
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member')),
  created_at timestamptz default now(),
  primary key (org_id, user_id)
);

-- Invites
create table if not exists org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('owner','admin','member')),
  token text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- ---- SmartSend tables: add org_id (existing data becomes personal org later) ----
alter table leads add column if not exists org_id uuid references orgs(id) on delete cascade;
alter table sequences add column if not exists org_id uuid references orgs(id) on delete cascade;
alter table sequence_steps add column if not exists org_id uuid references orgs(id) on delete cascade;
alter table sequence_enrollments add column if not exists org_id uuid references orgs(id) on delete cascade;
alter table send_jobs add column if not exists org_id uuid references orgs(id) on delete cascade;

-- backfill org_id to NULL for now; your API will enforce setting it

-- Indexes
create index if not exists idx_leads_org on leads(org_id);
create index if not exists idx_sequences_org on sequences(org_id);
create index if not exists idx_steps_org on sequence_steps(org_id);
create index if not exists idx_enroll_org on sequence_enrollments(org_id);
create index if not exists idx_jobs_org on send_jobs(org_id);

-- RLS
alter table leads enable row level security;
alter table sequences enable row level security;
alter table sequence_steps enable row level security;
alter table sequence_enrollments enable row level security;
alter table send_jobs enable row level security;

-- Helper function: is member of the org
create or replace function is_org_member(oid uuid, uid uuid)
returns boolean language sql stable as $$
  select exists(select 1 from org_members m where m.org_id = oid and m.user_id = uid)
$$;

-- Policies: only org members can read/write rows in their org
do $$
declare t text;
begin
  foreach t in array ['leads','sequences','sequence_steps','sequence_enrollments','send_jobs']
  loop
    execute format('
      drop policy if exists %I_read on %I;
      create policy %I_read on %I
      for select using ( is_org_member(org_id, auth.uid()) );

      drop policy if exists %I_write on %I;
      create policy %I_write on %I
      for all using ( is_org_member(org_id, auth.uid()) )
      with check ( is_org_member(org_id, auth.uid()) );
    ', t, t, t, t, t, t, t, t);
  end loop;
end$$;