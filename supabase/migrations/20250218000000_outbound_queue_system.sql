-- SmartSend Outbound Queue System
-- This migration creates the outbound_queue table and send_limits for rate-limited sending

-- outbound_queue table for queuing emails with retries
create table if not exists public.outbound_queue (
  id uuid primary key default gen_random_uuid(),
  org_id uuid, -- nullable, can be set from campaign
  campaign_id uuid references public.campaigns(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  to_email text not null,
  subject text not null,
  body text not null, -- HTML body
  connector text not null default 'gmail' check (connector in ('gmail', 'outlook', 'resend')),
  scheduled_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts int not null default 0,
  max_attempts int not null default 5,
  last_error text,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Indexes for efficient querying
create index if not exists idx_outbound_queue_status_scheduled 
  on public.outbound_queue(status, scheduled_at) 
  where status in ('pending', 'sending');

create index if not exists idx_outbound_queue_campaign 
  on public.outbound_queue(campaign_id, status);

create index if not exists idx_outbound_queue_org 
  on public.outbound_queue(org_id, status);

create index if not exists idx_outbound_queue_created 
  on public.outbound_queue(created_at);

-- RLS policies
alter table public.outbound_queue enable row level security;

-- Service role can do everything (for edge functions)
create policy "service_role_full_access" on public.outbound_queue
  for all
  to service_role
  using (true)
  with check (true);

-- Users can read their org's queue items
create policy "users_read_own_org_queue" on public.outbound_queue
  for select
  to authenticated
  using (
    exists (
      select 1 from public.organizations o
      join public.organization_members om on om.organization_id = o.id
      where o.id = outbound_queue.org_id 
      and om.user_id = auth.uid()
    )
  );

-- send_limits table for rate limiting per org
create table if not exists public.send_limits (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  max_per_minute int not null default 120,
  max_per_hour int not null default 3000,
  max_per_day int not null default 50000,
  warmup_enabled boolean not null default true,
  warmup_start_date date,
  warmup_days int not null default 14,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS for send_limits
alter table public.send_limits enable row level security;

create policy "service_role_full_access_limits" on public.send_limits
  for all
  to service_role
  using (true)
  with check (true);

create policy "users_read_own_org_limits" on public.send_limits
  for select
  to authenticated
  using (
    exists (
      select 1 from public.organizations o
      join public.organization_members om on om.organization_id = o.id
      where o.id = send_limits.org_id 
      and om.user_id = auth.uid()
    )
  );

-- Helper function to check if sending is allowed based on limits
create or replace function public.check_send_limit(
  p_org_id uuid,
  p_connector text default 'gmail'
)
returns boolean
language plpgsql
stable
as $$
declare
  v_limit record;
  v_count_minute bigint;
  v_count_hour bigint;
  v_count_day bigint;
  v_warmup_effective boolean;
begin
  -- Get limits for this org
  select * into v_limit from public.send_limits where org_id = p_org_id;
  
  -- If no limits configured, allow sending
  if v_limit is null then
    return true;
  end if;
  
  -- Check warmup
  if v_limit.warmup_enabled and v_limit.warmup_start_date is not null then
    v_warmup_effective := (current_date - v_limit.warmup_start_date) < v_limit.warmup_days;
    if v_warmup_effective then
      -- During warmup, reduce limits gradually
      -- TODO: Implement gradual warmup logic here
      -- For now, allow sending
    end if;
  end if;
  
  -- Count sends in last minute
  select count(*) into v_count_minute
  from public.outbound_queue
  where org_id = p_org_id
    and connector = p_connector
    and sent_at > now() - interval '1 minute'
    and status = 'sent';
  
  if v_count_minute >= v_limit.max_per_minute then
    return false;
  end if;
  
  -- Count sends in last hour
  select count(*) into v_count_hour
  from public.outbound_queue
  where org_id = p_org_id
    and connector = p_connector
    and sent_at > now() - interval '1 hour'
    and status = 'sent';
  
  if v_count_hour >= v_limit.max_per_hour then
    return false;
  end if;
  
  -- Count sends today
  select count(*) into v_count_day
  from public.outbound_queue
  where org_id = p_org_id
    and connector = p_connector
    and sent_at > date_trunc('day', now())
    and status = 'sent';
  
  if v_count_day >= v_limit.max_per_day then
    return false;
  end if;
  
  return true;
end;
$$;

-- Helper function to calculate exponential backoff delay
create or replace function public.calculate_backoff_delay(p_attempts int)
returns int
language plpgsql
immutable
as $$
begin
  -- Exponential backoff: 2^attempts minutes, capped at 64 minutes
  return least(power(2, p_attempts), 64);
end;
$$;

-- Update trigger for send_limits updated_at
create or replace function public.update_send_limits_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_send_limits_updated_at
  before update on public.send_limits
  for each row execute function public.update_send_limits_timestamp();

