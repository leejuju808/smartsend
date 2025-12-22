-- Log of inbound messages (idempotency via unique external_id)
-- Extends existing inbound_emails table with idempotency and improved structure

-- Add external_id column if it doesn't exist
alter table if exists public.inbound_emails
  add column if not exists external_id text,
  add column if not exists model jsonb;

-- Create unique index for idempotency (provider + external_id)
create unique index if not exists ux_inbound_external 
  on public.inbound_emails(provider, external_id)
  where external_id is not null;

-- Optional: tighten lookups
create index if not exists idx_inbound_lead 
  on public.inbound_emails(lead_id);

create index if not exists idx_inbound_campaign 
  on public.inbound_emails(campaign_id);

-- Ensure send_queue has the necessary indexes for cancel operations
create index if not exists idx_queue_lead_status 
  on public.send_queue(lead_id, status);

-- Minimal send_queue to allow cancel (ensure it exists with status column)
-- status: queued|sending|sent|failed|canceled
do $$
begin
  if not exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'send_queue'
  ) then
    create table public.send_queue (
      id uuid primary key default gen_random_uuid(),
      campaign_id uuid not null,
      lead_id uuid not null,
      attempt int not null default 0,
      status text not null default 'queued',
      run_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    );
  end if;

  -- Ensure status column exists
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
      and table_name = 'send_queue' 
      and column_name = 'status'
  ) then
    alter table public.send_queue add column status text not null default 'queued';
  end if;
end $$;

-- Helpful: a compact view for your dashboard if you like
create or replace view public.v_lead_status as
select l.*, 
  (select count(*) from send_queue q where q.lead_id=l.id and q.status in ('queued','sending')) as pending_sends
from public.leads l;

