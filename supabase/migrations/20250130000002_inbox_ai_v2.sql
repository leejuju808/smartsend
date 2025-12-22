-- Block 24180 — SmartSend Roofing Inbox AI v2
-- Advanced Lead Classification • Homeowner Intent Detection • Smart Reply Suggestions • Auto-Draft Responses • Booking Logic

-- ============================================================================
-- 1. INTENT CLASSIFICATION SYSTEM
-- ============================================================================

-- Add intent classification columns to inbox_messages
alter table public.inbox_messages
  add column if not exists ai_intent_label text check (ai_intent_label in (
    'hot_lead',
    'warm_lead', 
    'cold_reply',
    'quote_request',
    'inspection_scheduling',
    'not_interested',
    'appointment_confirmed'
  )),
  add column if not exists ai_intent_confidence numeric default 0.0,
  add column if not exists ai_intent_reasoning text,
  add column if not exists ai_emotional_tone text,
  add column if not exists ai_urgency_score numeric default 0.0,
  add column if not exists ai_classified_at timestamptz;

-- Add intent label to inbox_threads for quick filtering
alter table public.inbox_threads
  add column if not exists latest_intent_label text,
  add column if not exists latest_intent_confidence numeric default 0.0,
  add column if not exists priority_score numeric default 0.0; -- Higher = more urgent

-- Indexes for fast intent-based queries
create index if not exists idx_inbox_msgs_intent on public.inbox_messages(ai_intent_label, ai_classified_at desc);
create index if not exists idx_inbox_threads_intent on public.inbox_threads(latest_intent_label, priority_score desc);
create index if not exists idx_inbox_threads_priority on public.inbox_threads(priority_score desc, last_message_at desc);

-- ============================================================================
-- 2. AI REPLY DRAFTS SYSTEM
-- ============================================================================

create table if not exists public.inbox_ai_drafts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  message_id uuid references public.inbox_messages(id) on delete set null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  
  -- Draft content
  draft_subject text,
  draft_body text not null,
  
  -- AI metadata
  intent_label text not null,
  confidence numeric default 0.0,
  tone text default 'professional', -- casual, professional, direct, soft
  variant_number int default 1, -- Multiple drafts per intent
  
  -- Status
  status text not null default 'draft' check (status in ('draft', 'approved', 'sent', 'rejected')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  
  -- Metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_drafts_thread on public.inbox_ai_drafts(thread_id, created_at desc);
create index if not exists idx_ai_drafts_status on public.inbox_ai_drafts(status, created_at desc);
create index if not exists idx_ai_drafts_intent on public.inbox_ai_drafts(intent_label);

alter table public.inbox_ai_drafts enable row level security;

-- RLS: Same as inbox_threads
create policy "ai_drafts_read"
on public.inbox_ai_drafts
for select
using (public.can_view_campaign(campaign_id));

create policy "ai_drafts_write"
on public.inbox_ai_drafts
for insert, update, delete
using (public.can_edit_campaign(campaign_id))
with check (public.can_edit_campaign(campaign_id));

-- ============================================================================
-- 3. ROOFER STYLE PROFILES
-- ============================================================================

create table if not exists public.roofer_style_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade, -- null = default for all campaigns
  
  -- Style settings
  tone text not null default 'professional' check (tone in ('casual', 'professional', 'direct', 'soft')),
  signature text,
  common_phrases text[], -- Array of phrases the roofer commonly uses
  vocabulary_style text, -- 'formal', 'conversational', 'technical', 'simple'
  
  -- Learning from past messages
  sample_messages jsonb default '[]'::jsonb, -- Store examples of roofer's writing
  learned_patterns jsonb default '{}'::jsonb, -- AI-learned patterns
  
  -- Metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  unique (user_id, campaign_id)
);

create index if not exists idx_roofer_style_user on public.roofer_style_profiles(user_id);
create index if not exists idx_roofer_style_campaign on public.roofer_style_profiles(campaign_id);

alter table public.roofer_style_profiles enable row level security;

create policy "roofer_style_read"
on public.roofer_style_profiles
for select
using (auth.uid() = user_id or public.can_view_campaign(campaign_id));

create policy "roofer_style_write"
on public.roofer_style_profiles
for insert, update, delete
using (auth.uid() = user_id or public.can_edit_campaign(campaign_id))
with check (auth.uid() = user_id or public.can_edit_campaign(campaign_id));

-- ============================================================================
-- 4. FOLLOW-UP MEMORY SYSTEM
-- ============================================================================

create table if not exists public.inbox_followup_tasks (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  assigned_to uuid references auth.users(id),
  
  -- Task details
  task_type text not null check (task_type in ('follow_up', 'reminder', 'queued_message', 'check_back')),
  trigger_text text, -- What the homeowner said (e.g., "check back next week")
  scheduled_for timestamptz not null,
  
  -- Message details (if queued)
  queued_subject text,
  queued_body text,
  
  -- Status
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled', 'sent')),
  completed_at timestamptz,
  
  -- Metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_followup_tasks_scheduled on public.inbox_followup_tasks(scheduled_for, status);
create index if not exists idx_followup_tasks_thread on public.inbox_followup_tasks(thread_id);
create index if not exists idx_followup_tasks_assigned on public.inbox_followup_tasks(assigned_to, status);

alter table public.inbox_followup_tasks enable row level security;

create policy "followup_tasks_read"
on public.inbox_followup_tasks
for select
using (public.can_view_campaign(campaign_id));

create policy "followup_tasks_write"
on public.inbox_followup_tasks
for insert, update, delete
using (public.can_edit_campaign(campaign_id))
with check (public.can_edit_campaign(campaign_id));

-- ============================================================================
-- 5. AUTO-BOOKING SUGGESTIONS
-- ============================================================================

create table if not exists public.inbox_booking_suggestions (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  message_id uuid references public.inbox_messages(id) on delete set null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  
  -- Suggested times (from calendar sync)
  suggested_times jsonb not null default '[]'::jsonb, -- [{time: "2024-01-15T14:00:00Z", label: "Tomorrow 2-4 PM"}]
  
  -- Status
  status text not null default 'pending' check (status in ('pending', 'booked', 'rejected', 'expired')),
  booked_time timestamptz,
  booked_by uuid references auth.users(id),
  
  -- Metadata
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists idx_booking_suggestions_thread on public.inbox_booking_suggestions(thread_id, status);
create index if not exists idx_booking_suggestions_status on public.inbox_booking_suggestions(status, created_at desc);

alter table public.inbox_booking_suggestions enable row level security;

create policy "booking_suggestions_read"
on public.inbox_booking_suggestions
for select
using (public.can_view_campaign(campaign_id));

create policy "booking_suggestions_write"
on public.inbox_booking_suggestions
for insert, update, delete
using (public.can_edit_campaign(campaign_id))
with check (public.can_edit_campaign(campaign_id));

-- ============================================================================
-- 6. SPEED LEAD MODE TRACKING
-- ============================================================================

create table if not exists public.inbox_speed_leads (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  message_id uuid not null references public.inbox_messages(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  
  -- Speed metrics
  detected_at timestamptz not null default now(),
  draft_generated_at timestamptz,
  draft_generation_ms int, -- Milliseconds to generate draft
  sent_at timestamptz,
  response_time_ms int, -- Total time from detection to send
  
  -- Status
  status text not null default 'detected' check (status in ('detected', 'draft_ready', 'sent', 'missed')),
  
  -- Metadata
  created_at timestamptz not null default now()
);

create index if not exists idx_speed_leads_detected on public.inbox_speed_leads(detected_at desc);
create index if not exists idx_speed_leads_status on public.inbox_speed_leads(status);

alter table public.inbox_speed_leads enable row level security;

create policy "speed_leads_read"
on public.inbox_speed_leads
for select
using (public.can_view_campaign(campaign_id));

create policy "speed_leads_write"
on public.inbox_speed_leads
for insert, update, delete
using (public.can_edit_campaign(campaign_id))
with check (public.can_edit_campaign(campaign_id));

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate priority score based on intent
create or replace function public.calculate_thread_priority(
  p_intent_label text,
  p_confidence numeric,
  p_urgency_score numeric,
  p_last_message_at timestamptz
) returns numeric
language plpgsql
immutable
as $$
declare
  base_score numeric;
  intent_multiplier numeric;
begin
  -- Base priority scores by intent
  case p_intent_label
    when 'hot_lead' then base_score := 100;
    when 'warm_lead' then base_score := 60;
    when 'quote_request' then base_score := 70;
    when 'inspection_scheduling' then base_score := 80;
    when 'appointment_confirmed' then base_score := 50;
    when 'cold_reply' then base_score := 30;
    when 'not_interested' then base_score := 10;
    else base_score := 40;
  end case;
  
  -- Apply confidence multiplier (0.5 to 1.0)
  intent_multiplier := 0.5 + (p_confidence * 0.5);
  
  -- Apply urgency boost
  base_score := base_score + (p_urgency_score * 20);
  
  -- Apply recency boost (messages from last hour get +20, last 24h get +10)
  if p_last_message_at > now() - interval '1 hour' then
    base_score := base_score + 20;
  elsif p_last_message_at > now() - interval '24 hours' then
    base_score := base_score + 10;
  end if;
  
  return base_score * intent_multiplier;
end;
$$;

-- Function to update thread priority when intent changes
create or replace function public.update_thread_priority()
returns trigger
language plpgsql
as $$
begin
  update public.inbox_threads
  set 
    latest_intent_label = NEW.ai_intent_label,
    latest_intent_confidence = NEW.ai_intent_confidence,
    priority_score = public.calculate_thread_priority(
      NEW.ai_intent_label,
      NEW.ai_intent_confidence,
      COALESCE(NEW.ai_urgency_score, 0),
      NEW.sent_at
    )
  where id = NEW.thread_id;
  
  return NEW;
end;
$$;

drop trigger if exists tr_update_thread_priority on public.inbox_messages;
create trigger tr_update_thread_priority
after insert or update of ai_intent_label, ai_intent_confidence, ai_urgency_score on public.inbox_messages
for each row
when (NEW.direction = 'in' and NEW.ai_intent_label is not null)
execute function public.update_thread_priority();

-- ============================================================================
-- 8. NOTIFICATION TRIGGERS
-- ============================================================================

-- Function to create speed lead record when HOT LEAD detected
create or replace function public.create_speed_lead_record()
returns trigger
language plpgsql
as $$
begin
  if NEW.direction = 'in' and NEW.ai_intent_label = 'hot_lead' then
    insert into public.inbox_speed_leads (
      thread_id,
      message_id,
      campaign_id,
      lead_id,
      detected_at,
      status
    ) values (
      NEW.thread_id,
      NEW.id,
      NEW.campaign_id,
      NEW.lead_id,
      now(),
      'detected'
    );
  end if;
  
  return NEW;
end;
$$;

drop trigger if exists tr_create_speed_lead on public.inbox_messages;
create trigger tr_create_speed_lead
after insert or update of ai_intent_label on public.inbox_messages
for each row
when (NEW.direction = 'in' and NEW.ai_intent_label = 'hot_lead')
execute function public.create_speed_lead_record();

-- ============================================================================
-- 9. COMMENTS
-- ============================================================================

comment on table public.inbox_ai_drafts is 'AI-generated reply drafts for inbox messages';
comment on table public.roofer_style_profiles is 'Roofer writing style profiles for personalized AI replies';
comment on table public.inbox_followup_tasks is 'Follow-up reminders and queued messages based on homeowner responses';
comment on table public.inbox_booking_suggestions is 'Auto-booking suggestions when scheduling intent detected';
comment on table public.inbox_speed_leads is 'Tracks HOT leads for instant response mode';






































