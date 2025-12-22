-- Block 12100 — Multi-Email Rotation Engine v1
-- Identity Cycling + Load Balancing + Safe Sending Distribution
-- 
-- This block implements automatic rotation between multiple sending identities,
-- balancing sending volume safely and avoiding deliverability spikes.

-- ============================================================================
-- 1. EXTEND email_credentials WITH STATUS FIELDS
-- ============================================================================

alter table public.email_credentials
  add column if not exists disabled boolean default false,
  add column if not exists disable_reason text null,
  add column if not exists hourly_send_limit int default 200,
  add column if not exists last_risk_score int check (last_risk_score between 0 and 100),
  add column if not exists last_risk_checked_at timestamptz;

-- Create index for disabled status queries
create index if not exists idx_email_credentials_disabled 
  on public.email_credentials(org_id, disabled) 
  where disabled = false;

-- Create index for risk score queries
create index if not exists idx_email_credentials_risk_score 
  on public.email_credentials(last_risk_score) 
  where last_risk_score is not null;

-- ============================================================================
-- 2. CREATE identity_usage TABLE FOR TRACKING
-- ============================================================================

create table if not exists public.identity_usage (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  identity_id uuid not null references public.email_credentials(id) on delete cascade,
  date date not null,
  sent_count int default 0,
  hour timestamp not null,
  hour_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(identity_id, date, hour)
);

create index if not exists idx_identity_usage_org_date 
  on public.identity_usage(org_id, date);

create index if not exists idx_identity_usage_identity_date 
  on public.identity_usage(identity_id, date);

create index if not exists idx_identity_usage_identity_hour 
  on public.identity_usage(identity_id, hour);

-- Trigger to update updated_at
create or replace function update_identity_usage_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_update_identity_usage_updated_at on public.identity_usage;
create trigger trg_update_identity_usage_updated_at
  before update on public.identity_usage
  for each row
  execute function update_identity_usage_updated_at();

-- ============================================================================
-- 3. ADD last_rotation_index TO organizations TABLE
-- ============================================================================

alter table public.organizations
  add column if not exists last_rotation_index int default 0;

-- ============================================================================
-- 4. FUNCTION TO GET HEALTHY IDENTITIES FOR ROTATION
-- ============================================================================

create or replace function public.get_healthy_identities(
  p_org_id uuid
)
returns table (
  id uuid,
  identity_name text,
  email_address text,
  daily_send_limit int,
  hourly_send_limit int,
  sent_today int,
  sent_this_hour int,
  daily_remaining int,
  hourly_remaining int,
  last_risk_score int,
  disabled boolean,
  disable_reason text
)
language plpgsql
stable
as $$
declare
  v_today date := current_date;
  v_current_hour timestamp := date_trunc('hour', now());
begin
  return query
  with daily_usage as (
    select 
      identity_id,
      sum(sent_count) as total_sent
    from public.identity_usage
    where org_id = p_org_id
      and date = v_today
    group by identity_id
  ),
  hourly_usage as (
    select 
      identity_id,
      sum(hour_count) as total_hour_sent
    from public.identity_usage
    where org_id = p_org_id
      and hour = v_current_hour
    group by identity_id
  )
  select 
    ec.id,
    ec.identity_name,
    ec.email_address,
    coalesce(ec.daily_send_limit, 500) as daily_send_limit,
    coalesce(ec.hourly_send_limit, 200) as hourly_send_limit,
    coalesce(du.total_sent, 0)::int as sent_today,
    coalesce(hu.total_hour_sent, 0)::int as sent_this_hour,
    greatest(coalesce(ec.daily_send_limit, 500) - coalesce(du.total_sent, 0), 0)::int as daily_remaining,
    greatest(coalesce(ec.hourly_send_limit, 200) - coalesce(hu.total_hour_sent, 0), 0)::int as hourly_remaining,
    ec.last_risk_score,
    coalesce(ec.disabled, false) as disabled,
    ec.disable_reason
  from public.email_credentials ec
  left join daily_usage du on du.identity_id = ec.id
  left join hourly_usage hu on hu.identity_id = ec.id
  where ec.org_id = p_org_id
    and ec.verified = true
    and coalesce(ec.disabled, false) = false
    and (ec.last_risk_score is null or ec.last_risk_score >= 40)
  order by 
    coalesce(du.total_sent, 0) asc,  -- Least sent today first
    ec.email_address asc;              -- Stable tie-breaker
end;
$$;

grant execute on function public.get_healthy_identities(uuid) to authenticated, service_role;

-- ============================================================================
-- 5. FUNCTION TO SELECT NEXT IDENTITY FOR ROTATION
-- ============================================================================

create or replace function public.select_next_identity(
  p_org_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_identities uuid[];
  v_count int;
  v_current_index int;
  v_next_index int;
  v_selected_id uuid;
begin
  -- Get all healthy identities
  select array_agg(id order by sent_today asc, email_address asc)
  into v_identities
  from public.get_healthy_identities(p_org_id)
  where daily_remaining > 0
    and hourly_remaining > 0;
  
  -- If no healthy identities, return null
  if v_identities is null or array_length(v_identities, 1) = 0 then
    return null;
  end if;
  
  v_count := array_length(v_identities, 1);
  
  -- Get current rotation index
  select coalesce(last_rotation_index, 0)
  into v_current_index
  from public.organizations
  where id = p_org_id;
  
  -- Round-robin: next index
  v_next_index := (v_current_index + 1) % v_count;
  
  -- Get selected identity
  v_selected_id := v_identities[v_next_index + 1];  -- PostgreSQL arrays are 1-indexed
  
  -- Update rotation index
  update public.organizations
  set last_rotation_index = v_next_index
  where id = p_org_id;
  
  return v_selected_id;
end;
$$;

grant execute on function public.select_next_identity(uuid) to authenticated, service_role;

-- ============================================================================
-- 6. FUNCTION TO RECORD IDENTITY USAGE
-- ============================================================================

create or replace function public.record_identity_send(
  p_org_id uuid,
  p_identity_id uuid,
  p_count int default 1
)
returns void
language plpgsql
as $$
declare
  v_today date := current_date;
  v_current_hour timestamp := date_trunc('hour', now());
begin
  -- Upsert daily and hourly counts
  insert into public.identity_usage (
    org_id,
    identity_id,
    date,
    sent_count,
    hour,
    hour_count
  )
  values (
    p_org_id,
    p_identity_id,
    v_today,
    p_count,
    v_current_hour,
    p_count
  )
  on conflict (identity_id, date, hour) 
  do update set
    sent_count = identity_usage.sent_count + p_count,
    hour_count = identity_usage.hour_count + p_count,
    updated_at = now();
end;
$$;

grant execute on function public.record_identity_send(uuid, uuid, int) to authenticated, service_role;

-- ============================================================================
-- 7. FUNCTION TO CHECK IDENTITY HEALTH (INTEGRATES WARMUP & REPUTATION)
-- ============================================================================

create or replace function public.check_identity_health(
  p_identity_id uuid
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_identity record;
  v_bounce_rate numeric;
  v_is_healthy boolean := true;
  v_reasons text[] := '{}';
  v_result jsonb;
begin
  -- Get identity info
  select 
    ec.*,
    ec.last_risk_score as warmup_score
  into v_identity
  from public.email_credentials ec
  where ec.id = p_identity_id;
  
  if not found then
    return jsonb_build_object(
      'healthy', false,
      'reason', 'Identity not found'
    );
  end if;
  
  -- Check 1: Disabled flag
  if coalesce(v_identity.disabled, false) then
    v_is_healthy := false;
    v_reasons := array_append(v_reasons, 
      coalesce(v_identity.disable_reason, 'Identity disabled')
    );
  end if;
  
  -- Check 2: Warmup score < 40
  if v_identity.warmup_score is not null and v_identity.warmup_score < 40 then
    v_is_healthy := false;
    v_reasons := array_append(v_reasons, 
      format('Warmup score too low: %s (minimum: 40)', v_identity.warmup_score)
    );
  end if;
  
  -- Check 3: Bounce rate > 8% (from reputation guard)
  -- Check email_bounce_summary if it exists
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'email_bounce_summary'
  ) then
    select bounce_rate
    into v_bounce_rate
    from public.email_bounce_summary
    where sending_identity = v_identity.email_address
    limit 1;
    
    if v_bounce_rate is not null and v_bounce_rate > 8.0 then
      v_is_healthy := false;
      v_reasons := array_append(v_reasons, 
        format('Bounce rate too high: %.2f%% (maximum: 8%%)', v_bounce_rate)
      );
    end if;
  end if;
  
  -- Build result
  v_result := jsonb_build_object(
    'healthy', v_is_healthy,
    'identity_id', p_identity_id,
    'email_address', v_identity.email_address,
    'warmup_score', v_identity.warmup_score,
    'disabled', coalesce(v_identity.disabled, false),
    'disable_reason', v_identity.disable_reason,
    'bounce_rate', v_bounce_rate,
    'reasons', v_reasons
  );
  
  return v_result;
end;
$$;

grant execute on function public.check_identity_health(uuid) to authenticated, service_role;

-- ============================================================================
-- 8. FUNCTION TO AUTO-DISABLE IDENTITY (CALLED BY REPUTATION GUARD)
-- ============================================================================

create or replace function public.auto_disable_identity(
  p_identity_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
as $$
begin
  update public.email_credentials
  set 
    disabled = true,
    disable_reason = p_reason
  where id = p_identity_id;
end;
$$;

grant execute on function public.auto_disable_identity(uuid, text) to authenticated, service_role;

-- ============================================================================
-- 9. FUNCTION TO GET CAMPAIGN IDENTITY DISTRIBUTION
-- ============================================================================

create or replace function public.get_campaign_identity_distribution(
  p_campaign_id uuid
)
returns table (
  identity_id uuid,
  identity_name text,
  email_address text,
  send_count bigint,
  percentage numeric
)
language sql
stable
as $$
  with campaign_sends as (
    select 
      sending_identity_id as identity_id,
      count(*) as send_count
    from public.send_queue
    where campaign_id = p_campaign_id
      and sending_identity_id is not null
    group by sending_identity_id
  ),
  total_sends as (
    select sum(send_count) as total
    from campaign_sends
  )
  select 
    ec.id as identity_id,
    ec.identity_name,
    ec.email_address,
    coalesce(cs.send_count, 0)::bigint as send_count,
    case 
      when ts.total > 0 and ts.total is not null then 
        round((coalesce(cs.send_count, 0)::numeric / ts.total::numeric * 100), 2)
      else 0
    end as percentage
  from campaign_sends cs
  join public.email_credentials ec on ec.id = cs.identity_id
  cross join total_sends ts
  order by cs.send_count desc;
$$;

grant execute on function public.get_campaign_identity_distribution(uuid) to authenticated;

-- ============================================================================
-- 10. TRIGGER TO AUTO-DISABLE ON HIGH BOUNCE RATE
-- ============================================================================

-- This will be called by reputation guard when bounce rate exceeds threshold
-- We'll create a function that reputation guard can call

-- ============================================================================
-- 11. COMMENTS
-- ============================================================================

comment on column public.email_credentials.disabled is 'Whether this identity is disabled from rotation';
comment on column public.email_credentials.disable_reason is 'Reason why identity was disabled (e.g., high bounce rate, warmup needed)';
comment on column public.email_credentials.hourly_send_limit is 'Maximum emails per hour for this identity';
comment on column public.email_credentials.last_risk_score is 'Last warmup risk score (0-100, <40 = unhealthy)';
comment on column public.organizations.last_rotation_index is 'Last used index in round-robin rotation';
comment on table public.identity_usage is 'Tracks daily and hourly send counts per identity for limit enforcement';
comment on function public.select_next_identity(uuid) is 'Selects next identity for rotation using round-robin';
comment on function public.get_healthy_identities(uuid) is 'Returns all healthy identities available for rotation';
comment on function public.record_identity_send(uuid, uuid, int) is 'Records a send event for usage tracking';
comment on function public.check_identity_health(uuid) is 'Checks if identity is healthy (warmup, bounce rate, disabled status)';
comment on function public.get_campaign_identity_distribution(uuid) is 'Returns distribution of sends across identities for a campaign';

