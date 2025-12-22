-- Block 464 — Smart Resend Engine v1
-- Bounce Recovery • Soft-Bounce Retry Logic • Failover Inbox Sending • Auto-Diagnostics
-- This block implements intelligent retry and failover logic for high-volume, high-deliverability outbound systems.

-- ============================================
-- 1) Add New Columns to send_queue
-- ============================================

alter table public.send_queue
  add column if not exists retry_count int default 0,
  add column if not exists failover_used boolean default false,
  add column if not exists original_mailbox_id uuid,
  add column if not exists failover_mailbox_id uuid,
  add column if not exists error_category text, -- 'soft_bounce', 'greylisting', 'temp_smtp', 'rate_limit', 'inbox_quota', 'dns', 'permanent'
  add column if not exists retry_strategy text; -- 'immediate', 'delayed', 'backoff', 'failover'

-- Indexes for retry and failover queries
create index if not exists idx_send_queue_retry on public.send_queue(status, retry_count, next_attempt_at) 
  where status in ('queued', 'retry_scheduled', 'failed') and retry_count > 0;
create index if not exists idx_send_queue_failover on public.send_queue(failover_used, original_mailbox_id) 
  where failover_used = true;
create index if not exists idx_send_queue_error_category on public.send_queue(error_category, status) 
  where error_category is not null;

-- ============================================
-- 2) Retry Strategy Configuration Table
-- ============================================

create table if not exists public.retry_strategies (
  error_category text primary key,
  retry_delay_minutes int not null,
  max_attempts int not null,
  backoff_multiplier numeric default 1.5,
  description text,
  created_at timestamptz default now()
);

-- Insert default retry strategies
insert into public.retry_strategies (error_category, retry_delay_minutes, max_attempts, backoff_multiplier, description)
values
  ('soft_bounce', 15, 3, 1.5, 'Soft bounce - retry in 15 minutes, max 3 attempts'),
  ('greylisting', 5, 4, 1.2, 'Greylisting - retry in 5 minutes, max 4 attempts'),
  ('temp_smtp', 10, 5, 1.5, 'Temporary SMTP failure - retry in 10 minutes, max 5 attempts'),
  ('rate_limit', 30, 2, 2.0, 'Rate limit - retry in 30 minutes, max 2 attempts'),
  ('inbox_quota', 60, 3, 1.5, 'Inbox quota exceeded - retry in 60 minutes, max 3 attempts'),
  ('dns', 20, 2, 1.5, 'DNS issue - retry in 20 minutes, max 2 attempts'),
  ('provider_5xx', 10, 5, 1.5, 'Provider 5xx error - retry in 10 minutes, max 5 attempts')
on conflict (error_category) do nothing;

-- ============================================
-- 3) Failover Log Table
-- ============================================

create table if not exists public.failover_logs (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references public.send_queue(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  original_mailbox_id uuid not null,
  failover_mailbox_id uuid not null,
  failover_reason text not null,
  retry_count_at_failover int not null,
  created_at timestamptz default now()
);

create index if not exists idx_failover_logs_queue on public.failover_logs(queue_id);
create index if not exists idx_failover_logs_workspace on public.failover_logs(workspace_id);
create index if not exists idx_failover_logs_original_mailbox on public.failover_logs(original_mailbox_id);
create index if not exists idx_failover_logs_created on public.failover_logs(created_at desc);

-- ============================================
-- 4) Function: Classify Error Type
-- ============================================

create or replace function public.classify_error_type(
  p_error_text text
)
returns text
language plpgsql
immutable
as $$
declare
  v_error_lower text;
begin
  v_error_lower := lower(coalesce(p_error_text, ''));
  
  -- Soft bounce patterns
  if v_error_lower ~* '(mailbox.*full|quota.*exceeded|temporarily.*unavailable|try.*later|greylist|greylisting|temporary.*failure)' then
    return 'soft_bounce';
  end if;
  
  -- Greylisting patterns
  if v_error_lower ~* '(greylist|greylisting|try.*again.*later|temporarily.*rejected)' then
    return 'greylisting';
  end if;
  
  -- Rate limit patterns
  if v_error_lower ~* '(rate.*limit|throttl|429|too.*many.*requests|quota.*exceeded)' then
    return 'rate_limit';
  end if;
  
  -- Inbox quota patterns
  if v_error_lower ~* '(mailbox.*full|quota.*exceeded|storage.*full|inbox.*full)' then
    return 'inbox_quota';
  end if;
  
  -- DNS patterns
  if v_error_lower ~* '(dns|name.*resolution|host.*not.*found|nxdomain|timeout.*dns)' then
    return 'dns';
  end if;
  
  -- Temporary SMTP patterns
  if v_error_lower ~* '(temporary|temp.*fail|4\d{2}|try.*again|server.*busy|connection.*timeout)' then
    return 'temp_smtp';
  end if;
  
  -- Provider 5xx errors
  if v_error_lower ~* '(provider_5xx|5\d{2}|server.*error|internal.*error)' then
    return 'provider_5xx';
  end if;
  
  -- Permanent errors (hard bounces)
  if v_error_lower ~* '(invalid.*recipient|user.*unknown|mailbox.*not.*found|550|554|permanent|hard.*bounce|blocked|bounced)' then
    return 'permanent';
  end if;
  
  -- Default to temporary SMTP failure
  return 'temp_smtp';
end;
$$;

-- ============================================
-- 5) Function: Get Retry Delay
-- ============================================

create or replace function public.get_retry_delay(
  p_error_category text,
  p_retry_count int,
  p_strategy jsonb default null
)
returns int
language plpgsql
stable
as $$
declare
  v_strategy record;
  v_delay_minutes int;
begin
  -- Get strategy from table or use provided strategy
  if p_strategy is not null then
    v_delay_minutes := (p_strategy->>'retry_delay_minutes')::int;
  else
    select * into v_strategy
    from public.retry_strategies
    where error_category = p_error_category;
    
    if not found then
      -- Default strategy
      v_delay_minutes := 15;
    else
      v_delay_minutes := v_strategy.retry_delay_minutes;
    end if;
  end if;
  
  -- Apply exponential backoff
  if p_retry_count > 1 then
    v_delay_minutes := round(v_delay_minutes * power(1.5, p_retry_count - 1))::int;
  end if;
  
  return v_delay_minutes;
end;
$$;

-- ============================================
-- 6) Function: Find Failover Inbox (with Router v2 integration)
-- ============================================

create or replace function public.find_failover_inbox(
  p_workspace_id uuid,
  p_original_mailbox_id uuid,
  p_lead_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original_mailbox record;
  v_original_domain text;
  v_best_inbox_id uuid;
  v_lead record;
  v_priority text;
  v_is_high_value boolean := false;
  v_predicted_bounce_risk numeric;
begin
  -- Get original mailbox info
  -- Try to get from mailboxes table first
  select m.*, split_part(m.email, '@', 2) as sender_domain
  into v_original_mailbox
  from public.mailboxes m
  where m.id = p_original_mailbox_id;
  
  -- If not found, try sender_inboxes table
  if not found then
    select si.*, d.domain as sender_domain
    into v_original_mailbox
    from public.sender_inboxes si
    left join public.sender_domains d on d.id = si.domain_id
    where si.id = p_original_mailbox_id::text;
  end if;
  
  if not found then
    return null;
  end if;
  
  -- Extract domain from original mailbox email
  v_original_domain := split_part(v_original_mailbox.email, '@', 2);
  
  -- Get lead priority for routing (Router v2 integration)
  select l.priority, l.icp_score
  into v_lead
  from public.leads l
  where l.id = p_lead_id;
  
  v_priority := coalesce(v_lead.priority, 'C');
  
  -- Determine if this is a high-value lead (A-tier or high ICP score)
  v_is_high_value := (v_priority = 'A' or coalesce(v_lead.icp_score, 0) >= 80);
  
  -- Find best failover inbox using priority logic:
  -- For high-value leads: prioritize safest inboxes (highest health, lowest bounce risk)
  -- For regular leads: balance health and availability
  
  -- Try same domain first
  -- Support both mailboxes and sender_inboxes tables
  select coalesce(m.id, si.id::uuid) into v_best_inbox_id
  from public.mailboxes m
  full outer join public.sender_inboxes si on si.id = m.id::text
  left join public.sender_domains d on d.id = si.domain_id
  left join public.inbox_inspector_reports iir on iir.inbox_id = coalesce(si.id, m.id::text)
  left join public.mailbox_daily_stats mds on mds.mailbox_id = coalesce(m.id, si.id::uuid) and mds.day = current_date
  left join lateral (
    select predicted_value
    from public.predictions p
    where p.inbox_id = si.id
      and p.metric = 'bounce_risk'
    order by p.created_at desc
    limit 1
  ) pred on true
  where m.workspace_id = p_workspace_id
    and m.id != p_original_mailbox_id
    and m.enabled = true
    and (
      d.domain = v_original_domain
      or split_part(m.email, '@', 2) = v_original_domain
    )
    and (
      -- Check daily cap not exceeded
      coalesce(m.send_quota_used, 0) < coalesce(m.send_quota_per_day, 200)
    )
    and (
      -- Check warmup threshold (if warmup enabled)
      not exists (
        select 1 from public.inbox_warmup_status iws
        where iws.inbox_id = si.id and iws.is_paused = true
      )
    )
    and (
      -- For high-value leads, only use inboxes with low predicted bounce risk
      not v_is_high_value or coalesce(pred.predicted_value, 0) < 5
    )
  order by
    -- For high-value leads: prioritize lowest bounce risk, then highest health
    case when v_is_high_value then coalesce(pred.predicted_value, 100) else 0 end asc,
    coalesce(iir.health_score, 50) desc, -- Higher health score first
    coalesce(mds.delivered, 0)::numeric / nullif(coalesce(mds.sent, 1), 0) desc, -- Higher delivery rate
    m.send_quota_used asc -- Lower usage first
  limit 1;
  
  -- If no same-domain inbox found, try different domain
  if v_best_inbox_id is null then
    select coalesce(m.id, si.id::uuid) into v_best_inbox_id
    from public.mailboxes m
    full outer join public.sender_inboxes si on si.id = m.id::text
    left join public.inbox_inspector_reports iir on iir.inbox_id = coalesce(si.id, m.id::text)
    left join public.mailbox_daily_stats mds on mds.mailbox_id = coalesce(m.id, si.id::uuid) and mds.day = current_date
    left join lateral (
      select predicted_value
      from public.predictions p
      where p.inbox_id = si.id
        and p.metric = 'bounce_risk'
      order by p.created_at desc
      limit 1
    ) pred on true
    where m.workspace_id = p_workspace_id
      and m.id != p_original_mailbox_id
      and m.enabled = true
      and (
        coalesce(m.send_quota_used, 0) < coalesce(m.send_quota_per_day, 200)
      )
      and (
        not exists (
          select 1 from public.inbox_warmup_status iws
          where iws.inbox_id = si.id and iws.is_paused = true
        )
      )
      and (
        -- For high-value leads, only use inboxes with low predicted bounce risk
        not v_is_high_value or coalesce(pred.predicted_value, 0) < 5
      )
    order by
      -- For high-value leads: prioritize lowest bounce risk, then highest health
      case when v_is_high_value then coalesce(pred.predicted_value, 100) else 0 end asc,
      coalesce(iir.health_score, 50) desc,
      coalesce(mds.delivered, 0)::numeric / nullif(coalesce(mds.sent, 1), 0) desc,
      m.send_quota_used asc
    limit 1;
  end if;
  
  return v_best_inbox_id;
end;
$$;

-- ============================================
-- 7) Function: Schedule Retry
-- ============================================

create or replace function public.schedule_retry(
  p_queue_id uuid,
  p_error_text text,
  p_retry_count int
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_error_category text;
  v_strategy record;
  v_delay_minutes int;
  v_next_attempt_at timestamptz;
  v_max_attempts int;
begin
  -- Classify error
  v_error_category := public.classify_error_type(p_error_text);
  
  -- Get strategy
  select * into v_strategy
  from public.retry_strategies
  where error_category = v_error_category;
  
  if not found then
    -- Default strategy
    v_delay_minutes := 15;
    v_max_attempts := 3;
  else
    v_delay_minutes := v_strategy.retry_delay_minutes;
    v_max_attempts := v_strategy.max_attempts;
    
    -- Apply exponential backoff
    if p_retry_count > 1 then
      v_delay_minutes := round(v_delay_minutes * power(coalesce(v_strategy.backoff_multiplier, 1.5), p_retry_count - 1))::int;
    end if;
  end if;
  
  -- Calculate next attempt time
  v_next_attempt_at := now() + (v_delay_minutes || ' minutes')::interval;
  
  -- Update send_queue
  update public.send_queue
  set
    retry_count = p_retry_count,
    last_error = p_error_text,
    error_category = v_error_category,
    next_attempt_at = v_next_attempt_at,
    status = case
      when p_retry_count >= v_max_attempts then 'failed'
      else 'retry_scheduled'
    end
  where id = p_queue_id;
  
  return v_next_attempt_at;
end;
$$;

-- ============================================
-- 8) Function: Trigger Failover
-- ============================================

create or replace function public.trigger_failover(
  p_queue_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue record;
  v_workspace_id uuid;
  v_failover_mailbox_id uuid;
begin
  -- Get queue item
  select sq.*, l.workspace_id
  into v_queue
  from public.send_queue sq
  join public.leads l on l.id = sq.lead_id
  where sq.id = p_queue_id;
  
  if not found then
    return null;
  end if;
  
  v_workspace_id := v_queue.workspace_id;
  
  -- Store original mailbox if not already stored
  if v_queue.original_mailbox_id is null then
    update public.send_queue
    set original_mailbox_id = v_queue.mailbox_id
    where id = p_queue_id;
  end if;
  
  -- Find failover inbox
  v_failover_mailbox_id := public.find_failover_inbox(
    v_workspace_id,
    coalesce(v_queue.original_mailbox_id, v_queue.mailbox_id),
    v_queue.lead_id
  );
  
  if v_failover_mailbox_id is null then
    -- No failover available - mark as failed
    update public.send_queue
    set status = 'failed',
        last_error = coalesce(last_error, '') || ' | No failover inbox available'
    where id = p_queue_id;
    return null;
  end if;
  
  -- Update queue with failover mailbox
  update public.send_queue
  set
    mailbox_id = v_failover_mailbox_id,
    failover_mailbox_id = v_failover_mailbox_id,
    failover_used = true,
    status = 'queued',
    next_attempt_at = now(),
    retry_count = 0 -- Reset retry count for failover attempt
  where id = p_queue_id;
  
  -- Log failover
  insert into public.failover_logs (
    queue_id,
    workspace_id,
    original_mailbox_id,
    failover_mailbox_id,
    failover_reason,
    retry_count_at_failover
  )
  values (
    p_queue_id,
    v_workspace_id,
    coalesce(v_queue.original_mailbox_id, v_queue.mailbox_id),
    v_failover_mailbox_id,
    format('Max retries reached (%s attempts)', v_queue.retry_count),
    v_queue.retry_count
  );
  
  return v_failover_mailbox_id;
end;
$$;

-- ============================================
-- 9) Activity Log Integration
-- ============================================

-- Function to log retry events
create or replace function public.log_retry_event(
  p_queue_id uuid,
  p_event_type text,
  p_message text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  -- Get workspace_id from queue
  select l.workspace_id into v_workspace_id
  from public.send_queue sq
  join public.leads l on l.id = sq.lead_id
  where sq.id = p_queue_id;
  
  if v_workspace_id is not null then
    -- Insert into workspace_activity if table exists
    insert into public.workspace_activity (
      workspace_id,
      event_type,
      description,
      metadata
    )
    values (
      v_workspace_id,
      p_event_type,
      p_message,
      p_metadata
    )
    on conflict do nothing; -- Ignore if table doesn't exist or conflict
  end if;
end;
$$;

-- ============================================
-- 10) Fleet Manager Integration Functions
-- ============================================

-- Function to update inbox health after retries
create or replace function public.update_inbox_health_after_retries(
  p_mailbox_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_retry_count int;
  v_failover_count int;
begin
  -- Count retries in last 24 hours
  select count(*) into v_retry_count
  from public.send_queue
  where mailbox_id = p_mailbox_id
    and retry_count > 0
    and created_at > now() - interval '24 hours';
  
  -- Count failovers triggered in last 6 hours
  select count(*) into v_failover_count
  from public.failover_logs
  where original_mailbox_id = p_mailbox_id
    and created_at > now() - interval '6 hours';
  
  -- If too many retries, reduce daily cap by 40%
  if v_retry_count > 10 or v_failover_count >= 3 then
    update public.mailboxes
    set send_quota_per_day = greatest(
      round(coalesce(send_quota_per_day, 200) * 0.6)::int,
      10 -- Minimum 10 per day
    )
    where id = p_mailbox_id;
  end if;
end;
$$;

-- ============================================
-- 11) Views for Reporting
-- ============================================

-- View: Retry Statistics
create or replace view public.v_retry_stats as
select
  sq.mailbox_id,
  sq.error_category,
  count(*) as total_retries,
  count(*) filter (where sq.status = 'sent') as successful_retries,
  count(*) filter (where sq.failover_used = true) as failovers_triggered,
  avg(sq.retry_count) as avg_retry_count,
  max(sq.retry_count) as max_retry_count
from public.send_queue sq
where sq.retry_count > 0
  and sq.created_at > now() - interval '7 days'
group by sq.mailbox_id, sq.error_category;

-- View: Failover Statistics
create or replace view public.v_failover_stats as
select
  fl.workspace_id,
  fl.original_mailbox_id,
  count(*) as total_failovers,
  count(distinct fl.queue_id) as unique_queue_items,
  avg(fl.retry_count_at_failover) as avg_retries_before_failover,
  min(fl.created_at) as first_failover_at,
  max(fl.created_at) as last_failover_at
from public.failover_logs fl
where fl.created_at > now() - interval '30 days'
group by fl.workspace_id, fl.original_mailbox_id;

-- ============================================
-- 12) Indexes for Performance
-- ============================================

create index if not exists idx_send_queue_next_attempt_retry 
  on public.send_queue(next_attempt_at) 
  where status = 'retry_scheduled' and next_attempt_at is not null;

create index if not exists idx_send_queue_mailbox_status_retry 
  on public.send_queue(mailbox_id, status, retry_count) 
  where retry_count > 0;

-- Grant permissions
grant select on public.v_retry_stats to authenticated;
grant select on public.v_failover_stats to authenticated;

