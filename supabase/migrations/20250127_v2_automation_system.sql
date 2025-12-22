-- SmartSend V2: Automation System Migration
-- Creates tables for auto-reply agent, follow-up sequencer, lead enrichment, and notifications

-- ============================================================================
-- 1. AUTO-REPLIES TABLE
-- ============================================================================
-- Stores AI-generated replies with confidence scores and status
create table if not exists public.auto_replies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null, -- workspace/organization ID
  thread_id uuid references public.email_threads(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  email_log_id uuid references public.email_logs(id) on delete set null,
  
  -- Reply content
  subject text not null,
  body_text text not null,
  body_html text,
  
  -- AI metadata
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  model text default 'gpt-4o-mini',
  prompt_version text,
  tokens_used int,
  
  -- Status tracking
  status text not null default 'draft' check (status in ('draft', 'suggested', 'sent', 'rejected', 'archived')),
  action_taken text check (action_taken in ('auto_sent', 'suggested', 'escalated', 'none')),
  
  -- Context
  original_reply_text text, -- the reply that triggered this auto-response
  original_reply_intent text,
  context_json jsonb default '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

create index if not exists idx_auto_replies_thread on public.auto_replies(thread_id);
create index if not exists idx_auto_replies_campaign on public.auto_replies(campaign_id);
create index if not exists idx_auto_replies_lead on public.auto_replies(lead_id);
create index if not exists idx_auto_replies_status on public.auto_replies(status);
create index if not exists idx_auto_replies_org_created on public.auto_replies(org_id, created_at desc);
create index if not exists idx_auto_replies_confidence on public.auto_replies(confidence desc) where status = 'suggested';

-- RLS
alter table public.auto_replies enable row level security;

create policy "auto_replies_select_own_org"
  on public.auto_replies for select
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = auto_replies.org_id
      and w.id in (select workspace_id from public.workspace_members where user_id = auth.uid())
    )
  );

create policy "auto_replies_insert_service"
  on public.auto_replies for insert
  to service_role
  with check (true);

create policy "auto_replies_update_service"
  on public.auto_replies for update
  to service_role
  using (true)
  with check (true);

-- ============================================================================
-- 2. FOLLOW-UP SCHEDULES TABLE
-- ============================================================================
-- Schedules automated follow-up emails when no reply is detected
create table if not exists public.followup_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  
  -- Schedule metadata
  sequence_step int not null default 1, -- which follow-up in the sequence (1, 2, 3...)
  day_offset int not null default 3, -- days after initial send or previous follow-up
  send_at timestamptz not null,
  
  -- Email content (can override campaign template)
  subject text,
  body_text text,
  body_html text,
  
  -- Status
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'skipped', 'cancelled')),
  skipped_reason text, -- 'replied', 'unsubscribed', 'bounced', 'manual'
  
  -- Tracking
  email_log_id uuid references public.email_logs(id) on delete set null,
  sent_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_followup_schedules_campaign on public.followup_schedules(campaign_id);
create index if not exists idx_followup_schedules_lead on public.followup_schedules(lead_id);
create index if not exists idx_followup_schedules_send_at on public.followup_schedules(send_at) where status = 'scheduled';
create index if not exists idx_followup_schedules_org_status on public.followup_schedules(org_id, status, send_at);

-- RLS
alter table public.followup_schedules enable row level security;

create policy "followup_schedules_select_own_org"
  on public.followup_schedules for select
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = followup_schedules.org_id
      and w.id in (select workspace_id from public.workspace_members where user_id = auth.uid())
    )
  );

create policy "followup_schedules_insert_service"
  on public.followup_schedules for insert
  to service_role
  with check (true);

create policy "followup_schedules_update_service"
  on public.followup_schedules for update
  to service_role
  using (true)
  with check (true);

-- ============================================================================
-- 3. LEAD ENRICHMENT TABLE
-- ============================================================================
-- Stores enriched lead data from external sources (Clearbit-style)
create table if not exists public.lead_enrichment (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  org_id uuid not null,
  
  -- Enrichment source
  source text not null default 'manual' check (source in ('manual', 'clearbit', 'apollo', 'openai', 'linkedin', 'company_website')),
  enriched_at timestamptz not null default now(),
  enriched_by uuid references auth.users(id), -- null if automatic
  
  -- Enriched fields (stored as JSONB for flexibility)
  fields jsonb not null default '{}'::jsonb,
  -- Common fields in fields JSONB:
  -- - company_name, company_domain, company_size, company_industry
  -- - job_title, seniority_level, department
  -- - location (city, state, country)
  -- - linkedin_url, twitter_handle
  -- - company_technologies (array)
  -- - recent_news (array)
  -- - funding_stage, revenue_range
  
  -- Quality metrics
  completeness_score numeric check (completeness_score >= 0 and completeness_score <= 1),
  confidence_score numeric check (confidence_score >= 0 and confidence_score <= 1),
  last_verified_at timestamptz,
  
  -- Metadata
  raw_response jsonb, -- full API response for debugging
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_lead_enrichment_lead on public.lead_enrichment(lead_id);
create index if not exists idx_lead_enrichment_org on public.lead_enrichment(org_id);
create index if not exists idx_lead_enrichment_source on public.lead_enrichment(source);
create index if not exists idx_lead_enrichment_company on public.lead_enrichment using gin ((fields->>'company_domain'));

-- RLS
alter table public.lead_enrichment enable row level security;

create policy "lead_enrichment_select_own_org"
  on public.lead_enrichment for select
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = lead_enrichment.org_id
      and w.id in (select workspace_id from public.workspace_members where user_id = auth.uid())
    )
  );

create policy "lead_enrichment_insert_service"
  on public.lead_enrichment for insert
  to service_role
  with check (true);

create policy "lead_enrichment_update_service"
  on public.lead_enrichment for update
  to service_role
  using (true)
  with check (true);

-- ============================================================================
-- 4. NOTIFICATIONS TABLE
-- ============================================================================
-- Central notification system for email and Telegram alerts
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid,
  
  -- Notification metadata
  type text not null check (type in (
    'reply_detected', 'auto_reply_sent', 'auto_reply_suggested',
    'lead_enriched', 'followup_scheduled', 'followup_sent',
    'template_optimized', 'campaign_threshold', 'plan_limit',
    'meeting_scheduled', 'intent_detected', 'error'
  )),
  severity text not null default 'info' check (severity in ('info', 'success', 'warning', 'error')),
  
  -- Content
  title text not null,
  message text not null,
  action_url text, -- link to relevant page/thread/lead
  action_label text,
  
  -- Delivery channels
  sent_email boolean default false,
  sent_telegram boolean default false,
  sent_push boolean default false, -- for future mobile app
  
  -- Status
  read_at timestamptz,
  clicked_at timestamptz,
  
  -- Context data
  metadata jsonb default '{}'::jsonb,
  -- Common metadata:
  -- - thread_id, campaign_id, lead_id
  -- - confidence, counts, thresholds
  -- - error_details
  
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user on public.notifications(user_id, created_at desc);
create index if not exists idx_notifications_org on public.notifications(org_id, created_at desc);
create index if not exists idx_notifications_type on public.notifications(type);
create index if not exists idx_notifications_unread on public.notifications(user_id, read_at) where read_at is null;

-- RLS
alter table public.notifications enable row level security;

create policy "notifications_select_own"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "notifications_insert_service"
  on public.notifications for insert
  to service_role
  with check (true);

create policy "notifications_update_own"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================================
-- 5. ADD AUTO-REPLY SETTINGS TO CAMPAIGNS
-- ============================================================================
-- Add allow_auto_reply flag and auto-reply confidence threshold
alter table public.campaigns
  add column if not exists allow_auto_reply boolean default false,
  add column if not exists auto_reply_confidence_threshold numeric default 0.8 check (auto_reply_confidence_threshold >= 0 and auto_reply_confidence_threshold <= 1),
  add column if not exists auto_reply_enabled_at timestamptz,
  add column if not exists auto_reply_enabled_by uuid references auth.users(id);

create index if not exists idx_campaigns_auto_reply on public.campaigns(allow_auto_reply) where allow_auto_reply = true;

-- ============================================================================
-- 6. ENSURE LEADS TABLE HAS PIPELINE STATUS
-- ============================================================================
-- Add/update status column for pipeline view (if not already present)
alter table public.leads
  add column if not exists pipeline_stage text default 'Contacted' check (pipeline_stage in ('Contacted', 'Replied', 'Demo Scheduled', 'Closed')),
  add column if not exists demo_scheduled_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists closed_reason text;

create index if not exists idx_leads_pipeline_stage on public.leads(pipeline_stage);
create index if not exists idx_leads_org_pipeline on public.leads(org_id, pipeline_stage) where org_id is not null;

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- Function to update followup_schedules updated_at
create or replace function public.touch_followup_schedules_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_followup_schedules_updated_at
before update on public.followup_schedules
for each row
execute function public.touch_followup_schedules_updated_at();

-- Function to update lead_enrichment updated_at
create or replace function public.touch_lead_enrichment_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_lead_enrichment_updated_at
before update on public.lead_enrichment
for each row
execute function public.touch_lead_enrichment_updated_at();

-- ============================================================================
-- 8. VIEWS FOR ANALYTICS
-- ============================================================================

-- Auto-reply performance view
create or replace view public.v_auto_reply_stats as
select
  org_id,
  date_trunc('day', created_at)::date as date,
  count(*) as total_generated,
  count(*) filter (where status = 'sent') as auto_sent,
  count(*) filter (where status = 'suggested') as suggested,
  count(*) filter (where status = 'rejected') as rejected,
  avg(confidence) as avg_confidence,
  count(*) filter (where confidence >= 0.8) as high_confidence_count
from public.auto_replies
group by org_id, date_trunc('day', created_at)::date;

-- Follow-up effectiveness view
create or replace view public.v_followup_effectiveness as
select
  campaign_id,
  sequence_step,
  count(*) as scheduled,
  count(*) filter (where status = 'sent') as sent,
  count(*) filter (where status = 'skipped' and skipped_reason = 'replied') as skipped_due_to_reply,
  avg(extract(epoch from (sent_at - send_at))) / 3600 as avg_hours_delay
from public.followup_schedules
where status in ('sent', 'skipped')
group by campaign_id, sequence_step;

