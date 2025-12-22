-- =========================================================
-- Block 11600 — SmartSend Sending Health Monitor v1
-- (The Deliverability Guardian That Keeps Roofers Out of Spam Forever)
-- =========================================================

-- =====================================================
-- 1) Sending Health Table
-- =====================================================

create table if not exists public.sending_health (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bounce_24h numeric not null default 0,           -- bounce rate in last 24h (%)
  complaint_24h numeric not null default 0,        -- complaint rate in last 24h (%)
  volume_24h int not null default 0,                -- emails sent in last 24h
  domain_age_days int,                             -- age of primary sending domain
  health_score int not null default 100,           -- 0-100 health score
  safe_mode boolean not null default false,        -- safe mode enabled (slow rate limit)
  paused_until timestamptz,                        -- paused until this time (null if not paused)
  pause_reason text,                                -- reason for pause (e.g., 'high_bounce_rate')
  last_updated timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id)
);

-- Indexes
create index if not exists idx_sending_health_user on public.sending_health(user_id);
create index if not exists idx_sending_health_score on public.sending_health(health_score);
create index if not exists idx_sending_health_paused on public.sending_health(paused_until) where paused_until is not null;

-- Enable RLS
alter table public.sending_health enable row level security;

-- RLS: Users can view their own health
create policy "sending_health_select_own" on public.sending_health
  for select using (auth.uid() = user_id);

-- Service role can manage all
create policy "sending_health_service_role" on public.sending_health
  for all to service_role using (true) with check (true);

-- =====================================================
-- 2) Health Score Calculation Function
-- =====================================================

create or replace function public.calculate_sending_health_score(
  p_user_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bounce_rate numeric;
  v_complaint_rate numeric;
  v_volume_24h int;
  v_domain_age_days int;
  v_score int := 100;
begin
  -- Get 24h metrics from sending_health table
  select 
    bounce_24h,
    complaint_24h,
    volume_24h,
    domain_age_days
  into 
    v_bounce_rate,
    v_complaint_rate,
    v_volume_24h,
    v_domain_age_days
  from public.sending_health
  where user_id = p_user_id;
  
  -- If no record exists, return default score
  if not found then
    return 50;
  end if;
  
  -- Calculate score: 40% bounce rate, 30% complaint rate, 20% volume, 10% domain age
  -- Bounce rate penalty (40% weight)
  if v_bounce_rate > 5 then
    v_score := v_score - 40; -- Critical: >5% bounce rate
  elsif v_bounce_rate > 3 then
    v_score := v_score - 25; -- Warning: >3% bounce rate
  elsif v_bounce_rate > 1 then
    v_score := v_score - 10; -- Minor: >1% bounce rate
  end if;
  
  -- Complaint rate penalty (30% weight)
  if v_complaint_rate > 0.5 then
    v_score := v_score - 30; -- Critical: >0.5% complaint rate
  elsif v_complaint_rate > 0.3 then
    v_score := v_score - 20; -- Warning: >0.3% complaint rate
  elsif v_complaint_rate > 0.1 then
    v_score := v_score - 10; -- Minor: >0.1% complaint rate
  end if;
  
  -- Volume penalty (20% weight) - too many emails at once
  if v_volume_24h > 200 then
    v_score := v_score - 20; -- Too many emails
  elsif v_volume_24h > 100 then
    v_score := v_score - 10; -- High volume
  end if;
  
  -- Domain age bonus/penalty (10% weight)
  if v_domain_age_days is null then
    v_score := v_score - 5; -- Unknown domain age
  elsif v_domain_age_days < 14 then
    v_score := v_score - 10; -- Very new domain
  elsif v_domain_age_days < 30 then
    v_score := v_score - 5; -- New domain
  elsif v_domain_age_days > 90 then
    v_score := v_score + 5; -- Established domain bonus
  end if;
  
  -- Clamp between 0-100
  v_score := greatest(0, least(100, v_score));
  
  return v_score;
end;
$$;

grant execute on function public.calculate_sending_health_score(uuid) to service_role;

-- =====================================================
-- 3) Update Sending Health Metrics Function
-- =====================================================

create or replace function public.update_sending_health_metrics(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bounce_count int;
  v_complaint_count int;
  v_sent_count int;
  v_bounce_rate numeric;
  v_complaint_rate numeric;
  v_domain_age_days int;
  v_health_score int;
  v_24h_ago timestamptz;
begin
  v_24h_ago := now() - interval '24 hours';
  
  -- Get bounce count (from delivery_events or send_logs with status='bounced')
  select count(*) into v_bounce_count
  from public.send_logs sl
  join public.campaigns c on c.id = sl.campaign_id
  where c.user_id = p_user_id
    and (
      sl.status = 'bounced'
      or exists (
        select 1 from public.delivery_events de
        where de.send_log_id = sl.id
        and de.type = 'bounce'
        and de.created_at >= v_24h_ago
      )
    )
    and sl.sent_at >= v_24h_ago;
  
  -- Get complaint count
  select count(*) into v_complaint_count
  from public.send_logs sl
  join public.campaigns c on c.id = sl.campaign_id
  join public.delivery_events de on de.send_log_id = sl.id
  where c.user_id = p_user_id
    and de.type = 'complaint'
    and de.created_at >= v_24h_ago;
  
  -- Get sent count (last 24h)
  select count(*) into v_sent_count
  from public.send_logs sl
  join public.campaigns c on c.id = sl.campaign_id
  where c.user_id = p_user_id
    and sl.status = 'sent'
    and sl.sent_at >= v_24h_ago;
  
  -- Calculate rates
  v_bounce_rate := case 
    when v_sent_count > 0 then (v_bounce_count::numeric / v_sent_count::numeric) * 100
    else 0
  end;
  
  v_complaint_rate := case
    when v_sent_count > 0 then (v_complaint_count::numeric / v_sent_count::numeric) * 100
    else 0
  end;
  
  -- Get domain age (from sender_domains or calculate from first campaign)
  -- Try to get from sender_domains first
  select extract(epoch from (now() - min(sd.created_at))) / 86400 into v_domain_age_days
  from public.sender_domains sd
  join public.sender_inboxes si on si.domain_id = sd.id
  join public.connected_accounts ca on ca.email = si.email
  join public.send_logs sl on sl.mailbox_id = ca.id
  join public.campaigns c on c.id = sl.campaign_id
  where c.user_id = p_user_id
  limit 1;
  
  -- Fallback: calculate from first campaign created_at
  if v_domain_age_days is null then
    select extract(epoch from (now() - min(c.created_at))) / 86400 into v_domain_age_days
    from public.campaigns c
    where c.user_id = p_user_id;
  end if;
  
  -- Update or insert sending_health record (without health_score first)
  insert into public.sending_health (
    user_id,
    bounce_24h,
    complaint_24h,
    volume_24h,
    domain_age_days,
    last_updated
  )
  values (
    p_user_id,
    v_bounce_rate,
    v_complaint_rate,
    v_sent_count,
    v_domain_age_days::int,
    now()
  )
  on conflict (user_id) do update
  set
    bounce_24h = excluded.bounce_24h,
    complaint_24h = excluded.complaint_24h,
    volume_24h = excluded.volume_24h,
    domain_age_days = excluded.domain_age_days,
    last_updated = now();
  
  -- Now calculate health score with updated values
  v_health_score := public.calculate_sending_health_score(p_user_id);
  
  -- Update health score
  update public.sending_health
  set
    health_score = v_health_score,
    last_updated = now()
  where user_id = p_user_id;
end;
$$;

grant execute on function public.update_sending_health_metrics(uuid) to service_role;

-- =====================================================
-- 4) Safety Rule Enforcement Functions
-- =====================================================

-- Auto-pause on high bounce rate
create or replace function public.enforce_bounce_rate_safety(
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bounce_rate numeric;
  v_paused_until timestamptz;
begin
  select bounce_24h into v_bounce_rate
  from public.sending_health
  where user_id = p_user_id;
  
  if not found or v_bounce_rate is null then
    return false;
  end if;
  
  -- If bounce rate > 5%, pause for 24 hours
  if v_bounce_rate > 5 then
    v_paused_until := now() + interval '24 hours';
    
    update public.sending_health
    set
      paused_until = v_paused_until,
      pause_reason = 'high_bounce_rate',
      last_updated = now()
    where user_id = p_user_id;
    
    return true;
  end if;
  
  -- Check if pause should be lifted
  select paused_until into v_paused_until
  from public.sending_health
  where user_id = p_user_id;
  
  if v_paused_until is not null and v_paused_until <= now() then
    update public.sending_health
    set
      paused_until = null,
      pause_reason = null,
      last_updated = now()
    where user_id = p_user_id;
  end if;
  
  return false;
end;
$$;

grant execute on function public.enforce_bounce_rate_safety(uuid) to service_role;

-- Auto-pause on high complaint rate
create or replace function public.enforce_complaint_rate_safety(
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_complaint_rate numeric;
  v_paused_until timestamptz;
begin
  select complaint_24h into v_complaint_rate
  from public.sending_health
  where user_id = p_user_id;
  
  if not found or v_complaint_rate is null then
    return false;
  end if;
  
  -- If complaint rate > 0.5%, pause for 48 hours
  if v_complaint_rate > 0.5 then
    v_paused_until := now() + interval '48 hours';
    
    update public.sending_health
    set
      paused_until = v_paused_until,
      pause_reason = 'high_complaint_rate',
      last_updated = now()
    where user_id = p_user_id;
    
    return true;
  end if;
  
  -- Check if pause should be lifted
  select paused_until into v_paused_until
  from public.sending_health
  where user_id = p_user_id;
  
  if v_paused_until is not null and v_paused_until <= now() then
    update public.sending_health
    set
      paused_until = null,
      pause_reason = null,
      last_updated = now()
    where user_id = p_user_id;
  end if;
  
  return false;
end;
$$;

grant execute on function public.enforce_complaint_rate_safety(uuid) to service_role;

-- Enable safe mode for new domains or missing DNS
create or replace function public.enforce_safe_mode(
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_domain_age_days int;
  v_has_spf boolean;
  v_has_dkim boolean;
  v_safe_mode boolean;
begin
  select 
    domain_age_days,
    safe_mode
  into
    v_domain_age_days,
    v_safe_mode
  from public.sending_health
  where user_id = p_user_id;
  
  if not found then
    return false;
  end if;
  
  -- Check DNS setup (SPF/DKIM) from sender_domains
  select 
    bool_or(spf_pass) as has_spf,
    bool_or(dkim_pass) as has_dkim
  into
    v_has_spf,
    v_has_dkim
  from public.sender_domains sd
  join public.sender_inboxes si on si.domain_id = sd.id
  join public.connected_accounts ca on ca.email = si.email
  join public.send_logs sl on sl.mailbox_id = ca.id
  join public.campaigns c on c.id = sl.campaign_id
  where c.user_id = p_user_id
  limit 1;
  
  -- Enable safe mode if:
  -- 1. Domain age < 14 days, OR
  -- 2. SPF/DKIM not configured
  if (v_domain_age_days is not null and v_domain_age_days < 14) 
     or (coalesce(v_has_spf, false) = false or coalesce(v_has_dkim, false) = false) then
    if not v_safe_mode then
      update public.sending_health
      set
        safe_mode = true,
        last_updated = now()
      where user_id = p_user_id;
      return true;
    end if;
  else
    -- Disable safe mode if conditions are met
    if v_safe_mode then
      update public.sending_health
      set
        safe_mode = false,
        last_updated = now()
      where user_id = p_user_id;
      return true;
    end if;
  end if;
  
  return false;
end;
$$;

grant execute on function public.enforce_safe_mode(uuid) to service_role;

-- =====================================================
-- 5) Get Daily Send Allowance Function
-- =====================================================

create or replace function public.get_daily_send_allowance(
  p_user_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_domain_age_days int;
  v_health_score int;
  v_safe_mode boolean;
  v_paused_until timestamptz;
  v_allowance int;
begin
  -- Check if paused
  select paused_until into v_paused_until
  from public.sending_health
  where user_id = p_user_id;
  
  if v_paused_until is not null and v_paused_until > now() then
    return 0; -- Paused, no allowance
  end if;
  
  -- Get domain and health info
  select 
    domain_age_days,
    health_score,
    safe_mode
  into
    v_domain_age_days,
    v_health_score,
    v_safe_mode
  from public.sending_health
  where user_id = p_user_id;
  
  if not found then
    -- Default for new users
    return 40;
  end if;
  
  -- New domain (<14 days): Max 40 emails per day
  if v_domain_age_days is not null and v_domain_age_days < 14 then
    return 40;
  end if;
  
  -- Safe mode: Reduced allowance
  if v_safe_mode then
    return 50;
  end if;
  
  -- Warm domain: Based on health score
  -- Health score 90-100: 250 emails/day
  -- Health score 70-89: 150 emails/day
  -- Health score <70: 100 emails/day
  if v_health_score >= 90 then
    v_allowance := 250;
  elsif v_health_score >= 70 then
    v_allowance := 150;
  else
    v_allowance := 100;
  end if;
  
  return v_allowance;
end;
$$;

grant execute on function public.get_daily_send_allowance(uuid) to service_role;

-- =====================================================
-- 6) Comments
-- =====================================================

comment on table public.sending_health is 'Sending health monitor - tracks bounce/complaint rates and enforces safety rules';
comment on function public.calculate_sending_health_score(uuid) is 'Calculates 0-100 health score based on bounce rate (40%), complaint rate (30%), volume (20%), and domain age (10%)';
comment on function public.update_sending_health_metrics(uuid) is 'Updates sending health metrics for a user (bounce rate, complaint rate, volume, domain age)';
comment on function public.get_daily_send_allowance(uuid) is 'Returns daily send allowance based on domain age, health score, and safe mode status';

