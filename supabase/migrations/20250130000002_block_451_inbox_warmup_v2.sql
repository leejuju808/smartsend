-- Block 451 — Inbox Warmup v2
-- Smart Warmup • Adaptive Volume • AI Deliverability Adjustments • Domain-Aware Warmup • Auto-Corrective Behavior

-- ============================================
-- 0) Extend warmup_queue table for v2 features
-- ============================================
alter table if exists public.warmup_queue
  add column if not exists reply_scheduled_for timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists reply_body text;

create index if not exists idx_warmup_queue_reply_due
  on public.warmup_queue(reply_scheduled_for)
  where reply_scheduled_for is not null and replied_at is null;

-- ============================================
-- 1) Create inbox_warmup_status table
-- ============================================
create table if not exists public.inbox_warmup_status (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid not null references public.sender_inboxes(id) on delete cascade,
  daily_target int default 5,
  actual_sent int default 0,
  warmup_health_score int default 50 check (warmup_health_score >= 0 and warmup_health_score <= 100),
  warmup_ai_notes text,
  warmup_stage text default 'stage_1' check (warmup_stage in ('stage_1', 'stage_2', 'stage_3', 'stage_4')),
  is_paused boolean default false,
  pause_reason text,
  paused_at timestamptz,
  last_analyzed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(inbox_id)
);

create index if not exists idx_inbox_warmup_status_inbox on public.inbox_warmup_status(inbox_id);
create index if not exists idx_inbox_warmup_status_paused on public.inbox_warmup_status(is_paused) where is_paused = true;
create index if not exists idx_inbox_warmup_status_stage on public.inbox_warmup_status(warmup_stage);

-- ============================================
-- 2) Warmup metrics history table
-- ============================================
create table if not exists public.warmup_metrics_history (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid not null references public.sender_inboxes(id) on delete cascade,
  date date not null,
  target_count int default 0,
  actual_sent int default 0,
  bounce_count int default 0,
  spam_count int default 0,
  open_count int default 0,
  reply_count int default 0,
  health_score int default 50,
  created_at timestamptz default now(),
  unique(inbox_id, date)
);

create index if not exists idx_warmup_metrics_inbox_date on public.warmup_metrics_history(inbox_id, date desc);

-- ============================================
-- 3) Warmup pause events log
-- ============================================
create table if not exists public.warmup_pause_events (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid not null references public.sender_inboxes(id) on delete cascade,
  event_type text not null check (event_type in ('paused', 'resumed')),
  reason text,
  triggered_by text default 'auto' check (triggered_by in ('auto', 'manual')),
  created_at timestamptz default now()
);

create index if not exists idx_warmup_pause_events_inbox on public.warmup_pause_events(inbox_id, created_at desc);

-- ============================================
-- 4) Function to update warmup status updated_at
-- ============================================
create or replace function public.update_warmup_status_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_inbox_warmup_status_updated_at
  before update on public.inbox_warmup_status
  for each row execute function public.update_warmup_status_updated_at();

-- ============================================
-- 5) Function to get warmup stage based on metrics
-- ============================================
create or replace function public.get_warmup_stage(
  p_inbox_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_warmup_days int;
  v_health_score int;
  v_bounce_rate float;
  v_spam_rate float;
  v_domain_age_days int;
  v_inbox_age_days int;
begin
  -- Get warmup days from inbox_health
  select 
    coalesce(ih.warmup_stage, 0),
    coalesce(ih.score, 50),
    coalesce(ih.bounce_rate, 0),
    coalesce(ih.spam_rate, 0)
  into v_warmup_days, v_health_score, v_bounce_rate, v_spam_rate
  from public.inbox_health ih
  where ih.inbox_id = p_inbox_id;

  -- Get inbox age
  select extract(epoch from (now() - si.created_at)) / 86400
  into v_inbox_age_days
  from public.sender_inboxes si
  where si.id = p_inbox_id;

  -- Get domain age
  select extract(epoch from (now() - sd.created_at)) / 86400
  into v_domain_age_days
  from public.sender_inboxes si
  join public.sender_domains sd on sd.id = si.domain_id
  where si.id = p_inbox_id;

  -- Stage 1: Fresh Inbox (5-15/day)
  if v_warmup_days < 7 or v_inbox_age_days < 7 or v_domain_age_days < 14 then
    return 'stage_1';
  -- Stage 2: Building Trust (15-40/day)
  elsif v_warmup_days < 21 or v_health_score < 70 then
    return 'stage_2';
  -- Stage 3: Stable (40-80/day)
  elsif v_warmup_days < 60 or v_health_score < 85 then
    return 'stage_3';
  -- Stage 4: High Volume (80-150/day)
  else
    return 'stage_4';
  end if;
end;
$$;

-- ============================================
-- 6) Function to calculate domain warmup coordination
-- ============================================
create or replace function public.get_domain_warmup_distribution(
  p_domain_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_domain_target int;
  v_inbox_count int;
  v_result jsonb;
  v_inbox_distribution jsonb := '[]'::jsonb;
  v_inbox_record record;
begin
  -- Get domain warmup limits
  select daily_warmup_limit::int
  into v_domain_target
  from public.get_domain_warmup_limits(p_domain_id);

  -- Count active warmup inboxes for this domain
  select count(*)
  into v_inbox_count
  from public.sender_inboxes si
  join public.inbox_warmup_status iws on iws.inbox_id = si.id
  where si.domain_id = p_domain_id
    and si.warmup_enabled = true
    and si.connected = true
    and iws.is_paused = false;

  if v_inbox_count = 0 then
    return jsonb_build_object('domain_target', v_domain_target, 'inbox_count', 0, 'distribution', '[]'::jsonb);
  end if;

  -- Calculate per-inbox target
  declare
    v_per_inbox int := floor(v_domain_target / v_inbox_count);
    v_remainder int := v_domain_target % v_inbox_count;
    v_current_remainder int := v_remainder;
  begin
    -- Distribute across inboxes, prioritizing healthy ones
    for v_inbox_record in
      select 
        si.id,
        coalesce(ih.score, 50) as health_score,
        coalesce(ih.bounce_rate, 0) as bounce_rate,
        coalesce(ih.spam_rate, 0) as spam_rate
      from public.sender_inboxes si
      left join public.inbox_health ih on ih.inbox_id = si.id
      join public.inbox_warmup_status iws on iws.inbox_id = si.id
      where si.domain_id = p_domain_id
        and si.warmup_enabled = true
        and si.connected = true
        and iws.is_paused = false
      order by 
        coalesce(ih.score, 50) desc,
        coalesce(ih.bounce_rate, 0) asc,
        coalesce(ih.spam_rate, 0) asc
    loop
      declare
        v_target int := v_per_inbox;
      begin
        -- Give remainder to healthiest inboxes first
        if v_current_remainder > 0 then
          v_target := v_target + 1;
          v_current_remainder := v_current_remainder - 1;
        end if;

        -- Reduce target if inbox has issues
        if v_inbox_record.bounce_rate > 0.04 or v_inbox_record.spam_rate > 0.002 then
          v_target := floor(v_target * 0.5);
        end if;

        v_inbox_distribution := v_inbox_distribution || jsonb_build_object(
          'inbox_id', v_inbox_record.id,
          'target', v_target,
          'health_score', v_inbox_record.health_score
        );
      end;
    end loop;
  end;

  v_result := jsonb_build_object(
    'domain_target', v_domain_target,
    'inbox_count', v_inbox_count,
    'distribution', v_inbox_distribution
  );

  return v_result;
end;
$$;

-- ============================================
-- 7) Function to auto-pause warmup
-- ============================================
create or replace function public.auto_pause_warmup(
  p_inbox_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Update warmup status
  update public.inbox_warmup_status
  set 
    is_paused = true,
    pause_reason = p_reason,
    paused_at = now()
  where inbox_id = p_inbox_id;

  -- Log pause event
  insert into public.warmup_pause_events (inbox_id, event_type, reason, triggered_by)
  values (p_inbox_id, 'paused', p_reason, 'auto');
end;
$$;

-- ============================================
-- 8) Function to auto-resume warmup
-- ============================================
create or replace function public.auto_resume_warmup(
  p_inbox_id uuid,
  p_reason text default 'Conditions improved'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Update warmup status
  update public.inbox_warmup_status
  set 
    is_paused = false,
    pause_reason = null,
    paused_at = null
  where inbox_id = p_inbox_id;

  -- Log resume event
  insert into public.warmup_pause_events (inbox_id, event_type, reason, triggered_by)
  values (p_inbox_id, 'resumed', p_reason, 'auto');
end;
$$;

-- ============================================
-- 9) Enable RLS
-- ============================================
alter table public.inbox_warmup_status enable row level security;
alter table public.warmup_metrics_history enable row level security;
alter table public.warmup_pause_events enable row level security;

-- ============================================
-- 10) RLS Policies
-- ============================================
create policy "inbox_warmup_status_select_workspace_member" on public.inbox_warmup_status
  for select using (
    exists (
      select 1 from public.sender_inboxes si
      join public.workspace_members wm on wm.workspace_id = si.workspace_id
      where si.id = inbox_warmup_status.inbox_id
        and wm.user_id = auth.uid()
    )
  );

create policy "inbox_warmup_status_service_role" on public.inbox_warmup_status
  for all to service_role using (true) with check (true);

create policy "warmup_metrics_history_select_workspace_member" on public.warmup_metrics_history
  for select using (
    exists (
      select 1 from public.sender_inboxes si
      join public.workspace_members wm on wm.workspace_id = si.workspace_id
      where si.id = warmup_metrics_history.inbox_id
        and wm.user_id = auth.uid()
    )
  );

create policy "warmup_metrics_history_service_role" on public.warmup_metrics_history
  for all to service_role using (true) with check (true);

create policy "warmup_pause_events_select_workspace_member" on public.warmup_pause_events
  for select using (
    exists (
      select 1 from public.sender_inboxes si
      join public.workspace_members wm on wm.workspace_id = si.workspace_id
      where si.id = warmup_pause_events.inbox_id
        and wm.user_id = auth.uid()
    )
  );

create policy "warmup_pause_events_service_role" on public.warmup_pause_events
  for all to service_role using (true) with check (true);

-- ============================================
-- 11) Initialize warmup status for existing inboxes
-- ============================================
insert into public.inbox_warmup_status (inbox_id, daily_target, warmup_stage)
select 
  si.id,
  case 
    when si.warmup_enabled then 5
    else 0
  end,
  public.get_warmup_stage(si.id)
from public.sender_inboxes si
where not exists (
  select 1 from public.inbox_warmup_status iws
  where iws.inbox_id = si.id
)
on conflict (inbox_id) do nothing;

-- ============================================
-- 12) Comments
-- ============================================
comment on table public.inbox_warmup_status is 'Tracks warmup status, targets, and AI recommendations for each inbox';
comment on column public.inbox_warmup_status.daily_target is 'Dynamic daily warmup target (adjusted by AI)';
comment on column public.inbox_warmup_status.actual_sent is 'Actual warmup emails sent today';
comment on column public.inbox_warmup_status.warmup_health_score is 'AI-calculated warmup health score (0-100)';
comment on column public.inbox_warmup_status.warmup_ai_notes is 'AI-generated notes and recommendations';
comment on column public.inbox_warmup_status.warmup_stage is 'Warmup stage: stage_1 (5-15/day), stage_2 (15-40/day), stage_3 (40-80/day), stage_4 (80-150/day)';
comment on function public.get_warmup_stage is 'Determines warmup stage based on inbox age, domain age, warmup days, and health metrics';
comment on function public.get_domain_warmup_distribution is 'Distributes domain warmup target across multiple inboxes, prioritizing healthy ones';
comment on function public.auto_pause_warmup is 'Automatically pauses warmup for an inbox with a given reason';
comment on function public.auto_resume_warmup is 'Automatically resumes warmup when conditions improve';

-- ============================================
-- 13) Schedule cron jobs for warmup v2 functions
-- ============================================
-- Schedule inbox-warmup-analyzer to run daily at 3 AM UTC
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('inbox-warmup-analyzer') where exists (
      select 1 from cron.job where jobname = 'inbox-warmup-analyzer'
    );
    
    perform cron.schedule(
      'inbox-warmup-analyzer',
      '0 3 * * *', -- Daily at 3 AM UTC
      $$
      select
        net.http_post(
          url := current_setting('app.supabase_url', true) || '/functions/v1/inbox-warmup-analyzer',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
          ),
          body := '{}'::jsonb
        ) as request_id;
      $$
    );
  end if;
exception
  when others then null;
end;
$$;

-- Schedule warmup-schedule to run daily at 4 AM UTC (after analyzer)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('warmup-schedule-v2') where exists (
      select 1 from cron.job where jobname = 'warmup-schedule-v2'
    );
    
    perform cron.schedule(
      'warmup-schedule-v2',
      '0 4 * * *', -- Daily at 4 AM UTC
      $$
      select
        net.http_post(
          url := current_setting('app.supabase_url', true) || '/functions/v1/warmup-schedule',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
          ),
          body := '{}'::jsonb
        ) as request_id;
      $$
    );
  end if;
exception
  when others then null;
end;
$$;

-- Schedule warmup-reply-simulator to run every 10 minutes
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('warmup-reply-simulator') where exists (
      select 1 from cron.job where jobname = 'warmup-reply-simulator'
    );
    
    perform cron.schedule(
      'warmup-reply-simulator',
      '*/10 * * * *', -- Every 10 minutes
      $$
      select
        net.http_post(
          url := current_setting('app.supabase_url', true) || '/functions/v1/warmup-reply-simulator',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
          ),
          body := '{}'::jsonb
        ) as request_id;
      $$
    );
  end if;
exception
  when others then null;
end;
$$;

