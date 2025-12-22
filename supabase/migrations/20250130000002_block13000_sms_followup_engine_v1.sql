-- Block 13000 — SMS Follow-Up Engine v1
-- Two-Way Texting + Automated SMS Sequences + Unified Inbox
-- 
-- This migration adds SMS support to SmartSend:
-- - SMS sending identity (dedicated number per organization)
-- - SMS steps in campaigns
-- - Two-way SMS in unified inbox
-- - SMS reply detection + intent classification
-- - SMS opt-out handling
-- - SMS plan limits enforcement

-- ============================================================================
-- 1. EXTEND organizations TABLE FOR SMS CONFIGURATION
-- ============================================================================

alter table public.organizations
  add column if not exists sms_number text,
  add column if not exists sms_provider text default 'twilio' check (sms_provider in ('twilio', 'nexmo', 'telnyx')),
  add column if not exists sms_credentials jsonb default '{}'::jsonb,
  add column if not exists sms_sent_this_period int default 0,
  add column if not exists sms_period_start timestamptz default date_trunc('month', now());

-- Index for SMS number lookups (for inbound webhook routing)
create index if not exists idx_organizations_sms_number 
  on public.organizations(sms_number) 
  where sms_number is not null;

-- ============================================================================
-- 2. EXTEND messages TABLE FOR SMS SUPPORT
-- ============================================================================

-- Add channel column if it doesn't exist
alter table public.messages
  add column if not exists channel text default 'email' check (channel in ('email', 'sms'));

-- Add phone number column for SMS
alter table public.messages
  add column if not exists phone text;

-- Update existing messages to be email channel
update public.messages 
set channel = 'email' 
where channel is null;

-- Make channel not null after backfilling
alter table public.messages
  alter column channel set not null;

-- Indexes for SMS queries
create index if not exists idx_messages_channel 
  on public.messages(channel, created_at desc);

create index if not exists idx_messages_phone 
  on public.messages(phone) 
  where phone is not null;

-- ============================================================================
-- 3. EXTEND reply_threads TABLE FOR SMS SUPPORT
-- ============================================================================

-- Add channel column if it doesn't exist
alter table public.reply_threads
  add column if not exists channel text default 'email' check (channel in ('email', 'sms'));

-- Update existing threads to be email channel
update public.reply_threads 
set channel = 'email' 
where channel is null;

-- Make channel not null after backfilling
alter table public.reply_threads
  alter column channel set not null;

-- Index for SMS thread queries
create index if not exists idx_reply_threads_channel 
  on public.reply_threads(channel, last_message_at desc);

-- ============================================================================
-- 4. EXTEND contacts TABLE FOR SMS OPT-OUT
-- ============================================================================

alter table public.contacts
  add column if not exists sms_opt_out boolean default false,
  add column if not exists phone text;

-- Index for SMS opt-out queries
create index if not exists idx_contacts_sms_opt_out 
  on public.contacts(sms_opt_out) 
  where sms_opt_out = true;

create index if not exists idx_contacts_phone 
  on public.contacts(phone) 
  where phone is not null;

-- ============================================================================
-- 5. EXTEND campaign_steps FOR SMS STEP TYPE
-- ============================================================================

-- Ensure step_type column exists (from Block 459)
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
      and table_name = 'campaign_steps' 
      and column_name = 'step_type'
  ) then
    alter table public.campaign_steps
      add column step_type text default 'email' 
        check (step_type in ('email', 'sms', 'call', 'linkedin', 'manual'));
    
    update public.campaign_steps 
    set step_type = 'email' 
    where step_type is null;
    
    alter table public.campaign_steps
      alter column step_type set not null;
  end if;
end $$;

-- Ensure SMS-specific columns exist (from Block 459)
alter table public.campaign_steps
  add column if not exists sms_body text,
  add column if not exists sms_phone_field text default 'phone',
  add column if not exists sms_provider text default 'twilio',
  add column if not exists sms_send_window_start text,
  add column if not exists sms_send_window_end text,
  add column if not exists sms_throttle_per_hour int default 10;

-- ============================================================================
-- 6. CREATE SMS USAGE TRACKING TABLE
-- ============================================================================

create table if not exists public.sms_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  sms_sent int default 0,
  sms_delivered int default 0,
  sms_failed int default 0,
  sms_replied int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(organization_id, period_start)
);

-- Indexes for SMS usage queries
create index if not exists idx_sms_usage_org_period 
  on public.sms_usage(organization_id, period_start desc);

-- Enable RLS on sms_usage
alter table public.sms_usage enable row level security;

-- RLS policy: Users can view SMS usage for their organizations
create policy if not exists "sms_usage_select_org" on public.sms_usage
  for select
  using (
    exists (
      select 1 from public.org_members om
      where om.org_id = sms_usage.organization_id
        and om.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 7. CREATE SMS SUPPRESSIONS TABLE (OPT-OUT HANDLING)
-- ============================================================================

create table if not exists public.sms_suppressions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  phone_number text not null,
  reason text default 'stop' check (reason in ('stop', 'stopall', 'cancel', 'end', 'quit', 'unsubscribe', 'bounce', 'complaint', 'manual')),
  suppressed_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(organization_id, phone_number)
);

-- Indexes for SMS suppressions
create index if not exists idx_sms_suppressions_phone 
  on public.sms_suppressions(phone_number);

create index if not exists idx_sms_suppressions_org 
  on public.sms_suppressions(organization_id);

-- Enable RLS on sms_suppressions
alter table public.sms_suppressions enable row level security;

-- RLS policy: Users can view suppressions for their organizations
create policy if not exists "sms_suppressions_select_org" on public.sms_suppressions
  for select
  using (
    exists (
      select 1 from public.org_members om
      where om.org_id = sms_suppressions.organization_id
        and om.user_id = auth.uid()
    )
  );

-- RLS policy: Service role can insert suppressions (for webhook handling)
create policy if not exists "sms_suppressions_insert_service" on public.sms_suppressions
  for insert
  to service_role
  with check (true);

-- ============================================================================
-- 8. HELPER FUNCTIONS FOR SMS OPERATIONS
-- ============================================================================

-- Function to check if phone number is suppressed
create or replace function public.is_sms_suppressed(
  p_phone text,
  p_org_id uuid
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 
    from public.sms_suppressions 
    where phone_number = p_phone 
      and (organization_id = p_org_id or organization_id is null)
  )
  or exists (
    select 1
    from public.contacts c
    join public.campaigns camp on camp.org_id = p_org_id
    where c.phone = p_phone
      and c.sms_opt_out = true
  );
$$;

-- Function to get SMS plan limit
create or replace function public.get_sms_plan_limit(p_org_id uuid)
returns int
language plpgsql
stable
as $$
declare
  v_plan text;
begin
  -- Try to get plan from account_subscriptions first
  select plan_name into v_plan
  from public.account_subscriptions
  where account_id = p_org_id
  limit 1;
  
  -- If not found, try profiles table (common pattern)
  if v_plan is null then
    select plan into v_plan
    from public.profiles
    where id in (
      select user_id from public.org_members where org_id = p_org_id limit 1
    )
    limit 1;
  end if;
  
  -- Return limit based on plan (normalize plan name)
  v_plan := lower(coalesce(v_plan, ''));
  
  case v_plan
    when 'starter', 'free' then return 200;
    when 'growth', 'pro' then return 500;
    when 'domination', 'enterprise' then return 2000;
    else return 0; -- Free plan or no plan
  end case;
end;
$$;

-- Function to check SMS sending limit
create or replace function public.can_send_sms(
  p_org_id uuid,
  p_count int default 1
)
returns table(allowed boolean, current_count int, limit_count int, remaining int)
language plpgsql
as $$
declare
  v_limit int;
  v_current int;
  v_period_start timestamptz;
begin
  -- Get plan limit
  v_limit := public.get_sms_plan_limit(p_org_id);
  
  if v_limit = 0 then
    return query select false, 0, 0, 0;
    return;
  end if;
  
  -- Get current period start
  select sms_period_start into v_period_start
  from public.organizations
  where id = p_org_id;
  
  -- Reset period if needed (new month)
  if v_period_start is null or v_period_start < date_trunc('month', now()) then
    update public.organizations
    set sms_period_start = date_trunc('month', now()),
        sms_sent_this_period = 0
    where id = p_org_id;
    v_period_start := date_trunc('month', now());
    v_current := 0;
  else
    select sms_sent_this_period into v_current
    from public.organizations
    where id = p_org_id;
  end if;
  
  -- Check limit
  return query select
    (v_current + p_count <= v_limit) as allowed,
    v_current as current_count,
    v_limit as limit_count,
    greatest(v_limit - v_current, 0) as remaining;
end;
$$;

-- Function to increment SMS usage
create or replace function public.increment_sms_usage(
  p_org_id uuid,
  p_count int default 1
)
returns void
language plpgsql
as $$
declare
  v_period_start timestamptz;
begin
  -- Get or set period start
  select sms_period_start into v_period_start
  from public.organizations
  where id = p_org_id;
  
  -- Reset if new month
  if v_period_start is null or v_period_start < date_trunc('month', now()) then
    update public.organizations
    set sms_period_start = date_trunc('month', now()),
        sms_sent_this_period = p_count
    where id = p_org_id;
  else
    update public.organizations
    set sms_sent_this_period = sms_sent_this_period + p_count
    where id = p_org_id;
  end if;
  
  -- Update usage tracking table
  insert into public.sms_usage (
    organization_id,
    period_start,
    period_end,
    sms_sent
  )
  values (
    p_org_id,
    date_trunc('month', now()),
    (date_trunc('month', now()) + interval '1 month - 1 day'),
    p_count
  )
  on conflict (organization_id, period_start)
  do update set
    sms_sent = sms_usage.sms_sent + p_count,
    updated_at = now();
end;
$$;

-- Function to handle SMS opt-out
create or replace function public.handle_sms_opt_out(
  p_phone text,
  p_org_id uuid,
  p_reason text default 'stop'
)
returns void
language plpgsql
as $$
begin
  -- Add to suppressions table
  insert into public.sms_suppressions (
    organization_id,
    phone_number,
    reason
  )
  values (
    p_org_id,
    p_phone,
    p_reason
  )
  on conflict (organization_id, phone_number)
  do update set
    reason = p_reason,
    suppressed_at = now();
  
  -- Update contact if exists (try both org_id and user_id patterns)
  update public.contacts
  set sms_opt_out = true
  where phone = p_phone
    and (
      org_id = p_org_id
      or user_id in (select user_id from public.org_members where org_id = p_org_id)
    );
end;
$$;

-- ============================================================================
-- 9. CREATE SMS MESSAGES TABLE (if messages table doesn't support SMS well)
-- ============================================================================

-- This is optional - we're using the messages table with channel column
-- But we can create a view for easier SMS-specific queries

create or replace view public.v_sms_messages as
select 
  m.*,
  rt.id as thread_id,
  rt.workspace_id,
  rt.lead_id,
  rt.campaign_id
from public.messages m
left join public.reply_threads rt on rt.id = m.thread_id
where m.channel = 'sms';

grant select on public.v_sms_messages to authenticated;

-- ============================================================================
-- 10. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Additional indexes for SMS queries
create index if not exists idx_messages_thread_channel 
  on public.messages(thread_id, channel, created_at desc);

create index if not exists idx_reply_threads_workspace_channel 
  on public.reply_threads(workspace_id, channel, last_message_at desc)
  where workspace_id is not null;

-- ============================================================================
-- BLOCK 13000 COMPLETE
-- ============================================================================

