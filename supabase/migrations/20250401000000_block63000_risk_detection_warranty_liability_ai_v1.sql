-- =========================================================
-- Block 63000 — SmartSend Roofing "Risk Detection + Warranty Liability AI System" v1
-- (DETECT JOB RISKS • PREDICT FUTURE WARRANTY CLAIMS • FLAG INSTALLATION ERRORS • REDUCE LIABILITY • PREVENT CALLBACKS)
-- =========================================================
-- 
-- This system protects roofers from the #1 profit killer after job completion:
-- warranty claims + callbacks + installation mistakes that show up months/years later.
-- 
-- Every feature below directly helps roofers:
-- ✔ Prevents callbacks BEFORE they happen
-- ✔ Gives measurable risk number per job
-- ✔ Automates safety + quality control
-- ✔ Avoids financial surprises
-- ✔ Better planning, better crew training, fewer surprises
-- ✔ Boosts trust → more referrals → more 5-star reviews

-- ============================================================================
-- PART 1 — CREATE risk_assessments TABLE
-- ============================================================================
-- Stores AI-generated risk assessments for each job

CREATE TABLE IF NOT EXISTS public.risk_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  
  -- Risk scoring
  risk_score integer NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  
  -- Detailed risk factors (JSONB)
  risk_factors jsonb DEFAULT '{}'::jsonb,
  -- Structure: {
  --   "installation_risks": ["incorrect_nailing", "low_ventilation", ...],
  --   "material_risks": ["poor_quality_shingles", "inadequate_flashing", ...],
  --   "workmanship_risks": ["ridge_cap_misalignment", "valley_issues", ...],
  --   "environmental_risks": ["weather_during_install", "high_wind_area", ...]
  -- }
  
  -- Warranty risk prediction (JSONB)
  warranty_risk jsonb DEFAULT '{}'::jsonb,
  -- Structure: {
  --   "probability": 0-100,
  --   "predicted_claim_types": ["leak", "ventilation_failure", ...],
  --   "predicted_timeline_months": [6, 12, 24],
  --   "estimated_cost_range": {"min": 500, "max": 5000}
  -- }
  
  -- AI recommendations (JSONB array)
  recommendations jsonb DEFAULT '[]'::jsonb,
  -- Structure: [
  --   {"type": "immediate_fix", "priority": "high", "action": "Check step flashing", "reason": "..."},
  --   {"type": "monitor", "priority": "medium", "action": "Inspect ridge vent", "reason": "..."}
  -- ]
  
  -- Analysis metadata
  analyzed_at timestamptz DEFAULT now(),
  analyzed_by_ai boolean DEFAULT true,
  qc_inspection_id uuid REFERENCES public.qc_inspections(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'risk_assessments_job_id_fkey'
    ) THEN
      ALTER TABLE public.risk_assessments
        ADD CONSTRAINT risk_assessments_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'risk_assessments_workspace_id_fkey'
    ) THEN
      ALTER TABLE public.risk_assessments
        ADD CONSTRAINT risk_assessments_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_risk_assessments_job ON public.risk_assessments(job_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_workspace ON public.risk_assessments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_score ON public.risk_assessments(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_created ON public.risk_assessments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_qc ON public.risk_assessments(qc_inspection_id) WHERE qc_inspection_id IS NOT NULL;

-- ============================================================================
-- PART 2 — CREATE risk_alerts TABLE
-- ============================================================================
-- Critical risk alerts that need immediate attention

CREATE TABLE IF NOT EXISTS public.risk_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  risk_assessment_id uuid REFERENCES public.risk_assessments(id) ON DELETE SET NULL,
  
  -- Alert details
  alert_type text NOT NULL,
  -- Types: "installation_error", "ventilation_issue", "flashing_risk", "material_risk", "workmanship_issue", "environmental_risk"
  
  message text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  
  -- Related data
  related_checklist_item text,
  related_photo_id uuid,
  
  -- Resolution tracking
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes text,
  
  -- Task created (if auto-created)
  task_id uuid,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'risk_alerts_job_id_fkey'
    ) THEN
      ALTER TABLE public.risk_alerts
        ADD CONSTRAINT risk_alerts_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'risk_alerts_workspace_id_fkey'
    ) THEN
      ALTER TABLE public.risk_alerts
        ADD CONSTRAINT risk_alerts_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_risk_alerts_job ON public.risk_alerts(job_id);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_workspace ON public.risk_alerts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_severity ON public.risk_alerts(severity, resolved);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_resolved ON public.risk_alerts(resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_type ON public.risk_alerts(alert_type);

-- ============================================================================
-- PART 3 — CREATE warranty_prediction_history TABLE
-- ============================================================================
-- Historical warranty predictions for tracking accuracy and trends

CREATE TABLE IF NOT EXISTS public.warranty_prediction_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  risk_assessment_id uuid REFERENCES public.risk_assessments(id) ON DELETE SET NULL,
  
  -- Prediction details
  predicted_liability numeric(12,2),
  -- Estimated cost if warranty claim occurs
  
  predicted_date date,
  -- When warranty claim is predicted to occur
  
  factors jsonb DEFAULT '{}'::jsonb,
  -- Structure: {
  --   "primary_factors": ["poor_ventilation", "flashing_issues"],
  --   "secondary_factors": ["weather_during_install", "crew_experience"],
  --   "confidence": 0-100
  -- }
  
  -- Actual outcome (filled in later if claim occurs)
  actual_claim_occurred boolean DEFAULT false,
  actual_claim_date date,
  actual_claim_cost numeric(12,2),
  actual_claim_type text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now()
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'warranty_prediction_history_job_id_fkey'
    ) THEN
      ALTER TABLE public.warranty_prediction_history
        ADD CONSTRAINT warranty_prediction_history_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'warranty_prediction_history_workspace_id_fkey'
    ) THEN
      ALTER TABLE public.warranty_prediction_history
        ADD CONSTRAINT warranty_prediction_history_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_warranty_prediction_history_job ON public.warranty_prediction_history(job_id);
CREATE INDEX IF NOT EXISTS idx_warranty_prediction_history_workspace ON public.warranty_prediction_history(workspace_id);
CREATE INDEX IF NOT EXISTS idx_warranty_prediction_history_created ON public.warranty_prediction_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warranty_prediction_history_claim ON public.warranty_prediction_history(actual_claim_occurred) WHERE actual_claim_occurred = true;

-- ============================================================================
-- PART 4 — FUNCTIONS
-- ============================================================================

-- Function: Get risk level label from score
CREATE OR REPLACE FUNCTION public.get_risk_level_label(p_score integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_score >= 80 THEN
    RETURN 'VERY HIGH';
  ELSIF p_score >= 60 THEN
    RETURN 'HIGH';
  ELSIF p_score >= 40 THEN
    RETURN 'MEDIUM';
  ELSIF p_score >= 20 THEN
    RETURN 'SLIGHT CAUTION';
  ELSE
    RETURN 'LOW';
  END IF;
END;
$$;

-- Function: Auto-create risk alerts from assessment
CREATE OR REPLACE FUNCTION public.create_risk_alerts_from_assessment(
  p_risk_assessment_id uuid,
  p_threshold integer DEFAULT 40
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_assessment RECORD;
  v_recommendation jsonb;
  v_alert_severity text;
  v_task_id uuid;
BEGIN
  -- Get risk assessment
  SELECT * INTO v_assessment
  FROM public.risk_assessments
  WHERE id = p_risk_assessment_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Only create alerts if risk score exceeds threshold
  IF v_assessment.risk_score < p_threshold THEN
    RETURN;
  END IF;
  
  -- Create alerts from recommendations
  FOR v_recommendation IN SELECT * FROM jsonb_array_elements(v_assessment.recommendations)
  LOOP
    -- Determine severity from recommendation priority
    v_alert_severity := COALESCE((v_recommendation->>'priority')::text, 'medium');
    IF v_alert_severity NOT IN ('low', 'medium', 'high', 'critical') THEN
      v_alert_severity := 'medium';
    END IF;
    
    -- Create alert
    INSERT INTO public.risk_alerts (
      job_id,
      workspace_id,
      risk_assessment_id,
      alert_type,
      message,
      severity,
      related_checklist_item
    ) VALUES (
      v_assessment.job_id,
      v_assessment.workspace_id,
      p_risk_assessment_id,
      COALESCE((v_recommendation->>'type')::text, 'workmanship_issue'),
      COALESCE((v_recommendation->>'action')::text, 'Review installation'),
      v_alert_severity,
      (v_recommendation->>'checklist_item')::text
    )
    RETURNING id INTO v_task_id;
    
    -- If high priority, create task (if tasks table exists)
    IF v_alert_severity IN ('high', 'critical') THEN
      BEGIN
        INSERT INTO public.roofing_tasks (
          workspace_id,
          job_id,
          title,
          description,
          priority,
          status,
          creation_source,
          metadata
        ) VALUES (
          v_assessment.workspace_id,
          v_assessment.job_id,
          'Risk Alert: ' || COALESCE((v_recommendation->>'action')::text, 'Review installation'),
          COALESCE((v_recommendation->>'reason')::text, 'AI detected risk in installation'),
          CASE 
            WHEN v_alert_severity = 'critical' THEN 'high'
            ELSE 'medium'
          END,
          'open',
          'risk_detection',
          jsonb_build_object('risk_alert_id', v_task_id, 'risk_assessment_id', p_risk_assessment_id)
        )
        RETURNING id INTO v_task_id;
        
        -- Link task to alert
        UPDATE public.risk_alerts
        SET task_id = v_task_id
        WHERE id = v_task_id;
      EXCEPTION WHEN OTHERS THEN
        -- If tasks table doesn't exist or insert fails, continue
        NULL;
      END;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- PART 5 — TRIGGERS
-- ============================================================================

-- Trigger: Update updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_risk_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_risk_assessments_updated_at ON public.risk_assessments;
CREATE TRIGGER trg_risk_assessments_updated_at
BEFORE UPDATE ON public.risk_assessments
FOR EACH ROW
EXECUTE FUNCTION public.set_risk_updated_at();

DROP TRIGGER IF EXISTS trg_risk_alerts_updated_at ON public.risk_alerts;
CREATE TRIGGER trg_risk_alerts_updated_at
BEFORE UPDATE ON public.risk_alerts
FOR EACH ROW
EXECUTE FUNCTION public.set_risk_updated_at();

-- Trigger: Auto-create alerts when risk assessment is created/updated with high risk
DROP TRIGGER IF EXISTS trg_auto_create_risk_alerts ON public.risk_assessments;
CREATE TRIGGER trg_auto_create_risk_alerts
AFTER INSERT OR UPDATE ON public.risk_assessments
FOR EACH ROW
WHEN (NEW.risk_score >= 40)
EXECUTE FUNCTION public.create_risk_alerts_from_assessment(NEW.id, 40);

-- ============================================================================
-- PART 6 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE public.risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranty_prediction_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for risk_assessments
CREATE POLICY "risk_assessments_select_workspace"
  ON public.risk_assessments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = risk_assessments.workspace_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = w.id
          AND tm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "risk_assessments_insert_workspace"
  ON public.risk_assessments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = w.id
          AND tm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "risk_assessments_update_workspace"
  ON public.risk_assessments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = w.id
          AND tm.user_id = auth.uid()
        )
      )
    )
  );

-- RLS Policies for risk_alerts
CREATE POLICY "risk_alerts_select_workspace"
  ON public.risk_alerts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = risk_alerts.workspace_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = w.id
          AND tm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "risk_alerts_insert_workspace"
  ON public.risk_alerts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = w.id
          AND tm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "risk_alerts_update_workspace"
  ON public.risk_alerts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = w.id
          AND tm.user_id = auth.uid()
        )
      )
    )
  );

-- RLS Policies for warranty_prediction_history
CREATE POLICY "warranty_prediction_history_select_workspace"
  ON public.warranty_prediction_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = warranty_prediction_history.workspace_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = w.id
          AND tm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "warranty_prediction_history_insert_workspace"
  ON public.warranty_prediction_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = w.id
          AND tm.user_id = auth.uid()
        )
      )
    )
  );

-- ============================================================================
-- PART 7 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.risk_assessments IS 'AI-generated risk assessments for roofing jobs (Block 63000)';
COMMENT ON TABLE public.risk_alerts IS 'Critical risk alerts that need immediate attention (Block 63000)';
COMMENT ON TABLE public.warranty_prediction_history IS 'Historical warranty predictions for tracking accuracy (Block 63000)';

COMMENT ON FUNCTION public.get_risk_level_label IS 'Converts risk score (0-100) to human-readable label';
COMMENT ON FUNCTION public.create_risk_alerts_from_assessment IS 'Auto-creates risk alerts and tasks from risk assessment';




























