-- Block 435 — Inbox Reputation AI Monitor v1
-- Auto Health Scoring • Spam/Bounce Detection • AI Alerts • Inbox Failure Protection

-- ============================================
-- 1) Extend inbox_health table with new fields
-- ============================================

alter table public.inbox_health
  add column if not exists health_score int check (health_score >= 0 and health_score <= 100);

alter table public.inbox_health
  add column if not exists last_7_day_sends int default 0,
  add column if not exists last_7_day_bounces int default 0,
  add column if not exists last_7_day_spam int default 0,
  add column if not exists last_7_day_opens int default 0,
  add column if not exists last_7_day_replies int default 0;

alter table public.inbox_health
  add column if not exists reply_rate float default 0;

alter table public.inbox_health
  add column if not exists flagged boolean default false;

-- Update health_score to use the new column name (migrate from score if needed)
update public.inbox_health
set health_score = score
where health_score is null and score is not null;

-- ============================================
-- 2) Add disabled_reason to sender_inboxes
-- ============================================

alter table public.sender_inboxes
  add column if not exists disabled_reason text;

create index if not exists idx_sender_inboxes_disabled_reason on public.sender_inboxes(disabled_reason);

-- ============================================
-- 3) Create inbox_alerts table
-- ============================================

create table if not exists public.inbox_alerts (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid not null references public.sender_inboxes(id) on delete cascade,
  alert_type text not null check (alert_type in ('bounce_spike', 'spam_spike', 'open_rate_crash', 'inbox_disabled', 'warmup_required', 'deliverability_drop')),
  message text not null,
  created_at timestamptz default now(),
  resolved boolean default false,
  resolved_at timestamptz
);

create index if not exists idx_inbox_alerts_inbox on public.inbox_alerts(inbox_id, created_at desc);
create index if not exists idx_inbox_alerts_resolved on public.inbox_alerts(resolved);
create index if not exists idx_inbox_alerts_type on public.inbox_alerts(alert_type);

-- ============================================
-- 4) Enable RLS for inbox_alerts
-- ============================================

alter table public.inbox_alerts enable row level security;

create policy "inbox_alerts_select_workspace_member" on public.inbox_alerts
  for select using (
    exists (
      select 1 from public.sender_inboxes si
      join public.workspace_members wm on wm.workspace_id = si.workspace_id
      where si.id = inbox_alerts.inbox_id
        and wm.user_id = auth.uid()
    )
  );

create policy "inbox_alerts_service_role" on public.inbox_alerts
  for all to service_role using (true) with check (true);

-- ============================================
-- 5) Update pick_rotation_inbox to avoid unhealthy inboxes
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
      coalesce(ih.health_score, ih.score, 50) as health_score,
      coalesce(ih.spam_rate, 0) as spam_rate,
      coalesce(ih.bounce_rate, 0) as bounce_rate
    from public.sender_inboxes si
    left join public.inbox_health ih on ih.inbox_id = si.id
    where si.domain_id = p_domain_id
      and si.connected = true
  loop
    -- Step 2: Filter out unhealthy inboxes (score < 50)
    if v_inbox_pool.health_score >= 50 
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
-- 6) Helper function to create inbox alert
-- ============================================

create or replace function public.create_inbox_alert(
  p_inbox_id uuid,
  p_alert_type text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alert_id uuid;
begin
  insert into public.inbox_alerts (inbox_id, alert_type, message)
  values (p_inbox_id, p_alert_type, p_message)
  returning id into v_alert_id;
  
  return v_alert_id;
end;
$$;

-- ============================================
-- 7) Comments
-- ============================================

comment on column public.inbox_health.health_score is 'AI-calculated health score (0-100) based on bounce, spam, open, reply rates';
comment on column public.inbox_health.last_7_day_sends is 'Total sends in last 7 days';
comment on column public.inbox_health.last_7_day_bounces is 'Total bounces in last 7 days';
comment on column public.inbox_health.last_7_day_spam is 'Total spam complaints in last 7 days';
comment on column public.inbox_health.last_7_day_opens is 'Total opens in last 7 days';
comment on column public.inbox_health.last_7_day_replies is 'Total replies in last 7 days';
comment on column public.inbox_health.reply_rate is 'Reply rate (replies / sends)';
comment on column public.inbox_health.flagged is 'Whether inbox is flagged for review';
comment on column public.sender_inboxes.disabled_reason is 'Reason why inbox was auto-disabled (e.g., AI: reputation critical)';
comment on table public.inbox_alerts is 'Alerts for inbox health issues (bounce spikes, spam spikes, etc.)';



