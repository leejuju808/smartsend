-- ============================================================================
-- Block 22179 — SmartSend Roofing "Hot Lead Detector v1"
-- (🔥 Instantly Flags High-Intent Homeowners So Estimators Jump On Them FIRST)
-- ============================================================================
-- FULL BLOCK. MAX POWER.
--
-- This is one of the highest-ROI intelligence features you will build.
--
-- Right now, roofers lose MASSIVE revenue because:
-- - they don't know which leads are HOT
-- - they treat all leads the same
-- - they don't respond fast enough to urgent homeowners
-- - they don't see intent signals early
-- - they let high-value opportunities sit for hours
--
-- SmartSend fixes ALL of this with Hot Lead Detector v1:
-- AI that analyzes every new inbound lead and every homeowner message 
-- to detect HIGH BUYING INTENT and instantly FLAG it across the system.
--
-- This feature singlehandedly increases close rates.
-- This BLOCK makes owners say: "THIS is why I'm paying for SmartSend."
-- ============================================================================

-- ============================================================================
-- 1. ADD HOT LEAD COLUMNS TO LEADS TABLE
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS is_hot BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS hot_reason TEXT,
  ADD COLUMN IF NOT EXISTS hot_score INTEGER DEFAULT 0 CHECK (hot_score >= 0 AND hot_score <= 100);

-- Create index for fast hot lead queries
CREATE INDEX IF NOT EXISTS idx_leads_is_hot 
  ON public.leads(is_hot, hot_score DESC) 
  WHERE is_hot = true;

-- Create index for hot score queries
CREATE INDEX IF NOT EXISTS idx_leads_hot_score 
  ON public.leads(hot_score DESC) 
  WHERE hot_score > 0;

-- ============================================================================
-- 2. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN public.leads.is_hot IS 'Block 22179: True if this lead is flagged as a HOT LEAD (high buying intent detected)';
COMMENT ON COLUMN public.leads.hot_reason IS 'Block 22179: AI-generated explanation for why this lead is hot (e.g., "Homeowner requested timeline + insurance details within 3 minutes.")';
COMMENT ON COLUMN public.leads.hot_score IS 'Block 22179: Hot lead score (0-100). Higher = more urgent/higher intent. Calculated from intent keywords, urgency behavior, tone, insurance signals, etc.';

-- ============================================================================
-- 3. UPDATE ACTION QUEUE TASK TYPE TO INCLUDE call_now
-- ============================================================================
-- Ensure call_now is a valid task_type for hot leads

DO $$
BEGIN
  -- Check if call_now is already in the constraint
  IF EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu 
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'action_queue_tasks'
      AND tc.constraint_type = 'CHECK'
      AND tc.constraint_name = 'action_queue_tasks_task_type_check'
  ) THEN
    -- Drop and recreate constraint to include call_now
    ALTER TABLE public.action_queue_tasks
      DROP CONSTRAINT IF EXISTS action_queue_tasks_task_type_check;
    
    ALTER TABLE public.action_queue_tasks
      ADD CONSTRAINT action_queue_tasks_task_type_check 
      CHECK (task_type IN (
        -- Communication Tasks
        'call_homeowner',
        'call_now',  -- NEW: Hot lead immediate call task
        'follow_up_hot',
        'follow_up_warm',
        'soft_reengagement',
        'tone_reset',
        'photo_request',
        'insurance_questions',
        'timeline_questions',
        'homeowner_reply_needed',
        
        -- Proposal Tasks
        'send_proposal',
        'resend_proposal',
        'explain_proposal',
        'update_proposal',
        'proposal_overdue',
        
        -- Inspection Tasks
        'schedule_inspection',
        'confirm_inspection',
        'upload_inspection_report',
        
        -- Save Tasks
        'save_critical_risk_job',
        'job_save',
        'urgent_recovery_message',
        'call_required',
        
        -- AI-Driven Tasks
        'next_best_action',
        'ai_message_draft',
        'coaching_prompt',
        
        -- Stage Management
        'move_job_to_next_stage',
        'complete_inspection',
        'confirm_finished_work',
        
        -- Time-Based Tasks
        'overdue_follow_up',
        'reminder_trigger',
        'no_reply_48h',
        
        -- Legacy/Other
        'reply_to_angry_homeowner',
        'book_estimate',
        'review_stuck_job',
        'owner_review_high_value',
        'resurrection_follow_up'
      ));
  END IF;
END $$;

-- ============================================================================
-- 4. HELPER FUNCTION: Get transcript snapshot for a lead
-- ============================================================================
-- This function aggregates recent messages for AI analysis

CREATE OR REPLACE FUNCTION public.get_lead_transcript_snapshot(
  p_lead_id UUID,
  p_limit INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transcript JSONB;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'direction', direction,
        'body', body_text,
        'subject', subject,
        'created_at', created_at,
        'from_email', from_email,
        'from_name', from_name
      ) ORDER BY created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_transcript
  FROM (
    SELECT 
      'inbound' as direction,
      body_text,
      subject,
      created_at,
      from_email,
      from_name
    FROM public.inbox_messages
    WHERE lead_id = p_lead_id
      AND direction IN ('inbound', 'in')
    UNION ALL
    SELECT 
      'outbound' as direction,
      body_text,
      subject,
      created_at,
      NULL as from_email,
      NULL as from_name
    FROM public.messages
    WHERE lead_id = p_lead_id
      AND status = 'sent'
    ORDER BY created_at DESC
    LIMIT p_limit
  ) combined_messages;
  
  RETURN v_transcript;
END;
$$;

COMMENT ON FUNCTION public.get_lead_transcript_snapshot IS 'Block 22179: Returns recent message transcript for a lead for hot lead detection analysis';









































