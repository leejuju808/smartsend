-- Block 474 — AI SDR Control Center (Kill Switch, Per-Campaign Toggles, Manual Review)
-- Gives full control over AI SDR: global kill-switch, per-campaign toggle, and optional manual approval queue

-- ============================================================================
-- 1️⃣ Create ai_sdr_settings table (per-user global control)
-- ============================================================================

create table if not exists public.ai_sdr_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Completely shut off AI SDR for this user
  enabled boolean not null default true,

  -- If true, AI SDR actions go into a review queue instead of auto-sending
  require_manual_approval boolean not null default false,

  -- Max AI SDR sends per day (safety throttle)
  daily_send_limit integer not null default 50,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_ai_sdr_settings_user
  on public.ai_sdr_settings (user_id);

-- ============================================================================
-- 2️⃣ Add per-campaign toggle columns to campaigns table
-- ============================================================================

alter table public.campaigns
  add column if not exists ai_sdr_mode text
    check (ai_sdr_mode in ('autopilot','review'))
    default 'autopilot';

-- Note: ai_sdr_enabled already exists from Block 472

-- ============================================================================
-- 3️⃣ Create ai_sdr_pending_actions table (manual review queue)
-- ============================================================================

create table if not exists public.ai_sdr_pending_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  thread_id uuid not null references public.ai_sdr_threads(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,

  -- send_followup / reply_interest / revive_lead
  action_type text not null check (action_type in (
    'send_followup',
    'reply_interest',
    'revive_lead'
  )),

  suggested_subject text,
  suggested_body text,

  -- pending / approved / rejected / sent
  status text not null check (status in ('pending','approved','rejected','sent'))
    default 'pending',

  model_raw jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_ai_sdr_pending_actions_user_status
  on public.ai_sdr_pending_actions (user_id, status);

create index if not exists idx_ai_sdr_pending_actions_thread
  on public.ai_sdr_pending_actions (thread_id);

create index if not exists idx_ai_sdr_pending_actions_status
  on public.ai_sdr_pending_actions (status) where status = 'pending';

-- ============================================================================
-- 4️⃣ Enable RLS and create policies
-- ============================================================================

alter table public.ai_sdr_settings enable row level security;
alter table public.ai_sdr_pending_actions enable row level security;

-- RLS Policy: Users manage their own AI SDR settings
create policy "user manages their ai_sdr_settings"
  on public.ai_sdr_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role can manage all settings (for edge functions)
create policy "service_role_manages_settings" on public.ai_sdr_settings
  for all to service_role using (true) with check (true);

-- RLS Policy: Users see their pending actions
create policy "user sees their pending actions"
  on public.ai_sdr_pending_actions
  for select
  using (auth.uid() = user_id);

-- RLS Policy: Users edit their pending actions
create policy "user edits their pending actions"
  on public.ai_sdr_pending_actions
  for insert, update
  with check (auth.uid() = user_id);

-- Service role can manage all pending actions (for edge functions)
create policy "service_role_manages_pending_actions" on public.ai_sdr_pending_actions
  for all to service_role using (true) with check (true);

-- ============================================================================
-- 5️⃣ Create trigger to update updated_at timestamp
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

create trigger trg_ai_sdr_settings_updated_at
before update on public.ai_sdr_settings
for each row
execute function public.set_updated_at();

create trigger trg_ai_sdr_pending_actions_updated_at
before update on public.ai_sdr_pending_actions
for each row
execute function public.set_updated_at();

-- ============================================================================
-- 6️⃣ Update ai_sdr_events to include new event types
-- ============================================================================

-- Add new event types to the check constraint if they don't exist
do $$
begin
  -- Check if constraint exists and update it
  if exists (
    select 1 from information_schema.table_constraints 
    where constraint_name like '%ai_sdr_events_event_type%' 
    and table_name = 'ai_sdr_events'
  ) then
    -- Drop old constraint
    alter table public.ai_sdr_events drop constraint if exists ai_sdr_events_event_type_check;
  end if;
  
  -- Add new constraint with all event types
  alter table public.ai_sdr_events 
    add constraint ai_sdr_events_event_type_check 
    check (event_type in (
      'send_followup',
      'reply_interest',
      'revive_lead',
      'close_won',
      'close_lost',
      'ai_sdr_disabled',
      'throttled_daily_limit',
      'queued_for_review',
      'review_rejected'
    ));
exception
  when others then null;
end $$;

