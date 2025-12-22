-- 03_sequences_pause.sql

-- Mark lead's enrollment state per campaign/sequence

create table if not exists sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  campaign_id uuid not null,
  lead_id uuid not null,
  status text not null default 'active', -- active | paused_replied | paused_bounced | unsubscribed
  paused_reason text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (campaign_id, lead_id)
);

create index if not exists idx_seq_enroll_org on sequence_enrollments(org_id);
create index if not exists idx_seq_enroll_campaign on sequence_enrollments(campaign_id, status);

-- Link replies to enrollments (optional helper)
alter table threads add column if not exists campaign_id uuid;

-- RLS policies for sequence_enrollments
alter table sequence_enrollments enable row level security;

drop policy if exists "read enrollments by org" on sequence_enrollments;
drop policy if exists "insert enrollments by org" on sequence_enrollments;
drop policy if exists "update enrollments by org" on sequence_enrollments;

create policy "read enrollments by org" on sequence_enrollments
  for select using (
    org_id = (select org_id from profiles p where p.id = auth.uid())
  );

create policy "insert enrollments by org" on sequence_enrollments
  for insert with check (
    org_id = (select org_id from profiles p where p.id = auth.uid())
  );

create policy "update enrollments by org" on sequence_enrollments
  for update using (
    org_id = (select org_id from profiles p where p.id = auth.uid())
  );

