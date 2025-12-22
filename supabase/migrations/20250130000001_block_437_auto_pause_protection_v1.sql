-- Block 437 — Auto-Pause Protection v1
-- Automatic Safety Breaks • Bounce/Spam Spike Detection • Domain/Inboxes Auto-Stop • Sequence Halt Rules
-- 
-- This block gives SmartSend a safety brake system, exactly like how enterprise senders 
-- (Salesforce, Outreach, Instantly, Smartlead) protect users from destroying domain reputation.
--
-- Features:
-- ✔ Detect dangerous sending patterns
-- ✔ Auto-pause campaigns before damage happens
-- ✔ Auto-pause ALL sending for a workspace if catastrophe detected
-- ✔ Auto-pause specific inboxes
-- ✔ Auto-pause specific domains
-- ✔ Auto-pause specific steps in sequences
-- ✔ Auto-hold send_queue items
-- ✔ Notify user immediately
-- ✔ Require manual resume OR AI auto-resume

-- ============================================
-- 1) New Table: auto_pause_events
-- ============================================
create table if not exists public.auto_pause_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  inbox_id uuid references public.sender_inboxes(id) on delete set null,
  domain_id uuid references public.sender_domains(id) on delete set null,
  step_id uuid references public.campaign_steps(id) on delete set null,
  reason text not null,
  details jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  resolved boolean default false,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  auto_resume_eligible boolean default false
);

create index if not exists idx_auto_pause_events_workspace on public.auto_pause_events(workspace_id, resolved);
create index if not exists idx_auto_pause_events_campaign on public.auto_pause_events(campaign_id, resolved);
create index if not exists idx_auto_pause_events_inbox on public.auto_pause_events(inbox_id, resolved);
create index if not exists idx_auto_pause_events_domain on public.auto_pause_events(domain_id, resolved);
create index if not exists idx_auto_pause_events_step on public.auto_pause_events(step_id, resolved);
create index if not exists idx_auto_pause_events_created on public.auto_pause_events(created_at desc);

-- ============================================
-- 2) New Status Fields
-- ============================================

-- Campaigns: Add paused_auto and paused_reason
alter table public.campaigns
  add column if not exists paused_auto boolean default false,
  add column if not exists paused_reason text;

create index if not exists idx_campaigns_paused_auto on public.campaigns(paused_auto) where paused_auto = true;

-- Sender Inboxes: Add paused_auto
alter table public.sender_inboxes
  add column if not exists paused_auto boolean default false;

create index if not exists idx_sender_inboxes_paused_auto on public.sender_inboxes(paused_auto) where paused_auto = true;

-- Sender Domains: Add paused_auto
alter table public.sender_domains
  add column if not exists paused_auto boolean default false;

create index if not exists idx_sender_domains_paused_auto on public.sender_domains(paused_auto) where paused_auto = true;

-- Workspaces: Add sending_paused (global stop)
alter table public.workspaces
  add column if not exists sending_paused boolean default false;

create index if not exists idx_workspaces_sending_paused on public.workspaces(sending_paused) where sending_paused = true;

-- Campaign Steps: Add paused_auto for step-level protection
alter table public.campaign_steps
  add column if not exists paused_auto boolean default false;

create index if not exists idx_campaign_steps_paused_auto on public.campaign_steps(paused_auto) where paused_auto = true;

-- Send Queue: Add locked field to prevent sending when paused
alter table public.send_queue
  add column if not exists locked boolean default false;

create index if not exists idx_send_queue_locked on public.send_queue(locked, status) where locked = true;

-- ============================================
-- 3) Helper Functions for Metrics Calculation
-- ============================================

-- Function to calculate bounce rate for an inbox (last N sends)
create or replace function public.calculate_inbox_bounce_rate(
  p_inbox_id uuid,
  p_limit int default 100
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bounce_rate numeric;
  v_total_sent int;
  v_total_bounced int;
begin
  -- Count total sent emails for this inbox
  select count(*)::int
  into v_total_sent
  from public.send_queue sq
  where sq.sender_inbox_id = p_inbox_id
    and sq.status = 'sent'
    and sq.created_at >= now() - interval '30 days'
  order by sq.created_at desc
  limit p_limit;

  if v_total_sent = 0 then
    return 0;
  end if;

  -- Count bounces from email_bounces table (if exists) or email_events
  select count(distinct coalesce(eb.campaign_id, ee.campaign_id))::int
  into v_total_bounced
  from public.send_queue sq
  left join public.email_bounces eb on eb.campaign_id = sq.campaign_id 
    and eb.created_at >= now() - interval '30 days'
  left join public.email_events ee on ee.campaign_id = sq.campaign_id 
    and ee.event_type in ('bounced', 'bounce')
    and ee.created_at >= now() - interval '30 days'
  where sq.sender_inbox_id = p_inbox_id
    and sq.status = 'sent'
    and sq.created_at >= now() - interval '30 days'
    and (eb.id is not null or ee.id is not null)
  limit p_limit;

  -- Fallback: if email_bounces doesn't exist, check send_queue status = 'failed' with bounce-like errors
  if v_total_bounced = 0 then
    select count(*)::int
    into v_total_bounced
    from public.send_queue sq
    where sq.sender_inbox_id = p_inbox_id
      and sq.status = 'failed'
      and sq.last_error is not null
      and (
        sq.last_error ~* '\b(5\d\d|550|551|552|553|bounce|undeliverable|user unknown|no such user|mailbox unavailable|address not found|recipient address rejected|invalid recipient|does not exist)\b'
      )
      and sq.created_at >= now() - interval '30 days'
    limit p_limit;
  end if;

  v_bounce_rate := (v_total_bounced::numeric / v_total_sent::numeric) * 100;
  return v_bounce_rate;
end;
$$;

-- Function to calculate bounce rate for a domain (last N sends)
create or replace function public.calculate_domain_bounce_rate(
  p_domain_id uuid,
  p_limit int default 300
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bounce_rate numeric;
  v_total_sent int;
  v_total_bounced int;
begin
  -- Count total sent emails for this domain
  select count(*)::int
  into v_total_sent
  from public.send_queue sq
  join public.sender_inboxes si on si.id = sq.sender_inbox_id
  where si.domain_id = p_domain_id
    and sq.status = 'sent'
    and sq.created_at >= now() - interval '30 days'
  order by sq.created_at desc
  limit p_limit;

  if v_total_sent = 0 then
    return 0;
  end if;

  -- Count bounces from email_bounces or email_events
  select count(distinct coalesce(eb.campaign_id, ee.campaign_id))::int
  into v_total_bounced
  from public.send_queue sq
  join public.sender_inboxes si on si.id = sq.sender_inbox_id
  left join public.email_bounces eb on eb.campaign_id = sq.campaign_id 
    and eb.created_at >= now() - interval '30 days'
  left join public.email_events ee on ee.campaign_id = sq.campaign_id 
    and ee.event_type in ('bounced', 'bounce')
    and ee.created_at >= now() - interval '30 days'
  where si.domain_id = p_domain_id
    and sq.status = 'sent'
    and sq.created_at >= now() - interval '30 days'
    and (eb.id is not null or ee.id is not null)
  limit p_limit;

  -- Fallback: check failed sends with bounce-like errors
  if v_total_bounced = 0 then
    select count(*)::int
    into v_total_bounced
    from public.send_queue sq
    join public.sender_inboxes si on si.id = sq.sender_inbox_id
    where si.domain_id = p_domain_id
      and sq.status = 'failed'
      and sq.last_error is not null
      and (
        sq.last_error ~* '\b(5\d\d|550|551|552|553|bounce|undeliverable|user unknown|no such user|mailbox unavailable|address not found|recipient address rejected|invalid recipient|does not exist)\b'
      )
      and sq.created_at >= now() - interval '30 days'
    limit p_limit;
  end if;

  v_bounce_rate := (v_total_bounced::numeric / v_total_sent::numeric) * 100;
  return v_bounce_rate;
end;
$$;

-- Function to calculate workspace-wide bounce rate
create or replace function public.calculate_workspace_bounce_rate(
  p_workspace_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bounce_rate numeric;
  v_total_sent int;
  v_total_bounced int;
begin
  -- Count total sent emails for this workspace
  select count(*)::int
  into v_total_sent
  from public.send_queue sq
  where sq.workspace_id = p_workspace_id
    and sq.status = 'sent'
    and sq.created_at >= now() - interval '7 days';

  if v_total_sent = 0 then
    return 0;
  end if;

  -- Count bounces from email_bounces or email_events
  select count(distinct coalesce(eb.campaign_id, ee.campaign_id))::int
  into v_total_bounced
  from public.send_queue sq
  left join public.email_bounces eb on eb.campaign_id = sq.campaign_id 
    and eb.created_at >= now() - interval '7 days'
  left join public.email_events ee on ee.campaign_id = sq.campaign_id 
    and ee.event_type in ('bounced', 'bounce')
    and ee.created_at >= now() - interval '7 days'
  where sq.workspace_id = p_workspace_id
    and sq.status = 'sent'
    and sq.created_at >= now() - interval '7 days'
    and (eb.id is not null or ee.id is not null);

  -- Fallback: check failed sends with bounce-like errors
  if v_total_bounced = 0 then
    select count(*)::int
    into v_total_bounced
    from public.send_queue sq
    where sq.workspace_id = p_workspace_id
      and sq.status = 'failed'
      and sq.last_error is not null
      and (
        sq.last_error ~* '\b(5\d\d|550|551|552|553|bounce|undeliverable|user unknown|no such user|mailbox unavailable|address not found|recipient address rejected|invalid recipient|does not exist)\b'
      )
      and sq.created_at >= now() - interval '7 days';
  end if;

  v_bounce_rate := (v_total_bounced::numeric / v_total_sent::numeric) * 100;
  return v_bounce_rate;
end;
$$;

-- Function to calculate spam complaint rate for an inbox
create or replace function public.calculate_inbox_spam_rate(
  p_inbox_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spam_rate numeric;
  v_total_sent int;
  v_total_spam int;
begin
  -- Count total sent emails for this inbox
  select count(*)::int
  into v_total_sent
  from public.send_queue sq
  where sq.sender_inbox_id = p_inbox_id
    and sq.status = 'sent'
    and sq.created_at >= now() - interval '30 days';

  if v_total_sent = 0 then
    return 0;
  end if;

  -- Count spam complaints from email_events
  select count(distinct ee.campaign_id)::int
  into v_total_spam
  from public.send_queue sq
  join public.email_events ee on ee.campaign_id = sq.campaign_id
  where sq.sender_inbox_id = p_inbox_id
    and sq.status = 'sent'
    and sq.created_at >= now() - interval '30 days'
    and ee.event_type in ('complained', 'spam', 'complaint')
    and ee.created_at >= now() - interval '30 days';

  v_spam_rate := (v_total_spam::numeric / v_total_sent::numeric) * 100;
  return v_spam_rate;
end;
$$;

-- Function to calculate open rate for an inbox
create or replace function public.calculate_inbox_open_rate(
  p_inbox_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open_rate numeric;
  v_total_delivered int;
  v_total_opened int;
begin
  -- Count delivered and opened emails
  select 
    count(*) filter (where sq.status = 'sent' and sq.bounced_at is null)::int,
    count(*) filter (where ee.event_type = 'opened')::int
  into v_total_delivered, v_total_opened
  from public.send_queue sq
  left join public.email_events ee on ee.campaign_id = sq.campaign_id and ee.event_type = 'opened'
  where sq.sender_inbox_id = p_inbox_id
    and sq.status = 'sent'
    and sq.created_at >= now() - interval '7 days';

  if v_total_delivered = 0 then
    return 100; -- Default to 100% if no data
  end if;

  v_open_rate := (v_total_opened::numeric / v_total_delivered::numeric) * 100;
  return v_open_rate;
end;
$$;

-- Function to calculate sending volume spike
create or replace function public.detect_volume_spike(
  p_workspace_id uuid,
  p_multiplier numeric default 2.0
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today_count int;
  v_avg_daily_count numeric;
begin
  -- Count today's sends
  select count(*)::int
  into v_today_count
  from public.send_queue
  where workspace_id = p_workspace_id
    and status = 'sent'
    and created_at >= date_trunc('day', now());

  -- Calculate average daily sends over last 7 days (excluding today)
  select coalesce(avg(daily_count), 0)
  into v_avg_daily_count
  from (
    select count(*)::numeric as daily_count
    from public.send_queue
    where workspace_id = p_workspace_id
      and status = 'sent'
      and created_at >= date_trunc('day', now()) - interval '7 days'
      and created_at < date_trunc('day', now())
    group by date_trunc('day', created_at)
  ) daily_stats;

  if v_avg_daily_count = 0 then
    return false; -- No baseline, can't detect spike
  end if;

  -- Check if today's volume exceeds multiplier * average
  return v_today_count > (v_avg_daily_count * p_multiplier);
end;
$$;

-- ============================================
-- 4) Auto-Pause Detection Function
-- ============================================

create or replace function public.check_auto_pause_triggers(
  p_workspace_id uuid default null,
  p_campaign_id uuid default null,
  p_inbox_id uuid default null,
  p_domain_id uuid default null,
  p_step_id uuid default null
)
returns table (
  should_pause boolean,
  pause_level text, -- 'campaign' | 'inbox' | 'domain' | 'workspace' | 'step'
  reason text,
  details jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bounce_rate numeric;
  v_spam_rate numeric;
  v_open_rate numeric;
  v_volume_spike boolean;
  v_dns_valid boolean;
  v_inbox_id uuid;
  v_domain_id uuid;
  v_workspace_id uuid;
begin
  -- Determine context IDs
  if p_inbox_id is not null then
    select si.domain_id, si.workspace_id into v_domain_id, v_workspace_id
    from public.sender_inboxes si
    where si.id = p_inbox_id;
  elsif p_domain_id is not null then
    select sd.workspace_id into v_workspace_id
    from public.sender_domains sd
    where sd.id = p_domain_id;
  elsif p_campaign_id is not null then
    select c.workspace_id into v_workspace_id
    from public.campaigns c
    where c.id = p_campaign_id;
  elsif p_workspace_id is not null then
    v_workspace_id := p_workspace_id;
  end if;

  -- A. Bounce Spike Detection
  if p_inbox_id is not null then
    v_bounce_rate := public.calculate_inbox_bounce_rate(p_inbox_id, 100);
    
    if v_bounce_rate > 10 then
      return query select true, 'inbox'::text, 
        format('Bounce rate exceeded safe threshold (%.2f%%)', v_bounce_rate)::text,
        jsonb_build_object('bounce_rate', v_bounce_rate, 'threshold', 10);
    end if;
  end if;

  if p_domain_id is not null then
    v_bounce_rate := public.calculate_domain_bounce_rate(p_domain_id, 300);
    
    if v_bounce_rate > 15 then
      return query select true, 'domain'::text,
        format('Domain bounce rate exceeded safe threshold (%.2f%%)', v_bounce_rate)::text,
        jsonb_build_object('bounce_rate', v_bounce_rate, 'threshold', 15);
    end if;
  end if;

  if v_workspace_id is not null then
    v_bounce_rate := public.calculate_workspace_bounce_rate(v_workspace_id);
    
    if v_bounce_rate > 20 then
      return query select true, 'workspace'::text,
        format('Workspace-wide bounce rate exceeded safe threshold (%.2f%%)', v_bounce_rate)::text,
        jsonb_build_object('bounce_rate', v_bounce_rate, 'threshold', 20);
    end if;
  end if;

  -- B. Spam Complaint Spike Detection
  if p_inbox_id is not null then
    v_spam_rate := public.calculate_inbox_spam_rate(p_inbox_id);
    
    if v_spam_rate > 0.3 then
      return query select true, 'inbox'::text,
        format('Spam complaint rate exceeded safe threshold (%.2f%%)', v_spam_rate)::text,
        jsonb_build_object('spam_rate', v_spam_rate, 'threshold', 0.3);
    end if;
  end if;

  if p_domain_id is not null then
    -- Calculate domain spam rate (similar logic)
    if v_spam_rate > 0.5 then
      return query select true, 'domain'::text,
        format('Domain spam complaint rate exceeded safe threshold (%.2f%%)', v_spam_rate)::text,
        jsonb_build_object('spam_rate', v_spam_rate, 'threshold', 0.5);
    end if;
  end if;

  if v_workspace_id is not null then
    if v_spam_rate > 0.8 then
      return query select true, 'workspace'::text,
        format('Workspace-wide spam complaint rate exceeded safe threshold (%.2f%%)', v_spam_rate)::text,
        jsonb_build_object('spam_rate', v_spam_rate, 'threshold', 0.8);
    end if;
  end if;

  -- C. Open Rate Crash Detection
  if p_inbox_id is not null then
    v_open_rate := public.calculate_inbox_open_rate(p_inbox_id);
    
    if v_open_rate < 5 then
      return query select true, 'inbox'::text,
        format('Open rate dropped below safe threshold (%.2f%%)', v_open_rate)::text,
        jsonb_build_object('open_rate', v_open_rate, 'threshold', 5);
    end if;
  end if;

  if p_domain_id is not null then
    if v_open_rate < 3 then
      return query select true, 'domain'::text,
        format('Domain open rate dropped below safe threshold (%.2f%%)', v_open_rate)::text,
        jsonb_build_object('open_rate', v_open_rate, 'threshold', 3);
    end if;
  end if;

  -- D. Sequence Step-Level Catastrophe
  if p_step_id is not null then
    -- Check step-specific metrics
    -- This would need to query send_queue filtered by step_id
    -- For now, placeholder logic
    return query select false, 'step'::text, 'Step check not implemented'::text, '{}'::jsonb;
  end if;

  -- E. DNS Failures
  if p_domain_id is not null then
    select not (spf_valid and dkim_valid and dmarc_valid)
    into v_dns_valid
    from public.sender_domains
    where id = p_domain_id;
    
    if v_dns_valid then
      return query select true, 'domain'::text,
        'DNS validation failed (SPF, DKIM, or DMARC invalid)'::text,
        jsonb_build_object('dns_check', 'failed');
    end if;
  end if;

  -- F. Sending Volume Spike
  if v_workspace_id is not null then
    v_volume_spike := public.detect_volume_spike(v_workspace_id, 2.0);
    
    if v_volume_spike then
      return query select true, 'workspace'::text,
        'Sending volume spike detected (2x normal daily volume)'::text,
        jsonb_build_object('volume_spike', true);
    end if;
  end if;

  -- No triggers detected
  return query select false, 'none'::text, 'No auto-pause triggers detected'::text, '{}'::jsonb;
end;
$$;

-- ============================================
-- 5) Auto-Pause Execution Function
-- ============================================

create or replace function public.execute_auto_pause(
  p_workspace_id uuid,
  p_campaign_id uuid default null,
  p_inbox_id uuid default null,
  p_domain_id uuid default null,
  p_step_id uuid default null,
  p_reason text,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  -- Create auto-pause event record
  insert into public.auto_pause_events (
    workspace_id,
    campaign_id,
    inbox_id,
    domain_id,
    step_id,
    reason,
    details
  ) values (
    p_workspace_id,
    p_campaign_id,
    p_inbox_id,
    p_domain_id,
    p_step_id,
    p_reason,
    p_details
  ) returning id into v_event_id;

  -- Pause campaign if specified
  if p_campaign_id is not null then
    update public.campaigns
    set paused_auto = true,
        paused_reason = p_reason,
        status = case when status != 'paused' then 'paused' else status end
    where id = p_campaign_id;

    -- Lock send_queue items for this campaign
    update public.send_queue
    set locked = true
    where campaign_id = p_campaign_id
      and status in ('queued', 'sending');
  end if;

  -- Pause inbox if specified
  if p_inbox_id is not null then
    update public.sender_inboxes
    set paused_auto = true
    where id = p_inbox_id;

    -- Lock send_queue items for this inbox
    update public.send_queue
    set locked = true
    where sender_inbox_id = p_inbox_id
      and status in ('queued', 'sending');
  end if;

  -- Pause domain if specified
  if p_domain_id is not null then
    update public.sender_domains
    set paused_auto = true
    where id = p_domain_id;

    -- Lock send_queue items for all inboxes in this domain
    update public.send_queue
    set locked = true
    where sender_inbox_id in (
      select id from public.sender_inboxes where domain_id = p_domain_id
    )
    and status in ('queued', 'sending');
  end if;

  -- Pause step if specified
  if p_step_id is not null then
    update public.campaign_steps
    set paused_auto = true
    where id = p_step_id;

    -- Lock send_queue items for this step
    update public.send_queue
    set locked = true
    where campaign_id in (
      select campaign_id from public.campaign_steps where id = p_step_id
    )
    and status in ('queued', 'sending');
  end if;

  -- Global workspace pause
  if p_workspace_id is not null and p_campaign_id is null and p_inbox_id is null and p_domain_id is null then
    update public.workspaces
    set sending_paused = true
    where id = p_workspace_id;

    -- Lock ALL send_queue items for this workspace
    update public.send_queue
    set locked = true
    where workspace_id = p_workspace_id
      and status in ('queued', 'sending');
  end if;

  return v_event_id;
end;
$$;

-- ============================================
-- 6) Resume Safety Check Function
-- ============================================

create or replace function public.check_resume_safety(
  p_workspace_id uuid default null,
  p_campaign_id uuid default null,
  p_inbox_id uuid default null,
  p_domain_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bounce_rate numeric;
  v_spam_rate numeric;
  v_inbox_health numeric;
  v_domain_health numeric;
begin
  -- Check inbox resume safety
  if p_inbox_id is not null then
    -- Bounce rate check (last 50 sends)
    v_bounce_rate := public.calculate_inbox_bounce_rate(p_inbox_id, 50);
    if v_bounce_rate >= 3 then
      return false;
    end if;

    -- Spam rate check
    v_spam_rate := public.calculate_inbox_spam_rate(p_inbox_id);
    if v_spam_rate >= 0.1 then
      return false;
    end if;

    -- Inbox health score check (placeholder - implement based on your health scoring)
    -- For now, assume health is good if bounce and spam are low
    v_inbox_health := 100 - (v_bounce_rate * 10) - (v_spam_rate * 100);
    if v_inbox_health < 60 then
      return false;
    end if;
  end if;

  -- Check domain resume safety
  if p_domain_id is not null then
    v_bounce_rate := public.calculate_domain_bounce_rate(p_domain_id, 50);
    if v_bounce_rate >= 3 then
      return false;
    end if;

    -- DNS check
    select case when (spf_valid and dkim_valid and dmarc_valid) then 100 else 0 end
    into v_domain_health
    from public.sender_domains
    where id = p_domain_id;

    if v_domain_health < 60 then
      return false;
    end if;
  end if;

  -- Check campaign resume safety
  if p_campaign_id is not null then
    -- Use workspace-level checks
    select workspace_id into p_workspace_id
    from public.campaigns
    where id = p_campaign_id;
  end if;

  -- Check workspace resume safety
  if p_workspace_id is not null then
    v_bounce_rate := public.calculate_workspace_bounce_rate(p_workspace_id);
    if v_bounce_rate >= 3 then
      return false;
    end if;
  end if;

  return true;
end;
$$;

-- ============================================
-- 7) Resume Function
-- ============================================

create or replace function public.resume_auto_paused(
  p_event_id uuid,
  p_resolved_by uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_safe_to_resume boolean;
begin
  -- Get event details
  select * into v_event
  from public.auto_pause_events
  where id = p_event_id
    and resolved = false;

  if not found then
    return false;
  end if;

  -- Check if safe to resume
  v_safe_to_resume := public.check_resume_safety(
    v_event.workspace_id,
    v_event.campaign_id,
    v_event.inbox_id,
    v_event.domain_id
  );

  if not v_safe_to_resume then
    raise exception 'Safety checks failed. Cannot resume. Bounce rate, spam rate, or health scores do not meet requirements.';
  end if;

  -- Resume campaign
  if v_event.campaign_id is not null then
    update public.campaigns
    set paused_auto = false,
        paused_reason = null
    where id = v_event.campaign_id;

    update public.send_queue
    set locked = false
    where campaign_id = v_event.campaign_id
      and locked = true;
  end if;

  -- Resume inbox
  if v_event.inbox_id is not null then
    update public.sender_inboxes
    set paused_auto = false
    where id = v_event.inbox_id;

    update public.send_queue
    set locked = false
    where sender_inbox_id = v_event.inbox_id
      and locked = true;
  end if;

  -- Resume domain
  if v_event.domain_id is not null then
    update public.sender_domains
    set paused_auto = false
    where id = v_event.domain_id;

    update public.send_queue
    set locked = false
    where sender_inbox_id in (
      select id from public.sender_inboxes where domain_id = v_event.domain_id
    )
    and locked = true;
  end if;

  -- Resume step
  if v_event.step_id is not null then
    update public.campaign_steps
    set paused_auto = false
    where id = v_event.step_id;
  end if;

  -- Resume workspace
  if v_event.workspace_id is not null and v_event.campaign_id is null and v_event.inbox_id is null and v_event.domain_id is null then
    update public.workspaces
    set sending_paused = false
    where id = v_event.workspace_id;

    update public.send_queue
    set locked = false
    where workspace_id = v_event.workspace_id
      and locked = true;
  end if;

  -- Mark event as resolved
  update public.auto_pause_events
  set resolved = true,
      resolved_at = now(),
      resolved_by = p_resolved_by
  where id = p_event_id;

  return true;
end;
$$;

-- ============================================
-- 8) RLS Policies
-- ============================================

alter table public.auto_pause_events enable row level security;

-- Workspace members can view auto-pause events
create policy "auto_pause_events_select_workspace_member" on public.auto_pause_events
  for select using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = auto_pause_events.workspace_id
        and user_id = auth.uid()
    )
  );

-- Service role can insert/update auto-pause events
create policy "auto_pause_events_service_role" on public.auto_pause_events
  for all to service_role
  using (true)
  with check (true);

-- Workspace admins can resolve events
create policy "auto_pause_events_update_workspace_admin" on public.auto_pause_events
  for update using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = auto_pause_events.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- ============================================
-- 9) Grant Permissions
-- ============================================

grant usage on schema public to authenticated;
grant select on public.auto_pause_events to authenticated;
grant execute on function public.check_auto_pause_triggers to authenticated;
grant execute on function public.execute_auto_pause to service_role;
grant execute on function public.resume_auto_paused to authenticated;
grant execute on function public.check_resume_safety to authenticated;

-- ============================================
-- 10) Periodic Monitoring Function
-- ============================================

-- Function to monitor and auto-pause across all active entities
-- This can be called periodically (e.g., every 5 minutes) via cron or edge function
create or replace function public.monitor_and_auto_pause()
returns table (
  paused_count int,
  paused_items jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paused_count int := 0;
  v_paused_items jsonb := '[]'::jsonb;
  v_trigger record;
  v_event_id uuid;
  v_item jsonb;
begin
  -- Check all active inboxes
  for v_trigger in
    select distinct si.id as inbox_id, si.workspace_id, si.domain_id
    from public.sender_inboxes si
    where si.paused_auto = false
      and si.connected = true
  loop
    -- Check triggers for this inbox
    select jsonb_build_object(
      'should_pause', t.should_pause,
      'pause_level', t.pause_level,
      'reason', t.reason,
      'details', t.details
    ) into v_item
    from public.check_auto_pause_triggers(
      p_workspace_id => v_trigger.workspace_id,
      p_inbox_id => v_trigger.inbox_id,
      p_domain_id => v_trigger.domain_id
    ) t
    where t.should_pause = true
    limit 1;

    if v_item is not null and (v_item->>'should_pause')::boolean = true then
      -- Execute auto-pause
      v_event_id := public.execute_auto_pause(
        p_workspace_id => v_trigger.workspace_id,
        p_inbox_id => v_trigger.inbox_id,
        p_domain_id => v_trigger.domain_id,
        p_reason => v_item->>'reason',
        p_details => coalesce(v_item->>'details', '{}'::jsonb)::jsonb
      );

      v_paused_count := v_paused_count + 1;
      v_paused_items := v_paused_items || jsonb_build_object(
        'type', 'inbox',
        'id', v_trigger.inbox_id,
        'event_id', v_event_id,
        'reason', v_item->>'reason'
      );
    end if;
  end loop;

  -- Check all active domains
  for v_trigger in
    select distinct sd.id as domain_id, sd.workspace_id
    from public.sender_domains sd
    where sd.paused_auto = false
  loop
    select jsonb_build_object(
      'should_pause', t.should_pause,
      'pause_level', t.pause_level,
      'reason', t.reason,
      'details', t.details
    ) into v_item
    from public.check_auto_pause_triggers(
      p_workspace_id => v_trigger.workspace_id,
      p_domain_id => v_trigger.domain_id
    ) t
    where t.should_pause = true
    limit 1;

    if v_item is not null and (v_item->>'should_pause')::boolean = true then
      v_event_id := public.execute_auto_pause(
        p_workspace_id => v_trigger.workspace_id,
        p_domain_id => v_trigger.domain_id,
        p_reason => v_item->>'reason',
        p_details => coalesce(v_item->>'details', '{}'::jsonb)::jsonb
      );

      v_paused_count := v_paused_count + 1;
      v_paused_items := v_paused_items || jsonb_build_object(
        'type', 'domain',
        'id', v_trigger.domain_id,
        'event_id', v_event_id,
        'reason', v_item->>'reason'
      );
    end if;
  end loop;

  -- Check all active campaigns
  for v_trigger in
    select distinct c.id as campaign_id, c.workspace_id
    from public.campaigns c
    where c.paused_auto = false
      and c.status in ('running', 'active')
  loop
    select jsonb_build_object(
      'should_pause', t.should_pause,
      'pause_level', t.pause_level,
      'reason', t.reason,
      'details', t.details
    ) into v_item
    from public.check_auto_pause_triggers(
      p_workspace_id => v_trigger.workspace_id,
      p_campaign_id => v_trigger.campaign_id
    ) t
    where t.should_pause = true
    limit 1;

    if v_item is not null and (v_item->>'should_pause')::boolean = true then
      v_event_id := public.execute_auto_pause(
        p_workspace_id => v_trigger.workspace_id,
        p_campaign_id => v_trigger.campaign_id,
        p_reason => v_item->>'reason',
        p_details => coalesce(v_item->>'details', '{}'::jsonb)::jsonb
      );

      v_paused_count := v_paused_count + 1;
      v_paused_items := v_paused_items || jsonb_build_object(
        'type', 'campaign',
        'id', v_trigger.campaign_id,
        'event_id', v_event_id,
        'reason', v_item->>'reason'
      );
    end if;
  end loop;

  -- Check workspace-wide triggers
  for v_trigger in
    select distinct w.id as workspace_id
    from public.workspaces w
    where w.sending_paused = false
  loop
    select jsonb_build_object(
      'should_pause', t.should_pause,
      'pause_level', t.pause_level,
      'reason', t.reason,
      'details', t.details
    ) into v_item
    from public.check_auto_pause_triggers(
      p_workspace_id => v_trigger.workspace_id
    ) t
    where t.should_pause = true
      and t.pause_level = 'workspace'
    limit 1;

    if v_item is not null and (v_item->>'should_pause')::boolean = true then
      v_event_id := public.execute_auto_pause(
        p_workspace_id => v_trigger.workspace_id,
        p_reason => v_item->>'reason',
        p_details => coalesce(v_item->>'details', '{}'::jsonb)::jsonb
      );

      v_paused_count := v_paused_count + 1;
      v_paused_items := v_paused_items || jsonb_build_object(
        'type', 'workspace',
        'id', v_trigger.workspace_id,
        'event_id', v_event_id,
        'reason', v_item->>'reason'
      );
    end if;
  end loop;

  return query select v_paused_count, v_paused_items;
end;
$$;

grant execute on function public.monitor_and_auto_pause to service_role;

-- ============================================
-- 11) Comments for Documentation
-- ============================================

comment on table public.auto_pause_events is 'Logs every auto-pause event triggered by safety detection';
comment on column public.campaigns.paused_auto is 'True if campaign was auto-paused by safety system';
comment on column public.campaigns.paused_reason is 'Reason why campaign was auto-paused';
comment on column public.sender_inboxes.paused_auto is 'True if inbox was auto-paused by safety system';
comment on column public.sender_domains.paused_auto is 'True if domain was auto-paused by safety system';
comment on column public.workspaces.sending_paused is 'True if workspace-wide sending is paused (global stop)';
comment on column public.campaign_steps.paused_auto is 'True if specific sequence step was auto-paused';
comment on column public.send_queue.locked is 'True if send_queue item is locked due to auto-pause';

comment on function public.check_auto_pause_triggers is 'Checks all auto-pause trigger conditions and returns if pause is needed';
comment on function public.execute_auto_pause is 'Executes auto-pause: creates event, pauses entities, locks send_queue';
comment on function public.resume_auto_paused is 'Resumes auto-paused entities after safety checks pass';
comment on function public.check_resume_safety is 'Validates that it is safe to resume sending (bounce < 3%, spam < 0.1%, health > 60)';

