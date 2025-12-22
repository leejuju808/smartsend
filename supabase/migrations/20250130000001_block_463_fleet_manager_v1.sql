-- Block 463 — Fleet Manager v1
-- Inbox Rotation • Send Distribution • Auto-Warm Routing • Load Balancing • Volume Control
-- This block creates the Fleet Manager system that controls your entire inbox fleet like a real outbound ops director

-- ============================================
-- 1) Inbox Limits Table
-- ============================================
create table if not exists public.inbox_limits (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid not null references public.sender_inboxes(id) on delete cascade,
  daily_cap int,
  hourly_cap int,
  warmup_cap int,
  dynamic boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(inbox_id)
);

create index if not exists idx_inbox_limits_inbox on public.inbox_limits(inbox_id);
create index if not exists idx_inbox_limits_dynamic on public.inbox_limits(dynamic) where dynamic = true;

-- Enable RLS
alter table public.inbox_limits enable row level security;

-- RLS Policies
create policy "inbox_limits_select_workspace_member" on public.inbox_limits
  for select using (
    exists (
      select 1 from public.sender_inboxes si
      join public.workspace_members wm on wm.workspace_id = si.workspace_id
      where si.id = inbox_limits.inbox_id
        and wm.user_id = auth.uid()
    )
  );

create policy "inbox_limits_insert_workspace_member" on public.inbox_limits
  for insert with check (
    exists (
      select 1 from public.sender_inboxes si
      join public.workspace_members wm on wm.workspace_id = si.workspace_id
      where si.id = inbox_limits.inbox_id
        and wm.user_id = auth.uid()
    )
  );

create policy "inbox_limits_update_workspace_member" on public.inbox_limits
  for update using (
    exists (
      select 1 from public.sender_inboxes si
      join public.workspace_members wm on wm.workspace_id = si.workspace_id
      where si.id = inbox_limits.inbox_id
        and wm.user_id = auth.uid()
    )
  );

-- Trigger to update updated_at
create trigger trg_inbox_limits_updated_at
before update on public.inbox_limits
for each row
execute function public.set_updated_at();

-- ============================================
-- 2) Fleet Manager Activity Log Table
-- ============================================
create table if not exists public.fleet_manager_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  inbox_id uuid references public.sender_inboxes(id) on delete set null,
  domain text,
  action_type text not null check (action_type in (
    'cap_adjusted',
    'inbox_throttled',
    'inbox_boosted',
    'inbox_paused',
    'inbox_resumed',
    'domain_throttled',
    'domain_rerouted',
    'fallback_applied',
    'rotation_mode_changed',
    'warmup_routing_applied'
  )),
  action_details jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_fleet_activity_workspace on public.fleet_manager_activity(workspace_id, created_at desc);
create index if not exists idx_fleet_activity_inbox on public.fleet_manager_activity(inbox_id, created_at desc);
create index if not exists idx_fleet_activity_domain on public.fleet_manager_activity(domain, created_at desc);
create index if not exists idx_fleet_activity_type on public.fleet_manager_activity(action_type);

-- Enable RLS
alter table public.fleet_manager_activity enable row level security;

-- RLS Policies
create policy "fleet_activity_select_workspace_member" on public.fleet_manager_activity
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = fleet_manager_activity.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- ============================================
-- 3) Fleet Distribution Mode Configuration
-- ============================================
create table if not exists public.fleet_config (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  rotation_mode text not null default 'weighted' check (rotation_mode in ('balanced', 'weighted', 'priority', 'diversified')),
  auto_fallback_enabled boolean default true,
  domain_protection_enabled boolean default true,
  warmup_routing_enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger trg_fleet_config_updated_at
before update on public.fleet_config
for each row
execute function public.set_updated_at();

-- Enable RLS
alter table public.fleet_config enable row level security;

-- RLS Policies
create policy "fleet_config_select_workspace_member" on public.fleet_config
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = fleet_config.workspace_id
        and wm.user_id = auth.uid()
    )
  );

create policy "fleet_config_update_workspace_admin" on public.fleet_config
  for update using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = fleet_config.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

-- ============================================
-- 4) Helper Function — Calculate Inbox Health Score for Fleet
-- ============================================
create or replace function public.calculate_fleet_inbox_score(
  p_inbox_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_score jsonb;
  v_health record;
  v_inspector record;
  v_warmup record;
  v_predictions record;
  v_domain record;
  v_inbox record;
  v_7day_sent int;
  v_7day_bounced int;
  v_7day_spam int;
  v_7day_opened int;
  v_7day_replied int;
  v_domain_age_days int;
  v_inbox_age_days int;
  v_health_score int;
  v_deliverability_risk text;
  v_bounce_trend text;
  v_warmup_stage text;
  v_domain_risk text;
  v_predicted_open_rate numeric;
  v_predicted_reply_rate numeric;
begin
  -- Get inbox info
  select si.*, sd.domain, sd.created_at as domain_created_at
  into v_inbox
  from public.sender_inboxes si
  join public.sender_domains sd on sd.id = si.domain_id
  where si.id = p_inbox_id;

  if v_inbox is null then
    return jsonb_build_object('error', 'Inbox not found');
  end if;

  -- Get inbox health
  select * into v_health
  from public.inbox_health
  where inbox_id = p_inbox_id;

  -- Get inspector report
  select * into v_inspector
  from public.inbox_inspector_reports
  where inbox_id = p_inbox_id
  order by checked_at desc
  limit 1;

  -- Get warmup status
  select * into v_warmup
  from public.inbox_warmup_status
  where inbox_id = p_inbox_id;

  -- Get domain health
  select * into v_domain
  from public.domain_health
  where domain = v_inbox.domain;

  -- Get 7-day performance
  select 
    count(*) filter (where status = 'sent') as sent,
    count(*) filter (where status = 'bounced') as bounced,
    count(*) filter (where status = 'spam') as spam,
    count(*) filter (where event_type = 'open') as opened,
    count(*) filter (where event_type = 'reply') as replied
  into v_7day_sent, v_7day_bounced, v_7day_spam, v_7day_opened, v_7day_replied
  from public.send_logs
  where from_inbox_id = p_inbox_id
    and created_at >= now() - interval '7 days';

  -- Get predictions
  select 
    max(predicted_value) filter (where metric = 'open_rate') as open_rate,
    max(predicted_value) filter (where metric = 'reply_rate') as reply_rate
  into v_predicted_open_rate, v_predicted_reply_rate
  from public.predictions
  where inbox_id = p_inbox_id
    and horizon_days <= 7
    and created_at >= now() - interval '1 day';

  -- Calculate ages
  v_domain_age_days := extract(epoch from (now() - v_inbox.domain_created_at)) / 86400;
  v_inbox_age_days := extract(epoch from (now() - v_inbox.created_at)) / 86400;

  -- Calculate health score (use inspector if available, otherwise health table)
  v_health_score := coalesce(
    v_inspector.health_score,
    v_health.health_score,
    50
  );

  -- Determine deliverability risk
  v_deliverability_risk := case
    when coalesce(v_health.bounce_rate, 0) > 0.08 or coalesce(v_health.spam_rate, 0) > 0.003 then 'high'
    when coalesce(v_health.bounce_rate, 0) > 0.04 or coalesce(v_health.spam_rate, 0) > 0.001 then 'medium'
    else 'low'
  end;

  -- Determine bounce trend
  v_bounce_trend := case
    when v_7day_bounced > 0 and v_7day_sent > 0 then
      case
        when (v_7day_bounced::float / v_7day_sent) > coalesce(v_health.bounce_rate, 0) * 1.2 then 'increasing'
        when (v_7day_bounced::float / v_7day_sent) < coalesce(v_health.bounce_rate, 0) * 0.8 then 'decreasing'
        else 'stable'
      end
    else 'stable'
  end;

  -- Get warmup stage
  v_warmup_stage := coalesce(v_warmup.warmup_stage, 'idle');

  -- Determine domain risk
  v_domain_risk := case
    when v_domain is not null and (v_domain.bounce_rate > 0.05 or v_domain.spam_rate > 0.002) then 'high'
    when v_domain is not null and (v_domain.bounce_rate > 0.02 or v_domain.spam_rate > 0.001) then 'medium'
    else 'low'
  end;

  -- Build result
  v_score := jsonb_build_object(
    'inbox_id', p_inbox_id,
    'health_score', v_health_score,
    'deliverability_risk', v_deliverability_risk,
    'bounce_trend', v_bounce_trend,
    'warmup_stage', v_warmup_stage,
    'domain_risk', v_domain_risk,
    'predicted_open_rate', coalesce(v_predicted_open_rate, 0),
    'predicted_reply_rate', coalesce(v_predicted_reply_rate, 0),
    'domain_age_days', v_domain_age_days,
    'inbox_age_days', v_inbox_age_days,
    'last_7day_sent', coalesce(v_7day_sent, 0),
    'last_7day_bounced', coalesce(v_7day_bounced, 0),
    'last_7day_spam', coalesce(v_7day_spam, 0),
    'last_7day_opened', coalesce(v_7day_opened, 0),
    'last_7day_replied', coalesce(v_7day_replied, 0),
    'bounce_rate', coalesce(v_health.bounce_rate, 0),
    'spam_rate', coalesce(v_health.spam_rate, 0),
    'open_rate', coalesce(v_health.open_rate, 0),
    'reply_rate', coalesce(v_health.reply_rate, 0)
  );

  return v_score;
end;
$$;

-- ============================================
-- 5) Helper Function — Calculate Safe Daily Send Limit
-- ============================================
create or replace function public.calculate_safe_daily_limit(
  p_inbox_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_score jsonb;
  v_health_score int;
  v_deliverability_risk text;
  v_warmup_stage text;
  v_domain_risk text;
  v_bounce_rate numeric;
  v_spam_rate numeric;
  v_base_limit int;
  v_safe_limit int;
  v_warmup_limit int;
begin
  -- Get fleet score
  v_score := public.calculate_fleet_inbox_score(p_inbox_id);
  
  v_health_score := (v_score->>'health_score')::int;
  v_deliverability_risk := v_score->>'deliverability_risk';
  v_warmup_stage := v_score->>'warmup_stage';
  v_domain_risk := v_score->>'domain_risk';
  v_bounce_rate := (v_score->>'bounce_rate')::numeric;
  v_spam_rate := (v_score->>'spam_rate')::numeric;

  -- Base limit from inbox daily_limit
  select coalesce(daily_limit, 100) into v_base_limit
  from public.sender_inboxes
  where id = p_inbox_id;

  -- Start with base limit
  v_safe_limit := v_base_limit;

  -- Adjust based on health score
  if v_health_score >= 90 then
    v_safe_limit := v_safe_limit * 1.2; -- Boost healthy inboxes
  elsif v_health_score >= 80 then
    v_safe_limit := v_safe_limit * 1.1;
  elsif v_health_score >= 70 then
    v_safe_limit := v_safe_limit * 1.0;
  elsif v_health_score >= 60 then
    v_safe_limit := v_safe_limit * 0.7; -- Throttle medium health
  elsif v_health_score >= 50 then
    v_safe_limit := v_safe_limit * 0.4; -- Heavy throttle
  else
    v_safe_limit := v_safe_limit * 0.1; -- Minimal sending
  end if;

  -- Adjust based on deliverability risk
  if v_deliverability_risk = 'high' then
    v_safe_limit := v_safe_limit * 0.3;
  elsif v_deliverability_risk = 'medium' then
    v_safe_limit := v_safe_limit * 0.6;
  end if;

  -- Adjust based on domain risk
  if v_domain_risk = 'high' then
    v_safe_limit := v_safe_limit * 0.5;
  elsif v_domain_risk = 'medium' then
    v_safe_limit := v_safe_limit * 0.8;
  end if;

  -- Warmup stage adjustments
  if v_warmup_stage = 'stage_1' then
    v_warmup_limit := 10; -- Very limited during early warmup
  elsif v_warmup_stage = 'stage_2' then
    v_warmup_limit := 40;
  elsif v_warmup_stage = 'stage_3' then
    v_warmup_limit := 80;
  elsif v_warmup_stage = 'stage_4' then
    v_warmup_limit := 150; -- Full capacity
  else
    v_warmup_limit := v_safe_limit; -- No warmup restrictions
  end if;

  -- Use the lower of safe limit or warmup limit
  v_safe_limit := least(v_safe_limit, v_warmup_limit);

  -- Ensure minimum of 5 sends per day (unless paused)
  if v_health_score < 30 or v_deliverability_risk = 'high' then
    v_safe_limit := 0; -- Pause completely
  else
    v_safe_limit := greatest(5, v_safe_limit);
  end if;

  -- Round to nearest 5
  v_safe_limit := round(v_safe_limit / 5) * 5;

  return v_safe_limit::int;
end;
$$;

-- ============================================
-- 6) Helper Function — Select Best Inbox for Sending
-- ============================================
create or replace function public.select_fleet_inbox(
  p_workspace_id uuid,
  p_lead_priority text default null, -- 'A', 'B', 'C'
  p_lead_icp_score int default null,
  p_mode text default null -- 'balanced', 'weighted', 'priority', 'diversified'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text;
  v_config record;
  v_selected_inbox_id uuid;
  v_inbox record;
begin
  -- Get fleet config or use default
  select * into v_config
  from public.fleet_config
  where workspace_id = p_workspace_id;

  v_mode := coalesce(p_mode, v_config.rotation_mode, 'weighted');

  -- Priority mode: route A-tier/high-value leads to strongest inboxes
  if v_mode = 'priority' and p_lead_priority = 'A' then
    select si.id into v_selected_inbox_id
    from public.sender_inboxes si
    join public.inbox_health ih on ih.inbox_id = si.id
    left join public.inbox_limits il on il.inbox_id = si.id
    where si.workspace_id = p_workspace_id
      and si.connected = true
      and (ih.is_paused is null or ih.is_paused = false)
      and (
        il.daily_cap is null 
        or (select count(*) from public.send_logs 
            where from_inbox_id = si.id 
            and created_at >= date_trunc('day', now())) < il.daily_cap
      )
    order by ih.health_score desc nulls last
    limit 1;
  end if;

  -- Weighted mode: more load to healthier inboxes
  if v_mode = 'weighted' or v_selected_inbox_id is null then
    select si.id into v_selected_inbox_id
    from public.sender_inboxes si
    join public.inbox_health ih on ih.inbox_id = si.id
    left join public.inbox_limits il on il.inbox_id = si.id
    where si.workspace_id = p_workspace_id
      and si.connected = true
      and (ih.is_paused is null or ih.is_paused = false)
      and (
        il.daily_cap is null 
        or (select count(*) from public.send_logs 
            where from_inbox_id = si.id 
            and created_at >= date_trunc('day', now())) < il.daily_cap
      )
    order by 
      (ih.health_score * 0.6 + 
       coalesce((select predicted_value from public.predictions 
                 where inbox_id = si.id 
                 and metric = 'reply_rate' 
                 and horizon_days <= 7 
                 order by created_at desc limit 1), 0) * 100 * 0.4) desc nulls last,
      random()
    limit 1;
  end if;

  -- Balanced mode: even spread (fallback)
  if v_mode = 'balanced' or v_selected_inbox_id is null then
    select si.id into v_selected_inbox_id
    from public.sender_inboxes si
    join public.inbox_health ih on ih.inbox_id = si.id
    left join public.inbox_limits il on il.inbox_id = si.id
    where si.workspace_id = p_workspace_id
      and si.connected = true
      and (ih.is_paused is null or ih.is_paused = false)
      and (
        il.daily_cap is null 
        or (select count(*) from public.send_logs 
            where from_inbox_id = si.id 
            and created_at >= date_trunc('day', now())) < il.daily_cap
      )
    order by 
      (select count(*) from public.send_logs 
       where from_inbox_id = si.id 
       and created_at >= date_trunc('day', now())) asc,
      random()
    limit 1;
  end if;

  -- Diversified mode: spread across domains
  if v_mode = 'diversified' and v_selected_inbox_id is null then
    select si.id into v_selected_inbox_id
    from public.sender_inboxes si
    join public.sender_domains sd on sd.id = si.domain_id
    join public.inbox_health ih on ih.inbox_id = si.id
    left join public.inbox_limits il on il.inbox_id = si.id
    where si.workspace_id = p_workspace_id
      and si.connected = true
      and (ih.is_paused is null or ih.is_paused = false)
      and (
        il.daily_cap is null 
        or (select count(*) from public.send_logs 
            where from_inbox_id = si.id 
            and created_at >= date_trunc('day', now())) < il.daily_cap
      )
    order by 
      (select count(distinct sd2.domain) 
       from public.send_logs sl
       join public.sender_inboxes si2 on si2.id = sl.from_inbox_id
       join public.sender_domains sd2 on sd2.id = si2.domain_id
       where sl.created_at >= date_trunc('day', now())) asc,
      random()
    limit 1;
  end if;

  return v_selected_inbox_id;
end;
$$;

-- ============================================
-- 7) Helper Function — Log Fleet Manager Activity
-- ============================================
create or replace function public.log_fleet_activity(
  p_workspace_id uuid,
  p_action_type text,
  p_inbox_id uuid default null,
  p_domain text default null,
  p_action_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.fleet_manager_activity (
    workspace_id,
    inbox_id,
    domain,
    action_type,
    action_details
  ) values (
    p_workspace_id,
    p_inbox_id,
    p_domain,
    p_action_type,
    p_action_details
  );
end;
$$;

-- ============================================
-- 8) Helper Function — Get Fallback Inbox
-- ============================================
create or replace function public.get_fallback_inbox(
  p_workspace_id uuid,
  p_failed_inbox_id uuid,
  p_domain text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fallback_inbox_id uuid;
  v_failed_domain text;
begin
  -- Get domain of failed inbox if not provided
  if p_domain is null then
    select sd.domain into v_failed_domain
    from public.sender_inboxes si
    join public.sender_domains sd on sd.id = si.domain_id
    where si.id = p_failed_inbox_id;
  else
    v_failed_domain := p_domain;
  end if;

  -- Find best fallback inbox (prefer different domain, but same workspace)
  select si.id into v_fallback_inbox_id
  from public.sender_inboxes si
  join public.sender_domains sd on sd.id = si.domain_id
  join public.inbox_health ih on ih.inbox_id = si.id
  left join public.inbox_limits il on il.inbox_id = si.id
  where si.workspace_id = p_workspace_id
    and si.id != p_failed_inbox_id
    and si.connected = true
    and (ih.is_paused is null or ih.is_paused = false)
    and ih.health_score >= 70
    and (
      il.daily_cap is null 
      or (select count(*) from public.send_logs 
          where from_inbox_id = si.id 
          and created_at >= date_trunc('day', now())) < il.daily_cap * 0.9
    )
  order by 
    case when sd.domain != v_failed_domain then 0 else 1 end, -- Prefer different domain
    ih.health_score desc,
    random()
  limit 1;

  return v_fallback_inbox_id;
end;
$$;

-- ============================================
-- 9) Helper Function — Check Inbox for Problems
-- ============================================
create or replace function public.check_inbox_problems(
  p_inbox_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_health record;
  v_inspector record;
  v_dns_issues boolean := false;
  v_bounce_spike boolean := false;
  v_spam_issue boolean := false;
  v_domain_block boolean := false;
  v_problems text[] := array[]::text[];
begin
  -- Get health
  select * into v_health
  from public.inbox_health
  where inbox_id = p_inbox_id;

  -- Get inspector report
  select * into v_inspector
  from public.inbox_inspector_reports
  where inbox_id = p_inbox_id
  order by checked_at desc
  limit 1;

  -- Check DNS issues
  if v_inspector is not null then
    if not v_inspector.dns_spf_valid or 
       not v_inspector.dns_dkim_valid or 
       not v_inspector.dns_dmarc_valid then
      v_dns_issues := true;
      v_problems := array_append(v_problems, 'DNS configuration invalid');
    end if;
  end if;

  -- Check bounce spike (last 24h bounce rate > 8%)
  if v_health is not null and v_health.last_24h_sent > 0 then
    if (v_health.last_24h_bounced::float / v_health.last_24h_sent) > 0.08 then
      v_bounce_spike := true;
      v_problems := array_append(v_problems, format('Bounce spike: %.2f%%', (v_health.last_24h_bounced::float / v_health.last_24h_sent) * 100));
    end if;
  end if;

  -- Check spam issue
  if v_health is not null and v_health.last_24h_sent > 0 then
    if (v_health.last_24h_spam::float / v_health.last_24h_sent) > 0.003 then
      v_spam_issue := true;
      v_problems := array_append(v_problems, format('Spam complaint rate: %.2f%%', (v_health.last_24h_spam::float / v_health.last_24h_sent) * 100));
    end if;
  end if;

  -- Check domain-level block
  if v_inspector is not null then
    if v_inspector.blacklist_status::text like '%listed%' then
      v_domain_block := true;
      v_problems := array_append(v_problems, 'Domain blacklisted');
    end if;
  end if;

  -- Get predictions for spam risk
  declare
    v_prediction record;
  begin
    select * into v_prediction
    from public.predictions
    where inbox_id = p_inbox_id
      and metric = 'spam_risk'
      and horizon_days <= 7
      order by created_at desc
      limit 1;

    if v_prediction is not null and v_prediction.predicted_value > 0.05 then
      v_spam_issue := true;
      v_problems := array_append(v_problems, format('Predicted spam risk: %.2f%%', v_prediction.predicted_value * 100));
    end if;
  end;

  v_result := jsonb_build_object(
    'has_problems', v_dns_issues or v_bounce_spike or v_spam_issue or v_domain_block,
    'dns_issues', v_dns_issues,
    'bounce_spike', v_bounce_spike,
    'spam_issue', v_spam_issue,
    'domain_block', v_domain_block,
    'problems', v_problems
  );

  return v_result;
end;
$$;

-- ============================================
-- 10) Integration with Routing v2 — Enhanced get_best_inboxes_for_lead
-- ============================================
-- This function enhances the existing routing v2 function to use Fleet Manager limits

create or replace function public.get_best_inboxes_for_lead_fleet(
  p_lead_id uuid,
  p_workspace_id uuid,
  p_limit int default 5
)
returns table (
  inbox_id uuid,
  inbox_email text,
  domain text,
  health_score int,
  reply_rate float,
  sending_capacity int,
  industry_match boolean,
  total_score numeric,
  daily_cap_remaining int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_lead_industry text;
begin
  -- Get lead data
  select l.*
  into v_lead
  from public.leads l
  where l.id = p_lead_id;
  
  if v_lead is null then
    return;
  end if;
  
  v_lead_industry := coalesce(v_lead.company, '');
  
  -- Return inboxes with scoring, including Fleet Manager limits
  return query
  select 
    si.id as inbox_id,
    si.email as inbox_email,
    sd.domain as domain,
    coalesce(ih.health_score, 50) as health_score,
    coalesce(ih.reply_rate, 0.0) as reply_rate,
    coalesce(il.daily_cap, si.daily_limit, 100) as sending_capacity,
    
    -- Industry match (simplified - check if domain/email contains industry keywords)
    case when v_lead_industry is not null and (
      si.email ilike '%' || lower(v_lead_industry) || '%'
      or sd.domain ilike '%' || lower(v_lead_industry) || '%'
    ) then true else false end as industry_match,
    
    -- Total score: health (40%) + reply rate (30%) + capacity (20%) + industry match (10%)
    (
      coalesce(ih.health_score, 50) * 0.4 +
      coalesce(ih.reply_rate, 0.0) * 100 * 0.3 +
      least(coalesce(il.daily_cap, si.daily_limit, 100) / 100.0, 1.0) * 20 +
      case when v_lead_industry is not null and (
        si.email ilike '%' || lower(v_lead_industry) || '%'
        or sd.domain ilike '%' || lower(v_lead_industry) || '%'
      ) then 10 else 0 end
    ) as total_score,
    
    -- Daily cap remaining
    coalesce(il.daily_cap, si.daily_limit, 100) - 
    coalesce((
      select count(*) from public.send_logs 
      where from_inbox_id = si.id 
      and created_at >= date_trunc('day', now())
    ), 0) as daily_cap_remaining
    
  from public.sender_inboxes si
  join public.sender_domains sd on sd.id = si.domain_id
  left join public.inbox_health ih on ih.inbox_id = si.id
  left join public.inbox_limits il on il.inbox_id = si.id
  where si.workspace_id = p_workspace_id
    and si.connected = true
    and (ih.is_paused is null or ih.is_paused = false)
    -- Only include inboxes with remaining capacity
    and (
      il.daily_cap is null 
      or (select count(*) from public.send_logs 
          where from_inbox_id = si.id 
          and created_at >= date_trunc('day', now())) < il.daily_cap
    )
  order by total_score desc
  limit p_limit;
end;
$$;

-- ============================================
-- 11) Enhanced route_lead with Fleet Manager Integration
-- ============================================
-- This function wraps the existing route_lead to add Fleet Manager inbox selection

create or replace function public.route_lead_with_fleet(
  p_lead_id uuid,
  p_workspace_id uuid,
  p_force_recalculate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_routing_result jsonb;
  v_assigned_inbox_id uuid;
  v_fleet_inbox_id uuid;
  v_lead record;
  v_priority text;
  v_problems jsonb;
begin
  -- First, get routing result from Router v2
  v_routing_result := public.route_lead(p_lead_id, p_workspace_id, p_force_recalculate);
  
  -- Get lead priority
  select priority into v_priority
  from public.leads
  where id = p_lead_id;
  
  -- Get assigned inbox from routing result
  v_assigned_inbox_id := (v_routing_result->>'assigned_inbox_id')::uuid;
  
  -- If Router v2 assigned an inbox, check for problems
  if v_assigned_inbox_id is not null then
    v_problems := public.check_inbox_problems(v_assigned_inbox_id);
    
    -- If inbox has problems, get fallback
    if (v_problems->>'has_problems')::boolean then
      v_fleet_inbox_id := public.get_fallback_inbox(
        p_workspace_id,
        v_assigned_inbox_id
      );
      
      if v_fleet_inbox_id is not null then
        -- Use fallback inbox
        v_assigned_inbox_id := v_fleet_inbox_id;
        v_routing_result := jsonb_set(
          v_routing_result,
          '{assigned_inbox_id}',
          to_jsonb(v_fleet_inbox_id)
        );
        v_routing_result := jsonb_set(
          v_routing_result,
          '{fleet_fallback_applied}',
          to_jsonb(true)
        );
        v_routing_result := jsonb_set(
          v_routing_result,
          '{fleet_fallback_reason}',
          to_jsonb(v_problems->'problems')
        );
      end if;
    else
      -- Inbox is healthy, but use Fleet Manager to select best inbox from group
      -- Get fleet config to determine rotation mode
      declare
        v_fleet_mode text;
        v_config record;
      begin
        select * into v_config
        from public.fleet_config
        where workspace_id = p_workspace_id;
        
        v_fleet_mode := coalesce(v_config.rotation_mode, 'weighted');
        
        -- Use Fleet Manager to select best inbox
        v_fleet_inbox_id := public.select_fleet_inbox(
          p_workspace_id,
          v_priority,
          (v_routing_result->>'icp_score')::int,
          v_fleet_mode
        );
        
        if v_fleet_inbox_id is not null then
          v_assigned_inbox_id := v_fleet_inbox_id;
          v_routing_result := jsonb_set(
            v_routing_result,
            '{assigned_inbox_id}',
            to_jsonb(v_fleet_inbox_id)
          );
          v_routing_result := jsonb_set(
            v_routing_result,
            '{fleet_selected}',
            to_jsonb(true)
          );
        end if;
      end;
    end if;
  else
    -- Router v2 didn't assign an inbox, use Fleet Manager directly
    v_fleet_inbox_id := public.select_fleet_inbox(
      p_workspace_id,
      v_priority,
      (v_routing_result->>'icp_score')::int
    );
    
    if v_fleet_inbox_id is not null then
      v_assigned_inbox_id := v_fleet_inbox_id;
      v_routing_result := jsonb_set(
        v_routing_result,
        '{assigned_inbox_id}',
        to_jsonb(v_fleet_inbox_id)
      );
      v_routing_result := jsonb_set(
        v_routing_result,
        '{fleet_selected}',
        to_jsonb(true)
      );
    end if;
  end if;
  
  return v_routing_result;
end;
$$;

