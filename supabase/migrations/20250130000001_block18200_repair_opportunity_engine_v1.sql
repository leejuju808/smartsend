-- =========================================================
-- Block 18200 — SmartSend Repair Opportunity Engine v1
-- (The "Hidden Money Finder": Leak Detection, Small Repair Upsells, Emergency Response Logic & High-Margin Repair Pipeline)
-- =========================================================

-- ============================================================================
-- 1. CREATE REPAIR PIPELINE STAGES
-- ============================================================================

-- Add repair pipeline stages to existing workspaces
DO $$
DECLARE
  v_workspace_id uuid;
  v_max_position integer;
BEGIN
  FOR v_workspace_id IN SELECT id FROM public.workspaces LOOP
    -- Get max position for this workspace
    SELECT COALESCE(MAX(position), 0) INTO v_max_position
    FROM public.pipeline_stages
    WHERE workspace_id = v_workspace_id;
    
    -- Insert repair pipeline stages
    INSERT INTO public.pipeline_stages (workspace_id, key, label, position) VALUES
      (v_workspace_id, 'repair_new_issue', 'Repair — New Issue', v_max_position + 1),
      (v_workspace_id, 'repair_scheduled', 'Repair — Scheduled', v_max_position + 2),
      (v_workspace_id, 'repair_completed', 'Repair — Completed', v_max_position + 3)
    ON CONFLICT (workspace_id, key) DO UPDATE SET
      label = EXCLUDED.label,
      position = EXCLUDED.position;
  END LOOP;
END $$;

-- ============================================================================
-- 2. CREATE repair_intelligence TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.repair_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Repair Detection
  repair_type text NOT NULL CHECK (repair_type IN (
    'leak', 'shingle_repair', 'skylight_fix', 'gutter_repair', 
    'pipe_boot_failure', 'flashing_issue', 'wind_damage', 
    'emergency_repair', 'general_repair', 'unknown'
  )),
  detected_at timestamptz NOT NULL DEFAULT now(),
  detection_source text NOT NULL CHECK (detection_source IN (
    'message', 'photo', 'insurance_document', 'storm_intel', 'homeowner_language', 'manual'
  )),
  
  -- Urgency & Priority
  urgency_level text NOT NULL CHECK (urgency_level IN ('emergency', 'immediate', 'routine', 'low', 'uncertain')) DEFAULT 'uncertain',
  repair_score integer NOT NULL DEFAULT 0 CHECK (repair_score >= 0 AND repair_score <= 100),
  
  -- Evidence & Context
  photo_evidence_urls jsonb DEFAULT '[]'::jsonb,
  message_snippets jsonb DEFAULT '[]'::jsonb,
  detected_keywords jsonb DEFAULT '[]'::jsonb,
  
  -- Storm Connection
  storm_connected boolean DEFAULT false,
  storm_event_id uuid REFERENCES public.contact_storm_impacts(id) ON DELETE SET NULL,
  wind_speed_mph integer,
  
  -- Insurance Connection
  insurance_connected boolean DEFAULT false,
  insurance_metadata_id uuid REFERENCES public.insurance_metadata(id) ON DELETE SET NULL,
  
  -- Repair Details
  water_intrusion boolean DEFAULT false,
  homeowner_frustration_level text CHECK (homeowner_frustration_level IN ('high', 'medium', 'low', 'none')),
  roof_age_years integer,
  
  -- Recommended Actions
  recommended_repair_actions jsonb DEFAULT '[]'::jsonb,
  estimated_cost_range jsonb DEFAULT '{"min": null, "max": null}'::jsonb,
  
  -- Upsell Opportunities
  replacement_recommended boolean DEFAULT false,
  replacement_reason text,
  upsell_opportunities jsonb DEFAULT '[]'::jsonb,
  
  -- Status
  status text NOT NULL CHECK (status IN ('detected', 'scheduled', 'in_progress', 'completed', 'cancelled')) DEFAULT 'detected',
  pipeline_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_repair_intelligence_contact ON public.repair_intelligence(contact_id);
CREATE INDEX IF NOT EXISTS idx_repair_intelligence_workspace ON public.repair_intelligence(workspace_id);
CREATE INDEX IF NOT EXISTS idx_repair_intelligence_status ON public.repair_intelligence(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_repair_intelligence_urgency ON public.repair_intelligence(workspace_id, urgency_level, repair_score DESC);
CREATE INDEX IF NOT EXISTS idx_repair_intelligence_type ON public.repair_intelligence(repair_type);
CREATE INDEX IF NOT EXISTS idx_repair_intelligence_storm ON public.repair_intelligence(storm_connected, storm_event_id) WHERE storm_connected = true;
CREATE INDEX IF NOT EXISTS idx_repair_intelligence_insurance ON public.repair_intelligence(insurance_connected, insurance_metadata_id) WHERE insurance_connected = true;
CREATE INDEX IF NOT EXISTS idx_repair_intelligence_detected_at ON public.repair_intelligence(detected_at DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_repair_intelligence_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_repair_intelligence_updated_at ON public.repair_intelligence;
CREATE TRIGGER trg_repair_intelligence_updated_at
  BEFORE UPDATE ON public.repair_intelligence
  FOR EACH ROW
  EXECUTE FUNCTION public.set_repair_intelligence_updated_at();

-- ============================================================================
-- 3. CREATE repair_scores TABLE (Score History & Breakdown)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.repair_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_intelligence_id uuid NOT NULL REFERENCES public.repair_intelligence(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Overall Score (0-100)
  repair_score integer NOT NULL CHECK (repair_score >= 0 AND repair_score <= 100),
  
  -- Score Components (for transparency)
  urgency_score integer DEFAULT 0 CHECK (urgency_score >= 0 AND urgency_score <= 30),
  water_intrusion_score integer DEFAULT 0 CHECK (water_intrusion_score >= 0 AND water_intrusion_score <= 25),
  storm_source_score integer DEFAULT 0 CHECK (storm_source_score >= 0 AND storm_source_score <= 20),
  homeowner_frustration_score integer DEFAULT 0 CHECK (homeowner_frustration_score >= 0 AND homeowner_frustration_score <= 15),
  photo_evidence_score integer DEFAULT 0 CHECK (photo_evidence_score >= 0 AND photo_evidence_score <= 10),
  insurance_involvement_score integer DEFAULT 0 CHECK (insurance_involvement_score >= 0 AND insurance_involvement_score <= 10),
  roof_age_score integer DEFAULT 0 CHECK (roof_age_score >= 0 AND roof_age_score <= 10),
  neighborhood_patterns_score integer DEFAULT 0 CHECK (neighborhood_patterns_score >= 0 AND neighborhood_patterns_score <= 10),
  
  -- Score Band
  score_band text NOT NULL CHECK (score_band IN ('emergency', 'immediate', 'routine', 'low', 'uncertain')),
  
  -- Metadata
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_repair_scores_repair_intelligence ON public.repair_scores(repair_intelligence_id);
CREATE INDEX IF NOT EXISTS idx_repair_scores_contact ON public.repair_scores(contact_id);
CREATE INDEX IF NOT EXISTS idx_repair_scores_workspace ON public.repair_scores(workspace_id);
CREATE INDEX IF NOT EXISTS idx_repair_scores_score ON public.repair_scores(workspace_id, repair_score DESC);
CREATE INDEX IF NOT EXISTS idx_repair_scores_band ON public.repair_scores(workspace_id, score_band);

-- ============================================================================
-- 4. CREATE repair_events TABLE (Timeline & Activity Tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.repair_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_intelligence_id uuid NOT NULL REFERENCES public.repair_intelligence(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Event Details
  event_type text NOT NULL CHECK (event_type IN (
    'detected', 'scored', 'task_created', 'sequence_started', 
    'appointment_suggested', 'appointment_booked', 'scheduled', 
    'in_progress', 'completed', 'cancelled', 'upsell_recommended',
    'replacement_suggested', 'status_changed'
  )),
  event_description text,
  
  -- Related Entities
  task_id uuid REFERENCES public.smartsend_tasks(id) ON DELETE SET NULL,
  sequence_id uuid,
  appointment_id uuid,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_repair_events_repair_intelligence ON public.repair_events(repair_intelligence_id);
CREATE INDEX IF NOT EXISTS idx_repair_events_contact ON public.repair_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_repair_events_workspace ON public.repair_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_repair_events_type ON public.repair_events(workspace_id, event_type);
CREATE INDEX IF NOT EXISTS idx_repair_events_created_at ON public.repair_events(created_at DESC);

-- ============================================================================
-- 5. ADD REPAIR COLUMNS TO CONTACTS TABLE
-- ============================================================================

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS repair_opportunity_detected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS repair_score integer CHECK (repair_score >= 0 AND repair_score <= 100),
  ADD COLUMN IF NOT EXISTS repair_urgency_level text CHECK (repair_urgency_level IN ('emergency', 'immediate', 'routine', 'low', 'uncertain')),
  ADD COLUMN IF NOT EXISTS latest_repair_intelligence_id uuid REFERENCES public.repair_intelligence(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS repair_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repair_completed_count integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_contacts_repair_opportunity ON public.contacts(workspace_id, repair_opportunity_detected) WHERE repair_opportunity_detected = true;
CREATE INDEX IF NOT EXISTS idx_contacts_repair_score ON public.contacts(workspace_id, repair_score DESC) WHERE repair_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_repair_urgency ON public.contacts(workspace_id, repair_urgency_level) WHERE repair_urgency_level IS NOT NULL;

-- ============================================================================
-- 6. REPAIR DETECTION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_repair_opportunity(
  p_contact_id uuid,
  p_message_text text DEFAULT NULL,
  p_detection_source text DEFAULT 'message',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_record public.contacts%ROWTYPE;
  v_workspace_id uuid;
  v_repair_intelligence_id uuid;
  v_repair_type text := 'unknown';
  v_detected_keywords jsonb := '[]'::jsonb;
  v_keyword text;
  v_message_lower text;
BEGIN
  -- Get contact record
  SELECT * INTO v_contact_record
  FROM public.contacts
  WHERE id = p_contact_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact not found: %', p_contact_id;
  END IF;
  
  v_workspace_id := v_contact_record.workspace_id;
  
  -- Normalize message text
  IF p_message_text IS NOT NULL THEN
    v_message_lower := lower(p_message_text);
    
    -- Detect repair keywords
    -- Leak keywords
    IF v_message_lower ~* '(leaking|leak|water stain|dripping|water damage|wet|moisture)' THEN
      v_repair_type := 'leak';
      v_detected_keywords := v_detected_keywords || '["leak", "water"]'::jsonb;
    END IF;
    
    -- Shingle repair keywords
    IF v_message_lower ~* '(missing shingles|loose shingles|shingle repair|shingle fix|shingle damage|torn shingles)' THEN
      IF v_repair_type = 'unknown' THEN
        v_repair_type := 'shingle_repair';
      END IF;
      v_detected_keywords := v_detected_keywords || '["shingle"]'::jsonb;
    END IF;
    
    -- Skylight keywords
    IF v_message_lower ~* '(skylight leak|skylight repair|skylight fix|skylight issue)' THEN
      v_repair_type := 'skylight_fix';
      v_detected_keywords := v_detected_keywords || '["skylight"]'::jsonb;
    END IF;
    
    -- Gutter keywords
    IF v_message_lower ~* '(gutter leak|gutter repair|gutter fix|gutter issue|clogged gutter)' THEN
      IF v_repair_type = 'unknown' THEN
        v_repair_type := 'gutter_repair';
      END IF;
      v_detected_keywords := v_detected_keywords || '["gutter"]'::jsonb;
    END IF;
    
    -- Pipe boot keywords
    IF v_message_lower ~* '(pipe boot|vent boot|cracked boot|pipe leak)' THEN
      v_repair_type := 'pipe_boot_failure';
      v_detected_keywords := v_detected_keywords || '["pipe", "boot"]'::jsonb;
    END IF;
    
    -- Flashing keywords
    IF v_message_lower ~* '(flashing issue|flashing repair|loose flashing|damaged flashing)' THEN
      IF v_repair_type = 'unknown' THEN
        v_repair_type := 'flashing_issue';
      END IF;
      v_detected_keywords := v_detected_keywords || '["flashing"]'::jsonb;
    END IF;
    
    -- Wind damage keywords
    IF v_message_lower ~* '(wind damage|wind blown|wind lift|loose from wind)' THEN
      IF v_repair_type = 'unknown' THEN
        v_repair_type := 'wind_damage';
      END IF;
      v_detected_keywords := v_detected_keywords || '["wind"]'::jsonb;
    END IF;
    
    -- Emergency keywords
    IF v_message_lower ~* '(emergency|urgent|asap|today|immediately|right away|now)' THEN
      IF v_repair_type = 'unknown' THEN
        v_repair_type := 'emergency_repair';
      END IF;
      v_detected_keywords := v_detected_keywords || '["emergency", "urgent"]'::jsonb;
    END IF;
    
    -- General repair keywords
    IF v_message_lower ~* '(small fix|quick repair|minor repair|small repair|patch)' THEN
      IF v_repair_type = 'unknown' THEN
        v_repair_type := 'general_repair';
      END IF;
      v_detected_keywords := v_detected_keywords || '["repair", "fix"]'::jsonb;
    END IF;
  END IF;
  
  -- Only create if we detected something
  IF v_repair_type != 'unknown' OR jsonb_array_length(v_detected_keywords) > 0 THEN
    -- Create repair intelligence record
    INSERT INTO public.repair_intelligence (
      contact_id,
      workspace_id,
      repair_type,
      detected_at,
      detection_source,
      detected_keywords,
      message_snippets,
      metadata
    ) VALUES (
      p_contact_id,
      v_workspace_id,
      v_repair_type,
      now(),
      p_detection_source,
      v_detected_keywords,
      CASE WHEN p_message_text IS NOT NULL THEN jsonb_build_array(p_message_text) ELSE '[]'::jsonb END,
      p_metadata
    )
    RETURNING id INTO v_repair_intelligence_id;
    
    -- Update contact
    UPDATE public.contacts
    SET 
      repair_opportunity_detected = true,
      latest_repair_intelligence_id = v_repair_intelligence_id,
      repair_count = COALESCE(repair_count, 0) + 1
    WHERE id = p_contact_id;
    
    -- Calculate repair score
    PERFORM public.calculate_repair_score(v_repair_intelligence_id);
    
    -- Log event
    INSERT INTO public.repair_events (
      repair_intelligence_id,
      contact_id,
      workspace_id,
      event_type,
      event_description,
      metadata
    ) VALUES (
      v_repair_intelligence_id,
      p_contact_id,
      v_workspace_id,
      'detected',
      format('Repair opportunity detected: %s', v_repair_type),
      jsonb_build_object('detection_source', p_detection_source, 'keywords', v_detected_keywords)
    );
    
    RETURN v_repair_intelligence_id;
  END IF;
  
  RETURN NULL;
END;
$$;

-- ============================================================================
-- 7. REPAIR SCORING FUNCTION (0-100)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_repair_score(
  p_repair_intelligence_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_repair_record public.repair_intelligence%ROWTYPE;
  v_contact_record public.contacts%ROWTYPE;
  v_score integer := 0;
  v_urgency_score integer := 0;
  v_water_intrusion_score integer := 0;
  v_storm_source_score integer := 0;
  v_homeowner_frustration_score integer := 0;
  v_photo_evidence_score integer := 0;
  v_insurance_involvement_score integer := 0;
  v_roof_age_score integer := 0;
  v_neighborhood_patterns_score integer := 0;
  v_score_band text;
  v_storm_impact RECORD;
  v_insurance_meta RECORD;
BEGIN
  -- Get repair intelligence record
  SELECT * INTO v_repair_record
  FROM public.repair_intelligence
  WHERE id = p_repair_intelligence_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Get contact record
  SELECT * INTO v_contact_record
  FROM public.contacts
  WHERE id = v_repair_record.contact_id;
  
  -- 1. Urgency Score (0-30)
  IF v_repair_record.urgency_level = 'emergency' THEN
    v_urgency_score := 30;
  ELSIF v_repair_record.urgency_level = 'immediate' THEN
    v_urgency_score := 20;
  ELSIF v_repair_record.urgency_level = 'routine' THEN
    v_urgency_score := 10;
  ELSIF v_repair_record.urgency_level = 'low' THEN
    v_urgency_score := 5;
  ELSE
    v_urgency_score := 0;
  END IF;
  
  -- Check for urgency keywords in detected keywords
  IF v_repair_record.detected_keywords ? 'emergency' OR v_repair_record.detected_keywords ? 'urgent' THEN
    v_urgency_score := GREATEST(v_urgency_score, 25);
  END IF;
  
  -- 2. Water Intrusion Score (0-25)
  IF v_repair_record.water_intrusion = true THEN
    v_water_intrusion_score := 25;
  ELSIF v_repair_record.repair_type = 'leak' THEN
    v_water_intrusion_score := 20;
  ELSIF v_repair_record.detected_keywords ? 'water' OR v_repair_record.detected_keywords ? 'leak' THEN
    v_water_intrusion_score := 15;
  END IF;
  
  -- 3. Storm Source Score (0-20)
  IF v_repair_record.storm_connected = true THEN
    v_storm_source_score := 15;
    
    -- Get storm impact details
    IF v_repair_record.storm_event_id IS NOT NULL THEN
      SELECT * INTO v_storm_impact
      FROM public.contact_storm_impacts
      WHERE id = v_repair_record.storm_event_id;
      
      IF v_storm_impact.storm_risk_score > 70 THEN
        v_storm_source_score := 20;
      ELSIF v_storm_impact.storm_risk_score > 50 THEN
        v_storm_source_score := 18;
      END IF;
    END IF;
    
    -- Wind speed bonus
    IF v_repair_record.wind_speed_mph IS NOT NULL AND v_repair_record.wind_speed_mph > 40 THEN
      v_storm_source_score := GREATEST(v_storm_source_score, 18);
    END IF;
  ELSIF v_repair_record.detected_keywords ? 'wind' OR v_repair_record.detected_keywords ? 'storm' THEN
    v_storm_source_score := 10;
  END IF;
  
  -- 4. Homeowner Frustration Score (0-15)
  IF v_repair_record.homeowner_frustration_level = 'high' THEN
    v_homeowner_frustration_score := 15;
  ELSIF v_repair_record.homeowner_frustration_level = 'medium' THEN
    v_homeowner_frustration_score := 8;
  ELSIF v_repair_record.homeowner_frustration_level = 'low' THEN
    v_homeowner_frustration_score := 3;
  END IF;
  
  -- 5. Photo Evidence Score (0-10)
  IF jsonb_array_length(COALESCE(v_repair_record.photo_evidence_urls, '[]'::jsonb)) > 0 THEN
    v_photo_evidence_score := 10;
  END IF;
  
  -- 6. Insurance Involvement Score (0-10)
  IF v_repair_record.insurance_connected = true THEN
    v_insurance_involvement_score := 10;
    
    -- Get insurance metadata
    IF v_repair_record.insurance_metadata_id IS NOT NULL THEN
      SELECT * INTO v_insurance_meta
      FROM public.insurance_metadata
      WHERE id = v_repair_record.insurance_metadata_id;
      
      IF v_insurance_meta.claim_number IS NOT NULL THEN
        v_insurance_involvement_score := 10;
      END IF;
    END IF;
  END IF;
  
  -- 7. Roof Age Score (0-10)
  IF v_repair_record.roof_age_years IS NOT NULL THEN
    IF v_repair_record.roof_age_years > 20 THEN
      v_roof_age_score := 10;
    ELSIF v_repair_record.roof_age_years > 15 THEN
      v_roof_age_score := 7;
    ELSIF v_repair_record.roof_age_years > 10 THEN
      v_roof_age_score := 5;
    END IF;
  END IF;
  
  -- 8. Neighborhood Patterns Score (0-10)
  -- Check if other contacts in same ZIP have repairs
  IF v_contact_record.postal_code IS NOT NULL THEN
    SELECT COUNT(*) INTO v_neighborhood_patterns_score
    FROM public.repair_intelligence ri
    JOIN public.contacts c ON c.id = ri.contact_id
    WHERE c.postal_code = v_contact_record.postal_code
      AND c.workspace_id = v_repair_record.workspace_id
      AND ri.id != p_repair_intelligence_id
      AND ri.detected_at > now() - interval '30 days';
    
    v_neighborhood_patterns_score := LEAST(v_neighborhood_patterns_score, 10);
  END IF;
  
  -- Calculate total score
  v_score := v_urgency_score + v_water_intrusion_score + v_storm_source_score + 
             v_homeowner_frustration_score + v_photo_evidence_score + 
             v_insurance_involvement_score + v_roof_age_score + v_neighborhood_patterns_score;
  
  -- Clamp to 0-100
  v_score := GREATEST(0, LEAST(100, v_score));
  
  -- Determine score band
  IF v_score >= 90 THEN
    v_score_band := 'emergency';
  ELSIF v_score >= 75 THEN
    v_score_band := 'immediate';
  ELSIF v_score >= 55 THEN
    v_score_band := 'routine';
  ELSIF v_score >= 40 THEN
    v_score_band := 'low';
  ELSE
    v_score_band := 'uncertain';
  END IF;
  
  -- Update repair intelligence record
  UPDATE public.repair_intelligence
  SET 
    repair_score = v_score,
    urgency_level = v_score_band
  WHERE id = p_repair_intelligence_id;
  
  -- Insert score record
  INSERT INTO public.repair_scores (
    repair_intelligence_id,
    contact_id,
    workspace_id,
    repair_score,
    urgency_score,
    water_intrusion_score,
    storm_source_score,
    homeowner_frustration_score,
    photo_evidence_score,
    insurance_involvement_score,
    roof_age_score,
    neighborhood_patterns_score,
    score_band
  ) VALUES (
    p_repair_intelligence_id,
    v_repair_record.contact_id,
    v_repair_record.workspace_id,
    v_score,
    v_urgency_score,
    v_water_intrusion_score,
    v_storm_source_score,
    v_homeowner_frustration_score,
    v_photo_evidence_score,
    v_insurance_involvement_score,
    v_roof_age_score,
    v_neighborhood_patterns_score,
    v_score_band
  );
  
  -- Update contact repair score
  UPDATE public.contacts
  SET 
    repair_score = v_score,
    repair_urgency_level = v_score_band
  WHERE id = v_repair_record.contact_id;
  
  -- Log scoring event
  INSERT INTO public.repair_events (
    repair_intelligence_id,
    contact_id,
    workspace_id,
    event_type,
    event_description,
    metadata
  ) VALUES (
    p_repair_intelligence_id,
    v_repair_record.contact_id,
    v_repair_record.workspace_id,
    'scored',
    format('Repair score calculated: %s (%s)', v_score, v_score_band),
    jsonb_build_object(
      'score', v_score,
      'score_band', v_score_band,
      'components', jsonb_build_object(
        'urgency', v_urgency_score,
        'water_intrusion', v_water_intrusion_score,
        'storm_source', v_storm_source_score,
        'homeowner_frustration', v_homeowner_frustration_score,
        'photo_evidence', v_photo_evidence_score,
        'insurance', v_insurance_involvement_score,
        'roof_age', v_roof_age_score,
        'neighborhood_patterns', v_neighborhood_patterns_score
      )
    )
  );
  
  RETURN v_score;
END;
$$;

-- ============================================================================
-- 8. AUTO-TASK CREATION FUNCTION FOR REPAIRS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_repair_auto_tasks(
  p_repair_intelligence_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_repair_record public.repair_intelligence%ROWTYPE;
  v_contact_record public.contacts%ROWTYPE;
  v_task_id uuid;
  v_due_at timestamptz;
BEGIN
  -- Get repair intelligence record
  SELECT * INTO v_repair_record
  FROM public.repair_intelligence
  WHERE id = p_repair_intelligence_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Get contact record
  SELECT * INTO v_contact_record
  FROM public.contacts
  WHERE id = v_repair_record.contact_id;
  
  -- Determine urgency and create appropriate tasks
  IF v_repair_record.urgency_level = 'emergency' OR v_repair_record.repair_score >= 90 THEN
    -- Emergency Leak Tasks
    v_due_at := now(); -- Due immediately
    
    -- Task 1: Message homeowner now
    INSERT INTO public.smartsend_tasks (
      workspace_id,
      contact_id,
      task_type,
      urgency,
      status,
      title,
      description,
      due_at,
      auto_generated,
      auto_source,
      metadata
    ) VALUES (
      v_repair_record.workspace_id,
      v_repair_record.contact_id,
      'high_urgency_issue',
      'high',
      'today',
      'Message homeowner now - Emergency leak detected',
      format('Urgent repair detected: %s. Contact homeowner immediately.', v_repair_record.repair_type),
      v_due_at,
      true,
      'repair_engine',
      jsonb_build_object('repair_intelligence_id', p_repair_intelligence_id, 'repair_type', v_repair_record.repair_type)
    )
    RETURNING id INTO v_task_id;
    
    -- Task 2: Offer 2 time slots for today
    INSERT INTO public.smartsend_tasks (
      workspace_id,
      contact_id,
      task_type,
      urgency,
      status,
      title,
      description,
      due_at,
      auto_generated,
      auto_source,
      metadata
    ) VALUES (
      v_repair_record.workspace_id,
      v_repair_record.contact_id,
      'book_inspection',
      'high',
      'today',
      'Offer 2 time slots for today',
      'Emergency repair needs immediate attention. Offer available slots.',
      v_due_at,
      true,
      'repair_engine',
      jsonb_build_object('repair_intelligence_id', p_repair_intelligence_id, 'urgency', 'emergency')
    );
    
    -- Task 3: Prepare emergency kit
    INSERT INTO public.smartsend_tasks (
      workspace_id,
      contact_id,
      task_type,
      urgency,
      status,
      title,
      description,
      due_at,
      auto_generated,
      auto_source,
      metadata
    ) VALUES (
      v_repair_record.workspace_id,
      v_repair_record.contact_id,
      'update_lead_info',
      'high',
      'today',
      'Prepare emergency repair kit',
      format('Prepare materials for %s repair', v_repair_record.repair_type),
      v_due_at,
      true,
      'repair_engine',
      jsonb_build_object('repair_intelligence_id', p_repair_intelligence_id, 'repair_type', v_repair_record.repair_type)
    );
    
    -- Log task creation event
    INSERT INTO public.repair_events (
      repair_intelligence_id,
      contact_id,
      workspace_id,
      event_type,
      event_description,
      task_id,
      metadata
    ) VALUES (
      p_repair_intelligence_id,
      v_repair_record.contact_id,
      v_repair_record.workspace_id,
      'task_created',
      'Emergency repair tasks created',
      v_task_id,
      jsonb_build_object('task_count', 3, 'urgency', 'emergency')
    );
    
  ELSIF v_repair_record.urgency_level = 'immediate' OR v_repair_record.repair_score >= 75 THEN
    -- Immediate Repair Tasks
    v_due_at := now() + interval '1 day';
    
    INSERT INTO public.smartsend_tasks (
      workspace_id,
      contact_id,
      task_type,
      urgency,
      status,
      title,
      description,
      due_at,
      auto_generated,
      auto_source,
      metadata
    ) VALUES (
      v_repair_record.workspace_id,
      v_repair_record.contact_id,
      'book_inspection',
      'high',
      'upcoming',
      'Book repair appointment',
      format('Schedule repair for %s', v_repair_record.repair_type),
      v_due_at,
      true,
      'repair_engine',
      jsonb_build_object('repair_intelligence_id', p_repair_intelligence_id, 'repair_type', v_repair_record.repair_type)
    )
    RETURNING id INTO v_task_id;
    
    INSERT INTO public.smartsend_tasks (
      workspace_id,
      contact_id,
      task_type,
      urgency,
      status,
      title,
      description,
      due_at,
      auto_generated,
      auto_source,
      metadata
    ) VALUES (
      v_repair_record.workspace_id,
      v_repair_record.contact_id,
      'follow_up_needed',
      'normal',
      'upcoming',
      'Send repair checklist',
      'Send homeowner repair preparation checklist',
      v_due_at,
      true,
      'repair_engine',
      jsonb_build_object('repair_intelligence_id', p_repair_intelligence_id)
    );
    
    -- Log task creation event
    INSERT INTO public.repair_events (
      repair_intelligence_id,
      contact_id,
      workspace_id,
      event_type,
      event_description,
      task_id,
      metadata
    ) VALUES (
      p_repair_intelligence_id,
      v_repair_record.contact_id,
      v_repair_record.workspace_id,
      'task_created',
      'Immediate repair tasks created',
      v_task_id,
      jsonb_build_object('task_count', 2, 'urgency', 'immediate')
    );
    
  ELSE
    -- Routine/Low Urgency Tasks
    v_due_at := now() + interval '2 days';
    
    INSERT INTO public.smartsend_tasks (
      workspace_id,
      contact_id,
      task_type,
      urgency,
      status,
      title,
      description,
      due_at,
      auto_generated,
      auto_source,
      metadata
    ) VALUES (
      v_repair_record.workspace_id,
      v_repair_record.contact_id,
      'follow_up_needed',
      'normal',
      'upcoming',
      'Follow up on repair request',
      format('Follow up on %s repair request', v_repair_record.repair_type),
      v_due_at,
      true,
      'repair_engine',
      jsonb_build_object('repair_intelligence_id', p_repair_intelligence_id, 'repair_type', v_repair_record.repair_type)
    )
    RETURNING id INTO v_task_id;
    
    INSERT INTO public.smartsend_tasks (
      workspace_id,
      contact_id,
      task_type,
      urgency,
      status,
      title,
      description,
      due_at,
      auto_generated,
      auto_source,
      metadata
    ) VALUES (
      v_repair_record.workspace_id,
      v_repair_record.contact_id,
      'update_lead_info',
      'normal',
      'upcoming',
      'Ask for repair photos',
      'Request photos to better assess repair needs',
      v_due_at,
      true,
      'repair_engine',
      jsonb_build_object('repair_intelligence_id', p_repair_intelligence_id)
    );
    
    -- Log task creation event
    INSERT INTO public.repair_events (
      repair_intelligence_id,
      contact_id,
      workspace_id,
      event_type,
      event_description,
      task_id,
      metadata
    ) VALUES (
      p_repair_intelligence_id,
      v_repair_record.contact_id,
      v_repair_record.workspace_id,
      'task_created',
      'Routine repair tasks created',
      v_task_id,
      jsonb_build_object('task_count', 2, 'urgency', 'routine')
    );
  END IF;
END;
$$;

-- ============================================================================
-- 9. REPAIR → REPLACEMENT UPSELL LOGIC FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_repair_replacement_upsell(
  p_repair_intelligence_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_repair_record public.repair_intelligence%ROWTYPE;
  v_contact_record public.contacts%ROWTYPE;
  v_replacement_recommended boolean := false;
  v_replacement_reason text;
  v_upsell_opportunities jsonb := '[]'::jsonb;
BEGIN
  -- Get repair intelligence record
  SELECT * INTO v_repair_record
  FROM public.repair_intelligence
  WHERE id = p_repair_intelligence_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Get contact record
  SELECT * INTO v_contact_record
  FROM public.contacts
  WHERE id = v_repair_record.contact_id;
  
  -- Check replacement criteria
  
  -- 1. Roof age > 14 years
  IF v_repair_record.roof_age_years IS NOT NULL AND v_repair_record.roof_age_years > 14 THEN
    v_replacement_recommended := true;
    v_replacement_reason := format('Roof age (%s years) exceeds 14-year threshold', v_repair_record.roof_age_years);
    v_upsell_opportunities := v_upsell_opportunities || jsonb_build_object('type', 'roof_age', 'reason', v_replacement_reason);
  END IF;
  
  -- 2. Multiple repairs requested
  IF v_contact_record.repair_count > 2 THEN
    v_replacement_recommended := true;
    v_replacement_reason := format('Multiple repairs (%s) indicate systemic issues', v_contact_record.repair_count);
    v_upsell_opportunities := v_upsell_opportunities || jsonb_build_object('type', 'multiple_repairs', 'reason', v_replacement_reason);
  END IF;
  
  -- 3. Leak + old roof
  IF v_repair_record.repair_type = 'leak' AND v_repair_record.roof_age_years IS NOT NULL AND v_repair_record.roof_age_years > 10 THEN
    v_replacement_recommended := true;
    v_replacement_reason := format('Leak detected on %s-year-old roof - replacement recommended', v_repair_record.roof_age_years);
    v_upsell_opportunities := v_upsell_opportunities || jsonb_build_object('type', 'leak_old_roof', 'reason', v_replacement_reason);
  END IF;
  
  -- 4. Insurance language detected
  IF v_repair_record.insurance_connected = true THEN
    v_replacement_recommended := true;
    v_replacement_reason := 'Insurance claim detected - full replacement may be covered';
    v_upsell_opportunities := v_upsell_opportunities || jsonb_build_object('type', 'insurance_claim', 'reason', v_replacement_reason);
  END IF;
  
  -- 5. High repair score (indicates serious issues)
  IF v_repair_record.repair_score >= 80 THEN
    v_replacement_recommended := true;
    v_replacement_reason := format('High repair score (%s) indicates significant damage', v_repair_record.repair_score);
    v_upsell_opportunities := v_upsell_opportunities || jsonb_build_object('type', 'high_score', 'reason', v_replacement_reason);
  END IF;
  
  -- Update repair intelligence record
  IF v_replacement_recommended THEN
    UPDATE public.repair_intelligence
    SET 
      replacement_recommended = true,
      replacement_reason = v_replacement_reason,
      upsell_opportunities = v_upsell_opportunities
    WHERE id = p_repair_intelligence_id;
    
    -- Log upsell event
    INSERT INTO public.repair_events (
      repair_intelligence_id,
      contact_id,
      workspace_id,
      event_type,
      event_description,
      metadata
    ) VALUES (
      p_repair_intelligence_id,
      v_repair_record.contact_id,
      v_repair_record.workspace_id,
      'replacement_suggested',
      'Replacement recommended based on repair analysis',
      jsonb_build_object('reasons', v_upsell_opportunities)
    );
  END IF;
  
  RETURN v_replacement_recommended;
END;
$$;

-- ============================================================================
-- 10. TRIGGER: Auto-detect repairs from messages
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_detect_repair_from_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_repair_id uuid;
BEGIN
  -- Only process inbound messages
  IF NEW.direction = 'in' OR NEW.direction = 'inbound' THEN
    -- Detect repair opportunity
    v_repair_id := public.detect_repair_opportunity(
      p_contact_id := NEW.contact_id,
      p_message_text := COALESCE(NEW.body_text, NEW.body_html),
      p_detection_source := 'message',
      p_metadata := jsonb_build_object('message_id', NEW.id, 'received_at', NEW.received_at)
    );
    
    -- If repair detected, create tasks and check for upsell
    IF v_repair_id IS NOT NULL THEN
      PERFORM public.create_repair_auto_tasks(v_repair_id);
      PERFORM public.check_repair_replacement_upsell(v_repair_id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on inbox_messages (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inbox_messages') THEN
    DROP TRIGGER IF EXISTS trg_auto_detect_repair_from_message ON public.inbox_messages;
    CREATE TRIGGER trg_auto_detect_repair_from_message
      AFTER INSERT ON public.inbox_messages
      FOR EACH ROW
      EXECUTE FUNCTION public.auto_detect_repair_from_message();
  END IF;
END $$;

-- ============================================================================
-- 11. STORM + REPAIR SYNERGY FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.connect_storm_to_repair(
  p_repair_intelligence_id uuid,
  p_storm_event_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_repair_record public.repair_intelligence%ROWTYPE;
  v_storm_impact RECORD;
  v_wind_speed integer;
BEGIN
  -- Get repair intelligence record
  SELECT * INTO v_repair_record
  FROM public.repair_intelligence
  WHERE id = p_repair_intelligence_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Get storm impact details
  SELECT * INTO v_storm_impact
  FROM public.contact_storm_impacts
  WHERE id = p_storm_event_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Extract wind speed from metadata if available
  v_wind_speed := (v_storm_impact.metadata->>'wind_speed_mph')::integer;
  
  -- Update repair intelligence
  UPDATE public.repair_intelligence
  SET 
    storm_connected = true,
    storm_event_id = p_storm_event_id,
    wind_speed_mph = v_wind_speed,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('storm_connected_at', now())
  WHERE id = p_repair_intelligence_id;
  
  -- Recalculate repair score (storm connection boosts score)
  PERFORM public.calculate_repair_score(p_repair_intelligence_id);
  
  -- Add storm-specific repair task
  INSERT INTO public.smartsend_tasks (
    workspace_id,
    contact_id,
    task_type,
    urgency,
    status,
    title,
    description,
    due_at,
    auto_generated,
    auto_source,
    metadata
  ) VALUES (
    v_repair_record.workspace_id,
    v_repair_record.contact_id,
    'update_lead_info',
    'high',
    'upcoming',
    'Storm-related repair - request additional photos',
    'Storm damage detected. Request additional photos for insurance claim.',
    now() + interval '1 day',
    true,
    'repair_engine',
    jsonb_build_object('repair_intelligence_id', p_repair_intelligence_id, 'storm_event_id', p_storm_event_id)
  );
  
  -- Log event
  INSERT INTO public.repair_events (
    repair_intelligence_id,
    contact_id,
    workspace_id,
    event_type,
    event_description,
    metadata
  ) VALUES (
    p_repair_intelligence_id,
    v_repair_record.contact_id,
    v_repair_record.workspace_id,
    'detected',
    'Storm connection established with repair',
    jsonb_build_object('storm_event_id', p_storm_event_id, 'wind_speed_mph', v_wind_speed)
  );
END;
$$;

-- ============================================================================
-- 12. COMMENTS & DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.repair_intelligence IS 'Repair Opportunity Intelligence - Detects and tracks repair opportunities from messages, photos, and documents (Block 18200)';
COMMENT ON TABLE public.repair_scores IS 'Repair Score History - Tracks repair score calculations with component breakdowns';
COMMENT ON TABLE public.repair_events IS 'Repair Events Timeline - Tracks all repair-related activities and events';

COMMENT ON FUNCTION public.detect_repair_opportunity IS 'Detects repair opportunities from message text, photos, or documents';
COMMENT ON FUNCTION public.calculate_repair_score IS 'Calculates repair score (0-100) based on urgency, water intrusion, storm source, and other factors';
COMMENT ON FUNCTION public.create_repair_auto_tasks IS 'Automatically creates tasks based on repair urgency level';
COMMENT ON FUNCTION public.check_repair_replacement_upsell IS 'Checks if repair should trigger replacement recommendation based on roof age, multiple repairs, leaks, insurance, etc.';
COMMENT ON FUNCTION public.connect_storm_to_repair IS 'Connects storm events to repair opportunities for enhanced detection and upsell';

-- ============================================================================
-- 13. CREATE REPAIR SEQUENCES (Auto-Sequences for Repair Jobs)
-- ============================================================================

-- Create repair sequence templates table (if sequence_templates exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sequence_templates') THEN
    -- Sequence A: Leak Emergency
    INSERT INTO public.sequence_templates (name, description, persona)
    VALUES (
      'Repair: Leak Emergency',
      'Immediate reply sequence for emergency leak repairs - closes repairs fast',
      'roofer'
    )
    ON CONFLICT (name) DO NOTHING
    RETURNING id INTO NULL;
    
    -- Sequence B: Storm Repairs
    INSERT INTO public.sequence_templates (name, description, persona)
    VALUES (
      'Repair: Storm Repairs',
      'Sequence for storm-related repairs (shingles, wind damage, gutter fixes)',
      'roofer'
    )
    ON CONFLICT (name) DO NOTHING
    RETURNING id INTO NULL;
    
    -- Sequence C: Skylight Issues
    INSERT INTO public.sequence_templates (name, description, persona)
    VALUES (
      'Repair: Skylight Issues',
      'Sequence for skylight flashing and resealing repairs',
      'roofer'
    )
    ON CONFLICT (name) DO NOTHING
    RETURNING id INTO NULL;
    
    -- Sequence D: Small Shingle Repairs
    INSERT INTO public.sequence_templates (name, description, persona)
    VALUES (
      'Repair: Small Shingle Repairs',
      'Quick fix sequence for minor shingle repairs with upsell inspection',
      'roofer'
    )
    ON CONFLICT (name) DO NOTHING
    RETURNING id INTO NULL;
  END IF;
END $$;

-- Function to auto-start repair sequence based on repair type
CREATE OR REPLACE FUNCTION public.start_repair_sequence(
  p_repair_intelligence_id uuid,
  p_sequence_template_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_repair_record public.repair_intelligence%ROWTYPE;
  v_contact_record public.contacts%ROWTYPE;
  v_template_id uuid;
  v_sequence_id uuid;
BEGIN
  -- Get repair intelligence record
  SELECT * INTO v_repair_record
  FROM public.repair_intelligence
  WHERE id = p_repair_intelligence_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Get contact record
  SELECT * INTO v_contact_record
  FROM public.contacts
  WHERE id = v_repair_record.contact_id;
  
  -- Find sequence template
  SELECT id INTO v_template_id
  FROM public.sequence_templates
  WHERE name = p_sequence_template_name
  LIMIT 1;
  
  IF v_template_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Create sequence enrollment (if sequences table exists)
  -- This would be handled by the sequence enrollment system
  -- For now, we'll log the event
  
  INSERT INTO public.repair_events (
    repair_intelligence_id,
    contact_id,
    workspace_id,
    event_type,
    event_description,
    sequence_id,
    metadata
  ) VALUES (
    p_repair_intelligence_id,
    v_repair_record.contact_id,
    v_repair_record.workspace_id,
    'sequence_started',
    format('Repair sequence started: %s', p_sequence_template_name),
    v_template_id,
    jsonb_build_object('template_name', p_sequence_template_name)
  );
  
  RETURN v_template_id;
END;
$$;

