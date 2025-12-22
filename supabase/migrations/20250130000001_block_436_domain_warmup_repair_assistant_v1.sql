-- Block 436 — Domain Warmup & Repair Assistant v1
-- Domain-Level Protection • DNS Health • Repair Instructions • Warmup Plan • Spam/Bounce Recovery • AI Fix Guide

-- ============================================
-- 1) Extend sender_domains table
-- ============================================

-- Add new columns to sender_domains (if they don't already exist)
alter table if exists public.sender_domains
  add column if not exists spf_valid boolean,
  add column if not exists dkim_valid boolean,
  add column if not exists dmarc_valid boolean,
  add column if not exists dns_last_checked timestamptz,
  add column if not exists domain_health_score int default 50 check (domain_health_score >= 0 and domain_health_score <= 100),
  add column if not exists warmup_stage int default 0 check (warmup_stage >= 0),
  add column if not exists domain_flags text[] default '{}';

-- Create indexes for domain health queries
create index if not exists idx_sender_domains_health_score on public.sender_domains(domain_health_score);
create index if not exists idx_sender_domains_warmup_stage on public.sender_domains(warmup_stage);
create index if not exists idx_sender_domains_dns_last_checked on public.sender_domains(dns_last_checked);

-- ============================================
-- 2) Domain Alerts Table
-- ============================================

create table if not exists public.domain_alerts (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.sender_domains(id) on delete cascade,
  alert_type text not null check (alert_type in (
    'spf_invalid',
    'dkim_invalid',
    'dmarc_missing',
    'bounce_spike',
    'spam_spike',
    'domain_critical',
    'domain_disabled',
    'tld_warning',
    'reputation_drop',
    'cooldown_needed'
  )),
  message text not null,
  severity text default 'warning' check (severity in ('info', 'warning', 'critical')),
  created_at timestamptz default now(),
  resolved boolean default false,
  resolved_at timestamptz
);

create index if not exists idx_domain_alerts_domain on public.domain_alerts(domain_id);
create index if not exists idx_domain_alerts_unresolved on public.domain_alerts(domain_id, resolved) where resolved = false;
create index if not exists idx_domain_alerts_type on public.domain_alerts(alert_type, resolved);

-- Enable RLS
alter table public.domain_alerts enable row level security;

-- RLS Policies for domain_alerts
create policy "domain_alerts_select_workspace_member" on public.domain_alerts
  for select using (
    exists (
      select 1 from public.sender_domains sd
      join public.workspace_members wm on wm.workspace_id = sd.workspace_id
      where sd.id = domain_alerts.domain_id
        and wm.user_id = auth.uid()
    )
  );

create policy "domain_alerts_service_role" on public.domain_alerts
  for all to service_role using (true) with check (true);

-- ============================================
-- 3) Domain Reputation Score Calculation Function
-- ============================================

create or replace function public.compute_domain_reputation_score(
  p_domain_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_score int := 100;
  v_domain record;
  v_bounce_rate numeric;
  v_spam_rate numeric;
  v_open_rate numeric;
  v_domain_age_days int;
  v_tld text;
  v_bounce_count int;
  v_spam_count int;
  v_sent_count int;
  v_delivered_count int;
  v_opened_count int;
begin
  -- Get domain info
  select 
    sd.*,
    extract(epoch from (now() - sd.created_at)) / 86400 as age_days,
    split_part(sd.domain, '.', array_length(string_to_array(sd.domain, '.'), 1)) as tld_ext
  into v_domain
  from public.sender_domains sd
  where sd.id = p_domain_id;
  
  if not found then
    return 50; -- Default score if domain not found
  end if;
  
  v_domain_age_days := coalesce(v_domain.age_days::int, 0);
  v_tld := lower(coalesce(v_domain.tld_ext, ''));
  
  -- Get bounce/spam stats from inboxes in this domain (last 7 days)
  select 
    coalesce(sum(case when ee.event_type = 'bounce' then 1 else 0 end), 0),
    coalesce(sum(case when ee.event_type = 'spam' then 1 else 0 end), 0),
    coalesce(sum(case when ee.event_type = 'sent' then 1 else 0 end), 0),
    coalesce(sum(case when ee.event_type = 'delivered' then 1 else 0 end), 0),
    coalesce(sum(case when ee.event_type = 'opened' then 1 else 0 end), 0)
  into v_bounce_count, v_spam_count, v_sent_count, v_delivered_count, v_opened_count
  from public.sender_inboxes si
  left join public.email_events ee on ee.sender_inbox_id = si.id
    and ee.created_at >= now() - interval '7 days'
  where si.domain_id = p_domain_id;
  
  -- Calculate rates
  v_bounce_rate := case when v_sent_count > 0 then (v_bounce_count::numeric / v_sent_count::numeric) * 100 else 0 end;
  v_spam_rate := case when v_sent_count > 0 then (v_spam_count::numeric / v_sent_count::numeric) * 100 else 0 end;
  v_open_rate := case when v_delivered_count > 0 then (v_opened_count::numeric / v_delivered_count::numeric) * 100 else 0 end;
  
  -- DNS Penalties
  if not v_domain.spf_valid then
    v_score := v_score - 25;
  end if;
  
  if not v_domain.dkim_valid then
    v_score := v_score - 25;
  end if;
  
  if not v_domain.dmarc_valid then
    v_score := v_score - 30;
  end if;
  
  -- Bounce & Spam Penalties
  if v_bounce_rate > 5 then
    v_score := v_score - 20;
  end if;
  
  if v_spam_rate > 0.3 then
    v_score := v_score - 40;
  end if;
  
  -- Open Rate Drops
  if v_open_rate < 10 then
    v_score := v_score - 35;
  elsif v_open_rate < 15 then
    v_score := v_score - 20;
  end if;
  
  -- Domain Age Penalties
  if v_domain_age_days < 30 then
    v_score := v_score - 40;
  elsif v_domain_age_days < 90 then
    v_score := v_score - 20;
  end if;
  
  -- TLD Penalties/Bonuses
  if v_tld in ('xyz', 'online', 'site', 'info', 'biz') then
    v_score := v_score - 20;
  elsif v_tld in ('com', 'co', 'io', 'ai', 'app') then
    v_score := v_score + 10;
  end if;
  
  -- Clamp between 0-100
  v_score := greatest(0, least(100, v_score));
  
  return v_score;
end;
$$;

-- ============================================
-- 4) Domain Warmup Stage Management Function
-- ============================================

create or replace function public.get_domain_warmup_phase(
  p_domain_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_warmup_stage int;
  v_domain_age_days int;
  v_health_score int;
begin
  select 
    coalesce(sd.warmup_stage, 0),
    extract(epoch from (now() - sd.created_at)) / 86400,
    coalesce(sd.domain_health_score, 50)
  into v_warmup_stage, v_domain_age_days, v_health_score
  from public.sender_domains sd
  where sd.id = p_domain_id;
  
  if not found then
    return 'unknown';
  end if;
  
  -- Phase 1: Fresh/New Domain (Week 1-2)
  if v_warmup_stage < 14 or v_domain_age_days < 14 then
    return 'fresh';
  -- Phase 2: Building Reputation (Week 3-4)
  elsif v_warmup_stage < 28 or v_domain_age_days < 28 then
    return 'building';
  -- Phase 3: Stable (Week 5+)
  else
    return 'stable';
  end if;
end;
$$;

-- ============================================
-- 5) Auto-Protective Actions Function
-- ============================================

create or replace function public.apply_domain_protection(
  p_domain_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_health_score int;
  v_domain record;
begin
  -- Get domain health score
  select domain_health_score into v_health_score
  from public.sender_domains
  where id = p_domain_id;
  
  if not found or v_health_score is null then
    return;
  end if;
  
  -- If score < 50: Auto-stop new sends, reduce warmup, reduce volume
  if v_health_score < 50 then
    -- Add flag to domain
    update public.sender_domains
    set domain_flags = array_append(
      coalesce(domain_flags, '{}'),
      'auto_throttled'
    )
    where id = p_domain_id
      and 'auto_throttled' != all(coalesce(domain_flags, '{}'));
    
    -- Create alert
    insert into public.domain_alerts (domain_id, alert_type, message, severity)
    values (
      p_domain_id,
      'domain_critical',
      format('Domain health score dropped to %s. Auto-throttling enabled.', v_health_score),
      'critical'
    )
    on conflict do nothing;
  end if;
  
  -- If score < 30: Auto-disable domain and inboxes
  if v_health_score < 30 then
    -- Disable all inboxes in this domain
    update public.sender_inboxes
    set connected = false
    where domain_id = p_domain_id
      and connected = true;
    
    -- Add disabled flag
    update public.sender_domains
    set domain_flags = array_append(
      coalesce(domain_flags, '{}'),
      'auto_disabled'
    )
    where id = p_domain_id
      and 'auto_disabled' != all(coalesce(domain_flags, '{}'));
    
    -- Create alert
    insert into public.domain_alerts (domain_id, alert_type, message, severity)
    values (
      p_domain_id,
      'domain_disabled',
      format('Domain health score critical (%s). Domain and inboxes auto-disabled.', v_health_score),
      'critical'
    )
    on conflict do nothing;
  end if;
end;
$$;

-- ============================================
-- 6) Update Rotation Engine to be Domain-Aware
-- ============================================

-- Update pick_rotation_inbox to check domain health
create or replace function public.pick_rotation_inbox(
  p_domain_id uuid,
  p_today_start timestamptz default date_trunc('day', now())
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inbox_id uuid;
  v_inbox_pool record;
  v_usage_count int;
  v_health_score int;
  v_best_score numeric := -999999;
  v_best_inbox uuid;
  v_domain_health_score int;
begin
  -- Check domain health first - skip if domain is disabled or low health
  select domain_health_score into v_domain_health_score
  from public.sender_domains
  where id = p_domain_id;
  
  -- Skip domains with health < 50
  if v_domain_health_score < 50 then
    return null;
  end if;
  
  -- Step 1: Fetch inbox pool for the domain
  for v_inbox_pool in
    select 
      si.id,
      si.daily_limit,
      coalesce(ih.score, 50) as health_score,
      coalesce(ih.spam_rate, 0) as spam_rate,
      coalesce(ih.bounce_rate, 0) as bounce_rate
    from public.sender_inboxes si
    left join public.inbox_health ih on ih.inbox_id = si.id
    where si.domain_id = p_domain_id
      and si.connected = true
  loop
    -- Step 2: Filter out unhealthy inboxes
    if v_inbox_pool.health_score >= 30 
       and v_inbox_pool.spam_rate <= 0.01 
       and v_inbox_pool.bounce_rate <= 0.05 then
      
      -- Step 3: Get today's send usage for this inbox
      select coalesce(count(*), 0) into v_usage_count
      from public.email_events
      where sender_inbox_id = v_inbox_pool.id
        and event_type = 'sent'
        and created_at >= p_today_start;
      
      -- Step 4: Calculate rotation score
      -- Formula: weight_health * health_score - weight_volume * usage_today
      -- Defaults: weight_health = 2, weight_volume = 1
      declare
        v_rotation_score numeric;
        v_weight_health numeric := 2;
        v_weight_volume numeric := 1;
      begin
        v_rotation_score := (v_weight_health * v_inbox_pool.health_score) - (v_weight_volume * v_usage_count);
        
        -- Step 5: Track best inbox
        if v_rotation_score > v_best_score then
          v_best_score := v_rotation_score;
          v_best_inbox := v_inbox_pool.id;
        end if;
      end;
    end if;
  end loop;
  
  -- If no healthy inbox found, fallback to any connected inbox (only if domain health is OK)
  if v_best_inbox is null and v_domain_health_score >= 50 then
    select id into v_best_inbox
    from public.sender_inboxes
    where domain_id = p_domain_id
      and connected = true
    limit 1;
  end if;
  
  -- Return null if still no inbox found
  return v_best_inbox;
end;
$$;

-- ============================================
-- 7) Domain Warmup Plan Helper Function
-- ============================================

create or replace function public.get_domain_warmup_limits(
  p_domain_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phase text;
  v_warmup_stage int;
  v_health_score int;
  v_result jsonb;
begin
  -- Get domain phase and stage
  v_phase := public.get_domain_warmup_phase(p_domain_id);
  
  select warmup_stage, domain_health_score
  into v_warmup_stage, v_health_score
  from public.sender_domains
  where id = p_domain_id;
  
  -- Phase 1: Fresh/New Domain (Week 1-2)
  if v_phase = 'fresh' then
    v_result := jsonb_build_object(
      'phase', 1,
      'daily_warmup_limit', 20,
      'daily_cold_limit', case when v_health_score >= 70 then 20 else 0 end,
      'recommended_inboxes', 1,
      'warmup_speed', 'slow'
    );
  -- Phase 2: Building Reputation (Week 3-4)
  elsif v_phase = 'building' then
    v_result := jsonb_build_object(
      'phase', 2,
      'daily_warmup_limit', 50,
      'daily_cold_limit', 50,
      'recommended_inboxes', 3,
      'warmup_speed', 'normal'
    );
  -- Phase 3: Stable (Week 5+)
  else
    v_result := jsonb_build_object(
      'phase', 3,
      'daily_warmup_limit', 200,
      'daily_cold_limit', 200,
      'recommended_inboxes', 8,
      'warmup_speed', 'normal'
    );
  end if;
  
  return v_result;
end;
$$;

-- ============================================
-- 8) Comments
-- ============================================

comment on table public.domain_alerts is 'Alerts for domain health issues, DNS problems, and reputation drops';
comment on column public.sender_domains.domain_health_score is 'Domain reputation score (0-100). Calculated from DNS, bounce/spam rates, open rates, domain age, and TLD';
comment on column public.sender_domains.warmup_stage is 'Domain warmup stage (days). Increments daily during warmup phase';
comment on column public.sender_domains.domain_flags is 'Array of domain flags: auto_throttled, auto_disabled, etc.';
comment on function public.compute_domain_reputation_score is 'Calculates domain reputation score (0-100) based on DNS, bounce/spam rates, open rates, domain age, and TLD';
comment on function public.get_domain_warmup_phase is 'Returns domain warmup phase: fresh (week 1-2), building (week 3-4), stable (week 5+)';
comment on function public.apply_domain_protection is 'Applies auto-protective actions based on domain health score (throttle < 50, disable < 30)';
comment on function public.get_domain_warmup_limits is 'Returns warmup limits (daily warmup/cold limits, recommended inboxes) based on domain phase';

