-- Campaign Email Queue System
-- Implements queue-based email sending with throttle management and audit logging
-- NOTE: This extends existing send_queue table. If conflicts arise with existing
-- send_queue schema, you may need to adjust columns or use a different table name.

-- Add org_id to send_queue if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'send_queue' AND column_name = 'org_id') THEN
    ALTER TABLE send_queue ADD COLUMN org_id uuid REFERENCES orgs(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'send_queue' AND column_name = 'state') THEN
    ALTER TABLE send_queue ADD COLUMN state text DEFAULT 'queued';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'send_queue' AND column_name = 'idempotency_key') THEN
    ALTER TABLE send_queue ADD COLUMN idempotency_key text UNIQUE;
  END IF;
END $$;

-- queued outbound emails (create if not exists)
create table if not exists send_queue (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references orgs(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  provider text check (provider in ('gmail','outlook')) default null,
  to_email text not null,
  subject text not null,
  body text not null,
  schedule_at timestamptz not null,         -- when it's allowed to send
  state text default 'queued',               -- queued | sending | sent | failed | paused
  attempts int not null default 0,
  last_error text,
  idempotency_key text unique,               -- to avoid duplicates
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_send_queue_ready
  on send_queue (state, schedule_at);

create index if not exists idx_send_queue_org on send_queue (org_id);
create index if not exists idx_send_queue_campaign on send_queue (campaign_id);
create index if not exists idx_send_queue_lead on send_queue (lead_id);

-- per-send audit
create table if not exists send_logs (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references send_queue(id) on delete set null,
  org_id uuid not null,
  campaign_id uuid,
  lead_id uuid,
  provider text,
  status text not null,                      -- attempted | sent | failed
  error text,
  provider_msg_id text,                      -- Gmail/Graph id if available
  created_at timestamptz default now()
);

create index if not exists idx_send_logs_org on send_logs (org_id);
create index if not exists idx_send_logs_campaign on send_logs (campaign_id);
create index if not exists idx_send_logs_lead on send_logs (lead_id);
create index if not exists idx_send_logs_created on send_logs (created_at);

-- org-level throttle knobs (MVP defaults)
create table if not exists send_limits (
  org_id uuid primary key references orgs(id) on delete cascade,
  per_minute int not null default 12,        -- safe warmup
  per_hour int not null default 100,
  window_start time not null default '08:00',
  window_end   time not null default '17:00',
  timezone text not null default 'America/Los_Angeles'
);

-- updated_at trigger
create or replace function set_updated_at()
returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language plpgsql;

drop trigger if exists send_queue_updated on send_queue;
create trigger send_queue_updated before update on send_queue
for each row execute procedure set_updated_at();

-- RLS
alter table send_queue enable row level security;
alter table send_logs enable row level security;
alter table send_limits enable row level security;

-- RLS: send_queue - org members can read/write
create policy "org can read queue" on send_queue
for select using (exists (select 1 from org_members u where u.org_id = send_queue.org_id and u.user_id = auth.uid()));

create policy "org can insert queue" on send_queue
for insert with check (exists (select 1 from org_members u where u.org_id = send_queue.org_id and u.user_id = auth.uid()));

create policy "org can update own queue" on send_queue
for update using (exists (select 1 from org_members u where u.org_id = send_queue.org_id and u.user_id = auth.uid()));

-- Service role can update for processing
create policy "service can update queue" on send_queue
for update to service_role using (true) with check (true);

-- RLS: send_logs - org members can read
create policy "org can read logs" on send_logs
for select using (exists (select 1 from org_members u where u.org_id = send_logs.org_id and u.user_id = auth.uid()));

-- Service role can insert logs
create policy "service can insert logs" on send_logs
for insert to service_role with check (true);

-- RLS: send_limits - org members can read/write
create policy "org can read limits" on send_limits
for select using (exists (select 1 from org_members u where u.org_id = send_limits.org_id and u.user_id = auth.uid()));

create policy "org can update limits" on send_limits
for update using (exists (select 1 from org_members u where u.org_id = send_limits.org_id and u.user_id = auth.uid()));

create policy "org can insert limits" on send_limits
for insert with check (exists (select 1 from org_members u where u.org_id = send_limits.org_id and u.user_id = auth.uid()));

