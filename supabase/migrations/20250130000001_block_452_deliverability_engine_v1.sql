-- Block 452 — SmartSend Deliverability Engine v1
-- Global Safeguards • Reputation AI • Throttling • Inbox/Domain Health Enforcement • Adaptive Sending
-- This block turns SmartSend from a simple "cold email sender" into a real deliverability-safe outbound system

-- ============================================
-- 1) Schema Additions — Health Scores
-- ============================================

-- Inbox Health Table
create table if not exists public.inbox_health (
  inbox_id uuid primary key references public.sender_inboxes(id) on delete cascade,
  health_score int default 100 check (health_score >= 0 and health_score <= 100),
  bounce_rate float default 0 check (bounce_rate >= 0 and bounce_rate <= 1),
  spam_rate float default 0 check (spam_rate >= 0 and spam_rate <= 1),
  open_rate float default 0 check (open_rate >= 0 and open_rate <= 1),
  reply_rate float default 0 check (reply_rate >= 0 and reply_rate <= 1),
  unsubscribe_rate float default 0 check (unsubscribe_rate >= 0 and unsubscribe_rate <= 1),
  last_24h_sent int default 0,
  last_24h_bounced int default 0,
  last_24h_spam int default 0,
  last_24h_opened int default 0,
  last_24h_replied int default 0,
  last_24h_unsubscribed int default 0,
  is_paused boolean default false,
  pause_reason text,
  paused_at timestamptz,
  last_updated timestamptz default now()
);

create index if not exists idx_inbox_health_score on public.inbox_health(health_score);
create index if not exists idx_inbox_health_paused on public.inbox_health(is_paused) where is_paused = true;
create index if not exists idx_inbox_health_last_updated on public.inbox_health(last_updated);

-- Domain Health Table
create table if not exists public.domain_health (
  domain text primary key,
  health_score int default 100 check (health_score >= 0 and health_score <= 100),
  bounce_rate float default 0 check (bounce_rate >= 0 and bounce_rate <= 1),
  spam_rate float default 0 check (spam_rate >= 0 and spam_rate <= 1),
  open_rate float default 0 check (open_rate >= 0 and open_rate <= 1),
  sender_count int default 1,
  last_24h_sent int default 0,
  last_24h_bounced int default 0,
  last_24h_spam int default 0,
  last_24h_opened int default 0,
  is_paused boolean default false,
  pause_reason text,
  paused_at timestamptz,
  last_updated timestamptz default now()
);

create index if not exists idx_domain_health_score on public.domain_health(health_score);
create index if not exists idx_domain_health_paused on public.domain_health(is_paused) where is_paused = true;
create index if not exists idx_domain_health_last_updated on public.domain_health(last_updated);

-- Enable RLS
alter table public.inbox_health enable row level security;
alter table public.domain_health enable row level security;

-- RLS Policies for inbox_health
create policy "inbox_health_select_workspace_member" on public.inbox_health
  for select using (
    exists (
      select 1 from public.sender_inboxes si
      join public.workspace_members wm on wm.workspace_id = si.workspace_id
      where si.id = inbox_health.inbox_id
        and wm.user_id = auth.uid()
    )
  );

-- RLS Policies for domain_health (read-only for workspace members)
create policy "domain_health_select_workspace_member" on public.domain_health
  for select using (
    exists (
      select 1 from public.sender_domains sd
      join public.workspace_members wm on wm.workspace_id = sd.workspace_id
      where sd.domain = domain_health.domain
        and wm.user_id = auth.uid()
    )
  );

-- ============================================
-- 2) Helper Functions — Calculate Health Scores
-- ============================================

-- Function to calculate inbox health score from metrics
create or replace function public.calculate_inbox_health_score(
  p_bounce_rate float,
  p_spam_rate float,
  p_open_rate float,
  p_reply_rate float,
  p_unsubscribe_rate float,
  p_is_warmed boolean default false
)
returns int
language plpgsql
immutable
as $$
declare
  v_score int := 100;
begin
  -- Negative signals (penalties)
  if p_bounce_rate > 0.08 then
    v_score := v_score - 50; -- Pause threshold
  elsif p_bounce_rate > 0.06 then
    v_score := v_score - 35;
  elsif p_bounce_rate > 0.04 then
    v_score := v_score - 15;
  end if;

  if p_spam_rate > 0.003 then
    v_score := v_score - 50; -- Pause threshold
  elsif p_spam_rate > 0.002 then
    v_score := v_score - 25;
  elsif p_spam_rate > 0.001 then
    v_score := v_score - 10;
  end if;

  if p_unsubscribe_rate > 0.02 then
    v_score := v_score - 20;
  elsif p_unsubscribe_rate > 0.01 then
    v_score := v_score - 10;
  end if;

  -- Positive signals (bonuses)
  if p_open_rate > 0.35 then
    v_score := v_score + 10;
  end if;

  if p_reply_rate > 0.015 then
    v_score := v_score + 10;
  end if;

  if p_is_warmed then
    v_score := v_score + 15;
  end if;

  -- Clamp to 0-100
  return greatest(0, least(100, v_score));
end;
$$;

-- Function to update inbox health from last 24h stats
create or replace function public.update_inbox_health(
  p_inbox_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stats record;
  v_health_score int;
  v_bounce_rate float;
  v_spam_rate float;
  v_open_rate float;
  v_reply_rate float;
  v_unsubscribe_rate float;
  v_is_warmed boolean;
begin
  -- Get last 24h stats
  select 
    count(*) filter (where sl.status = 'sent') as sent,
    count(*) filter (where eb.id is not null) as bounced,
    count(*) filter (where s.reason = 'complaint' or s.reason = 'spamtrap') as spam,
    count(*) filter (where ee.event_type = 'open') as opened,
    count(*) filter (where r.id is not null) as replied,
    count(*) filter (where s.reason = 'unsubscribe') as unsubscribed
  into v_stats
  from public.send_logs sl
  left join public.email_bounces eb on eb.send_id = sl.id
  left join public.suppressions s on s.email = sl.to_email and s.account_id = (select workspace_id from public.sender_inboxes where id = p_inbox_id)
  left join public.email_events ee on ee.send_log_id = sl.id
  left join public.inbox_threads r on r.contact_id = sl.lead_id and r.last_message_at > sl.sent_at
  where sl.sender_inbox_id = p_inbox_id
    and sl.sent_at > now() - interval '24 hours';

  -- Calculate rates
  v_bounce_rate := case when v_stats.sent > 0 then v_stats.bounced::float / v_stats.sent else 0 end;
  v_spam_rate := case when v_stats.sent > 0 then v_stats.spam::float / v_stats.sent else 0 end;
  v_open_rate := case when v_stats.sent > 0 then v_stats.opened::float / v_stats.sent else 0 end;
  v_reply_rate := case when v_stats.sent > 0 then v_stats.replied::float / v_stats.sent else 0 end;
  v_unsubscribe_rate := case when v_stats.sent > 0 then v_stats.unsubscribed::float / v_stats.sent else 0 end;

  -- Check if inbox is warmed
  select warmup_enabled into v_is_warmed
  from public.sender_inboxes
  where id = p_inbox_id;

  -- Calculate health score
  v_health_score := public.calculate_inbox_health_score(
    v_bounce_rate,
    v_spam_rate,
    v_open_rate,
    v_reply_rate,
    v_unsubscribe_rate,
    v_is_warmed
  );

  -- Update inbox_health
  insert into public.inbox_health (
    inbox_id,
    health_score,
    bounce_rate,
    spam_rate,
    open_rate,
    reply_rate,
    unsubscribe_rate,
    last_24h_sent,
    last_24h_bounced,
    last_24h_spam,
    last_24h_opened,
    last_24h_replied,
    last_24h_unsubscribed,
    last_updated
  )
  values (
    p_inbox_id,
    v_health_score,
    v_bounce_rate,
    v_spam_rate,
    v_open_rate,
    v_reply_rate,
    v_unsubscribe_rate,
    v_stats.sent,
    v_stats.bounced,
    v_stats.spam,
    v_stats.opened,
    v_stats.replied,
    v_stats.unsubscribed,
    now()
  )
  on conflict (inbox_id) do update set
    health_score = excluded.health_score,
    bounce_rate = excluded.bounce_rate,
    spam_rate = excluded.spam_rate,
    open_rate = excluded.open_rate,
    reply_rate = excluded.reply_rate,
    unsubscribe_rate = excluded.unsubscribe_rate,
    last_24h_sent = excluded.last_24h_sent,
    last_24h_bounced = excluded.last_24h_bounced,
    last_24h_spam = excluded.last_24h_spam,
    last_24h_opened = excluded.last_24h_opened,
    last_24h_replied = excluded.last_24h_replied,
    last_24h_unsubscribed = excluded.last_24h_unsubscribed,
    last_updated = excluded.last_updated;
end;
$$;

-- Function to update domain health from last 24h stats
create or replace function public.update_domain_health(
  p_domain text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stats record;
  v_health_score int;
  v_bounce_rate float;
  v_spam_rate float;
  v_open_rate float;
begin
  -- Get last 24h stats for all inboxes on this domain
  select 
    count(*) filter (where sl.status = 'sent') as sent,
    count(*) filter (where eb.id is not null) as bounced,
    count(*) filter (where s.reason = 'complaint' or s.reason = 'spamtrap') as spam,
    count(*) filter (where ee.event_type = 'open') as opened,
    count(distinct si.id) as sender_count
  into v_stats
  from public.send_logs sl
  join public.sender_inboxes si on si.id = sl.sender_inbox_id
  join public.sender_domains sd on sd.id = si.domain_id
  left join public.email_bounces eb on eb.send_id = sl.id
  left join public.suppressions s on s.email = sl.to_email
  left join public.email_events ee on ee.send_log_id = sl.id
  where sd.domain = p_domain
    and sl.sent_at > now() - interval '24 hours';

  -- Calculate rates
  v_bounce_rate := case when v_stats.sent > 0 then v_stats.bounced::float / v_stats.sent else 0 end;
  v_spam_rate := case when v_stats.sent > 0 then v_stats.spam::float / v_stats.sent else 0 end;
  v_open_rate := case when v_stats.sent > 0 then v_stats.opened::float / v_stats.sent else 0 end;

  -- Calculate health score (same logic as inbox)
  v_health_score := public.calculate_inbox_health_score(
    v_bounce_rate,
    v_spam_rate,
    v_open_rate,
    0, -- reply_rate not used for domain
    0, -- unsubscribe_rate not used for domain
    false -- domain warmup not tracked here
  );

  -- Update domain_health
  insert into public.domain_health (
    domain,
    health_score,
    bounce_rate,
    spam_rate,
    open_rate,
    sender_count,
    last_24h_sent,
    last_24h_bounced,
    last_24h_spam,
    last_24h_opened,
    last_updated
  )
  values (
    p_domain,
    v_health_score,
    v_bounce_rate,
    v_spam_rate,
    v_open_rate,
    v_stats.sender_count,
    v_stats.sent,
    v_stats.bounced,
    v_stats.spam,
    v_stats.opened,
    now()
  )
  on conflict (domain) do update set
    health_score = excluded.health_score,
    bounce_rate = excluded.bounce_rate,
    spam_rate = excluded.spam_rate,
    open_rate = excluded.open_rate,
    sender_count = excluded.sender_count,
    last_24h_sent = excluded.last_24h_sent,
    last_24h_bounced = excluded.last_24h_bounced,
    last_24h_spam = excluded.last_24h_spam,
    last_24h_opened = excluded.last_24h_opened,
    last_updated = excluded.last_updated;
end;
$$;

-- ============================================
-- 3) Enforcement Functions — Pre-Send Checks
-- ============================================

-- Function to check if inbox can send (enforcement layer)
create or replace function public.can_inbox_send(
  p_inbox_id uuid
)
returns table (
  allowed boolean,
  reason text,
  recommended_throttle int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_health record;
  v_domain text;
  v_domain_health record;
begin
  -- Get inbox health
  select * into v_health
  from public.inbox_health
  where inbox_id = p_inbox_id;

  -- If no health record, allow (first time)
  if v_health is null then
    return query select true, null::text, 30::int;
    return;
  end if;

  -- Check if paused
  if v_health.is_paused then
    return query select false, coalesce(v_health.pause_reason, 'Inbox paused')::text, 0::int;
    return;
  end if;

  -- Check inbox health thresholds
  if v_health.health_score < 20 then
    return query select false, 'Inbox health too low (removed from rotation)'::text, 0::int;
    return;
  end if;

  if v_health.health_score < 30 then
    return query select false, 'Inbox disabled (health < 30)'::text, 0::int;
    return;
  end if;

  if v_health.health_score < 40 then
    return query select false, 'Inbox paused (health < 40)'::text, 0::int;
    return;
  end if;

  -- Get domain
  select sd.domain into v_domain
  from public.sender_inboxes si
  join public.sender_domains sd on sd.id = si.domain_id
  where si.id = p_inbox_id;

  -- Get domain health
  select * into v_domain_health
  from public.domain_health
  where domain = v_domain;

  -- Check domain health
  if v_domain_health is not null then
    if v_domain_health.is_paused then
      return query select false, coalesce(v_domain_health.pause_reason, 'Domain paused')::text, 0::int;
      return;
    end if;

    if v_domain_health.health_score < 30 then
      return query select false, 'Domain paused (health < 30)'::text, 0::int;
      return;
    end if;

    if v_domain_health.health_score < 50 then
      -- Slow down
      return query select true, 'Domain health low (slowing down)'::text, 10::int;
      return;
    end if;
  end if;

  -- Calculate recommended throttle based on health score
  declare
    v_throttle int;
  begin
    if v_health.health_score >= 80 then
      v_throttle := 50; -- High health: normal rate
    elsif v_health.health_score >= 50 then
      v_throttle := 30; -- Medium health: moderate rate
    else
      v_throttle := 10; -- Low health: slow rate
    end if;

    return query select true, null::text, v_throttle::int;
  end;
end;
$$;

-- Function to auto-pause inbox if thresholds exceeded
create or replace function public.check_auto_pause_inbox(
  p_inbox_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_health record;
  v_pause_reason text;
begin
  -- Get inbox health
  select * into v_health
  from public.inbox_health
  where inbox_id = p_inbox_id;

  if v_health is null then
    return false;
  end if;

  -- Check auto-pause thresholds
  if v_health.bounce_rate > 0.08 then
    v_pause_reason := 'Bounce rate > 8% (24h)';
  elsif v_health.spam_rate > 0.003 then
    v_pause_reason := 'Spam rate > 0.3% (24h)';
  elsif v_health.health_score < 30 then
    v_pause_reason := 'Health score < 30';
  else
    return false; -- No pause needed
  end if;

  -- Pause inbox
  update public.inbox_health
  set 
    is_paused = true,
    pause_reason = v_pause_reason,
    paused_at = now()
  where inbox_id = p_inbox_id;

  -- Log activity
  insert into public.workspace_activity (
    workspace_id,
    type,
    subtype,
    metadata
  )
  select 
    si.workspace_id,
    'deliverability',
    'inbox_paused',
    jsonb_build_object(
      'inbox_id', p_inbox_id,
      'inbox_email', si.email,
      'reason', v_pause_reason,
      'health_score', v_health.health_score
    )
  from public.sender_inboxes si
  where si.id = p_inbox_id;

  return true;
end;
$$;

-- Function to auto-pause domain if thresholds exceeded
create or replace function public.check_auto_pause_domain(
  p_domain text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_health record;
  v_pause_reason text;
begin
  -- Get domain health
  select * into v_health
  from public.domain_health
  where domain = p_domain;

  if v_health is null then
    return false;
  end if;

  -- Check auto-pause thresholds
  if v_health.bounce_rate > 0.08 then
    v_pause_reason := 'Domain bounce rate > 8% (24h)';
  elsif v_health.spam_rate > 0.003 then
    v_pause_reason := 'Domain spam rate > 0.3% (24h)';
  elsif v_health.health_score < 30 then
    v_pause_reason := 'Domain health score < 30';
  else
    return false; -- No pause needed
  end if;

  -- Pause domain
  update public.domain_health
  set 
    is_paused = true,
    pause_reason = v_pause_reason,
    paused_at = now()
  where domain = p_domain;

  -- Pause all inboxes on this domain
  update public.inbox_health ih
  set 
    is_paused = true,
    pause_reason = 'Domain paused: ' || v_pause_reason,
    paused_at = now()
  from public.sender_inboxes si
  join public.sender_domains sd on sd.id = si.domain_id
  where si.id = ih.inbox_id
    and sd.domain = p_domain;

  -- Log activity
  insert into public.workspace_activity (
    workspace_id,
    type,
    subtype,
    metadata
  )
  select distinct
    si.workspace_id,
    'deliverability',
    'domain_paused',
    jsonb_build_object(
      'domain', p_domain,
      'reason', v_pause_reason,
      'health_score', v_health.health_score
    )
  from public.sender_inboxes si
  join public.sender_domains sd on sd.id = si.domain_id
  where sd.domain = p_domain;

  return true;
end;
$$;

-- ============================================
-- 4) Throttling Rules — Inbox and Domain Limits
-- ============================================

-- Function to get inbox daily limit based on health
create or replace function public.get_inbox_daily_limit(
  p_inbox_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_health record;
  v_inbox record;
  v_limit int;
begin
  -- Get inbox and health
  select * into v_inbox from public.sender_inboxes where id = p_inbox_id;
  select * into v_health from public.inbox_health where inbox_id = p_inbox_id;

  -- Determine category based on health score
  if v_health is null or v_health.health_score < 50 then
    v_limit := 30; -- New inbox
  elsif v_health.health_score < 70 then
    v_limit := 80; -- Warm inbox
  elsif v_health.health_score < 90 then
    v_limit := 120; -- Strong inbox
  else
    v_limit := 200; -- Ultra inbox
  end if;

  -- Apply inbox's custom daily_limit if set
  if v_inbox.daily_limit is not null and v_inbox.daily_limit < v_limit then
    v_limit := v_inbox.daily_limit;
  end if;

  return v_limit;
end;
$$;

-- Function to get domain daily limit
create or replace function public.get_domain_daily_limit(
  p_domain text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_health record;
  v_domain record;
  v_limit int;
begin
  -- Get domain and health
  select * into v_domain from public.sender_domains where domain = p_domain;
  select * into v_health from public.domain_health where domain = p_domain;

  -- Determine limit based on domain age and health
  declare
    v_days_old int;
  begin
    select extract(day from now() - created_at)::int into v_days_old
    from public.sender_domains
    where domain = p_domain;

    if v_days_old < 30 then
      v_limit := 200; -- Low-age domain
    elsif v_health is null or v_health.health_score < 70 then
      v_limit := 500; -- Warm domain
    elsif v_health.health_score < 90 then
      v_limit := 1000; -- Strong domain
    else
      v_limit := 1500; -- Ultra domain
    end if;
  end;

  return v_limit;
end;
$$;

-- Function to check if inbox has daily quota remaining
create or replace function public.has_inbox_quota_remaining(
  p_inbox_id uuid,
  p_today_start timestamptz default date_trunc('day', now())
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
  v_sent_today int;
begin
  -- Get daily limit
  v_limit := public.get_inbox_daily_limit(p_inbox_id);

  -- Count sent today
  select count(*) into v_sent_today
  from public.send_logs
  where sender_inbox_id = p_inbox_id
    and status = 'sent'
    and sent_at >= p_today_start;

  return v_sent_today < v_limit;
end;
$$;

-- Function to check if domain has daily quota remaining
create or replace function public.has_domain_quota_remaining(
  p_domain text,
  p_today_start timestamptz default date_trunc('day', now())
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
  v_sent_today int;
begin
  -- Get daily limit
  v_limit := public.get_domain_daily_limit(p_domain);

  -- Count sent today (all inboxes on domain)
  select count(*) into v_sent_today
  from public.send_logs sl
  join public.sender_inboxes si on si.id = sl.sender_inbox_id
  join public.sender_domains sd on sd.id = si.domain_id
  where sd.domain = p_domain
    and sl.status = 'sent'
    and sl.sent_at >= p_today_start;

  return v_sent_today < v_limit;
end;
$$;

-- ============================================
-- 5) Smart Inbox Pooling — Load Balancing
-- ============================================

-- Function to pick best inbox for rotation (enhanced with health scores)
create or replace function public.pick_best_inbox_for_send(
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
  v_best_score numeric := -999999;
  v_score numeric;
  v_inbox record;
begin
  -- Find best inbox based on:
  -- - Health score (higher is better)
  -- - Daily quota remaining (more is better)
  -- - Current usage (less is better)
  for v_inbox in
    select 
      si.id,
      si.email,
      coalesce(ih.health_score, 50) as health_score,
      public.get_inbox_daily_limit(si.id) as daily_limit,
      count(*) filter (where sl.sent_at >= p_today_start and sl.status = 'sent') as sent_today
    from public.sender_inboxes si
    left join public.inbox_health ih on ih.inbox_id = si.id
    left join public.send_logs sl on sl.sender_inbox_id = si.id
    where si.domain_id = p_domain_id
      and si.connected = true
      and (ih.is_paused is null or ih.is_paused = false)
      and (ih.health_score is null or ih.health_score >= 40)
    group by si.id, si.email, ih.health_score
    having count(*) filter (where sl.sent_at >= p_today_start and sl.status = 'sent') < public.get_inbox_daily_limit(si.id)
  loop
    -- Calculate score: health_score * 10 + (quota_remaining / daily_limit) * 100
    v_score := (v_inbox.health_score::numeric * 10) + 
               ((v_inbox.daily_limit - v_inbox.sent_today)::numeric / greatest(v_inbox.daily_limit, 1) * 100);

    if v_score > v_best_score then
      v_best_score := v_score;
      v_inbox_id := v_inbox.id;
    end if;
  end loop;

  return v_inbox_id;
end;
$$;

-- ============================================
-- 6) Trigger to Update Health on Send Events
-- ============================================

-- Function to update health when send_logs changes
create or replace function public.update_health_on_send_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inbox_id uuid;
  v_domain text;
begin
  -- Get inbox_id and domain from send_logs
  if TG_OP = 'INSERT' or TG_OP = 'UPDATE' then
    v_inbox_id := NEW.sender_inbox_id;
    
    if v_inbox_id is not null then
      -- Update inbox health
      perform public.update_inbox_health(v_inbox_id);
      
      -- Get domain
      select sd.domain into v_domain
      from public.sender_inboxes si
      join public.sender_domains sd on sd.id = si.domain_id
      where si.id = v_inbox_id;
      
      if v_domain is not null then
        -- Update domain health
        perform public.update_domain_health(v_domain);
        
        -- Check auto-pause
        perform public.check_auto_pause_domain(v_domain);
      end if;
      
      -- Check auto-pause for inbox
      perform public.check_auto_pause_inbox(v_inbox_id);
    end if;
  end if;

  return NEW;
end;
$$;

-- Create trigger on send_logs
drop trigger if exists trg_update_health_on_send on public.send_logs;
create trigger trg_update_health_on_send
  after insert or update on public.send_logs
  for each row
  when (NEW.status = 'sent')
  execute function public.update_health_on_send_event();

-- Trigger on email_bounces
create or replace function public.update_health_on_bounce()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inbox_id uuid;
  v_domain text;
begin
  -- Get inbox_id from send_logs
  select sender_inbox_id into v_inbox_id
  from public.send_logs
  where id = NEW.send_id;
  
  if v_inbox_id is not null then
    perform public.update_inbox_health(v_inbox_id);
    
    -- Get domain
    select sd.domain into v_domain
    from public.sender_inboxes si
    join public.sender_domains sd on sd.id = si.domain_id
    where si.id = v_inbox_id;
    
    if v_domain is not null then
      perform public.update_domain_health(v_domain);
      perform public.check_auto_pause_domain(v_domain);
    end if;
    
    perform public.check_auto_pause_inbox(v_inbox_id);
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_update_health_on_bounce on public.email_bounces;
create trigger trg_update_health_on_bounce
  after insert on public.email_bounces
  for each row
  execute function public.update_health_on_bounce();

-- ============================================
-- 7) Grant Permissions
-- ============================================

grant select on public.inbox_health to authenticated;
grant select on public.domain_health to authenticated;
grant execute on function public.can_inbox_send(uuid) to authenticated;
grant execute on function public.get_inbox_daily_limit(uuid) to authenticated;
grant execute on function public.get_domain_daily_limit(text) to authenticated;
grant execute on function public.has_inbox_quota_remaining(uuid, timestamptz) to authenticated;
grant execute on function public.has_domain_quota_remaining(text, timestamptz) to authenticated;
grant execute on function public.pick_best_inbox_for_send(uuid, timestamptz) to authenticated;



