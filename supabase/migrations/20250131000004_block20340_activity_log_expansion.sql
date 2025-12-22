-- =========================================================
-- Block 20340 — SmartSend Inbox Conversation Timeline v1 (Unified Activity Feed)
-- Activity Log Normalization - Expand Timeline Log Types
-- =========================================================

-- Expand inbox_activity_log to support all possible event shapes
-- This keeps the timeline engine future-proof for all event types

ALTER TABLE IF EXISTS public.inbox_activity_log
  -- Email fields
  ADD COLUMN IF NOT EXISTS email_subject TEXT,
  ADD COLUMN IF NOT EXISTS email_direction TEXT CHECK (email_direction IN ('outbound', 'inbound')),
  ADD COLUMN IF NOT EXISTS email_status TEXT CHECK (email_status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced')),

  -- Call fields
  ADD COLUMN IF NOT EXISTS call_duration_seconds INT,
  ADD COLUMN IF NOT EXISTS call_outcome TEXT,

  -- Appointment fields
  ADD COLUMN IF NOT EXISTS appointment_type TEXT,
  ADD COLUMN IF NOT EXISTS appointment_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS appointment_status TEXT,

  -- Change tracking fields (JSONB for flexibility)
  ADD COLUMN IF NOT EXISTS property_change JSONB,
  ADD COLUMN IF NOT EXISTS roof_change JSONB,
  ADD COLUMN IF NOT EXISTS insurance_change JSONB,
  ADD COLUMN IF NOT EXISTS tag_change JSONB,

  -- Enrichment fields
  ADD COLUMN IF NOT EXISTS enrichment_provider TEXT,
  ADD COLUMN IF NOT EXISTS enrichment_status TEXT,

  -- Stage change fields
  ADD COLUMN IF NOT EXISTS stage_from TEXT,
  ADD COLUMN IF NOT EXISTS stage_to TEXT,

  -- Next action recommendation
  ADD COLUMN IF NOT EXISTS next_action_recommendation JSONB;

-- Update the type check constraint to include all new event types
ALTER TABLE IF EXISTS public.inbox_activity_log
  DROP CONSTRAINT IF EXISTS inbox_activity_log_type_check;

ALTER TABLE IF EXISTS public.inbox_activity_log
  ADD CONSTRAINT inbox_activity_log_type_check 
  CHECK (type IN (
    'note', 
    'status_change', 
    'value_change', 
    'follow_up', 
    'system',
    'email',
    'reply',
    'call',
    'appointment',
    'tag',
    'stage_change',
    'profile_update',
    'enrichment',
    'insurance_update',
    'next_action'
  ));

-- Add comments for documentation
COMMENT ON COLUMN public.inbox_activity_log.email_subject IS 'Email subject line for email/reply events';
COMMENT ON COLUMN public.inbox_activity_log.email_direction IS 'Email direction: outbound (sent) or inbound (received)';
COMMENT ON COLUMN public.inbox_activity_log.email_status IS 'Email status: sent, delivered, opened, clicked, bounced';
COMMENT ON COLUMN public.inbox_activity_log.call_duration_seconds IS 'Call duration in seconds';
COMMENT ON COLUMN public.inbox_activity_log.call_outcome IS 'Call outcome (e.g., "answered", "voicemail", "no_answer")';
COMMENT ON COLUMN public.inbox_activity_log.appointment_type IS 'Type of appointment (e.g., "estimate", "inspection")';
COMMENT ON COLUMN public.inbox_activity_log.appointment_at IS 'Scheduled appointment timestamp';
COMMENT ON COLUMN public.inbox_activity_log.appointment_status IS 'Appointment status (e.g., "scheduled", "completed", "cancelled")';
COMMENT ON COLUMN public.inbox_activity_log.property_change IS 'JSONB object tracking property-related changes';
COMMENT ON COLUMN public.inbox_activity_log.roof_change IS 'JSONB object tracking roof-related changes';
COMMENT ON COLUMN public.inbox_activity_log.insurance_change IS 'JSONB object tracking insurance-related changes';
COMMENT ON COLUMN public.inbox_activity_log.tag_change IS 'JSONB object tracking tag additions/removals';
COMMENT ON COLUMN public.inbox_activity_log.enrichment_provider IS 'Enrichment data provider name';
COMMENT ON COLUMN public.inbox_activity_log.enrichment_status IS 'Enrichment status (e.g., "success", "failed", "pending")';
COMMENT ON COLUMN public.inbox_activity_log.stage_from IS 'Previous pipeline stage';
COMMENT ON COLUMN public.inbox_activity_log.stage_to IS 'New pipeline stage';
COMMENT ON COLUMN public.inbox_activity_log.next_action_recommendation IS 'JSONB object with next best action recommendation details';

















































