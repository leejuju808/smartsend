-- =========================================================
-- Block 228000 — SmartSend Roofing "Change Orders + Insurance Supplements Engine" v1
-- Full Sprint Step — No Bullshit. This block PRINTS MONEY for roofers.
-- =========================================================
-- 
-- This is where roofers LOSE THE MOST MONEY because they have no system.
-- SmartSend is about to fix that automatically.
-- 
-- Features:
-- - Automatic Change Order Detection from Crew Issues
-- - Change Order Creation, Approval, Tracking
-- - Insurance Supplement Generation with AI
-- - Automatic Payment Schedule Updates
-- - Customer Portal Integration
-- =========================================================

-- ============================================================
-- 1. CHANGE_ORDERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.change_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Change order details
  reason text NOT NULL,
  description text NOT NULL,
  added_cost numeric(12,2) NOT NULL DEFAULT 0,
  
  -- Status tracking
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'draft', 'sent', 'viewed', 'approved', 'declined')),
  
  -- Signature and approval
  signature_url text,
  signed_at timestamptz,
  signed_by text, -- Homeowner name
  
  -- Link to crew issue that triggered this
  crew_issue_id uuid REFERENCES public.crew_issues(id) ON DELETE SET NULL,
  
  -- Portal token for homeowner approval
  portal_token text UNIQUE,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  viewed_at timestamptz
);

-- Handle job_id foreign key (works with either jobs or roofing_jobs)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'change_orders_job_id_fkey'
    ) THEN
      ALTER TABLE public.change_orders
        ADD CONSTRAINT change_orders_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'change_orders_job_id_fkey'
    ) THEN
      ALTER TABLE public.change_orders
        ADD CONSTRAINT change_orders_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Handle workspace_id foreign key
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'change_orders_workspace_id_fkey'
    ) THEN
      ALTER TABLE public.change_orders
        ADD CONSTRAINT change_orders_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_change_orders_job ON public.change_orders(job_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_workspace ON public.change_orders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_status ON public.change_orders(status);
CREATE INDEX IF NOT EXISTS idx_change_orders_portal_token ON public.change_orders(portal_token) WHERE portal_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_change_orders_crew_issue ON public.change_orders(crew_issue_id) WHERE crew_issue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_change_orders_created ON public.change_orders(created_at DESC);

-- ============================================================
-- 2. CHANGE_ORDER_ITEMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.change_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id uuid NOT NULL REFERENCES public.change_orders(id) ON DELETE CASCADE,
  
  -- Line item details
  label text NOT NULL,
  qty numeric(10,2) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) GENERATED ALWAYS AS (qty * unit_price) STORED,
  
  -- Metadata
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_change_order_items_co ON public.change_order_items(change_order_id);
CREATE INDEX IF NOT EXISTS idx_change_order_items_created ON public.change_order_items(created_at DESC);

-- ============================================================
-- 3. INSURANCE_SUPPLEMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.insurance_supplements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Supplement details
  reason text NOT NULL,
  description text NOT NULL,
  requested_amount numeric(12,2) NOT NULL DEFAULT 0,
  approved_amount numeric(12,2),
  
  -- Status tracking
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'negotiating', 'approved', 'denied')),
  
  -- Documents and communication
  documents_url text, -- URL to PDF/document package
  adjuster_email text,
  adjuster_name text,
  adjuster_phone text,
  
  -- Link to crew issue that triggered this
  crew_issue_id uuid REFERENCES public.crew_issues(id) ON DELETE SET NULL,
  
  -- Follow-up tracking
  sent_at timestamptz,
  last_followup_at timestamptz,
  followup_count integer DEFAULT 0,
  next_followup_date date,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  denied_at timestamptz
);

-- Handle job_id foreign key
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'insurance_supplements_job_id_fkey'
    ) THEN
      ALTER TABLE public.insurance_supplements
        ADD CONSTRAINT insurance_supplements_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'insurance_supplements_job_id_fkey'
    ) THEN
      ALTER TABLE public.insurance_supplements
        ADD CONSTRAINT insurance_supplements_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Handle workspace_id foreign key
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'insurance_supplements_workspace_id_fkey'
    ) THEN
      ALTER TABLE public.insurance_supplements
        ADD CONSTRAINT insurance_supplements_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_insurance_supplements_job ON public.insurance_supplements(job_id);
CREATE INDEX IF NOT EXISTS idx_insurance_supplements_workspace ON public.insurance_supplements(workspace_id);
CREATE INDEX IF NOT EXISTS idx_insurance_supplements_status ON public.insurance_supplements(status);
CREATE INDEX IF NOT EXISTS idx_insurance_supplements_crew_issue ON public.insurance_supplements(crew_issue_id) WHERE crew_issue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_insurance_supplements_next_followup ON public.insurance_supplements(next_followup_date) WHERE next_followup_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_insurance_supplements_created ON public.insurance_supplements(created_at DESC);

-- ============================================================
-- 4. SUPPLEMENT_ITEMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.supplement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplement_id uuid NOT NULL REFERENCES public.insurance_supplements(id) ON DELETE CASCADE,
  
  -- Xactimate-style line items
  xactimate_code text,
  description text NOT NULL,
  qty numeric(10,2) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) GENERATED ALWAYS AS (qty * unit_price) STORED,
  
  -- Metadata
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplement_items_supplement ON public.supplement_items(supplement_id);
CREATE INDEX IF NOT EXISTS idx_supplement_items_xactimate_code ON public.supplement_items(xactimate_code) WHERE xactimate_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplement_items_created ON public.supplement_items(created_at DESC);

-- ============================================================
-- 5. UPDATED_AT TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_change_orders_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER change_orders_updated_at
  BEFORE UPDATE ON public.change_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_change_orders_updated_at();

CREATE OR REPLACE FUNCTION public.set_insurance_supplements_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER insurance_supplements_updated_at
  BEFORE UPDATE ON public.insurance_supplements
  FOR EACH ROW
  EXECUTE FUNCTION public.set_insurance_supplements_updated_at();

-- ============================================================
-- 6. AUTOMATION TRIGGER — AUTO-CREATE CHANGE ORDER FROM CREW ISSUE
-- ============================================================
-- When a crew reports an issue that requires extra work, automatically create a change order draft
CREATE OR REPLACE FUNCTION public.auto_create_change_order_from_crew_issue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_workspace_id uuid;
  v_change_order_id uuid;
  v_portal_token text;
BEGIN
  -- Only trigger for issues that require extra work
  IF NEW.issue_type IN ('decking_rot', 'structural_issue', 'extra_work') AND NEW.status = 'open' THEN
    -- Get workspace_id from job
    SELECT workspace_id INTO v_job_workspace_id
    FROM (
      SELECT workspace_id FROM public.jobs WHERE id = NEW.job_id
      UNION ALL
      SELECT workspace_id FROM public.roofing_jobs WHERE id = NEW.job_id
    ) AS job_lookup
    LIMIT 1;
    
    IF v_job_workspace_id IS NULL THEN
      RETURN NEW;
    END IF;
    
    -- Generate portal token for homeowner approval
    v_portal_token := encode(gen_random_bytes(24), 'base64');
    
    -- Create change order draft
    INSERT INTO public.change_orders (
      job_id,
      workspace_id,
      crew_issue_id,
      reason,
      description,
      status,
      portal_token
    ) VALUES (
      NEW.job_id,
      v_job_workspace_id,
      NEW.id,
      format('Additional work required: %s', NEW.issue_type),
      NEW.description,
      'draft',
      v_portal_token
    )
    RETURNING id INTO v_change_order_id;
    
    -- If this is an insurance job, also create a supplement draft
    -- Check if job has insurance flag
    IF EXISTS (
      SELECT 1 FROM public.jobs WHERE id = NEW.job_id AND insurance = true
      UNION ALL
      SELECT 1 FROM public.roofing_jobs WHERE id = NEW.job_id AND insurance_claim = true
    ) THEN
      INSERT INTO public.insurance_supplements (
        job_id,
        workspace_id,
        crew_issue_id,
        reason,
        description,
        status
      ) VALUES (
        NEW.job_id,
        v_job_workspace_id,
        NEW.id,
        format('Supplement required for: %s', NEW.issue_type),
        NEW.description,
        'draft'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_auto_create_change_order_from_crew_issue ON public.crew_issues;
CREATE TRIGGER trigger_auto_create_change_order_from_crew_issue
  AFTER INSERT ON public.crew_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_change_order_from_crew_issue();

-- ============================================================
-- 7. FUNCTION — UPDATE JOB CONTRACT VALUE WHEN CHANGE ORDER APPROVED
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_job_value_on_change_order_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_total numeric;
  v_new_total numeric;
BEGIN
  -- Only trigger when status changes to 'approved'
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    -- Update job contract value
    -- Try jobs table first
    UPDATE public.jobs
    SET contract_value = COALESCE(contract_value, 0) + NEW.added_cost,
        updated_at = now()
    WHERE id = NEW.job_id;
    
    -- If no rows updated, try roofing_jobs
    IF NOT FOUND THEN
      UPDATE public.roofing_jobs
      SET job_value = COALESCE(job_value, 0) + NEW.added_cost,
          updated_at = now()
      WHERE id = NEW.job_id;
    END IF;
    
    -- Update payment schedule if it exists
    -- Recalculate payment milestones based on new total
    -- This will be handled by API endpoint to maintain payment schedule logic
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_job_value_on_change_order_approval
  AFTER UPDATE ON public.change_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_job_value_on_change_order_approval();

-- ============================================================
-- 8. FUNCTION — UPDATE JOB VALUE WHEN SUPPLEMENT APPROVED
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_job_value_on_supplement_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only trigger when status changes to 'approved'
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    -- Update job contract value with approved supplement amount
    UPDATE public.jobs
    SET contract_value = COALESCE(contract_value, 0) + COALESCE(NEW.approved_amount, NEW.requested_amount),
        updated_at = now()
    WHERE id = NEW.job_id;
    
    -- If no rows updated, try roofing_jobs
    IF NOT FOUND THEN
      UPDATE public.roofing_jobs
      SET job_value = COALESCE(job_value, 0) + COALESCE(NEW.approved_amount, NEW.requested_amount),
          updated_at = now()
      WHERE id = NEW.job_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_job_value_on_supplement_approval
  AFTER UPDATE ON public.insurance_supplements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_job_value_on_supplement_approval();

-- ============================================================
-- 9. ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.change_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_supplements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplement_items ENABLE ROW LEVEL SECURITY;

-- Change orders: workspace members can view/create/update
DROP POLICY IF EXISTS "change_orders_workspace_member" ON public.change_orders;
CREATE POLICY "change_orders_workspace_member" ON public.change_orders
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = change_orders.workspace_id AND wm.user_id = auth.uid()
    )
  );

-- Change order items: same access as parent change order
DROP POLICY IF EXISTS "change_order_items_workspace_member" ON public.change_order_items;
CREATE POLICY "change_order_items_workspace_member" ON public.change_order_items
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.change_orders co
      JOIN public.workspace_members wm ON co.workspace_id = wm.workspace_id
      WHERE co.id = change_order_items.change_order_id AND wm.user_id = auth.uid()
    )
  );

-- Insurance supplements: workspace members can view/create/update
DROP POLICY IF EXISTS "insurance_supplements_workspace_member" ON public.insurance_supplements;
CREATE POLICY "insurance_supplements_workspace_member" ON public.insurance_supplements
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = insurance_supplements.workspace_id AND wm.user_id = auth.uid()
    )
  );

-- Supplement items: same access as parent supplement
DROP POLICY IF EXISTS "supplement_items_workspace_member" ON public.supplement_items;
CREATE POLICY "supplement_items_workspace_member" ON public.supplement_items
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.insurance_supplements ins
      JOIN public.workspace_members wm ON ins.workspace_id = wm.workspace_id
      WHERE ins.id = supplement_items.supplement_id AND wm.user_id = auth.uid()
    )
  );

-- Public access for homeowner portal (change orders only, via portal_token)
DROP POLICY IF EXISTS "change_orders_portal_access" ON public.change_orders;
CREATE POLICY "change_orders_portal_access" ON public.change_orders
  FOR SELECT USING (
    -- This will be checked in the API endpoint with the portal_token
    true
  );

COMMENT ON TABLE public.change_orders IS 'Block 228000: Change orders for additional work on roofing jobs';
COMMENT ON TABLE public.change_order_items IS 'Block 228000: Line items for change orders';
COMMENT ON TABLE public.insurance_supplements IS 'Block 228000: Insurance supplements for additional covered work';
COMMENT ON TABLE public.supplement_items IS 'Block 228000: Xactimate-style line items for insurance supplements';

























