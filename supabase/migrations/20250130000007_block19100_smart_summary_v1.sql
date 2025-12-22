-- =========================================================
-- Block 19100 — SmartSend Smart Summary v1
-- (1-Click Full Lead Summary: Photo Intel, Insurance Intel, Storm Intel, 
--  Value Score, Material, Roof Age, Timeline, Tasks, Next Actions & Booking Recommendation)
-- =========================================================

-- ============================================================================
-- 1. CREATE lead_smart_summary TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lead_smart_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Summary Mode
  summary_mode text NOT NULL DEFAULT 'default' CHECK (summary_mode IN ('default', 'sales', 'prep', 'office')),
  
  -- 1️⃣ Contact Overview
  contact_overview jsonb DEFAULT '{}'::jsonb, -- name, address, phone, email, last_reply, priority_score
  
  -- 2️⃣ Core Issue Summary
  core_issue_summary jsonb DEFAULT '{}'::jsonb, -- detected_problem, severity_score, photo_evidence, interior_leak, repair_vs_replacement
  
  -- 3️⃣ Material Summary
  material_summary jsonb DEFAULT '{}'::jsonb, -- material_type, pitch, layers, roof_config, vulnerable_components
  
  -- 4️⃣ Roof Age Summary
  roof_age_summary jsonb DEFAULT '{}'::jsonb, -- estimated_age_range, confidence_score, replacement_probability, insurance_impact
  
  -- 5️⃣ Storm Impact Summary
  storm_impact_summary jsonb DEFAULT '{}'::jsonb, -- hail_size, wind_speed, storm_date, zip_vulnerability, storm_zone, storm_score
  
  -- 6️⃣ Insurance Summary
  insurance_summary jsonb DEFAULT '{}'::jsonb, -- claim_type, deductible_info, adjuster_status, approval_likelihood, coverage_type, supplement_opportunities, insurance_probability
  
  -- 7️⃣ Value Summary
  value_summary jsonb DEFAULT '{}'::jsonb, -- repair_estimate, replacement_estimate, insurance_payout_range, total_money_score, job_category
  
  -- 8️⃣ Timeline Summary
  timeline_summary jsonb DEFAULT '[]'::jsonb, -- compressed timeline feed (last 72 hours in bullet points)
  
  -- 9️⃣ Task Summary
  task_summary jsonb DEFAULT '[]'::jsonb, -- urgent_tasks, overdue_tasks, insurance_tasks, repair_tasks, booking_tasks, recommended_actions
  
  -- 🔟 Smart Next-Step Recommendation (THE MOST IMPORTANT PART)
  next_step_recommendation jsonb DEFAULT '{}'::jsonb, -- single best action, reasoning, urgency, cta_text
  
  -- Summary Alerts
  alerts text[] DEFAULT '{}'::text[], -- ['high_storm_opportunity', 'insurance_candidate', 'urgent_leak', 'high_value_replacement', 'appointment_recommended_today']
  
  -- Metadata
  generated_at timestamptz NOT NULL DEFAULT now(),
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  generation_version integer DEFAULT 1,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(contact_id, summary_mode)
);

CREATE INDEX IF NOT EXISTS idx_lead_smart_summary_contact 
  ON public.lead_smart_summary(contact_id);
CREATE INDEX IF NOT EXISTS idx_lead_smart_summary_workspace 
  ON public.lead_smart_summary(workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_smart_summary_mode 
  ON public.lead_smart_summary(workspace_id, summary_mode);
CREATE INDEX IF NOT EXISTS idx_lead_smart_summary_updated 
  ON public.lead_smart_summary(last_updated_at DESC);

-- ============================================================================
-- 2. CREATE summary_modes TABLE (for mode configuration)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.summary_modes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  mode_key text NOT NULL CHECK (mode_key IN ('sales', 'prep', 'office')),
  mode_name text NOT NULL,
  mode_description text,
  
  -- Which sections to emphasize
  emphasized_sections text[] DEFAULT '{}'::text[],
  
  -- Section weights (for scoring/ranking)
  section_weights jsonb DEFAULT '{}'::jsonb,
  
  -- Display configuration
  display_config jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, mode_key)
);

CREATE INDEX IF NOT EXISTS idx_summary_modes_workspace 
  ON public.summary_modes(workspace_id);

-- Seed default summary modes for existing workspaces
INSERT INTO public.summary_modes (workspace_id, mode_key, mode_name, mode_description, emphasized_sections)
SELECT 
  id,
  'sales',
  'Sales Mode',
  'Focuses on money, value, upsell, insurance, storm',
  ARRAY['value_summary', 'insurance_summary', 'storm_impact_summary', 'roof_age_summary']
FROM public.workspaces
ON CONFLICT (workspace_id, mode_key) DO NOTHING;

INSERT INTO public.summary_modes (workspace_id, mode_key, mode_name, mode_description, emphasized_sections)
SELECT 
  id,
  'prep',
  'Appointment Prep Mode',
  'Focuses on tools, travel, materials, components',
  ARRAY['material_summary', 'core_issue_summary', 'roof_age_summary', 'task_summary']
FROM public.workspaces
ON CONFLICT (workspace_id, mode_key) DO NOTHING;

INSERT INTO public.summary_modes (workspace_id, mode_key, mode_name, mode_description, emphasized_sections)
SELECT 
  id,
  'office',
  'Office Mode',
  'Focuses on tasks, billing, contact quality, calendar',
  ARRAY['task_summary', 'timeline_summary', 'contact_overview', 'value_summary']
FROM public.workspaces
ON CONFLICT (workspace_id, mode_key) DO NOTHING;

-- ============================================================================
-- 3. FUNCTION: Generate Smart Summary
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_smart_summary(
  p_contact_id uuid,
  p_summary_mode text DEFAULT 'default'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact record;
  v_workspace_id uuid;
  v_summary jsonb;
  v_contact_overview jsonb;
  v_core_issue jsonb;
  v_material jsonb;
  v_roof_age jsonb;
  v_storm jsonb;
  v_insurance jsonb;
  v_value jsonb;
  v_timeline jsonb;
  v_tasks jsonb;
  v_next_step jsonb;
  v_alerts text[];
  v_last_reply timestamptz;
  v_priority_score integer;
  v_email_quality text;
  v_line_type text;
BEGIN
  -- Get contact
  SELECT c.*, c.workspace_id INTO v_contact, v_workspace_id
  FROM public.contacts c
  WHERE c.id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Contact not found');
  END IF;
  
  -- 1️⃣ Contact Overview
  SELECT MAX(created_at) INTO v_last_reply
  FROM public.inbox_threads
  WHERE contact_id = p_contact_id AND is_reply = true;
  
  -- Get priority score (if table exists - will be NULL if table doesn't exist)
  BEGIN
    SELECT priority_score INTO v_priority_score
    FROM public.contact_priority_scores
    WHERE contact_id = p_contact_id;
  EXCEPTION WHEN OTHERS THEN
    v_priority_score := NULL;
  END;
  
  -- Email quality (simplified)
  v_email_quality := CASE 
    WHEN v_contact.email IS NOT NULL AND v_contact.email LIKE '%@%' THEN 'good'
    ELSE 'unknown'
  END;
  
  -- Phone line type (simplified - would use phone_intelligence in production)
  v_line_type := 'unknown';
  
  v_contact_overview := jsonb_build_object(
    'homeowner_name', COALESCE(v_contact.first_name || ' ' || v_contact.last_name, v_contact.email),
    'address', COALESCE(v_contact.address, 'Not provided'),
    'phone', v_contact.phone,
    'line_type', v_line_type,
    'email', v_contact.email,
    'email_quality', v_email_quality,
    'last_reply', v_last_reply,
    'priority_score', COALESCE(v_priority_score, 0)
  );
  
  -- 2️⃣ Core Issue Summary
  BEGIN
    SELECT jsonb_build_object(
      'detected_problem', COALESCE(
        (SELECT detected_problem FROM public.repair_opportunity_engine WHERE contact_id = p_contact_id LIMIT 1),
        'No specific problem detected'
      ),
      'severity_score', COALESCE(
        (SELECT overall_severity_score FROM public.photo_damage_scores WHERE contact_id = p_contact_id),
        0
      ),
      'photo_evidence', COALESCE(
        (SELECT COUNT(*)::integer FROM public.photo_intelligence WHERE contact_id = p_contact_id),
        0
      ),
      'interior_leak_indicators', COALESCE(
        (SELECT COUNT(*)::integer FROM public.photo_intelligence 
         WHERE contact_id = p_contact_id AND leak_detected = true),
        0
      ),
      'repair_vs_replacement_likelihood', COALESCE(
        (SELECT replacement_recommendation FROM public.photo_damage_scores WHERE contact_id = p_contact_id),
        'unknown'
      )
    ) INTO v_core_issue;
  EXCEPTION WHEN OTHERS THEN
    v_core_issue := jsonb_build_object(
      'detected_problem', 'No specific problem detected',
      'severity_score', 0,
      'photo_evidence', 0,
      'interior_leak_indicators', 0,
      'repair_vs_replacement_likelihood', 'unknown'
    );
  END;
  
  -- 3️⃣ Material Summary
  SELECT jsonb_build_object(
    'material_type', mi.material_type,
    'pitch', mi.pitch_estimate,
    'layers', mi.layer_count,
    'roof_configuration', jsonb_build_object(
      'has_skylights', mi.has_skylights,
      'has_chimney', mi.has_chimney,
      'has_box_vents', mi.has_box_vents,
      'has_ridge_vents', mi.has_ridge_vents,
      'has_pipe_boots', mi.has_pipe_boots
    ),
    'vulnerable_components', mi.compatibility_flags
  ) INTO v_material
  FROM public.material_intelligence mi
  WHERE mi.contact_id = p_contact_id
  LIMIT 1;
  
  IF v_material IS NULL THEN
    v_material := jsonb_build_object('material_type', 'unknown');
  END IF;
  
  -- 4️⃣ Roof Age Summary
  SELECT jsonb_build_object(
    'estimated_age_range', jsonb_build_object(
      'min', rad.estimated_age_min,
      'max', rad.estimated_age_max,
      'median', rad.estimated_age_median
    ),
    'confidence_score', rad.confidence_score,
    'replacement_probability', rad.replacement_probability,
    'insurance_impact', rad.insurance_feasibility,
    'age_band', rad.age_band
  ) INTO v_roof_age
  FROM public.roof_age_data rad
  WHERE rad.contact_id = p_contact_id
  LIMIT 1;
  
  IF v_roof_age IS NULL THEN
    v_roof_age := jsonb_build_object('estimated_age_range', jsonb_build_object('min', NULL, 'max', NULL));
  END IF;
  
  -- 5️⃣ Storm Impact Summary
  SELECT jsonb_build_object(
    'hail_size', NULL, -- Would come from storm engine
    'wind_speed', NULL, -- Would come from storm engine
    'storm_date', NULL, -- Would come from storm engine
    'zip_vulnerability', NULL, -- Would come from neighborhood_zip_intelligence
    'storm_zone', NULL, -- Would come from storm engine
    'storm_score', COALESCE(
      (SELECT storm_damage_score FROM public.photo_damage_scores WHERE contact_id = p_contact_id),
      0
    )
  ) INTO v_storm;
  
  -- 6️⃣ Insurance Summary
  SELECT jsonb_build_object(
    'claim_type', im.claim_status,
    'deductible_info', jsonb_build_object(
      'deductible', im.deductible,
      'acv', im.acv,
      'rcv', im.rcv
    ),
    'adjuster_status', jsonb_build_object(
      'adjuster_name', im.adjuster_name,
      'adjuster_phone', im.adjuster_phone,
      'adjuster_email', im.adjuster_email
    ),
    'approval_likelihood', COALESCE(
      (SELECT payout_category FROM public.insurance_value_scores WHERE contact_id = p_contact_id),
      'unknown'
    ),
    'coverage_type', NULL, -- Would come from insurance metadata
    'supplement_opportunities', NULL, -- Would come from insurance analysis
    'insurance_probability', COALESCE(
      (SELECT likelihood_score FROM public.insurance_scores WHERE contact_id = p_contact_id),
      0
    )
  ) INTO v_insurance
  FROM public.insurance_metadata im
  WHERE im.contact_id = p_contact_id
  LIMIT 1;
  
  IF v_insurance IS NULL THEN
    v_insurance := jsonb_build_object('insurance_probability', 0);
  END IF;
  
  -- 7️⃣ Value Summary
  SELECT jsonb_build_object(
    'repair_estimate', jsonb_build_object(
      'min', rce.estimated_repair_cost_min,
      'max', rce.estimated_repair_cost_max,
      'avg', rce.estimated_repair_cost_avg
    ),
    'replacement_estimate', jsonb_build_object(
      'min', rpce.estimated_replacement_cost_min,
      'max', rpce.estimated_replacement_cost_max,
      'avg', rpce.estimated_replacement_cost_avg
    ),
    'insurance_payout_range', jsonb_build_object(
      'min', sdve.storm_replacement_value_min,
      'max', sdve.storm_replacement_value_max
    ),
    'total_money_score', lvs.lead_money_score,
    'job_category', lvs.score_category
  ) INTO v_value
  FROM public.contacts c
  LEFT JOIN public.repair_cost_estimates rce ON rce.contact_id = c.id
  LEFT JOIN public.replacement_cost_estimates rpce ON rpce.contact_id = c.id
  LEFT JOIN public.storm_damage_value_estimates sdve ON sdve.contact_id = c.id
  LEFT JOIN public.lead_value_scores lvs ON lvs.contact_id = c.id
  WHERE c.id = p_contact_id;
  
  IF v_value IS NULL THEN
    v_value := jsonb_build_object('total_money_score', 0);
  END IF;
  
  -- 8️⃣ Timeline Summary (Last 72 hours compressed)
  SELECT jsonb_agg(
    jsonb_build_object(
      'type', it.event_type,
      'description', it.body,
      'timestamp', it.created_at
    ) ORDER BY it.created_at DESC
  ) INTO v_timeline
  FROM public.inbox_threads it
  WHERE it.contact_id = p_contact_id
    AND it.created_at > now() - interval '72 hours'
  LIMIT 6;
  
  IF v_timeline IS NULL THEN
    v_timeline := '[]'::jsonb;
  END IF;
  
  -- 9️⃣ Task Summary
  SELECT jsonb_build_object(
    'urgent_tasks', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'due_date', t.due_date,
        'status', t.status
      ))
      FROM public.tasks_v3 t
      WHERE t.contact_id = p_contact_id
        AND t.status != 'completed'
        AND t.priority = 'urgent'
    ),
    'overdue_tasks', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'due_date', t.due_date
      ))
      FROM public.tasks_v3 t
      WHERE t.contact_id = p_contact_id
        AND t.status != 'completed'
        AND t.due_date < now()
    ),
    'insurance_tasks', (
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title))
      FROM public.tasks_v3 t
      WHERE t.contact_id = p_contact_id
        AND t.status != 'completed'
        AND (t.title ILIKE '%insurance%' OR t.title ILIKE '%adjuster%' OR t.title ILIKE '%claim%')
    ),
    'repair_tasks', (
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title))
      FROM public.tasks_v3 t
      WHERE t.contact_id = p_contact_id
        AND t.status != 'completed'
        AND (t.title ILIKE '%repair%' OR t.title ILIKE '%inspection%')
    ),
    'booking_tasks', (
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title))
      FROM public.tasks_v3 t
      WHERE t.contact_id = p_contact_id
        AND t.status != 'completed'
        AND (t.title ILIKE '%appointment%' OR t.title ILIKE '%schedule%' OR t.title ILIKE '%book%')
    ),
    'recommended_actions', '[]'::jsonb
  ) INTO v_tasks;
  
  IF v_tasks IS NULL THEN
    v_tasks := jsonb_build_object('urgent_tasks', '[]'::jsonb);
  END IF;
  
  -- 🔟 Smart Next-Step Recommendation
  v_next_step := public.generate_next_step_recommendation(p_contact_id);
  
  -- Generate Alerts
  v_alerts := public.generate_summary_alerts(p_contact_id);
  
  -- Build full summary
  v_summary := jsonb_build_object(
    'contact_overview', v_contact_overview,
    'core_issue_summary', v_core_issue,
    'material_summary', v_material,
    'roof_age_summary', v_roof_age,
    'storm_impact_summary', v_storm,
    'insurance_summary', v_insurance,
    'value_summary', v_value,
    'timeline_summary', v_timeline,
    'task_summary', v_tasks,
    'next_step_recommendation', v_next_step,
    'alerts', v_alerts
  );
  
  -- Upsert summary
  INSERT INTO public.lead_smart_summary (
    contact_id,
    workspace_id,
    summary_mode,
    contact_overview,
    core_issue_summary,
    material_summary,
    roof_age_summary,
    storm_impact_summary,
    insurance_summary,
    value_summary,
    timeline_summary,
    task_summary,
    next_step_recommendation,
    alerts,
    generated_at,
    last_updated_at
  ) VALUES (
    p_contact_id,
    v_workspace_id,
    p_summary_mode,
    v_contact_overview,
    v_core_issue,
    v_material,
    v_roof_age,
    v_storm,
    v_insurance,
    v_value,
    v_timeline,
    v_tasks,
    v_next_step,
    v_alerts,
    now(),
    now()
  )
  ON CONFLICT (contact_id, summary_mode) DO UPDATE SET
    contact_overview = EXCLUDED.contact_overview,
    core_issue_summary = EXCLUDED.core_issue_summary,
    material_summary = EXCLUDED.material_summary,
    roof_age_summary = EXCLUDED.roof_age_summary,
    storm_impact_summary = EXCLUDED.storm_impact_summary,
    insurance_summary = EXCLUDED.insurance_summary,
    value_summary = EXCLUDED.value_summary,
    timeline_summary = EXCLUDED.timeline_summary,
    task_summary = EXCLUDED.task_summary,
    next_step_recommendation = EXCLUDED.next_step_recommendation,
    alerts = EXCLUDED.alerts,
    last_updated_at = now(),
    updated_at = now();
  
  RETURN jsonb_build_object(
    'ok', true,
    'contact_id', p_contact_id,
    'summary_mode', p_summary_mode,
    'summary', v_summary
  );
END;
$$;

-- ============================================================================
-- 4. FUNCTION: Generate Next Step Recommendation
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_next_step_recommendation(
  p_contact_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recommendation text;
  v_reasoning text;
  v_urgency text;
  v_cta_text text;
  v_photo_damage record;
  v_insurance_score integer;
  v_roof_age record;
  v_value_score integer;
  v_has_leak boolean;
  v_storm_score numeric;
BEGIN
  -- Get key data
  SELECT * INTO v_photo_damage
  FROM public.photo_damage_scores
  WHERE contact_id = p_contact_id;
  
  SELECT likelihood_score INTO v_insurance_score
  FROM public.insurance_scores
  WHERE contact_id = p_contact_id;
  
  SELECT * INTO v_roof_age
  FROM public.roof_age_data
  WHERE contact_id = p_contact_id;
  
  SELECT lead_money_score INTO v_value_score
  FROM public.lead_value_scores
  WHERE contact_id = p_contact_id;
  
  SELECT EXISTS(
    SELECT 1 FROM public.photo_intelligence
    WHERE contact_id = p_contact_id AND leak_detected = true
  ) INTO v_has_leak;
  
  v_storm_score := COALESCE(v_photo_damage.storm_damage_score, 0);
  
  -- Determine recommendation based on priority
  IF v_has_leak AND v_storm_score > 60 THEN
    v_recommendation := 'Offer same-day appointment (storm damage + leak)';
    v_reasoning := 'Active leak detected with storm damage - urgent attention needed';
    v_urgency := 'high';
    v_cta_text := 'Schedule Emergency Appointment';
  ELSIF v_insurance_score >= 60 THEN
    SELECT adjuster_scheduled_date INTO v_reasoning
    FROM public.insurance_metadata
    WHERE contact_id = p_contact_id;
    
    IF v_reasoning IS NOT NULL THEN
      v_recommendation := 'Send insurance prep message (adjuster scheduled)';
      v_reasoning := format('Adjuster meeting scheduled - prep homeowner with checklist');
      v_urgency := 'high';
      v_cta_text := 'Send Prep Message';
    ELSE
      v_recommendation := 'Push replacement estimate — insurance candidate';
      v_reasoning := 'High insurance probability - focus on replacement value';
      v_urgency := 'medium';
      v_cta_text := 'Send Estimate';
    END IF;
  ELSIF v_roof_age.replacement_probability >= 80 THEN
    v_recommendation := format('Push replacement estimate — roof age %s-%s years', 
      v_roof_age.estimated_age_min, v_roof_age.estimated_age_max);
    v_reasoning := format('Roof age indicates high replacement probability (%s%%)', 
      v_roof_age.replacement_probability);
    v_urgency := 'medium';
    v_cta_text := 'Send Replacement Estimate';
  ELSIF v_has_leak THEN
    v_recommendation := 'Ask for interior photos (possible water intrusion)';
    v_reasoning := 'Leak indicators detected - need interior photos to assess damage';
    v_urgency := 'high';
    v_cta_text := 'Request Photos';
  ELSIF v_value_score >= 70 THEN
    SELECT MAX(created_at) INTO v_reasoning
    FROM public.inbox_threads
    WHERE contact_id = p_contact_id AND is_reply = true;
    
    IF v_reasoning < now() - interval '2 days' THEN
      v_recommendation := 'Follow up now — high-value lead idle for 2+ days';
      v_reasoning := format('High-value lead (%s score) has been idle', v_value_score);
      v_urgency := 'medium';
      v_cta_text := 'Send Follow-Up';
    ELSE
      v_recommendation := 'Continue engagement — high-value lead';
      v_reasoning := format('High-value lead (%s score) - maintain momentum', v_value_score);
      v_urgency := 'low';
      v_cta_text := 'Continue Sequence';
    END IF;
  ELSE
    v_recommendation := 'Schedule routine inspection';
    v_reasoning := 'Standard lead - schedule inspection to assess needs';
    v_urgency := 'low';
    v_cta_text := 'Schedule Inspection';
  END IF;
  
  RETURN jsonb_build_object(
    'recommendation', v_recommendation,
    'reasoning', v_reasoning,
    'urgency', v_urgency,
    'cta_text', v_cta_text
  );
END;
$$;

-- ============================================================================
-- 5. FUNCTION: Generate Summary Alerts
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_summary_alerts(
  p_contact_id uuid
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alerts text[] := '{}'::text[];
  v_storm_score numeric;
  v_insurance_score integer;
  v_has_leak boolean;
  v_value_score integer;
  v_roof_age record;
BEGIN
  -- Check storm opportunity
  SELECT storm_damage_score INTO v_storm_score
  FROM public.photo_damage_scores
  WHERE contact_id = p_contact_id;
  
  IF v_storm_score >= 60 THEN
    v_alerts := array_append(v_alerts, 'high_storm_opportunity');
  END IF;
  
  -- Check insurance candidate
  SELECT likelihood_score INTO v_insurance_score
  FROM public.insurance_scores
  WHERE contact_id = p_contact_id;
  
  IF v_insurance_score >= 60 THEN
    v_alerts := array_append(v_alerts, 'insurance_candidate');
  END IF;
  
  -- Check urgent leak
  SELECT EXISTS(
    SELECT 1 FROM public.photo_intelligence
    WHERE contact_id = p_contact_id AND leak_detected = true AND is_emergency = true
  ) INTO v_has_leak;
  
  IF v_has_leak THEN
    v_alerts := array_append(v_alerts, 'urgent_leak');
  END IF;
  
  -- Check high-value replacement
  SELECT lead_money_score INTO v_value_score
  FROM public.lead_value_scores
  WHERE contact_id = p_contact_id;
  
  SELECT * INTO v_roof_age
  FROM public.roof_age_data
  WHERE contact_id = p_contact_id;
  
  IF v_value_score >= 70 AND COALESCE(v_roof_age.replacement_probability, 0) >= 70 THEN
    v_alerts := array_append(v_alerts, 'high_value_replacement_opportunity');
  END IF;
  
  -- Check appointment recommendation
  SELECT MAX(created_at) INTO v_value_score
  FROM public.inbox_threads
  WHERE contact_id = p_contact_id AND is_reply = true;
  
  IF v_value_score < now() - interval '1 day' AND (v_storm_score >= 60 OR v_has_leak) THEN
    v_alerts := array_append(v_alerts, 'appointment_recommended_today');
  END IF;
  
  RETURN v_alerts;
END;
$$;

-- ============================================================================
-- 6. FUNCTION: Update Summary On Change (Trigger Function)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_summary_on_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Regenerate summary when key data changes
  IF TG_TABLE_NAME = 'contacts' THEN
    PERFORM public.generate_smart_summary(NEW.id, 'default');
  ELSIF TG_TABLE_NAME = 'photo_intelligence' THEN
    PERFORM public.generate_smart_summary(NEW.contact_id, 'default');
  ELSIF TG_TABLE_NAME = 'insurance_metadata' THEN
    PERFORM public.generate_smart_summary(NEW.contact_id, 'default');
  ELSIF TG_TABLE_NAME = 'roof_age_data' THEN
    PERFORM public.generate_smart_summary(NEW.contact_id, 'default');
  ELSIF TG_TABLE_NAME = 'lead_value_scores' THEN
    PERFORM public.generate_smart_summary(NEW.contact_id, 'default');
  ELSIF TG_TABLE_NAME = 'tasks_v3' THEN
    PERFORM public.generate_smart_summary(NEW.contact_id, 'default');
  END IF;
  
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 7. FUNCTION: Generate Mode-Specific Summary
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_mode_summary(
  p_contact_id uuid,
  p_mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_summary jsonb;
BEGIN
  -- Generate base summary
  v_summary := public.generate_smart_summary(p_contact_id, p_mode);
  
  -- Apply mode-specific filtering/emphasis
  -- This would filter/emphasize sections based on mode configuration
  -- For now, just return the summary with the mode set
  
  RETURN v_summary;
END;
$$;

-- ============================================================================
-- 8. RLS POLICIES
-- ============================================================================

ALTER TABLE public.lead_smart_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.summary_modes ENABLE ROW LEVEL SECURITY;

-- RLS for lead_smart_summary
CREATE POLICY "Users can view smart summaries for their workspace"
  ON public.lead_smart_summary FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- RLS for summary_modes
CREATE POLICY "Users can view summary modes for their workspace"
  ON public.summary_modes FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Service role full access
CREATE POLICY "lead_smart_summary_service_role_full_access" ON public.lead_smart_summary
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "summary_modes_service_role_full_access" ON public.summary_modes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 9. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.lead_smart_summary IS 'Smart Summary v1 - One-button nuclear view that compresses everything SmartSend knows about a lead (Block 19100)';
COMMENT ON TABLE public.summary_modes IS 'Summary mode configurations (Sales Mode, Appointment Prep Mode, Office Mode)';

COMMENT ON COLUMN public.lead_smart_summary.summary_mode IS 'Mode: default, sales (money/value focus), prep (tools/materials focus), office (tasks/billing focus)';
COMMENT ON COLUMN public.lead_smart_summary.next_step_recommendation IS 'THE MOST IMPORTANT PART - Single best action the roofer should take next';
COMMENT ON COLUMN public.lead_smart_summary.alerts IS 'Mini alerts: high_storm_opportunity, insurance_candidate, urgent_leak, high_value_replacement_opportunity, appointment_recommended_today';

COMMENT ON FUNCTION public.generate_smart_summary IS 'Generates complete smart summary with all 10 sections for a contact';
COMMENT ON FUNCTION public.generate_next_step_recommendation IS 'Generates the single best next-step recommendation based on all available data';
COMMENT ON FUNCTION public.generate_summary_alerts IS 'Generates summary alerts based on lead characteristics';

