-- Block 425 — Inbox Rotation Engine v1
-- Cycle Multiple Inboxes Automatically • Load Balancing • Deliverability Optimization

-- ============================================
-- 1) Add rotation columns to campaign_steps
-- ============================================

-- Add sender_mode column (default 'single')
alter table if exists public.campaign_steps
  add column if not exists sender_mode text default 'single' check (sender_mode in ('single', 'rotation'));

-- Add rotation_domain_id column for domain-level rotation
alter table if exists public.campaign_steps
  add column if not exists rotation_domain_id uuid references public.sender_domains(id) on delete set null;

-- Create index for rotation queries
create index if not exists idx_campaign_steps_rotation_domain on public.campaign_steps(rotation_domain_id);

-- ============================================
-- 2) Add sender_inbox_id to send_queue
-- ============================================

alter table if exists public.send_queue
  add column if not exists sender_inbox_id uuid references public.sender_inboxes(id) on delete set null;

create index if not exists idx_send_queue_sender_inbox on public.send_queue(sender_inbox_id);

-- ============================================
-- 3) Helper function to pick best inbox for rotation
-- ============================================

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
  v_usage_map jsonb := '{}'::jsonb;
  v_usage_count int;
  v_health_score int;
  v_best_score numeric := -999999;
  v_best_inbox uuid;
begin
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
  
  -- If no healthy inbox found, fallback to any connected inbox
  if v_best_inbox is null then
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
-- 4) Update email_events to track sender_inbox_id
-- ============================================

-- Add sender_inbox_id to email_events if it doesn't exist
alter table if exists public.email_events
  add column if not exists sender_inbox_id uuid references public.sender_inboxes(id) on delete set null;

create index if not exists idx_email_events_sender_inbox on public.email_events(sender_inbox_id, event_type, created_at);

-- ============================================
-- 5) Failover function to mark inbox as disconnected
-- ============================================

create or replace function public.mark_inbox_disconnected(
  p_inbox_id uuid,
  p_reason text default 'send_failed'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Mark inbox as disconnected
  update public.sender_inboxes
  set connected = false,
      last_checked = now()
  where id = p_inbox_id;
  
  -- Log the failure (optional - can be extended)
  -- You might want to create an inbox_failures table for tracking
end;
$$;

-- ============================================
-- 6) Comments
-- ============================================

comment on function public.pick_rotation_inbox is 'Picks the best inbox for rotation based on health score and daily usage';
comment on function public.mark_inbox_disconnected is 'Marks an inbox as disconnected when sending fails (OAuth expired, SMTP rejected, etc.)';
comment on column public.campaign_steps.sender_mode is 'Sender mode: single (use one inbox) or rotation (auto-rotate across domain inboxes)';
comment on column public.campaign_steps.rotation_domain_id is 'Domain ID to rotate across when sender_mode is rotation';
comment on column public.send_queue.sender_inbox_id is 'Selected inbox ID for this queue item (set during rotation)';

