-- Email Sequences System
-- Multi-step email sequences with scheduling, enrollment tracking, and reply detection

-- Sequences table - belongs to an org and has multiple steps
create table if not exists sequences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  name text not null,
  timezone text default 'America/Los_Angeles',
  active boolean default true,
  created_at timestamptz default now()
);

-- Sequence steps - ordered steps with day offsets and templates
create table if not exists sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid references sequences(id) on delete cascade not null,
  step_number int not null check (step_number >= 1),
  wait_days int not null default 2,            -- days after previous message
  subject_template text not null,
  body_md text not null,                       -- markdown w/ {{vars}}
  created_at timestamptz default now(),
  unique (sequence_id, step_number)
);

-- Lead enrollment tracks progress through a sequence
create table if not exists sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  lead_id uuid references leads(id) on delete cascade not null,
  sequence_id uuid references sequences(id) on delete cascade not null,
  current_step int default 0,                  -- 0 before first send
  status text check (status in ('active','paused','completed','cancelled')) default 'active',
  last_sent_at timestamptz,
  next_due_at timestamptz,                     -- computed from wait_days and org window
  created_at timestamptz default now(),
  unique (lead_id, sequence_id)
);

-- Org send windows and caps
create table if not exists org_send_settings (
  org_id uuid primary key references organizations(id) on delete cascade,
  timezone text default 'America/Los_Angeles',
  window_start time default '09:00',
  window_end   time default '17:00',
  skip_weekends boolean default true,
  daily_cap int default 300
);

-- Queue for scheduled follow-ups (decoupled from existing immediate send-queue)
create table if not exists followup_queue (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  enrollment_id uuid not null references sequence_enrollments(id) on delete cascade,
  step_number int not null,
  due_at timestamptz not null,
  locked_at timestamptz,
  sent_at timestamptz,
  error text,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_sequences_org on sequences(org_id);
create index if not exists idx_sequence_steps_seq on sequence_steps(sequence_id, step_number);
create index if not exists idx_enrollments_org on sequence_enrollments(org_id);
create index if not exists idx_enrollments_lead on sequence_enrollments(lead_id);
create index if not exists idx_enrollments_status on sequence_enrollments(status);
create index if not exists idx_followup_queue_due on followup_queue(due_at) where sent_at is null;
create index if not exists idx_followup_queue_org on followup_queue(org_id);
create index if not exists idx_followup_queue_enrollment on followup_queue(enrollment_id);

-- RLS
alter table sequences enable row level security;
alter table sequence_steps enable row level security;
alter table sequence_enrollments enable row level security;
alter table org_send_settings enable row level security;
alter table followup_queue enable row level security;

-- RLS Policies using existing is_org_member function
create policy "seq org read" on sequences for select using (is_org_member(org_id));
create policy "seq org write" on sequences 
  for insert with check (is_org_member(org_id)), 
  update using (is_org_member(org_id)),
  delete using (is_org_member(org_id));

create policy "steps org read" on sequence_steps 
  for select using (is_org_member((select org_id from sequences s where s.id = sequence_id)));
create policy "steps org write" on sequence_steps 
  for insert with check (is_org_member((select org_id from sequences s where s.id = sequence_id))), 
  update using (is_org_member((select org_id from sequences s where s.id = sequence_id))),
  delete using (is_org_member((select org_id from sequences s where s.id = sequence_id)));

create policy "enroll org read" on sequence_enrollments for select using (is_org_member(org_id));
create policy "enroll org write" on sequence_enrollments 
  for insert with check (is_org_member(org_id)), 
  update using (is_org_member(org_id)),
  delete using (is_org_member(org_id));

create policy "settings org read" on org_send_settings for select using (is_org_member(org_id));
create policy "settings org write" on org_send_settings 
  for insert with check (is_org_member(org_id)), 
  update using (is_org_member(org_id)),
  delete using (is_org_member(org_id));

create policy "fq org read" on followup_queue for select using (is_org_member(org_id));
create policy "fq org write" on followup_queue 
  for insert with check (is_org_member(org_id)), 
  update using (is_org_member(org_id)),
  delete using (is_org_member(org_id));

-- Triggers - pause/cancel on reply or manual status
-- When a lead is marked Replied or Unsubscribed, stop their enrollments
create or replace function pause_enroll_on_replied()
returns trigger language plpgsql as $$
begin
  if new.status in ('Replied','Unsubscribed') then
    update sequence_enrollments
    set status='paused'
    where lead_id = new.id and status='active';
    update followup_queue
    set error = 'paused_due_to_reply'
    where enrollment_id in (select id from sequence_enrollments where lead_id=new.id)
      and sent_at is null;
  end if;
  return new;
end $$;

drop trigger if exists trg_pause_enroll_on_replied on leads;
create trigger trg_pause_enroll_on_replied
after update on leads
for each row when (old.status is distinct from new.status)
execute function pause_enroll_on_replied();

-- Also stop on new row in email_replies (failsafe)
create or replace function pause_enroll_on_email_reply()
returns trigger language plpgsql as $$
begin
  update sequence_enrollments
  set status='paused'
  where lead_id = new.lead_id and status='active';
  update followup_queue
  set error = 'paused_due_to_reply'
  where enrollment_id in (select id from sequence_enrollments where lead_id=new.lead_id)
    and sent_at is null;
  return new;
end $$;

-- Only create trigger if email_replies table exists and has lead_id column
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_name = 'email_replies' 
    and column_name = 'lead_id'
  ) then
    drop trigger if exists trg_pause_on_email_reply on email_replies;
    create trigger trg_pause_on_email_reply
    after insert on email_replies
    for each row execute function pause_enroll_on_email_reply();
  end if;
end $$;

