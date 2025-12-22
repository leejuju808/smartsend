-- Add helpful columns (if not present)
alter table send_queue
  add column if not exists updated_at timestamptz default now(),
  add column if not exists error_text text,
  add column if not exists retry_count int default 0;

-- Indexes for speed
create index if not exists idx_send_queue_status_scheduled_at
  on send_queue (status, scheduled_at);

-- Send logs
create table if not exists send_logs (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references send_queue(id) on delete set null,
  to_email text not null,
  provider_id text,
  status text not null, -- sent | failed
  error_text text,
  created_at timestamptz not null default now()
);

-- Minimal RLS for now (tighten later)
alter table send_logs enable row level security;
create policy "allow insert logs (service only)" on send_logs
  for insert to service_role using (true) with check (true);

-- You likely have RLS enabled on send_queue already; service role bypasses it.