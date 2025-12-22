-- Autopilot Settings and Review Queue
-- SmartSend v3-D: Autopilot Dashboard & Safety Guardrails

-- Autopilot settings table
create table if not exists autopilot_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique,
  enabled boolean default false,
  daily_send_limit int default 200,
  quiet_hours jsonb default '{"start": "22:00", "end": "06:00"}'::jsonb,
  review_mode boolean default true,
  last_reset timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Review queue for AI drafts
create table if not exists ai_review_queue (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  lead_id uuid references leads(id) on delete set null,
  channel text,
  draft text not null,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

-- Indexes
create index if not exists idx_autopilot_settings_org on autopilot_settings(org_id);
create index if not exists idx_ai_review_queue_org on ai_review_queue(org_id);
create index if not exists idx_ai_review_queue_status on ai_review_queue(status);
create index if not exists idx_ai_review_queue_created on ai_review_queue(created_at desc);

-- RLS Policies
alter table autopilot_settings enable row level security;
alter table ai_review_queue enable row level security;

-- Autopilot settings policies
drop policy if exists "read autopilot_settings by org" on autopilot_settings;
create policy "read autopilot_settings by org" on autopilot_settings
  for select using (
    org_id in (select org_id from organization_members where user_id = auth.uid())
    or org_id in (select id from organizations where owner_id = auth.uid())
    or org_id in (select org_id from org_members where user_id = auth.uid())
    or org_id in (select id from orgs where owner_id = auth.uid())
  );

drop policy if exists "update autopilot_settings by org" on autopilot_settings;
create policy "update autopilot_settings by org" on autopilot_settings
  for update using (
    org_id in (select org_id from organization_members where user_id = auth.uid())
    or org_id in (select id from organizations where owner_id = auth.uid())
    or org_id in (select org_id from org_members where user_id = auth.uid())
    or org_id in (select id from orgs where owner_id = auth.uid())
  );

drop policy if exists "insert autopilot_settings by org" on autopilot_settings;
create policy "insert autopilot_settings by org" on autopilot_settings
  for insert with check (
    org_id in (select org_id from organization_members where user_id = auth.uid())
    or org_id in (select id from organizations where owner_id = auth.uid())
    or org_id in (select org_id from org_members where user_id = auth.uid())
    or org_id in (select id from orgs where owner_id = auth.uid())
  );

-- Review queue policies
drop policy if exists "read ai_review_queue by org" on ai_review_queue;
create policy "read ai_review_queue by org" on ai_review_queue
  for select using (
    org_id in (select org_id from organization_members where user_id = auth.uid())
    or org_id in (select id from organizations where owner_id = auth.uid())
    or org_id in (select org_id from org_members where user_id = auth.uid())
    or org_id in (select id from orgs where owner_id = auth.uid())
  );

drop policy if exists "insert ai_review_queue by org" on ai_review_queue;
create policy "insert ai_review_queue by org" on ai_review_queue
  for insert with check (
    org_id in (select org_id from organization_members where user_id = auth.uid())
    or org_id in (select id from organizations where owner_id = auth.uid())
    or org_id in (select org_id from org_members where user_id = auth.uid())
    or org_id in (select id from orgs where owner_id = auth.uid())
  );

drop policy if exists "update ai_review_queue by org" on ai_review_queue;
create policy "update ai_review_queue by org" on ai_review_queue
  for update using (
    org_id in (select org_id from organization_members where user_id = auth.uid())
    or org_id in (select id from organizations where owner_id = auth.uid())
    or org_id in (select org_id from org_members where user_id = auth.uid())
    or org_id in (select id from orgs where owner_id = auth.uid())
  );

-- Updated timestamp trigger
create or replace function update_autopilot_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_autopilot_settings_updated_at on autopilot_settings;
create trigger trg_autopilot_settings_updated_at
before update on autopilot_settings
for each row execute function update_autopilot_settings_updated_at();

