-- =========================================================
-- Block 21768 — SmartSend Roofing Lead Routing Brain v1
-- Automatically assign every new lead to the best estimator
-- based on availability, performance score, workload balance,
-- job type, and service area matching.
-- =========================================================

-- ============================================================================
-- 1) ESTIMATOR AVAILABILITY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.estimator_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  is_available boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure one availability record per estimator per workspace
  UNIQUE(estimator_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_estimator_availability_estimator 
  ON public.estimator_availability(estimator_id);
CREATE INDEX IF NOT EXISTS idx_estimator_availability_workspace 
  ON public.estimator_availability(workspace_id);
CREATE INDEX IF NOT EXISTS idx_estimator_availability_available 
  ON public.estimator_availability(is_available) WHERE is_available = true;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_estimator_availability_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_estimator_availability_updated_at ON public.estimator_availability;
CREATE TRIGGER trg_estimator_availability_updated_at
BEFORE UPDATE ON public.estimator_availability
FOR EACH ROW
EXECUTE FUNCTION update_estimator_availability_updated_at();

-- ============================================================================
-- 2) ESTIMATOR ZONES TABLE (Service Area Matching)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.estimator_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  zipcode text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Allow multiple zones per estimator, but unique per estimator+zipcode
  UNIQUE(estimator_id, zipcode)
);

CREATE INDEX IF NOT EXISTS idx_estimator_zones_estimator 
  ON public.estimator_zones(estimator_id);
CREATE INDEX IF NOT EXISTS idx_estimator_zones_workspace 
  ON public.estimator_zones(workspace_id);
CREATE INDEX IF NOT EXISTS idx_estimator_zones_zipcode 
  ON public.estimator_zones(zipcode);

-- ============================================================================
-- 3) LEAD ROUTING LOG TABLE (Transparency & Debugging)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.lead_routing_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  estimator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  reasoning jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_routing_log_lead 
  ON public.lead_routing_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_routing_log_estimator 
  ON public.lead_routing_log(estimator_id);
CREATE INDEX IF NOT EXISTS idx_lead_routing_log_workspace 
  ON public.lead_routing_log(workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_routing_log_created_at 
  ON public.lead_routing_log(created_at DESC);

-- ============================================================================
-- 4) ADD ESTIMATOR_ID COLUMN TO LEADS TABLE
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'estimator_id'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN estimator_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_leads_estimator 
      ON public.leads(estimator_id);
  END IF;
END $$;

-- ============================================================================
-- 5) RLS POLICIES
-- ============================================================================

-- Estimator Availability RLS
ALTER TABLE public.estimator_availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_read_availability" ON public.estimator_availability;
CREATE POLICY "workspace_read_availability"
ON public.estimator_availability FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = estimator_availability.workspace_id
    AND wm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "workspace_update_availability" ON public.estimator_availability;
CREATE POLICY "workspace_update_availability"
ON public.estimator_availability FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = estimator_availability.workspace_id
    AND wm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = estimator_availability.workspace_id
    AND wm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "service_role_all_availability" ON public.estimator_availability;
CREATE POLICY "service_role_all_availability"
ON public.estimator_availability FOR ALL
TO service_role
USING (true) WITH CHECK (true);

-- Estimator Zones RLS
ALTER TABLE public.estimator_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_read_zones" ON public.estimator_zones;
CREATE POLICY "workspace_read_zones"
ON public.estimator_zones FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = estimator_zones.workspace_id
    AND wm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "workspace_manage_zones" ON public.estimator_zones;
CREATE POLICY "workspace_manage_zones"
ON public.estimator_zones FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = estimator_zones.workspace_id
    AND wm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = estimator_zones.workspace_id
    AND wm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "service_role_all_zones" ON public.estimator_zones;
CREATE POLICY "service_role_all_zones"
ON public.estimator_zones FOR ALL
TO service_role
USING (true) WITH CHECK (true);

-- Lead Routing Log RLS
ALTER TABLE public.lead_routing_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_read_routing_log" ON public.lead_routing_log;
CREATE POLICY "workspace_read_routing_log"
ON public.lead_routing_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = lead_routing_log.workspace_id
    AND wm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "service_role_all_routing_log" ON public.lead_routing_log;
CREATE POLICY "service_role_all_routing_log"
ON public.lead_routing_log FOR ALL
TO service_role
USING (true) WITH CHECK (true);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.estimator_availability IS 'Block 21768 — Tracks real-time availability status of estimators for lead routing.';
COMMENT ON TABLE public.estimator_zones IS 'Block 21768 — Maps estimators to service areas (zip codes) for geographic lead routing.';
COMMENT ON TABLE public.lead_routing_log IS 'Block 21768 — Logs every routing decision with full reasoning for transparency and debugging.';









































