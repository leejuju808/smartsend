-- ============================================================
-- Block 68000 — SmartSend Roofing "Collections & Payment Intelligence System" v1
-- (AUTO PAYMENT REMINDERS • LATE PAYMENT PREDICTION • INVOICE TRACKING • 
--  HOMEOWNER PAY-NOW PORTAL • COLLECTION RISK SCORE • LIEN PROTECTION)
-- ============================================================
-- 
-- This block solves one of the BIGGEST cash-flow killers in roofing:
-- - Homeowners not paying on time
-- - Invoices getting lost
-- - Collections taking forever
-- 
-- SmartSend automates ALL OF THIS.
-- Roofers get their money faster. Cash flow stabilizes. Stress drops immediately.
-- ============================================================

-- ============================================================
-- 1. ENHANCE INVOICES TABLE (if columns don't exist)
-- ============================================================
DO $$
BEGIN
  -- Add viewed_at tracking if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'invoices' 
    AND column_name = 'viewed_at'
  ) THEN
    ALTER TABLE public.invoices ADD COLUMN viewed_at timestamptz;
  END IF;

  -- Add homeowner_id if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'invoices' 
    AND column_name = 'homeowner_id'
  ) THEN
    ALTER TABLE public.invoices ADD COLUMN homeowner_id uuid;
    
    -- Add foreign key if homeowners table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'homeowners') THEN
      ALTER TABLE public.invoices 
      ADD CONSTRAINT invoices_homeowner_id_fkey 
      FOREIGN KEY (homeowner_id) REFERENCES public.homeowners(id) ON DELETE SET NULL;
    END IF;
  END IF;

  -- Add payment_method tracking
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'invoices' 
    AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE public.invoices ADD COLUMN payment_method text;
  END IF;

  -- Add collection_stage
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'invoices' 
    AND column_name = 'collection_stage'
  ) THEN
    ALTER TABLE public.invoices ADD COLUMN collection_stage text DEFAULT 'invoice_sent' 
    CHECK (collection_stage IN (
      'invoice_sent',
      'reminder_sent',
      'overdue',
      'escalation_needed',
      'lien_warning',
      'sent_to_collections',
      'paid'
    ));
  END IF;

  -- Add invoice_link_token for secure homeowner access
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'invoices' 
    AND column_name = 'invoice_link_token'
  ) THEN
    ALTER TABLE public.invoices ADD COLUMN invoice_link_token text UNIQUE;
    CREATE INDEX IF NOT EXISTS idx_invoices_link_token ON public.invoices(invoice_link_token);
  END IF;

  -- Add late_days calculation column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'invoices' 
    AND column_name = 'late_days'
  ) THEN
    ALTER TABLE public.invoices ADD COLUMN late_days integer GENERATED ALWAYS AS (
      CASE 
        WHEN status IN ('overdue', 'partially_paid') AND due_date IS NOT NULL AND due_date < CURRENT_DATE
        THEN EXTRACT(DAY FROM CURRENT_DATE - due_date)::integer
        ELSE 0
      END
    ) STORED;
  END IF;
END $$;

-- ============================================================
-- 2. PAYMENT REMINDERS TABLE (Enhanced)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  reminder_type text NOT NULL CHECK (reminder_type IN (
    '3_days_before',
    'due_date',
    '5_days_late',
    '10_days_late',
    '30_days_late',
    'hard_reminder'
  )),
  scheduled_at timestamptz NOT NULL,
  sent_at timestamptz,
  sent_via text CHECK (sent_via IN ('email', 'sms', 'both')) DEFAULT 'email',
  message_subject text,
  message_body text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_reminders_invoice ON public.payment_reminders(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_scheduled ON public.payment_reminders(scheduled_at) WHERE sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payment_reminders_type ON public.payment_reminders(reminder_type);

-- ============================================================
-- 3. PAYMENT RISK SCORES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payment_risk_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homeowner_id uuid REFERENCES public.homeowners(id) ON DELETE CASCADE,
  job_id uuid,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  risk_score numeric(5,2) NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  factors jsonb DEFAULT '{}'::jsonb, -- Stores AI analysis factors
  recommendation text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_risk_scores_homeowner ON public.payment_risk_scores(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_payment_risk_scores_job ON public.payment_risk_scores(job_id);
CREATE INDEX IF NOT EXISTS idx_payment_risk_scores_invoice ON public.payment_risk_scores(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_risk_scores_score ON public.payment_risk_scores(risk_score DESC);

-- Add foreign key to jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'payment_risk_scores_job_id_fkey'
    ) THEN
      ALTER TABLE public.payment_risk_scores
      ADD CONSTRAINT payment_risk_scores_job_id_fkey
      FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'payment_risk_scores_roofing_job_id_fkey'
    ) THEN
      ALTER TABLE public.payment_risk_scores
      ADD COLUMN IF NOT EXISTS roofing_job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_payment_risk_scores_roofing_job ON public.payment_risk_scores(roofing_job_id);
    END IF;
  END IF;
END $$;

-- ============================================================
-- 4. PAYMENT PLANS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  homeowner_id uuid REFERENCES public.homeowners(id) ON DELETE SET NULL,
  total_amount numeric(12,2) NOT NULL,
  plan_type text NOT NULL CHECK (plan_type IN ('50_50', '60_40', '70_30', 'custom')),
  installments jsonb NOT NULL, -- Array of {amount, due_date, paid_at, status}
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'defaulted')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_plans_invoice ON public.payment_plans(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_homeowner ON public.payment_plans(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_status ON public.payment_plans(status);

-- ============================================================
-- 5. LIEN PROTECTION TIMELINE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lien_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  invoice_sent_date date NOT NULL,
  payment_due_date date NOT NULL,
  lien_rights_expiry_date date NOT NULL, -- Typically 90-120 days after completion
  days_until_expiry integer GENERATED ALWAYS AS (
    EXTRACT(DAY FROM lien_rights_expiry_date - CURRENT_DATE)::integer
  ) STORED,
  warning_sent_at timestamptz, -- Track when lien warning was sent
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lien_timeline_job ON public.lien_timeline(job_id);
CREATE INDEX IF NOT EXISTS idx_lien_timeline_invoice ON public.lien_timeline(invoice_id);
CREATE INDEX IF NOT EXISTS idx_lien_timeline_expiry ON public.lien_timeline(lien_rights_expiry_date);
CREATE INDEX IF NOT EXISTS idx_lien_timeline_days_until_expiry ON public.lien_timeline(days_until_expiry) WHERE days_until_expiry > 0;

-- Add foreign keys to jobs/roofing_jobs if they exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'lien_timeline_job_id_fkey'
    ) THEN
      ALTER TABLE public.lien_timeline
      ADD CONSTRAINT lien_timeline_job_id_fkey
      FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'lien_timeline_roofing_job_id_fkey'
    ) THEN
      ALTER TABLE public.lien_timeline
      ADD COLUMN IF NOT EXISTS roofing_job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_lien_timeline_roofing_job ON public.lien_timeline(roofing_job_id);
    END IF;
  END IF;
END $$;

-- ============================================================
-- 6. COLLECTIONS PIPELINE EVENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.collections_pipeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN (
    'invoice_sent',
    'reminder_sent',
    'overdue',
    'escalation_needed',
    'lien_warning',
    'sent_to_collections',
    'paid'
  )),
  previous_stage text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collections_pipeline_events_invoice ON public.collections_pipeline_events(invoice_id);
CREATE INDEX IF NOT EXISTS idx_collections_pipeline_events_stage ON public.collections_pipeline_events(stage);
CREATE INDEX IF NOT EXISTS idx_collections_pipeline_events_created ON public.collections_pipeline_events(created_at DESC);

-- ============================================================
-- 7. FUNCTION: GENERATE INVOICE LINK TOKEN
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_invoice_link_token()
RETURNS text
LANGUAGE sql
AS $$
  SELECT encode(gen_random_bytes(32), 'base64url');
$$;

-- ============================================================
-- 8. FUNCTION: SCHEDULE AUTOMATED PAYMENT REMINDERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.schedule_automated_payment_reminders(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice record;
  v_due_date date;
BEGIN
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id;
  
  IF NOT FOUND OR v_invoice.status = 'paid' THEN
    RETURN;
  END IF;
  
  v_due_date := COALESCE(v_invoice.due_date, v_invoice.created_at::date + INTERVAL '7 days');
  
  -- Schedule reminders: 3 days before, due date, 5 days late, 10 days late, 30 days late
  INSERT INTO public.payment_reminders (invoice_id, reminder_type, scheduled_at)
  VALUES
    (p_invoice_id, '3_days_before', v_due_date - INTERVAL '3 days'),
    (p_invoice_id, 'due_date', v_due_date),
    (p_invoice_id, '5_days_late', v_due_date + INTERVAL '5 days'),
    (p_invoice_id, '10_days_late', v_due_date + INTERVAL '10 days'),
    (p_invoice_id, '30_days_late', v_due_date + INTERVAL '30 days')
  ON CONFLICT DO NOTHING;
END;
$$;

-- ============================================================
-- 9. FUNCTION: UPDATE COLLECTION STAGE
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_collection_stage(
  p_invoice_id uuid,
  p_new_stage text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_previous_stage text;
BEGIN
  -- Get current stage
  SELECT collection_stage INTO v_previous_stage
  FROM public.invoices
  WHERE id = p_invoice_id;
  
  -- Update invoice stage
  UPDATE public.invoices
  SET collection_stage = p_new_stage,
      updated_at = now()
  WHERE id = p_invoice_id;
  
  -- Log pipeline event
  INSERT INTO public.collections_pipeline_events (invoice_id, stage, previous_stage)
  VALUES (p_invoice_id, p_new_stage, v_previous_stage);
END;
$$;

-- ============================================================
-- 10. FUNCTION: CALCULATE PAYMENT RISK SCORE (Placeholder - AI will enhance)
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_payment_risk_score(
  p_homeowner_id uuid,
  p_job_id uuid DEFAULT NULL,
  p_invoice_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_risk_score numeric := 50.0; -- Default medium risk
  v_late_payments_count integer;
  v_response_time_avg interval;
  v_invoice_views_count integer;
BEGIN
  -- Count past late payments (if repeat customer)
  SELECT COUNT(*) INTO v_late_payments_count
  FROM public.invoices i
  JOIN public.homeowners h ON h.id = i.homeowner_id
  WHERE h.id = p_homeowner_id
    AND i.status IN ('overdue')
    AND i.id != COALESCE(p_invoice_id, '00000000-0000-0000-0000-000000000000'::uuid);
  
  -- Adjust risk based on late payments
  IF v_late_payments_count > 0 THEN
    v_risk_score := v_risk_score + (v_late_payments_count * 10);
  END IF;
  
  -- Check invoice viewing behavior (if invoice_id provided)
  IF p_invoice_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_invoice_views_count
    FROM public.invoice_events
    WHERE invoice_id = p_invoice_id
      AND event = 'viewed';
    
    IF v_invoice_views_count = 0 THEN
      v_risk_score := v_risk_score + 15; -- Never viewed = higher risk
    END IF;
  END IF;
  
  -- Cap at 100
  IF v_risk_score > 100 THEN
    v_risk_score := 100;
  END IF;
  
  RETURN ROUND(v_risk_score, 2);
END;
$$;

-- ============================================================
-- 11. FUNCTION: CHECK LIEN WINDOW
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_lien_windows()
RETURNS TABLE (
  invoice_id uuid,
  job_id uuid,
  days_until_expiry integer,
  lien_rights_expiry_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    lt.invoice_id,
    COALESCE(lt.job_id, lt.roofing_job_id) as job_id,
    lt.days_until_expiry,
    lt.lien_rights_expiry_date
  FROM public.lien_timeline lt
  JOIN public.invoices i ON i.id = lt.invoice_id
  WHERE i.status NOT IN ('paid', 'canceled')
    AND lt.days_until_expiry > 0
    AND lt.days_until_expiry <= 15 -- Warning window: 15 days
    AND (lt.warning_sent_at IS NULL OR lt.warning_sent_at < now() - INTERVAL '7 days'); -- Resend after 7 days
END;
$$;

-- ============================================================
-- 12. FUNCTION: GET OVERDUE INVOICES BY SEVERITY
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_overdue_invoices_by_severity(
  p_workspace_id uuid DEFAULT NULL,
  p_team_id uuid DEFAULT NULL
)
RETURNS TABLE (
  invoice_id uuid,
  invoice_number text,
  homeowner_name text,
  homeowner_email text,
  amount numeric,
  balance_due numeric,
  due_date date,
  late_days integer,
  severity text,
  collection_stage text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.id as invoice_id,
    i.invoice_number,
    h.name as homeowner_name,
    h.email as homeowner_email,
    i.amount,
    COALESCE(i.balance_due, i.amount) as balance_due,
    i.due_date,
    CASE 
      WHEN i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE
      THEN EXTRACT(DAY FROM CURRENT_DATE - i.due_date)::integer
      ELSE 0
    END as late_days,
    CASE 
      WHEN i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE - INTERVAL '30 days' THEN 'critical'
      WHEN i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE - INTERVAL '15 days' THEN 'high'
      WHEN i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE - INTERVAL '5 days' THEN 'medium'
      ELSE 'low'
    END as severity,
    i.collection_stage
  FROM public.invoices i
  LEFT JOIN public.homeowners h ON h.id = i.homeowner_id
  WHERE i.status IN ('overdue', 'partially_paid')
    AND COALESCE(i.balance_due, i.amount) > 0
    AND (p_workspace_id IS NULL OR i.workspace_id = p_workspace_id)
    AND (p_team_id IS NULL OR i.team_id = p_team_id)
  ORDER BY 
    CASE severity
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      ELSE 4
    END,
    late_days DESC;
END;
$$;

-- ============================================================
-- 13. FUNCTION: GET REVENUE FORECAST
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_revenue_forecast(
  p_workspace_id uuid DEFAULT NULL,
  p_team_id uuid DEFAULT NULL,
  p_days_ahead integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'forecasted_incoming', (
      SELECT COALESCE(SUM(COALESCE(i.balance_due, i.amount)), 0)
      FROM public.invoices i
      WHERE i.status IN ('pending', 'partially_paid')
        AND i.due_date >= CURRENT_DATE
        AND i.due_date <= CURRENT_DATE + (p_days_ahead || ' days')::interval
        AND (p_workspace_id IS NULL OR i.workspace_id = p_workspace_id)
        AND (p_team_id IS NULL OR i.team_id = p_team_id)
    ),
    'at_risk_amount', (
      SELECT COALESCE(SUM(COALESCE(i.balance_due, i.amount)), 0)
      FROM public.invoices i
      WHERE i.status = 'overdue'
        AND (p_workspace_id IS NULL OR i.workspace_id = p_workspace_id)
        AND (p_team_id IS NULL OR i.team_id = p_team_id)
    ),
    'overdue_risk', (
      SELECT jsonb_build_object(
        'high_risk', COALESCE(SUM(COALESCE(i.balance_due, i.amount)), 0)
      )
      FROM public.invoices i
      JOIN public.payment_risk_scores prs ON prs.invoice_id = i.id
      WHERE i.status IN ('pending', 'partially_paid')
        AND prs.risk_score >= 70
        AND (p_workspace_id IS NULL OR i.workspace_id = p_workspace_id)
        AND (p_team_id IS NULL OR i.team_id = p_team_id)
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- ============================================================
-- 14. TRIGGER: AUTO-GENERATE INVOICE LINK TOKEN
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_generate_invoice_token()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.invoice_link_token IS NULL THEN
    NEW.invoice_link_token := public.generate_invoice_link_token();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_generate_invoice_token ON public.invoices;
CREATE TRIGGER trg_auto_generate_invoice_token
BEFORE INSERT ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.auto_generate_invoice_token();

-- ============================================================
-- 15. TRIGGER: AUTO-SCHEDULE REMINDERS ON INVOICE CREATION
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_schedule_reminders()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'sent' OR NEW.status = 'pending' THEN
    PERFORM public.schedule_automated_payment_reminders(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_schedule_reminders ON public.invoices;
CREATE TRIGGER trg_auto_schedule_reminders
AFTER INSERT ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.auto_schedule_reminders();

-- ============================================================
-- 16. TRIGGER: UPDATE COLLECTION STAGE ON STATUS CHANGE
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_update_collection_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update collection stage based on status changes
  IF OLD.status != NEW.status THEN
    IF NEW.status = 'paid' THEN
      PERFORM public.update_collection_stage(NEW.id, 'paid');
    ELSIF NEW.status = 'overdue' AND OLD.collection_stage != 'overdue' THEN
      PERFORM public.update_collection_stage(NEW.id, 'overdue');
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_update_collection_stage ON public.invoices;
CREATE TRIGGER trg_auto_update_collection_stage
AFTER UPDATE OF status ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.auto_update_collection_stage();

-- ============================================================
-- 17. TRIGGER: UPDATE updated_at FOR RISK SCORES
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_payment_risk_scores_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_risk_scores_updated_at ON public.payment_risk_scores;
CREATE TRIGGER trg_payment_risk_scores_updated_at
BEFORE UPDATE ON public.payment_risk_scores
FOR EACH ROW
EXECUTE FUNCTION public.update_payment_risk_scores_updated_at();

-- ============================================================
-- 18. TRIGGER: UPDATE updated_at FOR PAYMENT PLANS
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_payment_plans_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_plans_updated_at ON public.payment_plans;
CREATE TRIGGER trg_payment_plans_updated_at
BEFORE UPDATE ON public.payment_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_payment_plans_updated_at();

-- ============================================================
-- 19. ROW LEVEL SECURITY POLICIES
-- ============================================================

-- Payment Reminders
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_reminders_access" ON public.payment_reminders;
CREATE POLICY "payment_reminders_access" ON public.payment_reminders
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.invoices i
      WHERE i.id = payment_reminders.invoice_id
      AND (
        (i.workspace_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.workspace_members 
          WHERE workspace_id = i.workspace_id AND user_id = auth.uid()
        ))
        OR
        (i.team_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.team_members 
          WHERE team_id = i.team_id AND user_id = auth.uid()
        ))
      )
    )
  );

-- Payment Risk Scores
ALTER TABLE public.payment_risk_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_risk_scores_access" ON public.payment_risk_scores;
CREATE POLICY "payment_risk_scores_access" ON public.payment_risk_scores
  FOR SELECT USING (
    invoice_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.invoices i
      WHERE i.id = payment_risk_scores.invoice_id
      AND (
        (i.workspace_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.workspace_members 
          WHERE workspace_id = i.workspace_id AND user_id = auth.uid()
        ))
        OR
        (i.team_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.team_members 
          WHERE team_id = i.team_id AND user_id = auth.uid()
        ))
      )
    )
  );

-- Payment Plans
ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_plans_access" ON public.payment_plans;
CREATE POLICY "payment_plans_access" ON public.payment_plans
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.invoices i
      WHERE i.id = payment_plans.invoice_id
      AND (
        (i.workspace_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.workspace_members 
          WHERE workspace_id = i.workspace_id AND user_id = auth.uid()
        ))
        OR
        (i.team_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.team_members 
          WHERE team_id = i.team_id AND user_id = auth.uid()
        ))
      )
    )
  );

-- Lien Timeline
ALTER TABLE public.lien_timeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lien_timeline_access" ON public.lien_timeline;
CREATE POLICY "lien_timeline_access" ON public.lien_timeline
  FOR SELECT USING (
    invoice_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.invoices i
      WHERE i.id = lien_timeline.invoice_id
      AND (
        (i.workspace_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.workspace_members 
          WHERE workspace_id = i.workspace_id AND user_id = auth.uid()
        ))
        OR
        (i.team_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.team_members 
          WHERE team_id = i.team_id AND user_id = auth.uid()
        ))
      )
    )
  );

-- Collections Pipeline Events
ALTER TABLE public.collections_pipeline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "collections_pipeline_events_access" ON public.collections_pipeline_events;
CREATE POLICY "collections_pipeline_events_access" ON public.collections_pipeline_events
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM public.invoices i
      WHERE i.id = collections_pipeline_events.invoice_id
      AND (
        (i.workspace_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.workspace_members 
          WHERE workspace_id = i.workspace_id AND user_id = auth.uid()
        ))
        OR
        (i.team_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.team_members 
          WHERE team_id = i.team_id AND user_id = auth.uid()
        ))
      )
    )
  );

-- ============================================================
-- END OF MIGRATION
-- ============================================================




























