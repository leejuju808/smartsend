-- =========================================================
-- Block 20870 — SmartSend Roofing Login & Session Guard v1
-- (User Authentication • Org Awareness • Role Enforcement • Secure Session Context)
-- =========================================================
--
-- This block is the security backbone of SmartSend.
-- Everything we've built so far will break unless the system knows:
-- - WHO is logged in
-- - WHAT organization they belong to
-- - WHAT role they have
-- - WHAT they are allowed to do
-- - WHICH leads/jobs they're associated with
--
-- 20870 ensures SmartSend is secure, multi-tenant, and role-safe.
-- =========================================================

-- ============================================================================
-- PART 1 — Session Context Helper Functions
-- ============================================================================

-- Get current user's organization_id and role from JWT or org_memberships
CREATE OR REPLACE FUNCTION public.get_session_context()
RETURNS TABLE (
  user_id uuid,
  organization_id uuid,
  role text,
  email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_role text;
  v_email text;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get user email
  SELECT email INTO v_email
  FROM auth.users
  WHERE id = v_user_id;
  
  -- Try to get organization_id from JWT custom claims first
  -- (This will be set by the auth trigger after login)
  BEGIN
    v_org_id := (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid;
    v_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  EXCEPTION
    WHEN OTHERS THEN
      v_org_id := NULL;
      v_role := NULL;
  END;
  
  -- If not in JWT, get from org_memberships (fallback)
  IF v_org_id IS NULL THEN
    SELECT om.org_id, om.roofing_role::text
    INTO v_org_id, v_role
    FROM public.org_memberships om
    WHERE om.user_id = v_user_id
      AND om.status = 'active'
    ORDER BY om.created_at ASC
    LIMIT 1;
  END IF;
  
  RETURN QUERY SELECT v_user_id, v_org_id, v_role, v_email;
END;
$$;

COMMENT ON FUNCTION public.get_session_context() IS 'Returns current user session context: user_id, organization_id, role, email';

-- Helper function to get current user's organization_id
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT organization_id
  FROM public.get_session_context()
  LIMIT 1;
$$;

-- Helper function to get current user's role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role
  FROM public.get_session_context()
  LIMIT 1;
$$;

-- ============================================================================
-- PART 2 — JWT Custom Claims Function (Called by Auth Trigger)
-- ============================================================================

-- Function to set JWT custom claims when user logs in
-- This will be called by a database trigger on auth.users
CREATE OR REPLACE FUNCTION public.set_jwt_custom_claims()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_role text;
BEGIN
  -- Get user's primary organization and role
  SELECT om.org_id, om.roofing_role::text
  INTO v_org_id, v_role
  FROM public.org_memberships om
  WHERE om.user_id = NEW.id
    AND om.status = 'active'
  ORDER BY om.created_at ASC
  LIMIT 1;
  
  -- Set custom claims in user metadata
  -- Note: Supabase will automatically include these in the JWT
  NEW.raw_user_meta_data := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb) || 
    jsonb_build_object(
      'organization_id', v_org_id,
      'role', v_role
    );
  
  RETURN NEW;
END;
$$;

-- Create trigger to set JWT claims on user creation/update
DROP TRIGGER IF EXISTS set_jwt_claims_trigger ON auth.users;
CREATE TRIGGER set_jwt_claims_trigger
  BEFORE INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_jwt_custom_claims();

-- Also update claims when org_memberships change
CREATE OR REPLACE FUNCTION public.refresh_user_jwt_claims()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update user metadata to refresh JWT claims
  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || 
    jsonb_build_object(
      'organization_id', NEW.org_id,
      'role', NEW.roofing_role::text
    )
  WHERE id = NEW.user_id;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refresh_jwt_on_membership_change ON public.org_memberships;
CREATE TRIGGER refresh_jwt_on_membership_change
  AFTER INSERT OR UPDATE ON public.org_memberships
  FOR EACH ROW
  WHEN (NEW.status = 'active' AND NEW.user_id IS NOT NULL)
  EXECUTE FUNCTION public.refresh_user_jwt_claims();

-- ============================================================================
-- PART 3 — Multi-Tenant RLS Policies
-- ============================================================================

-- Enable RLS on all critical tables
ALTER TABLE IF EXISTS public.inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inbox_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.roofing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.insurance_claim_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.insurance_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.outbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.activity_feed_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.leads ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is member of organization
CREATE OR REPLACE FUNCTION public.is_org_member(check_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.org_memberships
    WHERE org_id = check_org_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

-- RLS Policy: inbox_messages
-- Users can only see messages from their organization
DROP POLICY IF EXISTS inbox_messages_org_isolation ON public.inbox_messages;
CREATE POLICY inbox_messages_org_isolation
ON public.inbox_messages
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.inbox_threads it
    LEFT JOIN public.campaigns c ON c.id = it.campaign_id
    LEFT JOIN public.leads l ON l.id = it.lead_id
    WHERE it.id = inbox_messages.thread_id
      AND (
        (c.org_id IS NOT NULL AND public.is_org_member(c.org_id))
        OR (l.org_id IS NOT NULL AND public.is_org_member(l.org_id))
      )
  )
);

-- RLS Policy: inbox_threads
DROP POLICY IF EXISTS inbox_threads_org_isolation ON public.inbox_threads;
CREATE POLICY inbox_threads_org_isolation
ON public.inbox_threads
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.campaigns c
    WHERE c.id = inbox_threads.campaign_id
      AND c.org_id IS NOT NULL
      AND public.is_org_member(c.org_id)
  )
  OR EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = inbox_threads.lead_id
      AND l.org_id IS NOT NULL
      AND public.is_org_member(l.org_id)
  )
);

-- RLS Policy: roofing_jobs
DROP POLICY IF EXISTS roofing_jobs_org_isolation ON public.roofing_jobs;
CREATE POLICY roofing_jobs_org_isolation
ON public.roofing_jobs
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = roofing_jobs.lead_id
      AND l.org_id IS NOT NULL
      AND public.is_org_member(l.org_id)
  )
  OR EXISTS (
    SELECT 1
    FROM public.campaigns c
    WHERE c.id = roofing_jobs.campaign_id
      AND c.org_id IS NOT NULL
      AND public.is_org_member(c.org_id)
  )
);

-- RLS Policy: insurance_claim_summaries (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'insurance_claim_summaries') THEN
    ALTER TABLE public.insurance_claim_summaries ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS insurance_claim_summaries_org_isolation ON public.insurance_claim_summaries;
    EXECUTE '
    CREATE POLICY insurance_claim_summaries_org_isolation
    ON public.insurance_claim_summaries
    FOR ALL
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.leads l
        WHERE l.id = insurance_claim_summaries.lead_id
          AND l.org_id IS NOT NULL
          AND public.is_org_member(l.org_id)
      )
    )';
  END IF;
END $$;

-- RLS Policy: insurance_attachments (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'insurance_attachments') THEN
    ALTER TABLE public.insurance_attachments ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS insurance_attachments_org_isolation ON public.insurance_attachments;
    EXECUTE '
    CREATE POLICY insurance_attachments_org_isolation
    ON public.insurance_attachments
    FOR ALL
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.leads l
        WHERE l.id = insurance_attachments.lead_id
          AND l.org_id IS NOT NULL
          AND public.is_org_member(l.org_id)
      )
    )';
  END IF;
END $$;

-- RLS Policy: outbound_messages (multiple tables may exist, handle gracefully)
DO $$
BEGIN
  -- Check for outbound_messages table with account_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'outbound_messages' 
    AND column_name = 'account_id'
  ) THEN
    DROP POLICY IF EXISTS outbound_messages_org_isolation ON public.outbound_messages;
    EXECUTE '
    CREATE POLICY outbound_messages_org_isolation
    ON public.outbound_messages
    FOR ALL
    TO authenticated
    USING (
      account_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.leads l
        WHERE l.id = outbound_messages.lead_id
          AND l.org_id IS NOT NULL
          AND public.is_org_member(l.org_id)
      )
    )';
  END IF;
END $$;

-- RLS Policy: activity_feed_events
DROP POLICY IF EXISTS activity_feed_events_org_isolation ON public.activity_feed_events;
CREATE POLICY activity_feed_events_org_isolation
ON public.activity_feed_events
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = activity_feed_events.lead_id
      AND l.org_id IS NOT NULL
      AND public.is_org_member(l.org_id)
  )
  OR EXISTS (
    SELECT 1
    FROM public.roofing_jobs rj
    JOIN public.leads l ON l.id = rj.lead_id
    WHERE rj.id = activity_feed_events.job_id
      AND l.org_id IS NOT NULL
      AND public.is_org_member(l.org_id)
  )
  OR EXISTS (
    SELECT 1
    FROM public.inbox_threads it
    LEFT JOIN public.campaigns c ON c.id = it.campaign_id
    LEFT JOIN public.leads l ON l.id = it.lead_id
    WHERE it.id = activity_feed_events.thread_id
      AND (
        (c.org_id IS NOT NULL AND public.is_org_member(c.org_id))
        OR (l.org_id IS NOT NULL AND public.is_org_member(l.org_id))
      )
  )
);

-- RLS Policy: notifications
DROP POLICY IF EXISTS notifications_org_isolation ON public.notifications;
CREATE POLICY notifications_org_isolation
ON public.notifications
FOR ALL
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = notifications.lead_id
      AND l.org_id IS NOT NULL
      AND public.is_org_member(l.org_id)
  )
);

-- RLS Policy: calendar_events
DROP POLICY IF EXISTS calendar_events_org_isolation ON public.calendar_events;
CREATE POLICY calendar_events_org_isolation
ON public.calendar_events
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.workspaces w
    WHERE w.id = calendar_events.workspace_id
      AND EXISTS (
        SELECT 1
        FROM public.org_memberships om
        WHERE om.org_id = w.id
          AND om.user_id = auth.uid()
          AND om.status = 'active'
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = calendar_events.lead_id
      AND l.org_id IS NOT NULL
      AND public.is_org_member(l.org_id)
  )
);

-- RLS Policy: leads (with role-based filtering)
DROP POLICY IF EXISTS leads_org_isolation ON public.leads;
CREATE POLICY leads_org_isolation
ON public.leads
FOR SELECT
TO authenticated
USING (
  -- OWNER, OFFICE_STAFF, ADJUSTER_HELPER can see all org leads
  (
    public.is_org_member(org_id)
    AND public.get_user_role() IN ('OWNER', 'OFFICE_STAFF', 'ADJUSTER_HELPER')
  )
  OR
  -- SALES_REP can only see assigned leads
  (
    public.is_org_member(org_id)
    AND public.get_user_role() = 'SALES_REP'
    AND assigned_user_id = auth.uid()
  )
);

-- Allow inserts/updates for org members
DROP POLICY IF EXISTS leads_org_insert ON public.leads;
CREATE POLICY leads_org_insert
ON public.leads
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_org_member(org_id)
);

DROP POLICY IF EXISTS leads_org_update ON public.leads;
CREATE POLICY leads_org_update
ON public.leads
FOR UPDATE
TO authenticated
USING (
  public.is_org_member(org_id)
  AND (
    public.get_user_role() IN ('OWNER', 'OFFICE_STAFF')
    OR (public.get_user_role() = 'SALES_REP' AND assigned_user_id = auth.uid())
  )
)
WITH CHECK (
  public.is_org_member(org_id)
  AND (
    public.get_user_role() IN ('OWNER', 'OFFICE_STAFF')
    OR (public.get_user_role() = 'SALES_REP' AND assigned_user_id = auth.uid())
  )
);

-- ============================================================================
-- PART 4 — Grant Permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_session_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_organization_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;

-- ============================================================================
-- PART 5 — Comments
-- ============================================================================

COMMENT ON FUNCTION public.get_session_context() IS 'Returns current user session context: user_id, organization_id, role, email';
COMMENT ON FUNCTION public.get_user_organization_id() IS 'Returns current user organization_id';
COMMENT ON FUNCTION public.get_user_role() IS 'Returns current user role';
COMMENT ON FUNCTION public.is_org_member(uuid) IS 'Checks if current user is a member of the specified organization';
















































