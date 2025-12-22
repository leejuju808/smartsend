-- Sender Health & Deliverability System
-- Adds warmup throttling, bounce tracking, and health scores

-- 1) Enhance sender_profiles with health tracking fields
do $$
begin
  -- Add team_id if it doesn't exist
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'sender_profiles' and column_name = 'team_id'
  ) then
    alter table public.sender_profiles 
      add column team_id uuid references public.teams(id) on delete cascade;
  end if;

  -- Add warmup_stage if it doesn't exist
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'sender_profiles' and column_name = 'warmup_stage'
  ) then
    alter table public.sender_profiles 
      add column warmup_stage int not null default 1;
  end if;

  -- Add bounce_rate if it doesn't exist
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'sender_profiles' and column_name = 'bounce_rate'
  ) then
    alter table public.sender_profiles 
      add column bounce_rate numeric not null default 0;
  end if;

  -- Add complaints if it doesn't exist
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'sender_profiles' and column_name = 'complaints'
  ) then
    alter table public.sender_profiles 
      add column complaints int not null default 0;
  end if;

  -- Add health_score if it doesn't exist
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'sender_profiles' and column_name = 'health_score'
  ) then
    alter table public.sender_profiles 
      add column health_score numeric not null default 100;
  end if;

  -- Update daily_limit default for new senders (warmup starts at 25)
  -- Existing senders keep their current limit
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'sender_profiles' and column_name = 'daily_limit'
  ) then
    -- Set new senders to 25 if they have default value (200) and are new
    update public.sender_profiles 
    set daily_limit = 25 
    where daily_limit = 200 
      and warmup_stage = 1 
      and created_at > now() - interval '1 day';
  end if;

  -- Ensure email is unique (if not already)
  if not exists (
    select 1 from information_schema.table_constraints 
    where constraint_name = 'sender_profiles_email_key' 
      and table_name = 'sender_profiles'
  ) then
    create unique index if not exists sender_profiles_email_key on public.sender_profiles(email);
  end if;
end $$;

-- Update provider check to include 'smtp' if needed
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints 
    where constraint_name = 'sender_profiles_provider_check'
  ) then
    -- Drop old constraint
    alter table public.sender_profiles drop constraint if exists sender_profiles_provider_check;
  end if;
  -- Add new constraint
  alter table public.sender_profiles 
    add constraint sender_profiles_provider_check 
    check (provider in ('gmail','outlook','smtp'));
exception when others then
  -- Constraint might already exist with correct values, ignore
  null;
end $$;

-- 2) Create bounce_logs table
create table if not exists public.bounce_logs (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.sender_profiles(id) on delete cascade,
  campaign_id uuid references public.campaigns(id),
  lead_id uuid references public.campaign_leads(id),
  reason text,
  type text check (type in ('soft','hard')),
  created_at timestamptz default now()
);

-- Indexes for bounce_logs
create index if not exists idx_bounce_logs_sender on public.bounce_logs(sender_id);
create index if not exists idx_bounce_logs_campaign on public.bounce_logs(campaign_id);
create index if not exists idx_bounce_logs_created on public.bounce_logs(created_at);

-- Enable RLS on bounce_logs
alter table public.bounce_logs enable row level security;

-- Drop existing policy if it exists
drop policy if exists "bounce read" on public.bounce_logs;

-- RLS policy: users can read bounces for their sender profiles
create policy "bounce read" on public.bounce_logs
  for select using (
    exists (
      select 1 from public.sender_profiles s 
      where s.id = bounce_logs.sender_id 
        and s.user_id = auth.uid()
    )
  );

-- 3) Add sender_id to send_queue if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'sender_id'
  ) then
    alter table public.send_queue 
      add column sender_id uuid references public.sender_profiles(id) on delete set null;
    
    create index if not exists idx_send_queue_sender on public.send_queue(sender_id);
  end if;
end $$;

-- 4) Create function to update sender health score
create or replace function public.update_sender_health(p_sender_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_bounce_count int;
  v_sent_count int;
  v_rate numeric;
  v_health numeric;
begin
  -- Count bounces in last 7 days
  select count(*) into v_bounce_count
  from public.bounce_logs
  where sender_id = p_sender_id
    and created_at > now() - interval '7 days';

  -- Count sent emails in last 7 days (check both send_logs.queue_id and send_queue directly)
  select count(*) into v_sent_count
  from public.send_queue sq
  where sq.sender_id = p_sender_id
    and sq.status = 'sent'
    and sq.sent_at > now() - interval '7 days';

  -- Calculate bounce rate
  if v_sent_count > 0 then
    v_rate := v_bounce_count::numeric / v_sent_count::numeric;
  else
    v_rate := 0;
  end if;

  -- Calculate health score (simple formula: 100 - (rate * 400), min 10)
  v_health := greatest(10, round(100 - (v_rate * 400)));

  -- Update sender profile
  update public.sender_profiles
  set bounce_rate = v_rate,
      health_score = v_health,
      updated_at = now()
  where id = p_sender_id;
end;
$$;

-- Grant execute to service role
grant execute on function public.update_sender_health(uuid) to service_role;

-- 5) Create function for daily warmup increment
create or replace function public.increment_warmup_daily()
returns void
language plpgsql
security definer
as $$
begin
  -- Increment daily_limit by 25 up to 200, increment warmup_stage
  update public.sender_profiles
  set daily_limit = least(daily_limit + 25, 200),
      warmup_stage = warmup_stage + 1,
      updated_at = now()
  where daily_limit < 200
    and health_score >= 70; -- Only warmup if health is good
end;
$$;

-- Grant execute to service role
grant execute on function public.increment_warmup_daily() to service_role;

-- 6) Create function for auto-suspend bad senders
create or replace function public.auto_suspend_bad_senders()
returns void
language plpgsql
security definer
as $$
begin
  -- Reduce daily limit for bad senders (health < 40)
  update public.sender_profiles
  set daily_limit = greatest(daily_limit - 25, 10),
      updated_at = now()
  where health_score < 40
    and daily_limit > 10;
end;
$$;

-- Grant execute to service role
grant execute on function public.auto_suspend_bad_senders() to service_role;

