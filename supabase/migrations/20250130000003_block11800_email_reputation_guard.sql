-- Block 11800 — Email Sending Reputation Guard v1
-- Bounce Detection + Rate Limiting + Auto-Pause Protections
-- 
-- This block adds a real safety layer over the outbound sending engine.
-- When something looks dangerous, SmartSend steps in automatically and protects:
-- - The contractor's domain
-- - The campaign's performance  
-- - SmartSend's sending reputation
-- - The IP/domain warmup system

-- ============================================================================
-- 1. EXTEND MESSAGES/EMAIL_SENDS TABLES WITH BOUNCE TRACKING
-- ============================================================================

-- Extend messages table (if it exists)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'messages') then
    alter table public.messages
      add column if not exists bounce_type text check (bounce_type in ('hard', 'soft', 'none')),
      add column if not exists bounce_reason text,
      add column if not exists is_bounce boolean default false,
      add column if not exists provider_message_id text;
    
    create index if not exists messages_is_bounce_idx on public.messages(is_bounce);
    create index if not exists messages_provider_message_id_idx on public.messages(provider_message_id) where provider_message_id is not null;
  end if;
end $$;

-- Extend email_sends table (if it exists)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'email_sends') then
    alter table public.email_sends
      add column if not exists bounce_type text check (bounce_type in ('hard', 'soft', 'none')),
      add column if not exists bounce_reason text,
      add column if not exists is_bounce boolean default false,
      add column if not exists provider_message_id text,
      add column if not exists sender_email text;
    
    create index if not exists email_sends_is_bounce_idx on public.email_sends(is_bounce);
    create index if not exists email_sends_provider_message_id_idx on public.email_sends(provider_message_id) where provider_message_id is not null;
    create index if not exists email_sends_sender_email_idx on public.email_sends(sender_email) where sender_email is not null;
  end if;
end $$;

-- Extend send_queue table (if it exists) with bounce tracking
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'send_queue') then
    alter table public.send_queue
      add column if not exists bounce_type text check (bounce_type in ('hard', 'soft', 'none')),
      add column if not exists bounce_reason text,
      add column if not exists is_bounce boolean default false;
    
    create index if not exists send_queue_is_bounce_idx on public.send_queue(is_bounce);
  end if;
end $$;

-- ============================================================================
-- 2. EXTEND CAMPAIGNS TABLE WITH PAUSE FIELDS
-- ============================================================================

alter table public.campaigns
  add column if not exists paused boolean default false,
  add column if not exists pause_reason text,
  add column if not exists paused_at timestamptz;

create index if not exists campaigns_paused_idx on public.campaigns(paused) where paused = true;

-- ============================================================================
-- 3. CREATE SENDING IDENTITY HELPER FUNCTION
-- ============================================================================

-- Helper function to extract sending identity (email address) from various tables
create or replace function public.get_sending_identity_from_send(
  p_send_id uuid,
  p_table_name text default 'email_sends'
)
returns text
language plpgsql
stable
as $$
declare
  v_email text;
begin
  if p_table_name = 'email_sends' and exists (select 1 from information_schema.tables where table_name = 'email_sends') then
    select sender_email into v_email
    from public.email_sends
    where id = p_send_id;
    
    -- Fallback: try to get from connected_accounts via account_id
    if v_email is null then
      select coalesce(ca.email_address, ca.account_email, ca.email) into v_email
      from public.email_sends es
      join public.connected_accounts ca on es.account_id = ca.id
      where es.id = p_send_id
      limit 1;
    end if;
  elsif p_table_name = 'send_queue' and exists (select 1 from information_schema.tables where table_name = 'send_queue') then
    select sender_email into v_email
    from public.send_queue
    where id = p_send_id;
    
    -- Fallback: try to get from connected_accounts via from_account_id
    if v_email is null then
      select coalesce(ca.email_address, ca.account_email, ca.email) into v_email
      from public.send_queue sq
      join public.connected_accounts ca on sq.from_account_id = ca.id
      where sq.id = p_send_id
      limit 1;
    end if;
  elsif p_table_name = 'messages' and exists (select 1 from information_schema.tables where table_name = 'messages') then
    select coalesce(ca.email_address, ca.account_email, ca.email) into v_email
    from public.messages m
    join public.connected_accounts ca on m.smtp_account_id = ca.id
    where m.id = p_send_id
    limit 1;
  end if;
  
  return v_email;
end;
$$;

-- ============================================================================
-- 4. CREATE BOUNCE SUMMARY MATERIALIZED VIEW
-- ============================================================================

-- Drop existing view if it exists
drop materialized view if exists public.email_bounce_summary;

create materialized view public.email_bounce_summary as
with all_sends as (
  -- From email_sends table
  select 
    coalesce(es.sender_email, ca.email_address, ca.account_email, ca.email) as sending_identity,
    es.campaign_id,
    es.account_id,
    es.created_at as sent_at,
    es.is_bounce,
    es.bounce_type,
    es.bounce_reason
  from public.email_sends es
  left join public.connected_accounts ca on es.account_id = ca.id
  where es.status = 'sent' and es.created_at >= now() - interval '30 days'
  
  union all
  
  -- From send_queue table (if it exists and has sent state)
  select 
    coalesce(sq.sender_email, ca.email_address, ca.account_email, ca.email) as sending_identity,
    sq.campaign_id,
    sq.account_id,
    sq.created_at as sent_at,
    sq.is_bounce,
    sq.bounce_type,
    sq.bounce_reason
  from public.send_queue sq
  left join public.connected_accounts ca on sq.from_account_id = ca.id
  where sq.state = 'sent' and sq.created_at >= now() - interval '30 days'
    and exists (select 1 from information_schema.tables where table_name = 'send_queue')
  
  union all
  
  -- From messages table (if it exists)
  select 
    coalesce(ca.email_address, ca.account_email, ca.email) as sending_identity,
    m.campaign_id,
    ca.id as account_id,
    m.sent_at,
    m.is_bounce,
    m.bounce_type,
    m.bounce_reason
  from public.messages m
  join public.connected_accounts ca on m.smtp_account_id = ca.id
  where m.status = 'sent' and m.sent_at >= now() - interval '30 days'
    and exists (select 1 from information_schema.tables where table_name = 'messages')
)
select
  sending_identity,
  count(*) as total_sent,
  count(*) filter (where is_bounce = true) as total_bounced,
  count(*) filter (where bounce_type = 'hard') as hard_bounces,
  count(*) filter (where bounce_type = 'soft') as soft_bounces,
  case 
    when count(*) > 0 then 
      round((count(*) filter (where is_bounce = true)::numeric / count(*)::numeric) * 100, 2)
    else 0
  end as bounce_rate,
  max(sent_at) as last_sent_at
from all_sends
where sending_identity is not null
group by sending_identity;

create unique index email_bounce_summary_sending_identity_idx on public.email_bounce_summary(sending_identity);
create index email_bounce_summary_bounce_rate_idx on public.email_bounce_summary(bounce_rate desc);

-- ============================================================================
-- 5. CREATE FUNCTION TO REFRESH BOUNCE SUMMARY
-- ============================================================================

create or replace function public.refresh_bounce_summary()
returns void
language plpgsql
security definer
as $$
begin
  refresh materialized view concurrently public.email_bounce_summary;
end;
$$;

-- ============================================================================
-- 6. CREATE REPUTATION GUARD RULES FUNCTIONS
-- ============================================================================

-- Rule 1: Check hard bounce rate threshold
create or replace function public.check_bounce_rate_threshold(
  p_sending_identity text,
  p_total_sent int
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_bounce_summary record;
  v_threshold numeric;
  v_result jsonb;
begin
  -- Determine threshold based on send volume
  if p_total_sent < 100 then
    v_threshold := 5.0; -- 5% for small sends
  elsif p_total_sent < 1000 then
    v_threshold := 8.0; -- 8% for medium sends
  else
    v_threshold := 10.0; -- 10% for large sends
  end if;
  
  -- Get bounce summary
  select * into v_bounce_summary
  from public.email_bounce_summary
  where sending_identity = p_sending_identity;
  
  if not found then
    return jsonb_build_object(
      'triggered', false,
      'rule', 'bounce_rate_threshold',
      'reason', 'No bounce data found'
    );
  end if;
  
  -- Check if threshold exceeded
  if v_bounce_summary.bounce_rate > v_threshold then
    return jsonb_build_object(
      'triggered', true,
      'rule', 'bounce_rate_threshold',
      'bounce_rate', v_bounce_summary.bounce_rate,
      'threshold', v_threshold,
      'total_sent', v_bounce_summary.total_sent,
      'total_bounced', v_bounce_summary.total_bounced,
      'hard_bounces', v_bounce_summary.hard_bounces,
      'reason', format('Bounce rate %.2f%% exceeds threshold of %.2f%%', v_bounce_summary.bounce_rate, v_threshold)
    );
  end if;
  
  return jsonb_build_object(
    'triggered', false,
    'rule', 'bounce_rate_threshold',
    'bounce_rate', v_bounce_summary.bounce_rate,
    'threshold', v_threshold
  );
end;
$$;

-- Rule 2: Check for 5 hard bounces in last 50 sends
create or replace function public.check_hard_bounce_spike(
  p_sending_identity text
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_hard_bounces_last_50 int;
  v_result jsonb;
begin
  -- Count hard bounces in last 50 sends
  select count(*) into v_hard_bounces_last_50
  from (
    select 
      coalesce(es.sender_email, ca.email_address, ca.account_email, ca.email) as sending_identity,
      es.bounce_type
    from public.email_sends es
    left join public.connected_accounts ca on es.account_id = ca.id
    where coalesce(es.sender_email, ca.email_address, ca.account_email, ca.email) = p_sending_identity
      and es.status = 'sent'
      and es.created_at >= now() - interval '7 days'
    order by es.created_at desc
    limit 50
  ) recent_sends
  where bounce_type = 'hard';
  
  if v_hard_bounces_last_50 >= 5 then
    return jsonb_build_object(
      'triggered', true,
      'rule', 'hard_bounce_spike',
      'hard_bounces_last_50', v_hard_bounces_last_50,
      'reason', format('Too many hard bounces: %s in last 50 sends', v_hard_bounces_last_50)
    );
  end if;
  
  return jsonb_build_object(
    'triggered', false,
    'rule', 'hard_bounce_spike',
    'hard_bounces_last_50', v_hard_bounces_last_50
  );
end;
$$;

-- Rule 3: Check daily sending limit
create or replace function public.check_daily_limit(
  p_sending_identity text,
  p_daily_limit int default 1000
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_sent_today int;
  v_result jsonb;
begin
  -- Count sends today for this identity
  select count(*) into v_sent_today
  from (
    select coalesce(es.sender_email, ca.email_address, ca.account_email, ca.email) as sending_identity
    from public.email_sends es
    left join public.connected_accounts ca on es.account_id = ca.id
    where coalesce(es.sender_email, ca.email_address, ca.account_email, ca.email) = p_sending_identity
      and es.status = 'sent'
      and es.created_at >= date_trunc('day', now())
    
    union all
    
    select coalesce(sq.sender_email, ca.email_address, ca.account_email, ca.email) as sending_identity
    from public.send_queue sq
    left join public.connected_accounts ca on sq.from_account_id = ca.id
    where coalesce(sq.sender_email, ca.email_address, ca.account_email, ca.email) = p_sending_identity
      and sq.state = 'sent'
      and sq.created_at >= date_trunc('day', now())
      and exists (select 1 from information_schema.tables where table_name = 'send_queue')
  ) today_sends;
  
  if v_sent_today >= p_daily_limit then
    return jsonb_build_object(
      'triggered', true,
      'rule', 'daily_limit',
      'sent_today', v_sent_today,
      'daily_limit', p_daily_limit,
      'reason', format('Daily limit reached: %s/%s emails sent today', v_sent_today, p_daily_limit)
    );
  end if;
  
  return jsonb_build_object(
    'triggered', false,
    'rule', 'daily_limit',
    'sent_today', v_sent_today,
    'daily_limit', p_daily_limit
  );
end;
$$;

-- Rule 4: Check hourly sending limit
create or replace function public.check_hourly_limit(
  p_sending_identity text,
  p_hourly_limit int default 200
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_sent_last_hour int;
  v_result jsonb;
begin
  -- Count sends in last hour for this identity
  select count(*) into v_sent_last_hour
  from (
    select coalesce(es.sender_email, ca.email_address, ca.account_email, ca.email) as sending_identity
    from public.email_sends es
    left join public.connected_accounts ca on es.account_id = ca.id
    where coalesce(es.sender_email, ca.email_address, ca.account_email, ca.email) = p_sending_identity
      and es.status = 'sent'
      and es.created_at >= now() - interval '1 hour'
    
    union all
    
    select coalesce(sq.sender_email, ca.email_address, ca.account_email, ca.email) as sending_identity
    from public.send_queue sq
    left join public.connected_accounts ca on sq.from_account_id = ca.id
    where coalesce(sq.sender_email, ca.email_address, ca.account_email, ca.email) = p_sending_identity
      and sq.state = 'sent'
      and sq.created_at >= now() - interval '1 hour'
      and exists (select 1 from information_schema.tables where table_name = 'send_queue')
  ) hour_sends;
  
  if v_sent_last_hour >= p_hourly_limit then
    return jsonb_build_object(
      'triggered', true,
      'rule', 'hourly_limit',
      'sent_last_hour', v_sent_last_hour,
      'hourly_limit', p_hourly_limit,
      'reason', format('Hourly limit reached: %s/%s emails sent in last hour', v_sent_last_hour, p_hourly_limit)
    );
  end if;
  
  return jsonb_build_object(
    'triggered', false,
    'rule', 'hourly_limit',
    'sent_last_hour', v_sent_last_hour,
    'hourly_limit', p_hourly_limit
  );
end;
$$;

-- Rule 5: Check warmup score (Block 11700 integration)
create or replace function public.check_warmup_score(
  p_account_id uuid
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_warmup_score int;
  v_result jsonb;
begin
  -- Get warmup score from connected_accounts (Block 11700)
  select last_risk_score into v_warmup_score
  from public.connected_accounts
  where id = p_account_id;
  
  if not found then
    return jsonb_build_object(
      'triggered', false,
      'rule', 'warmup_score',
      'reason', 'Account not found'
    );
  end if;
  
  -- If warmup score is low (< 40), trigger pause
  if v_warmup_score is not null and v_warmup_score < 40 then
    return jsonb_build_object(
      'triggered', true,
      'rule', 'warmup_score',
      'warmup_score', v_warmup_score,
      'threshold', 40,
      'reason', format('Warmup score too low: %s (threshold: 40). Dangerous sending risk detected.', v_warmup_score)
    );
  end if;
  
  return jsonb_build_object(
    'triggered', false,
    'rule', 'warmup_score',
    'warmup_score', v_warmup_score
  );
end;
$$;

-- Rule 6: Check for sudden volume spike (3x vs 7-day average)
create or replace function public.check_volume_spike(
  p_sending_identity text
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_sent_today int;
  v_sent_7d_avg numeric;
  v_result jsonb;
begin
  -- Count sends today
  select count(*) into v_sent_today
  from (
    select coalesce(es.sender_email, ca.email_address, ca.account_email, ca.email) as sending_identity
    from public.email_sends es
    left join public.connected_accounts ca on es.account_id = ca.id
    where coalesce(es.sender_email, ca.email_address, ca.account_email, ca.email) = p_sending_identity
      and es.status = 'sent'
      and es.created_at >= date_trunc('day', now())
    
    union all
    
    select coalesce(sq.sender_email, ca.email_address, ca.account_email, ca.email) as sending_identity
    from public.send_queue sq
    left join public.connected_accounts ca on sq.from_account_id = ca.id
    where coalesce(sq.sender_email, ca.email_address, ca.account_email, ca.email) = p_sending_identity
      and sq.state = 'sent'
      and sq.created_at >= date_trunc('day', now())
      and exists (select 1 from information_schema.tables where table_name = 'send_queue')
  ) today_sends;
  
  -- Calculate 7-day average (excluding today)
  select avg(daily_count) into v_sent_7d_avg
  from (
    select 
      date_trunc('day', es.created_at)::date as send_date,
      count(*) as daily_count
    from public.email_sends es
    left join public.connected_accounts ca on es.account_id = ca.id
    where coalesce(es.sender_email, ca.email_address, ca.account_email, ca.email) = p_sending_identity
      and es.status = 'sent'
      and es.created_at >= now() - interval '7 days'
      and es.created_at < date_trunc('day', now())
    group by date_trunc('day', es.created_at)::date
    
    union all
    
    select 
      date_trunc('day', sq.created_at)::date as send_date,
      count(*) as daily_count
    from public.send_queue sq
    left join public.connected_accounts ca on sq.from_account_id = ca.id
    where coalesce(sq.sender_email, ca.email_address, ca.account_email, ca.email) = p_sending_identity
      and sq.state = 'sent'
      and sq.created_at >= now() - interval '7 days'
      and sq.created_at < date_trunc('day', now())
      and exists (select 1 from information_schema.tables where table_name = 'send_queue')
    group by date_trunc('day', sq.created_at)::date
  ) daily_counts;
  
  -- If 7-day average is null or 0, set to 1 to avoid division by zero
  v_sent_7d_avg := coalesce(v_sent_7d_avg, 1);
  
  -- Check if today's volume is 3x the 7-day average
  if v_sent_today > 0 and v_sent_7d_avg > 0 and (v_sent_today::numeric / v_sent_7d_avg) >= 3.0 then
    return jsonb_build_object(
      'triggered', true,
      'rule', 'volume_spike',
      'sent_today', v_sent_today,
      'sent_7d_avg', round(v_sent_7d_avg, 2),
      'multiplier', round((v_sent_today::numeric / v_sent_7d_avg), 2),
      'reason', format('Volume spike detected: %s emails today vs %.2f average (%.1fx increase). Sending too fast from a cold domain can cause deliverability issues.', v_sent_today, v_sent_7d_avg, (v_sent_today::numeric / v_sent_7d_avg))
    );
  end if;
  
  return jsonb_build_object(
    'triggered', false,
    'rule', 'volume_spike',
    'sent_today', v_sent_today,
    'sent_7d_avg', round(v_sent_7d_avg, 2)
  );
end;
$$;

-- ============================================================================
-- 7. CREATE NOTIFICATION HELPER FUNCTION
-- ============================================================================

create or replace function public.create_reputation_notification(
  p_campaign_id uuid,
  p_user_id uuid,
  p_workspace_id uuid default null,
  p_type text default 'system',
  p_title text,
  p_body text default null,
  p_link text default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_notification_id uuid;
begin
  -- Try to insert into notifications table (handle different schema variations)
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'notifications') then
    -- Check which columns exist
    if exists (select 1 from information_schema.columns where table_name = 'notifications' and column_name = 'workspace_id') then
      insert into public.notifications (workspace_id, user_id, type, title, body, link, read, created_at)
      values (p_workspace_id, p_user_id, p_type, p_title, p_body, p_link, false, now())
      returning id into v_notification_id;
    elsif exists (select 1 from information_schema.columns where table_name = 'notifications' and column_name = 'campaign_id') then
      insert into public.notifications (campaign_id, user_id, type, title, body, read, created_at)
      values (p_campaign_id, p_user_id, p_type, p_title, p_body, false, now())
      returning id into v_notification_id;
    else
      insert into public.notifications (user_id, type, title, body, read, created_at)
      values (p_user_id, p_type, p_title, p_body, false, now())
      returning id into v_notification_id;
    end if;
  end if;
  
  return v_notification_id;
end;
$$;

-- ============================================================================
-- 8. MAIN REPUTATION GUARD CHECK FUNCTION
-- ============================================================================

create or replace function public.check_reputation_guard(
  p_campaign_id uuid,
  p_sending_identity text,
  p_account_id uuid default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_result jsonb := '[]'::jsonb;
  v_rule_result jsonb;
  v_total_sent int;
  v_should_pause boolean := false;
  v_pause_reason text;
  v_triggered_rules jsonb := '[]'::jsonb;
  v_campaign record;
  v_user_id uuid;
  v_workspace_id uuid;
  v_notification_title text;
  v_notification_body text;
begin
  -- Get campaign details for notification
  if p_campaign_id is not null then
    select c.*, 
           coalesce(c.user_id, c.owner_id, (select user_id from public.workspaces w where w.id = c.workspace_id limit 1)) as owner_user_id,
           c.workspace_id
    into v_campaign
    from public.campaigns c
    where c.id = p_campaign_id;
    
    if found then
      v_user_id := v_campaign.owner_user_id;
      v_workspace_id := v_campaign.workspace_id;
    end if;
  end if;
  
  -- Get total sent count for threshold calculation
  select coalesce(total_sent, 0) into v_total_sent
  from public.email_bounce_summary
  where sending_identity = p_sending_identity;
  
  -- Rule 1: Bounce rate threshold
  v_rule_result := public.check_bounce_rate_threshold(p_sending_identity, v_total_sent);
  v_result := v_result || jsonb_build_array(v_rule_result);
  if (v_rule_result->>'triggered')::boolean then
    v_should_pause := true;
    v_triggered_rules := v_triggered_rules || jsonb_build_array(v_rule_result);
    if v_pause_reason is null then
      v_pause_reason := v_rule_result->>'reason';
    end if;
  end if;
  
  -- Rule 2: Hard bounce spike
  v_rule_result := public.check_hard_bounce_spike(p_sending_identity);
  v_result := v_result || jsonb_build_array(v_rule_result);
  if (v_rule_result->>'triggered')::boolean then
    v_should_pause := true;
    v_triggered_rules := v_triggered_rules || jsonb_build_array(v_rule_result);
    if v_pause_reason is null then
      v_pause_reason := v_rule_result->>'reason';
    end if;
  end if;
  
  -- Rule 3: Daily limit
  v_rule_result := public.check_daily_limit(p_sending_identity, 1000);
  v_result := v_result || jsonb_build_array(v_rule_result);
  if (v_rule_result->>'triggered')::boolean then
    v_should_pause := true;
    v_triggered_rules := v_triggered_rules || jsonb_build_array(v_rule_result);
    if v_pause_reason is null then
      v_pause_reason := v_rule_result->>'reason';
    end if;
  end if;
  
  -- Rule 4: Hourly limit
  v_rule_result := public.check_hourly_limit(p_sending_identity, 200);
  v_result := v_result || jsonb_build_array(v_rule_result);
  if (v_rule_result->>'triggered')::boolean then
    v_should_pause := true;
    v_triggered_rules := v_triggered_rules || jsonb_build_array(v_rule_result);
    if v_pause_reason is null then
      v_pause_reason := v_rule_result->>'reason';
    end if;
  end if;
  
  -- Rule 5: Warmup score (if account_id provided)
  if p_account_id is not null then
    v_rule_result := public.check_warmup_score(p_account_id);
    v_result := v_result || jsonb_build_array(v_rule_result);
    if (v_rule_result->>'triggered')::boolean then
      v_should_pause := true;
      v_triggered_rules := v_triggered_rules || jsonb_build_array(v_rule_result);
      if v_pause_reason is null then
        v_pause_reason := v_rule_result->>'reason';
      end if;
    end if;
  end if;
  
  -- Rule 6: Volume spike
  v_rule_result := public.check_volume_spike(p_sending_identity);
  v_result := v_result || jsonb_build_array(v_rule_result);
  if (v_rule_result->>'triggered')::boolean then
    v_should_pause := true;
    v_triggered_rules := v_triggered_rules || jsonb_build_array(v_rule_result);
    if v_pause_reason is null then
      v_pause_reason := v_rule_result->>'reason';
    end if;
  end if;
  
  -- Auto-pause campaign if needed
  if v_should_pause and p_campaign_id is not null then
    update public.campaigns
    set 
      paused = true,
      pause_reason = v_pause_reason,
      paused_at = now()
    where id = p_campaign_id;
    
    -- Create notification
    if v_user_id is not null then
      v_notification_title := format('Campaign Paused: %s', coalesce(v_campaign.name, v_campaign.title, 'Campaign'));
      v_notification_body := format('Reason: %s. Recommended action: Clean your list before resuming.', v_pause_reason);
      
      perform public.create_reputation_notification(
        p_campaign_id := p_campaign_id,
        p_user_id := v_user_id,
        p_workspace_id := v_workspace_id,
        p_type := 'system',
        p_title := v_notification_title,
        p_body := v_notification_body,
        p_link := format('/campaigns/%s', p_campaign_id)
      );
    end if;
  end if;
  
  return jsonb_build_object(
    'should_pause', v_should_pause,
    'pause_reason', v_pause_reason,
    'triggered_rules', v_triggered_rules,
    'all_rules', v_result
  );
end;
$$;

-- ============================================================================
-- 9. BOUNCE WEBHOOK PROCESSING FUNCTION
-- ============================================================================

create or replace function public.process_bounce_event(
  p_provider_message_id text,
  p_bounce_type text, -- 'hard' or 'soft'
  p_bounce_reason text,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_updated_count int := 0;
  v_sending_identity text;
  v_campaign_id uuid;
  v_account_id uuid;
  v_guard_result jsonb;
begin
  -- Update email_sends table
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'email_sends') then
    update public.email_sends
    set 
      is_bounce = true,
      bounce_type = p_bounce_type,
      bounce_reason = p_bounce_reason
    where provider_message_id = p_provider_message_id;
    
    get diagnostics v_updated_count = row_count;
    
    -- Get sending identity and campaign for guard check
    if v_updated_count > 0 then
      select 
        coalesce(es.sender_email, ca.email_address, ca.account_email, ca.email),
        es.campaign_id,
        es.account_id
      into v_sending_identity, v_campaign_id, v_account_id
      from public.email_sends es
      left join public.connected_accounts ca on es.account_id = ca.id
      where es.provider_message_id = p_provider_message_id
      limit 1;
    end if;
  end if;
  
  -- Update send_queue table
  if v_updated_count = 0 and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'send_queue') then
    update public.send_queue
    set 
      is_bounce = true,
      bounce_type = p_bounce_type,
      bounce_reason = p_bounce_reason
    where provider_message_id = p_provider_message_id;
    
    get diagnostics v_updated_count = row_count;
    
    -- Get sending identity and campaign for guard check
    if v_updated_count > 0 then
      select 
        coalesce(sq.sender_email, ca.email_address, ca.account_email, ca.email),
        sq.campaign_id,
        sq.account_id
      into v_sending_identity, v_campaign_id, v_account_id
      from public.send_queue sq
      left join public.connected_accounts ca on sq.from_account_id = ca.id
      where sq.provider_message_id = p_provider_message_id
      limit 1;
    end if;
  end if;
  
  -- Update messages table
  if v_updated_count = 0 and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'messages') then
    update public.messages
    set 
      is_bounce = true,
      bounce_type = p_bounce_type,
      bounce_reason = p_bounce_reason
    where provider_message_id = p_provider_message_id;
    
    get diagnostics v_updated_count = row_count;
    
    -- Get sending identity and campaign for guard check
    if v_updated_count > 0 then
      select 
        coalesce(ca.email_address, ca.account_email, ca.email),
        m.campaign_id,
        ca.id
      into v_sending_identity, v_campaign_id, v_account_id
      from public.messages m
      join public.connected_accounts ca on m.smtp_account_id = ca.id
      where m.provider_message_id = p_provider_message_id
      limit 1;
    end if;
  end if;
  
  -- Refresh bounce summary
  if v_updated_count > 0 then
    perform public.refresh_bounce_summary();
    
    -- Run reputation guard check
    if v_sending_identity is not null then
      v_guard_result := public.check_reputation_guard(
        p_campaign_id := v_campaign_id,
        p_sending_identity := v_sending_identity,
        p_account_id := v_account_id
      );
    end if;
  end if;
  
  return jsonb_build_object(
    'updated', v_updated_count > 0,
    'sending_identity', v_sending_identity,
    'campaign_id', v_campaign_id,
    'guard_result', v_guard_result
  );
end;
$$;

-- ============================================================================
-- 10. RESUME CAMPAIGN FUNCTION
-- ============================================================================

create or replace function public.resume_campaign(
  p_campaign_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_campaign record;
  v_result jsonb;
begin
  -- Get campaign details
  select * into v_campaign
  from public.campaigns
  where id = p_campaign_id;
  
  if not found then
    return jsonb_build_object('error', 'Campaign not found');
  end if;
  
  -- Unpause campaign
  update public.campaigns
  set 
    paused = false,
    pause_reason = null,
    paused_at = null
  where id = p_campaign_id;
  
  return jsonb_build_object(
    'success', true,
    'campaign_id', p_campaign_id,
    'message', 'Campaign resumed successfully'
  );
end;
$$;

-- ============================================================================
-- 11. GET REPUTATION STATUS FUNCTION
-- ============================================================================

create or replace function public.get_reputation_status(
  p_sending_identity text,
  p_account_id uuid default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_bounce_summary record;
  v_warmup_score int;
  v_result jsonb;
begin
  -- Get bounce summary
  select * into v_bounce_summary
  from public.email_bounce_summary
  where sending_identity = p_sending_identity;
  
  -- Get warmup score if account_id provided
  if p_account_id is not null then
    select last_risk_score into v_warmup_score
    from public.connected_accounts
    where id = p_account_id;
  end if;
  
  -- Run all guard checks
  v_result := public.check_reputation_guard(
    p_campaign_id := null,
    p_sending_identity := p_sending_identity,
    p_account_id := p_account_id
  );
  
  return jsonb_build_object(
    'sending_identity', p_sending_identity,
    'bounce_summary', case when v_bounce_summary is not null then
      jsonb_build_object(
        'total_sent', v_bounce_summary.total_sent,
        'total_bounced', v_bounce_summary.total_bounced,
        'hard_bounces', v_bounce_summary.hard_bounces,
        'soft_bounces', v_bounce_summary.soft_bounces,
        'bounce_rate', v_bounce_summary.bounce_rate,
        'last_sent_at', v_bounce_summary.last_sent_at
      )
    else null end,
    'warmup_score', v_warmup_score,
    'guard_status', v_result
  );
end;
$$;

-- ============================================================================
-- 12. CHECK CAMPAIGN PAUSE STATUS (FOR SEND ORCHESTRATOR)
-- ============================================================================

create or replace function public.is_campaign_paused(
  p_campaign_id uuid
)
returns boolean
language plpgsql
stable
as $$
declare
  v_paused boolean;
begin
  select paused into v_paused
  from public.campaigns
  where id = p_campaign_id;
  
  return coalesce(v_paused, false);
end;
$$;

-- ============================================================================
-- 13. GRANT PERMISSIONS
-- ============================================================================

grant execute on function public.check_reputation_guard(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.process_bounce_event(text, text, text, text) to authenticated, service_role;
grant execute on function public.resume_campaign(uuid) to authenticated, service_role;
grant execute on function public.get_reputation_status(text, uuid) to authenticated, service_role;
grant execute on function public.refresh_bounce_summary() to authenticated, service_role;
grant execute on function public.get_sending_identity_from_send(uuid, text) to authenticated, service_role;
grant execute on function public.is_campaign_paused(uuid) to authenticated, service_role;
grant execute on function public.create_reputation_notification(uuid, uuid, uuid, text, text, text, text) to authenticated, service_role;

-- Grant select on bounce summary view
grant select on public.email_bounce_summary to authenticated, service_role;

-- ============================================================================
-- 14. CREATE TRIGGER TO AUTO-REFRESH BOUNCE SUMMARY (optional, via cron)
-- ============================================================================

-- Note: This can be scheduled via pg_cron if available
-- Example: SELECT cron.schedule('refresh-bounce-summary', '*/15 * * * *', $$SELECT public.refresh_bounce_summary();$$);

-- ============================================================================
-- 15. RLS POLICIES FOR BOUNCE DATA
-- ============================================================================

-- RLS is already enabled on underlying tables (email_sends, send_queue, messages)
-- The bounce summary view inherits RLS from those tables via the underlying queries

