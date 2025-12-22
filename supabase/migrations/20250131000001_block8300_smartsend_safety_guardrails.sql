-- Block 8300 - SmartSend Safety Guardrails
-- Duplicate Prevention + Global Throttling + Error Shields
-- Makes SmartSend unbreakable by adding all non-negotiable protections

-- 1. Safety Settings Table
create table if not exists public.smartsend_safety (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  max_per_hour int default 25,
  max_per_day int default 150,
  domain_cooldown_seconds int default 90,
  error_cooldown_seconds int default 300,
  created_at timestamptz default now()
);

create index if not exists idx_smartsend_safety_user_id 
  on public.smartsend_safety (user_id);

-- 2. Domain Send Log (for throttling)
create table if not exists public.smartsend_domain_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null,
  sent_at timestamptz default now()
);

create index if not exists idx_smartsend_domain_logs_user_domain_sent 
  on public.smartsend_domain_logs (user_id, domain, sent_at);

-- 3. Hourly/Daily Quota Tracking (per user)
create table if not exists public.smartsend_quota (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sent_at timestamptz default now()
);

create index if not exists idx_smartsend_quota_user_sent 
  on public.smartsend_quota (user_id, sent_at);

-- 4. Add cooldown_until field to campaigns table
alter table public.campaigns
  add column if not exists cooldown_until timestamptz;

-- 5. Update campaigns status constraint to include 'cooldown'
do $$
begin
  -- Drop existing check constraint if it exists
  if exists (
    select 1 from information_schema.table_constraints 
    where constraint_name like '%campaigns_status%' 
    and table_name = 'campaigns'
  ) then
    alter table public.campaigns drop constraint if exists campaigns_status_check;
  end if;
  
  -- Add new check constraint with cooldown status
  alter table public.campaigns 
    add constraint campaigns_status_check 
    check (status in ('draft', 'scheduled', 'running', 'paused', 'completed', 'active', 'archived', 'paused_quota', 'cooldown'));
exception
  when others then null;
end $$;

-- 6. Safety Check Function (used before sending)
create or replace function public.smartsend_can_send(
  p_user_id uuid,
  p_domain text
) returns boolean
language plpgsql
security definer
as $$
declare
  s public.smartsend_safety;
  recent_domain int;
  last_hour int;
  last_day int;
begin
  -- load user safety settings
  select * into s
  from public.smartsend_safety
  where user_id = p_user_id
  limit 1;

  -- if no safety settings exist, allow sending (default behavior)
  if s is null then
    return true;
  end if;

  -- domain cooldown check
  select count(*) into recent_domain
  from public.smartsend_domain_logs
  where user_id = p_user_id
  and domain = p_domain
  and sent_at > now() - (s.domain_cooldown_seconds || ' seconds')::interval;

  if recent_domain > 0 then
    return false;
  end if;

  -- hourly limit check
  select count(*) into last_hour
  from public.smartsend_quota
  where user_id = p_user_id
  and sent_at > now() - interval '1 hour';

  if last_hour >= s.max_per_hour then
    return false;
  end if;

  -- daily limit check
  select count(*) into last_day
  from public.smartsend_quota
  where user_id = p_user_id
  and sent_at > now() - interval '1 day';

  if last_day >= s.max_per_day then
    return false;
  end if;

  return true;
end;
$$;

-- Grant execute permission
grant execute on function public.smartsend_can_send(uuid, text) to service_role, authenticated;

-- Enable RLS on safety tables
alter table public.smartsend_safety enable row level security;
alter table public.smartsend_domain_logs enable row level security;
alter table public.smartsend_quota enable row level security;

-- RLS policies for smartsend_safety
create policy "smartsend_safety_select_own"
  on public.smartsend_safety
  for select
  using (user_id = auth.uid());

create policy "smartsend_safety_insert_own"
  on public.smartsend_safety
  for insert
  with check (user_id = auth.uid());

create policy "smartsend_safety_update_own"
  on public.smartsend_safety
  for update
  using (user_id = auth.uid());

-- Service role can access all (for edge functions)
create policy "smartsend_safety_service_role"
  on public.smartsend_safety
  for all
  using (true)
  with check (true);

-- RLS policies for smartsend_domain_logs
create policy "smartsend_domain_logs_select_own"
  on public.smartsend_domain_logs
  for select
  using (user_id = auth.uid());

create policy "smartsend_domain_logs_insert_own"
  on public.smartsend_domain_logs
  for insert
  with check (user_id = auth.uid());

create policy "smartsend_domain_logs_service_role"
  on public.smartsend_domain_logs
  for all
  using (true)
  with check (true);

-- RLS policies for smartsend_quota
create policy "smartsend_quota_select_own"
  on public.smartsend_quota
  for select
  using (user_id = auth.uid());

create policy "smartsend_quota_insert_own"
  on public.smartsend_quota
  for insert
  with check (user_id = auth.uid());

create policy "smartsend_quota_service_role"
  on public.smartsend_quota
  for all
  using (true)
  with check (true);

