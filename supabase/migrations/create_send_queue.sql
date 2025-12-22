-- Create send_queue table for email queue management
create table if not exists send_queue (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null,
  campaign_id uuid not null,
  lead_id uuid not null,
  to_email text not null,
  subject text not null,
  body_html text not null,
  status text not null default 'queued', -- queued | sending | sent | failed
  scheduled_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Create indexes for performance
create index if not exists idx_queue_campaign on send_queue(campaign_id);
create index if not exists idx_queue_status on send_queue(status);

-- Enable row level security
alter table send_queue enable row level security;

-- Create RLS policies
create policy "queue_select_own" on send_queue for select using (auth.uid() = user_id);
create policy "queue_insert_own" on send_queue for insert with check (auth.uid() = user_id);

-- Optional: Anti-duplicate guard (one queued email per lead)
create unique index if not exists uq_queue_campaign_lead
  on send_queue(campaign_id, lead_id)
  where status in ('queued','sending');