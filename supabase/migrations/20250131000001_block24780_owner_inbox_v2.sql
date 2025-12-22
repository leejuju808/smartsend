-- =========================================================
-- Block 24780 — SmartSend Roofing Owner Inbox v2
-- (Owner-Only View • High-Priority Escalations • Financial Alerts • Crew & Supplier Problems • "What the Owner Needs to Know Today")
-- =========================================================
-- 
-- THIS IS THE OWNER-LEVEL COMMAND MODULE — ZERO FLUFF.
-- 
-- This feature gives the OWNER a private, high-level inbox that cuts out noise and ONLY surfaces:
-- ✔ problems
-- ✔ risks
-- ✔ opportunities
-- ✔ money alerts
-- ✔ staffing issues
-- ✔ supplier failures
-- ✔ jobs at risk
-- ✔ customer escalations
--
-- This is NOT the normal inbox.
-- This is the CEO View of SmartSend.
--
-- It tells the owner EXACTLY what they need to address — nothing more, nothing less.

-- ============================================================================
-- PART 1 — CREATE owner_inbox_items TABLE
-- ============================================================================
-- Stores high-impact items that need owner attention

CREATE TABLE IF NOT EXISTS public.owner_inbox_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Message type (one of 6 types)
  message_type text NOT NULL CHECK (message_type IN (
    'financial_alert',
    'job_risk_alert',
    'crew_problem',
    'supplier_problem',
    'high_value_opportunity',
    'leadership_decision_needed'
  )),
  
  -- Priority level
  priority text NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',
  
  -- Title and description
  title text NOT NULL,
  description text,
  
  -- Related entities (flexible - can link to jobs, leads, crews, suppliers, etc.)
  related_job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  related_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  related_crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  related_supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  related_invoice_id uuid REFERENCES public.job_invoices(id) ON DELETE SET NULL,
  related_payment_id uuid REFERENCES public.job_payments(id) ON DELETE SET NULL,
  
  -- Action metadata
  action_type text, -- e.g., 'assign_to_manager', 'call_homeowner', 'message_crew_lead', 'contact_supplier', 'resolve_and_watch', 'create_task'
  action_url text, -- Deep link to relevant dashboard view
  
  -- Status
  status text NOT NULL CHECK (status IN ('new', 'acknowledged', 'resolved', 'dismissed')) DEFAULT 'new',
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  dismissed_at timestamptz,
  dismissed_by uuid REFERENCES auth.users(id),
  
  -- Additional context (JSONB for flexibility)
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  escalated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owner_inbox_items_workspace_owner 
  ON public.owner_inbox_items(workspace_id, owner_id, status, priority, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_owner_inbox_items_status 
  ON public.owner_inbox_items(status, priority) 
  WHERE status = 'new';

CREATE INDEX IF NOT EXISTS idx_owner_inbox_items_message_type 
  ON public.owner_inbox_items(message_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_owner_inbox_items_priority 
  ON public.owner_inbox_items(priority, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_owner_inbox_items_related_job 
  ON public.owner_inbox_items(related_job_id) 
  WHERE related_job_id IS NOT NULL;

-- ============================================================================
-- PART 2 — CREATE FUNCTION: escalate_to_owner_inbox
-- ============================================================================
-- Generic function to escalate items to owner inbox

CREATE OR REPLACE FUNCTION public.escalate_to_owner_inbox(
  p_workspace_id uuid,
  p_message_type text,
  p_priority text,
  p_title text,
  p_description text DEFAULT NULL,
  p_related_job_id uuid DEFAULT NULL,
  p_related_lead_id uuid DEFAULT NULL,
  p_related_crew_id uuid DEFAULT NULL,
  p_related_supplier_id uuid DEFAULT NULL,
  p_related_invoice_id uuid DEFAULT NULL,
  p_related_payment_id uuid DEFAULT NULL,
  p_action_type text DEFAULT NULL,
  p_action_url text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id uuid;
  v_item_id uuid;
BEGIN
  -- Get owner_id from workspace (workspace owner or first user with owner role)
  SELECT 
    COALESCE(
      w.owner_id,
      (SELECT u.auth_user_id FROM public.users u WHERE u.account_id = w.id AND u.role = 'owner' LIMIT 1),
      (SELECT wm.user_id FROM public.workspace_members wm WHERE wm.workspace_id = p_workspace_id LIMIT 1)
    )
  INTO v_owner_id
  FROM public.workspaces w
  WHERE w.id = p_workspace_id
  LIMIT 1;
  
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'No owner found for workspace %', p_workspace_id;
  END IF;
  
  -- Check if similar item already exists (prevent duplicates)
  SELECT id INTO v_item_id
  FROM public.owner_inbox_items
  WHERE workspace_id = p_workspace_id
    AND owner_id = v_owner_id
    AND message_type = p_message_type
    AND status = 'new'
    AND (
      (p_related_job_id IS NOT NULL AND related_job_id = p_related_job_id)
      OR (p_related_lead_id IS NOT NULL AND related_lead_id = p_related_lead_id)
      OR (p_related_crew_id IS NOT NULL AND related_crew_id = p_related_crew_id)
      OR (p_related_supplier_id IS NOT NULL AND related_supplier_id = p_related_supplier_id)
      OR (p_related_invoice_id IS NOT NULL AND related_invoice_id = p_related_invoice_id)
    )
  LIMIT 1;
  
  -- If exists, update it; otherwise create new
  IF v_item_id IS NOT NULL THEN
    UPDATE public.owner_inbox_items
    SET 
      priority = GREATEST(priority::text, p_priority)::text,
      description = COALESCE(p_description, description),
      updated_at = now(),
      escalated_at = now()
    WHERE id = v_item_id;
    RETURN v_item_id;
  ELSE
    INSERT INTO public.owner_inbox_items (
      workspace_id,
      owner_id,
      message_type,
      priority,
      title,
      description,
      related_job_id,
      related_lead_id,
      related_crew_id,
      related_supplier_id,
      related_invoice_id,
      related_payment_id,
      action_type,
      action_url,
      metadata
    )
    VALUES (
      p_workspace_id,
      v_owner_id,
      p_message_type,
      p_priority,
      p_title,
      p_description,
      p_related_job_id,
      p_related_lead_id,
      p_related_crew_id,
      p_related_supplier_id,
      p_related_invoice_id,
      p_related_payment_id,
      p_action_type,
      p_action_url,
      p_metadata
    )
    RETURNING id INTO v_item_id;
    RETURN v_item_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.escalate_to_owner_inbox IS 'Block 24780: Escalates items to owner inbox based on escalation rules';

-- ============================================================================
-- PART 3 — CREATE FUNCTION: check_financial_alerts
-- ============================================================================
-- Detects financial alerts and escalates to owner

CREATE OR REPLACE FUNCTION public.check_financial_alerts(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alert record;
BEGIN
  -- Final invoice overdue > 7 days
  FOR v_alert IN
    SELECT 
      pse.job_id,
      pse.invoice_id,
      j.title as job_title,
      pse.expected_amount,
      pse.due_date,
      current_date - pse.due_date as days_overdue
    FROM public.payment_status_engine pse
    JOIN public.roofing_jobs j ON j.id = pse.job_id
    WHERE pse.workspace_id = p_workspace_id
      AND pse.payment_type = 'final_invoice'
      AND pse.status = 'overdue'
      AND pse.due_date < current_date - INTERVAL '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.owner_inbox_items oii
        WHERE oii.workspace_id = p_workspace_id
          AND oii.related_invoice_id = pse.invoice_id
          AND oii.message_type = 'financial_alert'
          AND oii.status = 'new'
      )
  LOOP
    PERFORM public.escalate_to_owner_inbox(
      p_workspace_id,
      'financial_alert',
      'high',
      format('Final invoice overdue — $%s outstanding (%s)', v_alert.expected_amount, v_alert.job_title),
      format('Invoice is %s days overdue. Payment needed immediately.', v_alert.days_overdue),
      v_alert.job_id,
      NULL, -- lead_id
      NULL, -- crew_id
      NULL, -- supplier_id
      v_alert.invoice_id,
      NULL, -- payment_id
      'call_homeowner',
      format('/jobs/%s/payments', v_alert.job_id),
      jsonb_build_object('amount', v_alert.expected_amount, 'days_overdue', v_alert.days_overdue)
    );
  END LOOP;
  
  -- Deposit not collected - job should NOT start
  FOR v_alert IN
    SELECT 
      pse.job_id,
      pse.invoice_id,
      j.title as job_title,
      pse.expected_amount,
      j.scheduled_start_date
    FROM public.payment_status_engine pse
    JOIN public.roofing_jobs j ON j.id = pse.job_id
    WHERE pse.workspace_id = p_workspace_id
      AND pse.payment_type = 'deposit'
      AND pse.status = 'unpaid'
      AND j.status IN ('scheduled', 'in_progress')
      AND j.scheduled_start_date <= current_date + INTERVAL '1 day'
      AND NOT EXISTS (
        SELECT 1 FROM public.owner_inbox_items oii
        WHERE oii.workspace_id = p_workspace_id
          AND oii.related_job_id = pse.job_id
          AND oii.message_type = 'financial_alert'
          AND oii.status = 'new'
      )
  LOOP
    PERFORM public.escalate_to_owner_inbox(
      p_workspace_id,
      'financial_alert',
      'critical',
      format('Deposit not collected — job should NOT start (%s)', v_alert.job_title),
      format('Job is scheduled to start %s but deposit of $%s has not been collected.', 
        COALESCE(v_alert.scheduled_start_date::text, 'soon'), v_alert.expected_amount),
      v_alert.job_id,
      NULL,
      NULL,
      NULL,
      v_alert.invoice_id,
      NULL,
      'call_homeowner',
      format('/jobs/%s/payments', v_alert.job_id),
      jsonb_build_object('amount', v_alert.expected_amount, 'scheduled_start_date', v_alert.scheduled_start_date)
    );
  END LOOP;
  
  -- Insurance depreciation stalled > 12 days
  FOR v_alert IN
    SELECT 
      pse.job_id,
      j.title as job_title,
      pse.expected_amount,
      pse.due_date,
      current_date - pse.due_date as days_stalled
    FROM public.payment_status_engine pse
    JOIN public.roofing_jobs j ON j.id = pse.job_id
    WHERE pse.workspace_id = p_workspace_id
      AND pse.payment_type = 'depreciation'
      AND pse.status IN ('unpaid', 'insurance_submitted', 'insurance_approved')
      AND pse.due_date < current_date - INTERVAL '12 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.owner_inbox_items oii
        WHERE oii.workspace_id = p_workspace_id
          AND oii.related_job_id = pse.job_id
          AND oii.message_type = 'financial_alert'
          AND oii.status = 'new'
      )
  LOOP
    PERFORM public.escalate_to_owner_inbox(
      p_workspace_id,
      'financial_alert',
      'high',
      format('Insurance depreciation stalled for %s days (%s)', v_alert.days_stalled, v_alert.job_title),
      format('Depreciation check of $%s has been stalled for %s days. Follow up with insurance company.', 
        v_alert.expected_amount, v_alert.days_stalled),
      v_alert.job_id,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      'call_homeowner',
      format('/jobs/%s/insurance', v_alert.job_id),
      jsonb_build_object('amount', v_alert.expected_amount, 'days_stalled', v_alert.days_stalled)
    );
  END LOOP;
  
  -- Supplement rejected
  FOR v_alert IN
    SELECT 
      pse.job_id,
      j.title as job_title,
      pse.supplement_status,
      pse.expected_amount
    FROM public.payment_status_engine pse
    JOIN public.roofing_jobs j ON j.id = pse.job_id
    WHERE pse.workspace_id = p_workspace_id
      AND pse.supplement_status = 'denied'
      AND NOT EXISTS (
        SELECT 1 FROM public.owner_inbox_items oii
        WHERE oii.workspace_id = p_workspace_id
          AND oii.related_job_id = pse.job_id
          AND oii.message_type = 'financial_alert'
          AND oii.status = 'new'
      )
  LOOP
    PERFORM public.escalate_to_owner_inbox(
      p_workspace_id,
      'financial_alert',
      'high',
      format('Supplement rejected — $%s potential loss (%s)', v_alert.expected_amount, v_alert.job_title),
      format('Insurance supplement of $%s was denied. Owner intervention needed to appeal or negotiate.', 
        v_alert.expected_amount),
      v_alert.job_id,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      'call_homeowner',
      format('/jobs/%s/insurance', v_alert.job_id),
      jsonb_build_object('amount', v_alert.expected_amount, 'supplement_status', v_alert.supplement_status)
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.check_financial_alerts IS 'Block 24780: Checks for financial alerts and escalates to owner inbox';

-- ============================================================================
-- PART 4 — CREATE FUNCTION: check_job_risk_alerts
-- ============================================================================
-- Detects job risk alerts and escalates to owner

CREATE OR REPLACE FUNCTION public.check_job_risk_alerts(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alert record;
BEGIN
  -- Delivery delayed - crew will be idle
  FOR v_alert IN
    SELECT 
      mo.job_id,
      j.title as job_title,
      mo.expected_delivery_date,
      mo.issue_description,
      s.name as supplier_name
    FROM public.material_orders mo
    JOIN public.roofing_jobs j ON j.id = mo.job_id
    LEFT JOIN public.suppliers s ON s.id = mo.supplier_id
    WHERE mo.workspace_id = p_workspace_id
      AND mo.status IN ('delayed', 'issue_reported')
      AND j.status IN ('scheduled', 'in_progress')
      AND j.scheduled_start_date <= current_date + INTERVAL '2 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.owner_inbox_items oii
        WHERE oii.workspace_id = p_workspace_id
          AND oii.related_job_id = mo.job_id
          AND oii.message_type = 'job_risk_alert'
          AND oii.status = 'new'
      )
  LOOP
    PERFORM public.escalate_to_owner_inbox(
      p_workspace_id,
      'job_risk_alert',
      'critical',
      format('Delivery delayed — crew will be idle (%s)', v_alert.job_title),
      format('Material delivery from %s is delayed. Crew scheduled to start %s may be idle.', 
        COALESCE(v_alert.supplier_name, 'supplier'), v_alert.job_title),
      v_alert.job_id,
      NULL,
      NULL,
      (SELECT supplier_id FROM public.material_orders WHERE job_id = v_alert.job_id LIMIT 1),
      NULL,
      NULL,
      'contact_supplier',
      format('/jobs/%s/materials', v_alert.job_id),
      jsonb_build_object('supplier_name', v_alert.supplier_name, 'expected_delivery_date', v_alert.expected_delivery_date)
    );
  END LOOP;
  
  -- Homeowner unhappy - review risk
  FOR v_alert IN
    SELECT 
      j.id as job_id,
      j.title as job_title,
      hs.overall_score,
      (SELECT COUNT(*) FROM public.job_health_issues jhi WHERE jhi.job_id = j.id AND jhi.status = 'active') as issues_count
    FROM public.roofing_jobs j
    JOIN public.job_health_scores hs ON hs.job_id = j.id
    WHERE j.workspace_id = p_workspace_id
      AND j.status IN ('scheduled', 'in_progress')
      AND hs.overall_score < 50
      AND NOT EXISTS (
        SELECT 1 FROM public.owner_inbox_items oii
        WHERE oii.workspace_id = p_workspace_id
          AND oii.related_job_id = j.id
          AND oii.message_type = 'job_risk_alert'
          AND oii.status = 'new'
      )
  LOOP
    PERFORM public.escalate_to_owner_inbox(
      p_workspace_id,
      'job_risk_alert',
      'high',
      format('Homeowner unhappy — review risk (%s)', v_alert.job_title),
      format('Job health score is %s (below 50). Multiple issues detected. Owner review needed.', 
        v_alert.overall_score),
      v_alert.job_id,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      'call_homeowner',
      format('/jobs/%s', v_alert.job_id),
      jsonb_build_object('health_score', v_alert.overall_score, 'issues_count', v_alert.issues_count)
    );
  END LOOP;
  
  -- Crew reporting decking issues - cost change expected
  FOR v_alert IN
    SELECT 
      jhi.job_id,
      j.title as job_title,
      jhi.issue_description,
      jhi.issue_type
    FROM public.job_health_issues jhi
    JOIN public.roofing_jobs j ON j.id = jhi.job_id
    WHERE jhi.workspace_id = p_workspace_id
      AND jhi.status = 'active'
      AND jhi.issue_type LIKE '%decking%'
      AND j.status IN ('scheduled', 'in_progress')
      AND NOT EXISTS (
        SELECT 1 FROM public.owner_inbox_items oii
        WHERE oii.workspace_id = p_workspace_id
          AND oii.related_job_id = jhi.job_id
          AND oii.message_type = 'job_risk_alert'
          AND oii.status = 'new'
      )
  LOOP
    PERFORM public.escalate_to_owner_inbox(
      p_workspace_id,
      'job_risk_alert',
      'high',
      format('Crew reporting decking issues — cost change expected (%s)', v_alert.job_title),
      format('Crew has reported decking issues: %s. Cost change expected. Owner approval needed.', 
        v_alert.issue_description),
      v_alert.job_id,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      'message_crew_lead',
      format('/jobs/%s', v_alert.job_id),
      jsonb_build_object('issue_type', v_alert.issue_type, 'issue_description', v_alert.issue_description)
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.check_job_risk_alerts IS 'Block 24780: Checks for job risk alerts and escalates to owner inbox';

-- ============================================================================
-- PART 5 — CREATE FUNCTION: check_crew_problems
-- ============================================================================
-- Detects crew problems and escalates to owner

CREATE OR REPLACE FUNCTION public.check_crew_problems(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alert record;
BEGIN
  -- Crew late 3 days in a row
  FOR v_alert IN
    SELECT 
      c.id as crew_id,
      c.name as crew_name,
      COUNT(*) as late_count
    FROM public.crews c
    JOIN public.job_crew_assignments jca ON jca.crew_id = c.id AND jca.unassigned_at IS NULL
    JOIN public.roofing_jobs j ON j.id = jca.job_id
    WHERE c.workspace_id = p_workspace_id
      AND j.status IN ('scheduled', 'in_progress')
      AND j.scheduled_start_date BETWEEN current_date - INTERVAL '3 days' AND current_date
      AND EXISTS (
        SELECT 1 FROM public.job_health_issues jhi
        WHERE jhi.job_id = j.id
          AND jhi.pillar = 'crew_readiness'
          AND jhi.status = 'active'
      )
    GROUP BY c.id, c.name
    HAVING COUNT(*) >= 3
  LOOP
    PERFORM public.escalate_to_owner_inbox(
      p_workspace_id,
      'crew_problem',
      'high',
      format('Crew %s late 3 days in a row', v_alert.crew_name),
      format('Crew %s has been late for 3 consecutive days. Performance review needed.', v_alert.crew_name),
      NULL,
      NULL,
      v_alert.crew_id,
      NULL,
      NULL,
      NULL,
      'message_crew_lead',
      format('/crews/%s', v_alert.crew_id),
      jsonb_build_object('late_count', v_alert.late_count)
    );
  END LOOP;
  
  -- Crew cleanup complaints from homeowner
  FOR v_alert IN
    SELECT DISTINCT
      c.id as crew_id,
      c.name as crew_name,
      j.id as job_id,
      j.title as job_title
    FROM public.crews c
    JOIN public.job_crew_assignments jca ON jca.crew_id = c.id AND jca.unassigned_at IS NULL
    JOIN public.roofing_jobs j ON j.id = jca.job_id
    JOIN public.job_health_issues jhi ON jhi.job_id = j.id
    WHERE c.workspace_id = p_workspace_id
      AND jhi.pillar = 'homeowner_readiness'
      AND jhi.issue_type LIKE '%cleanup%'
      AND jhi.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.owner_inbox_items oii
        WHERE oii.workspace_id = p_workspace_id
          AND oii.related_crew_id = c.id
          AND oii.message_type = 'crew_problem'
          AND oii.status = 'new'
      )
  LOOP
    PERFORM public.escalate_to_owner_inbox(
      p_workspace_id,
      'crew_problem',
      'medium',
      format('Crew %s cleanup complaints from homeowner (%s)', v_alert.crew_name, v_alert.job_title),
      format('Homeowner has complained about cleanup quality from crew %s on job %s.', 
        v_alert.crew_name, v_alert.job_title),
      v_alert.job_id,
      NULL,
      v_alert.crew_id,
      NULL,
      NULL,
      NULL,
      'message_crew_lead',
      format('/crews/%s', v_alert.crew_id),
      jsonb_build_object('job_title', v_alert.job_title)
    );
  END LOOP;
  
  -- Crew uploaded no documentation today (if job_documents table exists)
  -- Note: This check is optional and will be skipped if table doesn't exist
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_documents') THEN
    FOR v_alert IN
      SELECT 
        c.id as crew_id,
        c.name as crew_name
      FROM public.crews c
      JOIN public.job_crew_assignments jca ON jca.crew_id = c.id AND jca.unassigned_at IS NULL
      JOIN public.roofing_jobs j ON j.id = jca.job_id
      WHERE c.workspace_id = p_workspace_id
        AND j.status = 'in_progress'
        AND j.scheduled_start_date = current_date
        AND NOT EXISTS (
          SELECT 1 FROM public.job_documents jd
          WHERE jd.job_id = j.id
            AND jd.created_at::date = current_date
        )
      GROUP BY c.id, c.name
      HAVING COUNT(*) > 0
  LOOP
    PERFORM public.escalate_to_owner_inbox(
      p_workspace_id,
      'crew_problem',
      'low',
      format('Crew %s uploaded no documentation today', v_alert.crew_name),
      format('Crew %s has not uploaded any job documentation today. Follow up needed.', v_alert.crew_name),
      NULL,
      NULL,
      v_alert.crew_id,
      NULL,
      NULL,
      NULL,
      'message_crew_lead',
      format('/crews/%s', v_alert.crew_id),
      jsonb_build_object()
    );
    END LOOP;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.check_crew_problems IS 'Block 24780: Checks for crew problems and escalates to owner inbox';

-- ============================================================================
-- PART 6 — CREATE FUNCTION: check_supplier_problems
-- ============================================================================
-- Detects supplier problems and escalates to owner

CREATE OR REPLACE FUNCTION public.check_supplier_problems(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alert record;
BEGIN
  -- Supplier late 2/3 deliveries this week
  FOR v_alert IN
    SELECT 
      s.id as supplier_id,
      s.name as supplier_name,
      COUNT(*) FILTER (WHERE mo.status IN ('delayed', 'issue_reported')) as late_count,
      COUNT(*) as total_deliveries
    FROM public.suppliers s
    JOIN public.material_orders mo ON mo.supplier_id = s.id
    WHERE s.workspace_id = p_workspace_id
      AND mo.created_at >= current_date - INTERVAL '7 days'
    GROUP BY s.id, s.name
    HAVING COUNT(*) >= 3 AND COUNT(*) FILTER (WHERE mo.status IN ('delayed', 'issue_reported')) >= 2
  LOOP
    PERFORM public.escalate_to_owner_inbox(
      p_workspace_id,
      'supplier_problem',
      'high',
      format('%s late %s/%s deliveries this week', v_alert.supplier_name, v_alert.late_count, v_alert.total_deliveries),
      format('Supplier %s has been late on %s out of %s deliveries this week. Reliability concerns.', 
        v_alert.supplier_name, v_alert.late_count, v_alert.total_deliveries),
      NULL,
      NULL,
      NULL,
      v_alert.supplier_id,
      NULL,
      NULL,
      'contact_supplier',
      format('/suppliers/%s', v_alert.supplier_id),
      jsonb_build_object('late_count', v_alert.late_count, 'total_deliveries', v_alert.total_deliveries)
    );
  END LOOP;
  
  -- Material mismatch caused delay
  FOR v_alert IN
    SELECT DISTINCT
      mo.supplier_id,
      s.name as supplier_name,
      mo.job_id,
      j.title as job_title,
      mo.issue_description
    FROM public.material_orders mo
    JOIN public.suppliers s ON s.id = mo.supplier_id
    JOIN public.roofing_jobs j ON j.id = mo.job_id
    WHERE mo.workspace_id = p_workspace_id
      AND mo.issue_reported = true
      AND mo.issue_description ILIKE '%mismatch%'
      AND mo.created_at >= current_date - INTERVAL '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.owner_inbox_items oii
        WHERE oii.workspace_id = p_workspace_id
          AND oii.related_supplier_id = mo.supplier_id
          AND oii.message_type = 'supplier_problem'
          AND oii.status = 'new'
      )
  LOOP
    PERFORM public.escalate_to_owner_inbox(
      p_workspace_id,
      'supplier_problem',
      'medium',
      format('Material mismatch caused delay (%s)', v_alert.job_title),
      format('Supplier %s sent wrong materials for job %s, causing delay: %s', 
        v_alert.supplier_name, v_alert.job_title, v_alert.issue_description),
      v_alert.job_id,
      NULL,
      NULL,
      v_alert.supplier_id,
      NULL,
      NULL,
      'contact_supplier',
      format('/suppliers/%s', v_alert.supplier_id),
      jsonb_build_object('issue_description', v_alert.issue_description)
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.check_supplier_problems IS 'Block 24780: Checks for supplier problems and escalates to owner inbox';

-- ============================================================================
-- PART 7 — CREATE FUNCTION: check_high_value_opportunities
-- ============================================================================
-- Detects high-value opportunities and escalates to owner

CREATE OR REPLACE FUNCTION public.check_high_value_opportunities(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alert record;
  v_total_value numeric;
BEGIN
  -- 3 approved jobs not scheduled - stuck revenue
  SELECT COALESCE(SUM(j.job_value), 0), COUNT(*)
  INTO v_total_value, v_alert
  FROM public.roofing_jobs j
  WHERE j.workspace_id = p_workspace_id
    AND j.status = 'unscheduled'
    AND EXISTS (
      SELECT 1 FROM public.payment_status_engine pse
      WHERE pse.job_id = j.id
        AND pse.payment_type = 'deposit'
        AND pse.status = 'paid'
    );
  
  IF v_total_value > 0 AND NOT EXISTS (
    SELECT 1 FROM public.owner_inbox_items oii
    WHERE oii.workspace_id = p_workspace_id
      AND oii.message_type = 'high_value_opportunity'
      AND oii.title LIKE '%approved jobs not scheduled%'
      AND oii.status = 'new'
  ) THEN
    PERFORM public.escalate_to_owner_inbox(
      p_workspace_id,
      'high_value_opportunity',
      'high',
      format('%s approved jobs not scheduled — $%s stuck', 
        (SELECT COUNT(*) FROM public.roofing_jobs WHERE workspace_id = p_workspace_id AND status = 'unscheduled' AND EXISTS (SELECT 1 FROM public.payment_status_engine WHERE job_id = roofing_jobs.id AND payment_type = 'deposit' AND status = 'paid')),
        v_total_value),
      format('%s approved jobs with deposits paid are not yet scheduled. Total value: $%s. Schedule these to start generating revenue.', 
        (SELECT COUNT(*) FROM public.roofing_jobs WHERE workspace_id = p_workspace_id AND status = 'unscheduled' AND EXISTS (SELECT 1 FROM public.payment_status_engine WHERE job_id = roofing_jobs.id AND payment_type = 'deposit' AND status = 'paid')),
        v_total_value),
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      'create_task',
      '/jobs?status=unscheduled',
      jsonb_build_object('total_value', v_total_value, 'job_count', (SELECT COUNT(*) FROM public.roofing_jobs WHERE workspace_id = p_workspace_id AND status = 'unscheduled' AND EXISTS (SELECT 1 FROM public.payment_status_engine WHERE job_id = roofing_jobs.id AND payment_type = 'deposit' AND status = 'paid')))
    );
  END IF;
  
  -- 5 hot leads from yesterday - no inspection scheduled
  SELECT COUNT(*)
  INTO v_alert
  FROM public.leads l
  WHERE l.workspace_id = p_workspace_id
    AND l.stage = 'lead'
    AND l.created_at::date = current_date - INTERVAL '1 day'
    AND EXISTS (
      SELECT 1 FROM public.priority_scores ps
      WHERE ps.contact_id = l.contact_id
        AND ps.priority_score >= 70
    );
  
  IF v_alert >= 5 AND NOT EXISTS (
    SELECT 1 FROM public.owner_inbox_items oii
    WHERE oii.workspace_id = p_workspace_id
      AND oii.message_type = 'high_value_opportunity'
      AND oii.title LIKE '%hot leads%'
      AND oii.status = 'new'
  ) THEN
    PERFORM public.escalate_to_owner_inbox(
      p_workspace_id,
      'high_value_opportunity',
      'medium',
      format('%s hot leads from yesterday — no inspection scheduled', v_alert),
      format('%s high-priority leads came in yesterday but no inspections have been scheduled. Act fast to convert these.', v_alert),
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      'create_task',
      '/leads?heat=hot',
      jsonb_build_object('lead_count', v_alert)
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.check_high_value_opportunities IS 'Block 24780: Checks for high-value opportunities and escalates to owner inbox';

-- ============================================================================
-- PART 8 — CREATE FUNCTION: check_leadership_decisions
-- ============================================================================
-- Detects situations requiring leadership-level decisions

CREATE OR REPLACE FUNCTION public.check_leadership_decisions(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alert record;
BEGIN
  -- Homeowner refusing deductible - escalate
  FOR v_alert IN
    SELECT DISTINCT
      j.id as job_id,
      j.title as job_title
    FROM public.roofing_jobs j
    JOIN public.job_health_issues jhi ON jhi.job_id = j.id
    WHERE j.workspace_id = p_workspace_id
      AND jhi.issue_type LIKE '%deductible%'
      AND jhi.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.owner_inbox_items oii
        WHERE oii.workspace_id = p_workspace_id
          AND oii.related_job_id = j.id
          AND oii.message_type = 'leadership_decision_needed'
          AND oii.status = 'new'
      )
  LOOP
    PERFORM public.escalate_to_owner_inbox(
      p_workspace_id,
      'leadership_decision_needed',
      'high',
      format('Homeowner refusing deductible — escalate? (%s)', v_alert.job_title),
      format('Homeowner is refusing to pay deductible for job %s. Owner decision needed on how to proceed.', v_alert.job_title),
      v_alert.job_id,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      'call_homeowner',
      format('/jobs/%s', v_alert.job_id),
      jsonb_build_object()
    );
  END LOOP;
  
  -- Insurance not approving supplement - needs owner call
  FOR v_alert IN
    SELECT 
      pse.job_id,
      j.title as job_title,
      pse.supplement_status
    FROM public.payment_status_engine pse
    JOIN public.roofing_jobs j ON j.id = pse.job_id
    WHERE pse.workspace_id = p_workspace_id
      AND pse.supplement_status = 'denied'
      AND NOT EXISTS (
        SELECT 1 FROM public.owner_inbox_items oii
        WHERE oii.workspace_id = p_workspace_id
          AND oii.related_job_id = pse.job_id
          AND oii.message_type = 'leadership_decision_needed'
          AND oii.status = 'new'
      )
  LOOP
    PERFORM public.escalate_to_owner_inbox(
      p_workspace_id,
      'leadership_decision_needed',
      'high',
      format('Insurance not approving supplement — needs owner call (%s)', v_alert.job_title),
      format('Insurance company denied supplement for job %s. Owner call needed to negotiate or appeal.', v_alert.job_title),
      v_alert.job_id,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      'call_homeowner',
      format('/jobs/%s/insurance', v_alert.job_id),
      jsonb_build_object('supplement_status', v_alert.supplement_status)
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.check_leadership_decisions IS 'Block 24780: Checks for situations requiring leadership decisions and escalates to owner inbox';

-- ============================================================================
-- PART 9 — CREATE FUNCTION: run_owner_inbox_escalation_engine
-- ============================================================================
-- Main function that runs all escalation checks

CREATE OR REPLACE FUNCTION public.run_owner_inbox_escalation_engine(p_workspace_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace record;
BEGIN
  -- If workspace_id provided, check only that workspace
  IF p_workspace_id IS NOT NULL THEN
    PERFORM public.check_financial_alerts(p_workspace_id);
    PERFORM public.check_job_risk_alerts(p_workspace_id);
    PERFORM public.check_crew_problems(p_workspace_id);
    PERFORM public.check_supplier_problems(p_workspace_id);
    PERFORM public.check_high_value_opportunities(p_workspace_id);
    PERFORM public.check_leadership_decisions(p_workspace_id);
  ELSE
    -- Check all workspaces
    FOR v_workspace IN
      SELECT id FROM public.workspaces
    LOOP
      PERFORM public.check_financial_alerts(v_workspace.id);
      PERFORM public.check_job_risk_alerts(v_workspace.id);
      PERFORM public.check_crew_problems(v_workspace.id);
      PERFORM public.check_supplier_problems(v_workspace.id);
      PERFORM public.check_high_value_opportunities(v_workspace.id);
      PERFORM public.check_leadership_decisions(v_workspace.id);
    END LOOP;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.run_owner_inbox_escalation_engine IS 'Block 24780: Runs all escalation checks for owner inbox';

-- ============================================================================
-- PART 10 — CREATE FUNCTION: get_owner_inbox_digest
-- ============================================================================
-- Returns digest data for daily email

CREATE OR REPLACE FUNCTION public.get_owner_inbox_digest(p_workspace_id uuid, p_owner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result jsonb;
  v_critical jsonb;
  v_high jsonb;
  v_medium jsonb;
  v_low jsonb;
  v_opportunities jsonb;
  v_financial_overview jsonb;
BEGIN
  -- Critical issues
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'title', title,
      'description', description,
      'message_type', message_type,
      'created_at', created_at
    )
    ORDER BY created_at DESC
  )
  INTO v_critical
  FROM public.owner_inbox_items
  WHERE workspace_id = p_workspace_id
    AND owner_id = p_owner_id
    AND status = 'new'
    AND priority = 'critical'
  LIMIT 10;
  
  -- High priority
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'title', title,
      'description', description,
      'message_type', message_type,
      'created_at', created_at
    )
    ORDER BY created_at DESC
  )
  INTO v_high
  FROM public.owner_inbox_items
  WHERE workspace_id = p_workspace_id
    AND owner_id = p_owner_id
    AND status = 'new'
    AND priority = 'high'
  LIMIT 10;
  
  -- Opportunities
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'title', title,
      'description', description,
      'message_type', message_type,
      'created_at', created_at
    )
    ORDER BY created_at DESC
  )
  INTO v_opportunities
  FROM public.owner_inbox_items
  WHERE workspace_id = p_workspace_id
    AND owner_id = p_owner_id
    AND status = 'new'
    AND message_type = 'high_value_opportunity'
  LIMIT 5;
  
  -- Financial overview
  SELECT jsonb_build_object(
    'collected_this_week', (
      SELECT COALESCE(SUM(amount), 0)
      FROM public.job_payments
      WHERE workspace_id = p_workspace_id
        AND created_at >= date_trunc('week', current_date)
    ),
    'outstanding', (
      SELECT COALESCE(SUM(expected_amount), 0)
      FROM public.payment_status_engine
      WHERE workspace_id = p_workspace_id
        AND status IN ('unpaid', 'overdue')
    ),
    'jobs_scheduled_today', (
      SELECT COUNT(*)
      FROM public.roofing_jobs
      WHERE workspace_id = p_workspace_id
        AND scheduled_start_date = current_date
        AND status IN ('scheduled', 'in_progress')
    )
  )
  INTO v_financial_overview;
  
  v_result := jsonb_build_object(
    'critical_issues', COALESCE(v_critical, '[]'::jsonb),
    'high_priority', COALESCE(v_high, '[]'::jsonb),
    'opportunities', COALESCE(v_opportunities, '[]'::jsonb),
    'financial_overview', v_financial_overview
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_owner_inbox_digest IS 'Block 24780: Returns digest data for owner inbox daily email';

-- ============================================================================
-- PART 11 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.owner_inbox_items ENABLE ROW LEVEL SECURITY;

-- Owners can view their own inbox items
CREATE POLICY "Owners can view their inbox items"
  ON public.owner_inbox_items
  FOR SELECT
  USING (owner_id = auth.uid());

-- System can insert inbox items
CREATE POLICY "System can insert inbox items"
  ON public.owner_inbox_items
  FOR INSERT
  WITH CHECK (true);

-- Owners can update their inbox items
CREATE POLICY "Owners can update their inbox items"
  ON public.owner_inbox_items
  FOR UPDATE
  USING (owner_id = auth.uid());

-- ============================================================================
-- PART 12 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.owner_inbox_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.escalate_to_owner_inbox TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_financial_alerts TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_job_risk_alerts TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_crew_problems TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_supplier_problems TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_high_value_opportunities TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_leadership_decisions TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_owner_inbox_escalation_engine TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_inbox_digest TO authenticated;

-- ============================================================================
-- PART 13 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.owner_inbox_items IS 'Block 24780: Owner-level inbox items - high-impact escalations only';
COMMENT ON FUNCTION public.escalate_to_owner_inbox IS 'Block 24780: Escalates items to owner inbox';
COMMENT ON FUNCTION public.check_financial_alerts IS 'Block 24780: Checks for financial alerts';
COMMENT ON FUNCTION public.check_job_risk_alerts IS 'Block 24780: Checks for job risk alerts';
COMMENT ON FUNCTION public.check_crew_problems IS 'Block 24780: Checks for crew problems';
COMMENT ON FUNCTION public.check_supplier_problems IS 'Block 24780: Checks for supplier problems';
COMMENT ON FUNCTION public.check_high_value_opportunities IS 'Block 24780: Checks for high-value opportunities';
COMMENT ON FUNCTION public.check_leadership_decisions IS 'Block 24780: Checks for leadership decisions needed';
COMMENT ON FUNCTION public.run_owner_inbox_escalation_engine IS 'Block 24780: Runs all escalation checks';
COMMENT ON FUNCTION public.get_owner_inbox_digest IS 'Block 24780: Returns digest data for daily email';

