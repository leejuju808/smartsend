-- Block 21505 — SmartSend Roofing Send Queue Engine v1 (Scheduling + Rate Limits)
-- The engine that actually sends outreach, at the perfect schedule, safely, and consistently

-- ============================================================================
-- PART 1 — Send Queue Table
-- ============================================================================
-- Stores all pending messages for all campaigns

create table if not exists send_queue (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  step integer not null, -- which email in the sequence
  scheduled_for timestamptz not null, -- when it should send
  status text not null default 'pending', -- pending | processing | sent | failed
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add columns if table exists but columns don't
do $$
begin
  -- Add step if missing
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'step'
  ) then
    alter table public.send_queue add column step integer not null default 1;
  end if;

  -- Add scheduled_for if missing (may exist as scheduled_at)
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'scheduled_for'
  ) then
    if exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' and table_name = 'send_queue' and column_name = 'scheduled_at'
    ) then
      alter table public.send_queue add column scheduled_for timestamptz;
      update public.send_queue set scheduled_for = scheduled_at where scheduled_for is null;
      alter table public.send_queue alter column scheduled_for set not null;
    else
      alter table public.send_queue add column scheduled_for timestamptz not null default now();
    end if;
  end if;

  -- Add last_error if missing
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'last_error'
  ) then
    alter table public.send_queue add column last_error text;
  end if;

  -- Ensure status has correct default
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'status'
  ) then
    alter table public.send_queue alter column status set default 'pending';
    alter table public.send_queue alter column status set not null;
  end if;

  -- Ensure updated_at exists
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'updated_at'
  ) then
    alter table public.send_queue add column updated_at timestamptz default now();
  end if;
end $$;

-- Indexes for efficient querying
create index if not exists send_queue_campaign_idx on send_queue (campaign_id, status, scheduled_for);
create index if not exists send_queue_scheduled_idx on send_queue (status, scheduled_for);

-- ============================================================================
-- PART 2 — Email Sends Log Table
-- ============================================================================
-- Keeps a permanent record of all emails sent

create table if not exists email_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  step integer,
  subject text,
  body text,
  provider_id text, -- message id from SendGrid/Resend/etc.
  sent_at timestamptz default now()
);

-- Add columns if table exists but columns don't
do $$
begin
  -- Add step if missing
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'email_sends' and column_name = 'step'
  ) then
    alter table public.email_sends add column step integer;
  end if;

  -- Add provider_id if missing
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'email_sends' and column_name = 'provider_id'
  ) then
    alter table public.email_sends add column provider_id text;
  end if;

  -- Ensure sent_at has correct default
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'email_sends' and column_name = 'sent_at'
  ) then
    alter table public.email_sends alter column sent_at set default now();
  end if;
end $$;

-- Indexes for efficient querying
create index if not exists email_sends_campaign_idx on email_sends (campaign_id, lead_id);

-- ============================================================================
-- PART 3 — Trigger to update updated_at
-- ============================================================================

create or replace function update_send_queue_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_send_queue_updated_at on send_queue;
create trigger trg_send_queue_updated_at
before update on send_queue
for each row
execute function update_send_queue_updated_at();

-- ============================================================================
-- PART 4 — RLS Policies
-- ============================================================================

alter table send_queue enable row level security;
alter table email_sends enable row level security;

-- Drop existing policies if they exist
drop policy if exists "send_queue_service_role_all" on send_queue;
drop policy if exists "email_sends_service_role_all" on email_sends;
drop policy if exists "email_sends_select_authenticated" on email_sends;

-- Service role has full access to send_queue (needed for edge function)
create policy "send_queue_service_role_all" on send_queue
  for all to service_role
  using (true) with check (true);

-- Service role has full access to email_sends (needed for edge function)
create policy "email_sends_service_role_all" on email_sends
  for all to service_role
  using (true) with check (true);

-- Authenticated users can read email_sends for campaigns they have access to
create policy "email_sends_select_authenticated" on email_sends
  for select to authenticated
  using (
    campaign_id in (
      select id from campaigns
      where workspace_id in (
        select workspace_id from workspace_members
        where user_id = auth.uid()
      )
    )
  );














































