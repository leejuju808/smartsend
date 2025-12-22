-- =========================================================
-- Block 35333 — SmartSend Roofing "Reactivation Engine + Dead Lead Revival System" v1
-- (Revive old leads automatically • Detect homeowner re-interest • Send personalized revival messages • Turn dead pipelines into booked estimates)
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE REVIVAL SYSTEM TABLES
-- ============================================================================

-- TABLE: lead_status_history
-- Tracks all status changes for leads
CREATE TABLE IF NOT EXISTS public.lead_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  reason text,
  triggered_by text DEFAULT 'system', -- 'system', 'user', 'ai', 'storm', 'behavior'
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_status_history_lead_id ON public.lead_status_history (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_status_history_workspace_id ON public.lead_status_history (workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_status_history_new_status ON public.lead_status_history (new_status);
CREATE INDEX IF NOT EXISTS idx_lead_status_history_created_at ON public.lead_status_history (created_at);

-- TABLE: revival_events
-- Tracks all events that trigger revival attempts
CREATE TABLE IF NOT EXISTS public.revival_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  trigger_type text NOT NULL CHECK (trigger_type IN (
    'no_response',
    'storm',
    'proposal_view',
    'financing_click',
    'behavior_detected',
    'proposal_expired',
    'appointment_no_show',
    'proposal_not_signed',
    'insurance_delay'
  )),
  details jsonb DEFAULT '{}'::jsonb,
  processed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revival_events_lead_id ON public.revival_events (lead_id);
CREATE INDEX IF NOT EXISTS idx_revival_events_workspace_id ON public.revival_events (workspace_id);
CREATE INDEX IF NOT EXISTS idx_revival_events_trigger_type ON public.revival_events (trigger_type);
CREATE INDEX IF NOT EXISTS idx_revival_events_processed ON public.revival_events (processed);
CREATE INDEX IF NOT EXISTS idx_revival_events_created_at ON public.revival_events (created_at);

-- TABLE: revival_sequences
-- Stores all revival messages sent to leads
CREATE TABLE IF NOT EXISTS public.revival_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  sequence_level int NOT NULL CHECK (sequence_level BETWEEN 1 AND 4),
  message text NOT NULL,
  channel text NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms', 'email')),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('scheduled', 'sent', 'delivered', 'failed', 'replied')),
  sent_at timestamptz,
  delivered_at timestamptz,
  replied_at timestamptz,
  external_message_id text,
  revival_event_id uuid REFERENCES public.revival_events(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revival_sequences_lead_id ON public.revival_sequences (lead_id);
CREATE INDEX IF NOT EXISTS idx_revival_sequences_workspace_id ON public.revival_sequences (workspace_id);
CREATE INDEX IF NOT EXISTS idx_revival_sequences_sequence_level ON public.revival_sequences (sequence_level);
CREATE INDEX IF NOT EXISTS idx_revival_sequences_status ON public.revival_sequences (status);
CREATE INDEX IF NOT EXISTS idx_revival_sequences_sent_at ON public.revival_sequences (sent_at);

-- ============================================================================
-- PART 2 — EXTEND LEADS TABLE WITH DEAD LEAD TRACKING
-- ============================================================================

-- Add status column if it doesn't exist (extend existing status)
DO $$
BEGIN
  -- Ensure status column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'status'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN status text DEFAULT 'new';
  END IF;

  -- Extend status to include 'dead' and 'revived'
  -- We'll update the check constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'leads_status_check'
  ) THEN
    ALTER TABLE public.leads DROP CONSTRAINT leads_status_check;
  END IF;
END $$;

-- Add last_activity_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'last_activity_at'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN last_activity_at timestamptz;
  END IF;
END $$;

-- Add revival_score column (0-100) for prioritization
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'revival_score'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN revival_score integer DEFAULT 0 CHECK (revival_score >= 0 AND revival_score <= 100);
  END IF;
END $$;

-- Add address fields for storm detection if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'address'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN address text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'city'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN city text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'state'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN state text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'zip_code'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN zip_code text;
  END IF;
END $$;

-- Add proposal tracking fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'proposal_amount'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN proposal_amount numeric(12,2);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'proposal_sent_at'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN proposal_sent_at timestamptz;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'proposal_viewed_at'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN proposal_viewed_at timestamptz;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'appointment_booked_at'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN appointment_booked_at timestamptz;
  END IF;
END $$;

-- ============================================================================
-- PART 3 — CREATE HELPER FUNCTIONS
-- ============================================================================

-- Function to detect dead leads (no activity for 30+ days)
CREATE OR REPLACE FUNCTION public.detect_dead_leads()
RETURNS TABLE (
  lead_id uuid,
  workspace_id uuid,
  current_status text,
  last_activity timestamptz,
  days_inactive integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cutoff_date timestamptz;
BEGIN
  cutoff_date := now() - INTERVAL '30 days';
  
  RETURN QUERY
  SELECT 
    l.id,
    l.workspace_id,
    COALESCE(l.status, 'new')::text,
    COALESCE(l.last_activity_at, l.updated_at, l.created_at) as last_activity,
    EXTRACT(EPOCH FROM (now() - COALESCE(l.last_activity_at, l.updated_at, l.created_at)))::integer / 86400 as days_inactive
  FROM public.leads l
  WHERE l.status NOT IN ('won', 'dead', 'revived')
    AND COALESCE(l.last_activity_at, l.updated_at, l.created_at) < cutoff_date
    AND l.workspace_id IS NOT NULL;
END;
$$;

-- Function to calculate revival score for a lead
CREATE OR REPLACE FUNCTION public.calculate_revival_score(p_lead_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score integer := 0;
  v_lead RECORD;
  v_days_inactive integer;
  v_has_proposal boolean;
  v_proposal_age integer;
  v_has_appointment boolean;
BEGIN
  SELECT 
    l.*,
    COALESCE(l.last_activity_at, l.updated_at, l.created_at) as last_activity,
    l.proposal_sent_at IS NOT NULL as has_proposal,
    CASE 
      WHEN l.proposal_sent_at IS NOT NULL 
      THEN EXTRACT(EPOCH FROM (now() - l.proposal_sent_at))::integer / 86400
      ELSE NULL
    END as proposal_age_days,
    l.appointment_booked_at IS NOT NULL as had_appointment
  INTO v_lead
  FROM public.leads l
  WHERE l.id = p_lead_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  v_days_inactive := EXTRACT(EPOCH FROM (now() - v_lead.last_activity))::integer / 86400;
  
  -- Base score decreases with inactivity (max 30 points)
  IF v_days_inactive BETWEEN 30 AND 60 THEN
    v_score := v_score + 30;
  ELSIF v_days_inactive BETWEEN 61 AND 90 THEN
    v_score := v_score + 25;
  ELSIF v_days_inactive BETWEEN 91 AND 180 THEN
    v_score := v_score + 20;
  ELSE
    v_score := v_score + 15;
  END IF;
  
  -- Proposal exists (max 30 points)
  IF v_lead.has_proposal THEN
    v_score := v_score + 30;
    
    -- Proposal viewed but not signed (max 15 points)
    IF v_lead.proposal_viewed_at IS NOT NULL AND v_lead.proposal_viewed_at > v_lead.proposal_sent_at THEN
      v_score := v_score + 15;
    END IF;
    
    -- Proposal age matters (newer = better)
    IF v_lead.proposal_age_days BETWEEN 60 AND 90 THEN
      v_score := v_score + 10;
    ELSIF v_lead.proposal_age_days BETWEEN 91 AND 180 THEN
      v_score := v_score + 5;
    END IF;
  END IF;
  
  -- Had appointment (max 15 points)
  IF v_lead.had_appointment THEN
    v_score := v_score + 15;
  END IF;
  
  -- Proposal amount matters (higher = better, max 10 points)
  IF v_lead.proposal_amount IS NOT NULL AND v_lead.proposal_amount > 10000 THEN
    v_score := v_score + 10;
  ELSIF v_lead.proposal_amount IS NOT NULL AND v_lead.proposal_amount > 5000 THEN
    v_score := v_score + 5;
  END IF;
  
  -- Cap at 100
  IF v_score > 100 THEN
    v_score := 100;
  END IF;
  
  RETURN v_score;
END;
$$;

-- Function to mark lead as dead
CREATE OR REPLACE FUNCTION public.mark_lead_dead(
  p_lead_id uuid,
  p_reason text DEFAULT 'no_activity'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_status text;
  v_workspace_id uuid;
BEGIN
  SELECT status, workspace_id INTO v_old_status, v_workspace_id
  FROM public.leads
  WHERE id = p_lead_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;
  
  -- Update lead status
  UPDATE public.leads
  SET status = 'dead',
      updated_at = now()
  WHERE id = p_lead_id;
  
  -- Log status change
  INSERT INTO public.lead_status_history (
    lead_id,
    workspace_id,
    old_status,
    new_status,
    reason,
    triggered_by
  ) VALUES (
    p_lead_id,
    v_workspace_id,
    v_old_status,
    'dead',
    p_reason,
    'system'
  );
  
  -- Create revival event
  INSERT INTO public.revival_events (
    lead_id,
    workspace_id,
    trigger_type,
    details
  ) VALUES (
    p_lead_id,
    v_workspace_id,
    'no_response',
    jsonb_build_object('reason', p_reason, 'old_status', v_old_status)
  );
END;
$$;

-- Function to revive a lead
CREATE OR REPLACE FUNCTION public.revive_lead(
  p_lead_id uuid,
  p_trigger_type text DEFAULT 'behavior_detected'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.leads
  WHERE id = p_lead_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;
  
  -- Update lead status
  UPDATE public.leads
  SET status = 'revived',
      last_activity_at = now(),
      updated_at = now(),
      revival_score = public.calculate_revival_score(p_lead_id)
  WHERE id = p_lead_id;
  
  -- Log status change
  INSERT INTO public.lead_status_history (
    lead_id,
    workspace_id,
    old_status,
    new_status,
    reason,
    triggered_by
  ) VALUES (
    p_lead_id,
    v_workspace_id,
    'dead',
    'revived',
    'Revived by ' || p_trigger_type,
    'system'
  );
  
  -- Create revival event
  INSERT INTO public.revival_events (
    lead_id,
    workspace_id,
    trigger_type,
    details,
    processed
  ) VALUES (
    p_lead_id,
    v_workspace_id,
    p_trigger_type,
    jsonb_build_object('revived_at', now()),
    true
  );
END;
$$;

-- ============================================================================
-- PART 4 — CREATE VIEWS FOR DASHBOARD
-- ============================================================================

-- View for revival metrics
CREATE OR REPLACE VIEW public.revival_metrics AS
SELECT 
  workspace_id,
  COUNT(*) FILTER (WHERE status = 'dead') as dead_leads_count,
  COUNT(*) FILTER (WHERE status = 'revived') as revived_leads_count,
  COUNT(*) FILTER (WHERE status = 'revived' AND updated_at >= date_trunc('month', now())) as revived_this_month,
  COUNT(*) FILTER (WHERE revival_score >= 60) as high_potential_leads,
  COUNT(DISTINCT rs.lead_id) FILTER (WHERE rs.created_at >= date_trunc('month', now())) as revival_messages_sent_this_month,
  COUNT(DISTINCT rs.lead_id) FILTER (WHERE rs.status = 'replied' AND rs.created_at >= date_trunc('month', now())) as revival_replies_this_month
FROM public.leads l
LEFT JOIN public.revival_sequences rs ON rs.lead_id = l.id
GROUP BY workspace_id;

-- View for dead leads with details
CREATE OR REPLACE VIEW public.dead_leads_view AS
SELECT 
  l.id,
  l.workspace_id,
  l.name,
  l.email,
  l.phone,
  l.address,
  l.city,
  l.state,
  l.zip_code,
  l.status,
  l.proposal_amount,
  l.proposal_sent_at,
  l.proposal_viewed_at,
  l.appointment_booked_at,
  l.revival_score,
  COALESCE(l.last_activity_at, l.updated_at, l.created_at) as last_activity_at,
  EXTRACT(EPOCH FROM (now() - COALESCE(l.last_activity_at, l.updated_at, l.created_at)))::integer / 86400 as days_inactive,
  COUNT(rs.id) FILTER (WHERE rs.status = 'sent') as revival_messages_sent,
  MAX(rs.sent_at) as last_revival_message_at
FROM public.leads l
LEFT JOIN public.revival_sequences rs ON rs.lead_id = l.id
WHERE l.status = 'dead'
GROUP BY l.id, l.workspace_id, l.name, l.email, l.phone, l.address, l.city, l.state, l.zip_code,
         l.status, l.proposal_amount, l.proposal_sent_at, l.proposal_viewed_at, l.appointment_booked_at,
         l.revival_score, l.last_activity_at, l.updated_at, l.created_at;

-- ============================================================================
-- PART 5 — RLS POLICIES
-- ============================================================================

ALTER TABLE public.lead_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revival_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revival_sequences ENABLE ROW LEVEL SECURITY;

-- Lead status history policies
CREATE POLICY "Users can view lead status history for their workspace"
  ON public.lead_status_history FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Revival events policies
CREATE POLICY "Users can view revival events for their workspace"
  ON public.revival_events FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Revival sequences policies
CREATE POLICY "Users can view revival sequences for their workspace"
  ON public.revival_sequences FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert revival sequences for their workspace"
  ON public.revival_sequences FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update revival sequences for their workspace"
  ON public.revival_sequences FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );
































