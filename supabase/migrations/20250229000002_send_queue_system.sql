-- 003_send_queue.sql
-- Mailboxes connected to users/orgs (OAuth slice next; for now, stub provider)
-- Send queue system with rate limiting and retry logic

-- Mailboxes table
create table if not exists mailboxes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  user_id uuid references auth.users(id) on delete cascade,
  provider text check (provider in ('gmail','outlook','smtp','dev')) default 'dev',
  daily_limit int default 200,
  per_minute_limit int default 8,
  sent_today int default 0,
  last_reset_at timestamptz default now(),
  is_active boolean default true,
  display_name text,
  from_email text,
  oauth jsonb,        -- tokens (for later slice)
  smtp jsonb,         -- host, port, user, pass (if smtp)
  created_at timestamptz default now()
);

create index if not exists idx_mailboxes_user on mailboxes(user_id);
create index if not exists idx_mailboxes_org on mailboxes(org_id);
create index if not exists idx_mailboxes_active on mailboxes(is_active) where is_active = true;

-- Send queue table
create table if not exists send_queue (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid references mailboxes(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  thread_id uuid references threads(id) on delete set null,
  subject text,
  body text,
  scheduled_at timestamptz not null,
  status text check (status in ('queued','sending','sent','failed','paused')) default 'queued',
  error text,
  attempts int default 0,
  max_attempts int default 5,
  backoff_seconds int default 0,
  meta jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_send_queue_due
  on send_queue (status, scheduled_at) where status = 'queued' and scheduled_at <= now();

create index if not exists idx_send_queue_mailbox on send_queue(mailbox_id);
create index if not exists idx_send_queue_thread on send_queue(thread_id);
create index if not exists idx_send_queue_lead on send_queue(lead_id);

-- Send logs table
create table if not exists send_logs (
  id bigserial primary key,
  queue_id uuid references send_queue(id) on delete cascade,
  mailbox_id uuid references mailboxes(id) on delete set null,
  event text,    -- queued|dequeued|sent|failed|retry_scheduled|rate_limited
  detail text,
  meta jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists idx_send_logs_queue on send_logs(queue_id);
create index if not exists idx_send_logs_mailbox on send_logs(mailbox_id);
create index if not exists idx_send_logs_created on send_logs(created_at desc);

-- Simple trigger to keep updated_at fresh
create or replace function touch_updated_at() returns trigger as $$
begin 
  new.updated_at = now(); 
  return new; 
end; 
$$ language plpgsql;

drop trigger if exists trg_send_queue_updated on send_queue;
create trigger trg_send_queue_updated before update on send_queue
for each row execute function touch_updated_at();

-- RLS Policies
alter table send_queue enable row level security;
create policy "read_own_org" on send_queue for select using (auth.uid() is not null);
create policy "enqueue_via_client" on send_queue for insert with check (auth.uid() is not null);

alter table send_logs enable row level security;
create policy "read_own_org" on send_logs for select using (auth.uid() is not null);

alter table mailboxes enable row level security;
create policy "read_own_org" on mailboxes for select using (auth.uid() is not null);
create policy "insert_own_org" on mailboxes for insert with check (auth.uid() is not null);
/* Edge function uses Service Role and bypasses RLS for processing */

