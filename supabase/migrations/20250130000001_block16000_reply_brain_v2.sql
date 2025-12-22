-- =========================================================
-- Block 16000 — SmartSend AI Reply Brain v2
-- (Emotional Tone Detection, Question Extraction, Insurance Intent, 
--  Booking Intent, Objection Detection, & Next-Step Auto-Suggestions)
-- =========================================================

-- ============================================================================
-- 1. CREATE ENUM TYPES FOR NEW CLASSIFICATION SYSTEM
-- ============================================================================

-- 18 Reply Categories (v2 — Roofing Optimized)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reply_category_v2') THEN
    CREATE TYPE reply_category_v2 AS ENUM (
      -- 🔥 HOT LEADS
      'yes_wants_estimate',
      'yes_come_inspect',
      'booking_link_clicked',
      'insurance_claim_active',
      'adjuster_coming_soon',
      -- 🟡 WARM LEADS
      'has_question',
      'wants_pricing',
      'wants_availability',
      'wants_more_info',
      'needs_photos',
      'considering_not_sure',
      -- 🔵 COLD LEADS
      'not_now_maybe_later',
      'checking_around',
      'already_got_quotes',
      -- 🔴 HARD NO
      'not_interested',
      'wrong_person',
      'stop_messaging',
      -- ⚠ SPECIAL FLAGS
      'urgent_roof_damage'
    );
  END IF;
END$$;

-- Emotional Tone Detection
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'emotional_tone') THEN
    CREATE TYPE emotional_tone AS ENUM (
      'neutral',
      'curious',
      'confused',
      'annoyed',
      'interested',
      'excited',
      'urgent',
      'frustrated',
      'skeptical',
      'demanding'
    );
  END IF;
END$$;

-- Question Types
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'question_type') THEN
    CREATE TYPE question_type AS ENUM (
      'availability',
      'pricing',
      'inspection',
      'insurance',
      'process',
      'timeline',
      'warranty',
      'materials',
      'other'
    );
  END IF;
END$$;

-- Objection Types
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'objection_type') THEN
    CREATE TYPE objection_type AS ENUM (
      'price_too_high',
      'getting_other_quotes',
      'not_needed',
      'wrong_person',
      'timing',
      'competitor',
      'other'
    );
  END IF;
END$$;

-- ============================================================================
-- 2. CREATE REPLY_INTELLIGENCE_EVENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reply_intelligence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Foreign keys
  inbound_message_id uuid REFERENCES public.inbound_messages(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Core Classification
  category reply_category_v2 NOT NULL,
  confidence numeric(4,3) NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  
  -- Emotional Tone Detection
  emotional_tone emotional_tone,
  tone_confidence numeric(4,3) CHECK (tone_confidence >= 0.0 AND tone_confidence <= 1.0),
  
  -- Question Extraction
  extracted_questions jsonb DEFAULT '[]'::jsonb, -- Array of {question: string, type: question_type, confidence: number}
  
  -- Insurance Intent Recognition
  has_insurance_intent boolean DEFAULT false,
  insurance_keywords text[], -- Array of detected keywords
  insurance_confidence numeric(4,3) CHECK (insurance_confidence >= 0.0 AND insurance_confidence <= 1.0),
  
  -- Booking Intent Detection
  has_booking_intent boolean DEFAULT false,
  booking_confidence numeric(4,3) CHECK (booking_confidence >= 0.0 AND booking_confidence <= 1.0),
  
  -- Objection Detection
  has_objection boolean DEFAULT false,
  objection_type objection_type,
  objection_text text, -- The actual objection phrase
  
  -- Urgent Roof Damage Detection
  has_urgent_damage boolean DEFAULT false,
  damage_keywords text[], -- e.g., ["leaking", "water", "hole"]
  urgency_score numeric(4,3) CHECK (urgency_score >= 0.0 AND urgency_score <= 1.0),
  
  -- Auto-Suggestions
  suggested_actions jsonb DEFAULT '[]'::jsonb, -- Array of {action: string, priority: number, reasoning: string}
  suggested_reply_templates text[], -- Array of template IDs or names
  
  -- Pipeline Movement
  suggested_pipeline_stage text, -- HOT, WARM, COLD, NOT_INTERESTED
  pipeline_moved boolean DEFAULT false,
  previous_pipeline_stage text,
  
  -- Tags to add
  suggested_tags text[],
  
  -- Raw AI Response
  raw_ai_response jsonb,
  
  -- Model info
  model_version text DEFAULT 'gpt-4o-mini',
  processing_time_ms integer
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_reply_intelligence_events_inbound_message 
  ON public.reply_intelligence_events(inbound_message_id);
CREATE INDEX IF NOT EXISTS idx_reply_intelligence_events_contact 
  ON public.reply_intelligence_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_reply_intelligence_events_campaign 
  ON public.reply_intelligence_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_reply_intelligence_events_workspace_created 
  ON public.reply_intelligence_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reply_intelligence_events_category 
  ON public.reply_intelligence_events(category);
CREATE INDEX IF NOT EXISTS idx_reply_intelligence_events_insurance 
  ON public.reply_intelligence_events(has_insurance_intent) 
  WHERE has_insurance_intent = true;
CREATE INDEX IF NOT EXISTS idx_reply_intelligence_events_booking 
  ON public.reply_intelligence_events(has_booking_intent) 
  WHERE has_booking_intent = true;
CREATE INDEX IF NOT EXISTS idx_reply_intelligence_events_urgent 
  ON public.reply_intelligence_events(has_urgent_damage) 
  WHERE has_urgent_damage = true;

-- ============================================================================
-- 3. ADD ENHANCED FIELDS TO EXISTING TABLES
-- ============================================================================

-- Add intelligence fields to inbound_messages if they don't exist
DO $$
BEGIN
  -- Add emotional_tone
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'inbound_messages' 
    AND column_name = 'emotional_tone'
  ) THEN
    ALTER TABLE public.inbound_messages
      ADD COLUMN emotional_tone emotional_tone;
  END IF;
  
  -- Add has_insurance_intent
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'inbound_messages' 
    AND column_name = 'has_insurance_intent'
  ) THEN
    ALTER TABLE public.inbound_messages
      ADD COLUMN has_insurance_intent boolean DEFAULT false;
  END IF;
  
  -- Add has_booking_intent
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'inbound_messages' 
    AND column_name = 'has_booking_intent'
  ) THEN
    ALTER TABLE public.inbound_messages
      ADD COLUMN has_booking_intent boolean DEFAULT false;
  END IF;
  
  -- Add has_urgent_damage
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'inbound_messages' 
    AND column_name = 'has_urgent_damage'
  ) THEN
    ALTER TABLE public.inbound_messages
      ADD COLUMN has_urgent_damage boolean DEFAULT false;
  END IF;
  
  -- Add extracted_questions
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'inbound_messages' 
    AND column_name = 'extracted_questions'
  ) THEN
    ALTER TABLE public.inbound_messages
      ADD COLUMN extracted_questions jsonb DEFAULT '[]'::jsonb;
  END IF;
  
  -- Add suggested_actions
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'inbound_messages' 
    AND column_name = 'suggested_actions'
  ) THEN
    ALTER TABLE public.inbound_messages
      ADD COLUMN suggested_actions jsonb DEFAULT '[]'::jsonb;
  END IF;
END$$;

-- ============================================================================
-- 4. FUNCTION: AUTO PIPELINE MOVEMENT BASED ON CLASSIFICATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_move_pipeline_from_intelligence(
  p_contact_id uuid,
  p_category reply_category_v2,
  p_has_insurance_intent boolean DEFAULT false,
  p_has_booking_intent boolean DEFAULT false,
  p_has_urgent_damage boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_current_stage text;
  v_new_stage text;
  v_stage_id uuid;
BEGIN
  -- Get workspace_id from contact
  SELECT workspace_id INTO v_workspace_id
  FROM public.contacts
  WHERE id = p_contact_id;
  
  IF v_workspace_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Get current pipeline stage
  SELECT pipeline_stage_id INTO v_stage_id
  FROM public.contacts
  WHERE id = p_contact_id;
  
  -- Determine new pipeline stage based on category
  CASE p_category
    -- 🔥 HOT LEADS → Move to HOT
    WHEN 'yes_wants_estimate' THEN
      v_new_stage := 'hot';
    WHEN 'yes_come_inspect' THEN
      v_new_stage := 'hot';
    WHEN 'booking_link_clicked' THEN
      v_new_stage := 'hot';
    WHEN 'insurance_claim_active' THEN
      v_new_stage := 'hot';
    WHEN 'adjuster_coming_soon' THEN
      v_new_stage := 'hot';
    WHEN 'urgent_roof_damage' THEN
      v_new_stage := 'hot';
    
    -- 🟡 WARM LEADS → Move to WARM
    WHEN 'has_question' THEN
      v_new_stage := 'warm';
    WHEN 'wants_pricing' THEN
      v_new_stage := 'warm';
    WHEN 'wants_availability' THEN
      v_new_stage := 'warm';
    WHEN 'wants_more_info' THEN
      v_new_stage := 'warm';
    WHEN 'needs_photos' THEN
      v_new_stage := 'warm';
    WHEN 'considering_not_sure' THEN
      v_new_stage := 'warm';
    
    -- 🔵 COLD LEADS → Move to COLD
    WHEN 'not_now_maybe_later' THEN
      v_new_stage := 'cold';
    WHEN 'checking_around' THEN
      v_new_stage := 'cold';
    WHEN 'already_got_quotes' THEN
      v_new_stage := 'cold';
    
    -- 🔴 HARD NO → Move to NOT_INTERESTED
    WHEN 'not_interested' THEN
      v_new_stage := 'lost';
    WHEN 'wrong_person' THEN
      v_new_stage := 'lost';
    WHEN 'stop_messaging' THEN
      v_new_stage := 'lost';
    
    ELSE
      v_new_stage := NULL;
  END CASE;
  
  -- Override with insurance/booking/urgent flags
  IF p_has_insurance_intent OR p_has_booking_intent OR p_has_urgent_damage THEN
    v_new_stage := 'hot';
  END IF;
  
  -- Find pipeline_stage_id by key
  IF v_new_stage IS NOT NULL THEN
    SELECT id INTO v_stage_id
    FROM public.pipeline_stages
    WHERE workspace_id = v_workspace_id
      AND key = v_new_stage
    LIMIT 1;
    
    -- Update contact pipeline stage
    IF v_stage_id IS NOT NULL THEN
      UPDATE public.contacts
      SET pipeline_stage_id = v_stage_id,
          updated_at = now()
      WHERE id = p_contact_id;
      
      -- Also update lead_status for compatibility
      CASE v_new_stage
        WHEN 'hot' THEN
          UPDATE public.contacts SET lead_status = 'hot' WHERE id = p_contact_id;
        WHEN 'warm' THEN
          UPDATE public.contacts SET lead_status = 'warm' WHERE id = p_contact_id;
        WHEN 'cold' THEN
          UPDATE public.contacts SET lead_status = 'cold' WHERE id = p_contact_id;
        WHEN 'lost' THEN
          UPDATE public.contacts SET lead_status = 'not_interested' WHERE id = p_contact_id;
      END CASE;
    END IF;
  END IF;
  
  RETURN v_new_stage;
END;
$$;

-- ============================================================================
-- 5. FUNCTION: AUTO TAG CONTACTS BASED ON INTELLIGENCE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_tag_from_intelligence(
  p_contact_id uuid,
  p_has_insurance_intent boolean DEFAULT false,
  p_has_booking_intent boolean DEFAULT false,
  p_has_urgent_damage boolean DEFAULT false,
  p_suggested_tags text[] DEFAULT ARRAY[]::text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tags_to_add text[];
BEGIN
  v_tags_to_add := p_suggested_tags;
  
  -- Add insurance tag
  IF p_has_insurance_intent THEN
    v_tags_to_add := array_append(v_tags_to_add, 'insurance-opportunity');
  END IF;
  
  -- Add booking tag
  IF p_has_booking_intent THEN
    v_tags_to_add := array_append(v_tags_to_add, 'ready-to-book');
  END IF;
  
  -- Add urgent tag
  IF p_has_urgent_damage THEN
    v_tags_to_add := array_append(v_tags_to_add, 'urgent-damage');
  END IF;
  
  -- Update contact tags (assuming contacts table has tags column)
  IF array_length(v_tags_to_add, 1) > 0 THEN
    UPDATE public.contacts
    SET tags = COALESCE(tags, ARRAY[]::text[]) || v_tags_to_add,
        updated_at = now()
    WHERE id = p_contact_id
      AND NOT (tags && v_tags_to_add); -- Only add if not already present
  END IF;
END;
$$;

-- ============================================================================
-- 6. FUNCTION: PROCESS REPLY INTELLIGENCE EVENT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_reply_intelligence_event(
  p_event_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event RECORD;
BEGIN
  -- Get the intelligence event
  SELECT * INTO v_event
  FROM public.reply_intelligence_events
  WHERE id = p_event_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Auto move pipeline
  PERFORM public.auto_move_pipeline_from_intelligence(
    v_event.contact_id,
    v_event.category,
    v_event.has_insurance_intent,
    v_event.has_booking_intent,
    v_event.has_urgent_damage
  );
  
  -- Auto tag contact
  PERFORM public.auto_tag_from_intelligence(
    v_event.contact_id,
    v_event.has_insurance_intent,
    v_event.has_booking_intent,
    v_event.has_urgent_damage,
    v_event.suggested_tags
  );
  
  -- Mark as processed
  UPDATE public.reply_intelligence_events
  SET pipeline_moved = true
  WHERE id = p_event_id;
END;
$$;

-- ============================================================================
-- 7. TRIGGER: AUTO-PROCESS INTELLIGENCE EVENTS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_process_reply_intelligence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Auto-process the event
  PERFORM public.process_reply_intelligence_event(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_process_reply_intelligence ON public.reply_intelligence_events;
CREATE TRIGGER trg_process_reply_intelligence
  AFTER INSERT ON public.reply_intelligence_events
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_process_reply_intelligence();

-- ============================================================================
-- 8. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.reply_intelligence_events IS 'Comprehensive intelligence data for each homeowner reply - emotional tone, questions, insurance intent, booking intent, objections, and auto-suggestions';
COMMENT ON COLUMN public.reply_intelligence_events.category IS '18-category classification system optimized for roofing leads';
COMMENT ON COLUMN public.reply_intelligence_events.emotional_tone IS 'Detected emotional tone of the homeowner reply';
COMMENT ON COLUMN public.reply_intelligence_events.extracted_questions IS 'Array of questions extracted from the reply with types and confidence scores';
COMMENT ON COLUMN public.reply_intelligence_events.has_insurance_intent IS 'True if homeowner mentions insurance claim, adjuster, deductible, etc.';
COMMENT ON COLUMN public.reply_intelligence_events.has_booking_intent IS 'True if homeowner wants to schedule inspection or appointment';
COMMENT ON COLUMN public.reply_intelligence_events.has_urgent_damage IS 'True if urgent roof damage detected (leaking, water, hole, etc.)';
COMMENT ON COLUMN public.reply_intelligence_events.suggested_actions IS 'AI-generated suggestions for next steps (e.g., "Offer inspection availability tomorrow")';
COMMENT ON FUNCTION public.auto_move_pipeline_from_intelligence IS 'Automatically moves contact to appropriate pipeline stage based on reply classification';
COMMENT ON FUNCTION public.auto_tag_from_intelligence IS 'Automatically adds relevant tags to contact based on intelligence data';





















































