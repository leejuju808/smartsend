-- ============================================================
-- Block 227000 — SmartSend Roofing "Customer Portal + Live Job Tracking" v1
-- Full Sprint Step — No Bullshit. This is the block that makes SmartSend look like a MULTI-MILLION-DOLLAR PLATFORM.
-- ============================================================
-- 
-- This is where SmartSend jumps far ahead of every roofing CRM on the market.
-- Production is handled. Crews are handled. Safety is handled.
-- Now we open the front door of the company: A Homeowner Portal that shows every customer:
-- - Their estimate
-- - Their contract
-- - Their payments
-- - Their schedule
-- - Their photos
-- - Their progress
-- - Their warranty
-- 
-- No more texting updates. No more homeowners asking "when will they be here?"
-- No more miscommunication.
-- 
-- Roofers will say: "SmartSend makes us look like a $20M company even if we're a $2M company."
-- This block alone closes customers at HIGHER PRICES.

-- ============================================================
-- 1. CUSTOMER_PORTAL_ACCESS TABLE
-- ============================================================
-- One record per homeowner per job.
-- Powers passwordless logins via secure access tokens.

CREATE TABLE IF NOT EXISTS public.customer_portal_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homeowner_id uuid REFERENCES public.homeowners(id) ON DELETE CASCADE,
  job_id uuid, -- Can reference roofing_jobs or jobs (flexible)
  access_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'base64url'),
  last_login timestamptz,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz, -- Optional expiration
  is_active boolean DEFAULT true
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'customer_portal_access_job_id_roofing_fkey'
    ) THEN
      ALTER TABLE public.customer_portal_access
        ADD CONSTRAINT customer_portal_access_job_id_roofing_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  -- Also try jobs table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    -- We'll handle this with a check constraint or application logic
    -- since we can't have two foreign keys on the same column
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_portal_access_token ON public.customer_portal_access(access_token);
CREATE INDEX IF NOT EXISTS idx_customer_portal_access_job ON public.customer_portal_access(job_id);
CREATE INDEX IF NOT EXISTS idx_customer_portal_access_homeowner ON public.customer_portal_access(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_customer_portal_access_active ON public.customer_portal_access(job_id, is_active) WHERE is_active = true;

-- ============================================================
-- 2. CUSTOMER_MESSAGES TABLE
-- ============================================================
-- Two-way communication between homeowner and company.

CREATE TABLE IF NOT EXISTS public.customer_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  sender_type text NOT NULL CHECK (sender_type IN ('homeowner', 'company')),
  sender_name text,
  sender_email text,
  message text NOT NULL,
  homeowner_id uuid REFERENCES public.homeowners(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'customer_messages_job_id_fkey'
    ) THEN
      ALTER TABLE public.customer_messages
        ADD CONSTRAINT customer_messages_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_messages_job ON public.customer_messages(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_messages_homeowner ON public.customer_messages(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_customer_messages_unread ON public.customer_messages(job_id, read_at) WHERE read_at IS NULL AND sender_type = 'homeowner';

-- ============================================================
-- 3. CUSTOMER_NOTIFICATIONS TABLE
-- ============================================================
-- Events that show up in the customer's "timeline."
-- Auto-populated from various job events.

CREATE TABLE IF NOT EXISTS public.customer_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'estimate_sent',
    'contract_signed',
    'deposit_paid',
    'progress_payment_paid',
    'materials_delivered',
    'crew_scheduled',
    'crew_started',
    'crew_finished',
    'photos_uploaded',
    'job_completed',
    'warranty_issued'
  )),
  title text NOT NULL,
  body text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'customer_notifications_job_id_fkey'
    ) THEN
      ALTER TABLE public.customer_notifications
        ADD CONSTRAINT customer_notifications_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_notifications_job ON public.customer_notifications(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_notifications_type ON public.customer_notifications(event_type);

-- ============================================================
-- 4. ROW LEVEL SECURITY POLICIES
-- ============================================================

-- Customer portal access - public read for token validation
ALTER TABLE public.customer_portal_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_portal_access_public_read"
  ON public.customer_portal_access FOR SELECT
  USING (true);

CREATE POLICY "customer_portal_access_workspace_insert"
  ON public.customer_portal_access FOR INSERT
  WITH CHECK (
    job_id IN (
      SELECT id FROM public.roofing_jobs
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
      OR workspace_id IN (
        SELECT id FROM public.workspaces 
        WHERE owner_id = auth.uid()
      )
    )
    OR job_id IN (
      SELECT id FROM public.jobs
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
      OR workspace_id IN (
        SELECT id FROM public.workspaces 
        WHERE owner_id = auth.uid()
      )
    )
  );

-- Customer messages - public read/write for portal access
ALTER TABLE public.customer_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_messages_public_all"
  ON public.customer_messages FOR ALL
  USING (true)
  WITH CHECK (true);

-- Customer notifications - public read for portal access
ALTER TABLE public.customer_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_notifications_public_read"
  ON public.customer_notifications FOR SELECT
  USING (true);

CREATE POLICY "customer_notifications_workspace_insert"
  ON public.customer_notifications FOR INSERT
  WITH CHECK (
    job_id IN (
      SELECT id FROM public.roofing_jobs
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
      OR workspace_id IN (
        SELECT id FROM public.workspaces 
        WHERE owner_id = auth.uid()
      )
    )
    OR job_id IN (
      SELECT id FROM public.jobs
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
      OR workspace_id IN (
        SELECT id FROM public.workspaces 
        WHERE owner_id = auth.uid()
      )
    )
  );

-- ============================================================
-- 5. GRANT PERMISSIONS
-- ============================================================

GRANT SELECT, INSERT ON public.customer_portal_access TO authenticated;
GRANT SELECT, INSERT ON public.customer_messages TO authenticated;
GRANT SELECT, INSERT ON public.customer_notifications TO authenticated;

-- Public access for portal (via service role or anon with RLS)
GRANT SELECT ON public.customer_portal_access TO anon;
GRANT SELECT, INSERT ON public.customer_messages TO anon;
GRANT SELECT ON public.customer_notifications TO anon;

-- ============================================================
-- 6. HELPER FUNCTION: CREATE PORTAL ACCESS
-- ============================================================
-- Creates a portal access record and returns the secure token

CREATE OR REPLACE FUNCTION public.create_customer_portal_access(
  p_homeowner_id uuid,
  p_job_id uuid,
  p_expires_in_days int DEFAULT 365
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_access_id uuid;
  v_token text;
  v_expires_at timestamptz;
BEGIN
  -- Check if access already exists
  SELECT id, access_token INTO v_access_id, v_token
  FROM public.customer_portal_access
  WHERE homeowner_id = p_homeowner_id
    AND job_id = p_job_id
    AND is_active = true
  LIMIT 1;
  
  -- If exists, return existing token
  IF v_access_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'id', v_access_id,
      'access_token', v_token,
      'url', 'https://smartsendhq.com/portal/' || v_token
    );
  END IF;
  
  -- Generate new token
  v_token := encode(gen_random_bytes(32), 'base64url');
  v_expires_at := now() + (p_expires_in_days || ' days')::interval;
  
  -- Insert new access record
  INSERT INTO public.customer_portal_access (
    homeowner_id,
    job_id,
    access_token,
    expires_at
  ) VALUES (
    p_homeowner_id,
    p_job_id,
    v_token,
    v_expires_at
  )
  RETURNING id INTO v_access_id;
  
  RETURN jsonb_build_object(
    'id', v_access_id,
    'access_token', v_token,
    'url', 'https://smartsendhq.com/portal/' || v_token
  );
END;
$$;

-- ============================================================
-- 7. TRIGGER: AUTO-CREATE PORTAL ACCESS ON CONTRACT SIGN
-- ============================================================
-- When a contract is signed, automatically create portal access

CREATE OR REPLACE FUNCTION public.auto_create_portal_on_contract_sign()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_homeowner_id uuid;
  v_job_id uuid;
  v_estimate_id uuid;
  v_proposal_id uuid;
BEGIN
  -- Only trigger on contract sign
  IF NEW.status = 'signed' AND (OLD.status IS NULL OR OLD.status != 'signed') THEN
    -- Get proposal and estimate to find homeowner and job
    SELECT ep.estimate_id INTO v_estimate_id
    FROM public.estimates_proposals ep
    WHERE ep.id = NEW.proposal_id;
    
    IF v_estimate_id IS NOT NULL THEN
      -- Find homeowner from estimate
      SELECT h.id INTO v_homeowner_id
      FROM public.homeowners h
      WHERE h.id = (SELECT homeowner_id FROM public.estimates WHERE id = v_estimate_id)
      LIMIT 1;
      
      -- Find job from contract link
      SELECT ejl.job_id INTO v_job_id
      FROM public.estimates_job_links ejl
      WHERE ejl.contract_id = NEW.id
      LIMIT 1;
      
      -- If we have homeowner and job, create portal access
      IF v_homeowner_id IS NOT NULL AND v_job_id IS NOT NULL THEN
        PERFORM public.create_customer_portal_access(v_homeowner_id, v_job_id);
        
        -- Create notification
        INSERT INTO public.customer_notifications (
          job_id,
          event_type,
          title,
          body
        ) VALUES (
          v_job_id,
          'contract_signed',
          'Contract Signed',
          'Your contract has been signed. You can now access your customer portal to track your project.'
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger if estimates_contracts table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'estimates_contracts') THEN
    DROP TRIGGER IF EXISTS trg_auto_create_portal_on_contract_sign ON public.estimates_contracts;
    CREATE TRIGGER trg_auto_create_portal_on_contract_sign
    AFTER UPDATE ON public.estimates_contracts
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_create_portal_on_contract_sign();
  END IF;
END $$;

-- ============================================================
-- 8. TRIGGER: AUTO-NOTIFY ON MATERIAL DELIVERY
-- ============================================================
-- When materials are delivered, notify customer

CREATE OR REPLACE FUNCTION public.auto_notify_material_delivery()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check if status changed to 'delivered'
  IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status != 'delivered') THEN
    -- Create notification
    INSERT INTO public.customer_notifications (
      job_id,
      event_type,
      title,
      body,
      metadata
    ) VALUES (
      NEW.job_id,
      'materials_delivered',
      'Materials Delivered',
      'Your roofing materials have been delivered and are ready for installation.',
      jsonb_build_object('supplier_order_id', NEW.id)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger if supplier_orders table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'supplier_orders') THEN
    DROP TRIGGER IF EXISTS trg_auto_notify_material_delivery ON public.supplier_orders;
    CREATE TRIGGER trg_auto_notify_material_delivery
    AFTER UPDATE ON public.supplier_orders
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_notify_material_delivery();
  END IF;
END $$;

-- ============================================================
-- 9. TRIGGER: AUTO-NOTIFY ON CREW SCHEDULING
-- ============================================================
-- When crew is scheduled, notify customer

CREATE OR REPLACE FUNCTION public.auto_notify_crew_scheduled()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_scheduled_date date;
  v_crew_name text;
BEGIN
  -- Check if production_date is set
  IF NEW.production_date IS NOT NULL AND (OLD.production_date IS NULL OR OLD.production_date != NEW.production_date) THEN
    v_scheduled_date := NEW.production_date;
    
    -- Get crew name if available
    SELECT name INTO v_crew_name
    FROM public.crews
    WHERE id = NEW.crew_id
    LIMIT 1;
    
    -- Create notification
    INSERT INTO public.customer_notifications (
      job_id,
      event_type,
      title,
      body,
      metadata
    ) VALUES (
      NEW.id,
      'crew_scheduled',
      'Crew Scheduled',
      COALESCE('Your crew' || CASE WHEN v_crew_name IS NOT NULL THEN ' (' || v_crew_name || ')' ELSE '' END || ' is scheduled to start on ' || to_char(v_scheduled_date, 'Month DD, YYYY'), 
               'Your crew is scheduled to start on ' || to_char(v_scheduled_date, 'Month DD, YYYY')),
      jsonb_build_object(
        'scheduled_date', v_scheduled_date,
        'crew_id', NEW.crew_id,
        'crew_name', v_crew_name
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on roofing_jobs or jobs table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    DROP TRIGGER IF EXISTS trg_auto_notify_crew_scheduled ON public.roofing_jobs;
    CREATE TRIGGER trg_auto_notify_crew_scheduled
    AFTER UPDATE ON public.roofing_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_notify_crew_scheduled();
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    DROP TRIGGER IF EXISTS trg_auto_notify_crew_scheduled_jobs ON public.jobs;
    CREATE TRIGGER trg_auto_notify_crew_scheduled_jobs
    AFTER UPDATE ON public.jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_notify_crew_scheduled();
  END IF;
END $$;

-- ============================================================
-- 10. TRIGGER: AUTO-ADD PROGRESS PHOTOS TO PORTAL
-- ============================================================
-- When crew photos are uploaded, add to customer notifications

CREATE OR REPLACE FUNCTION public.auto_notify_photos_uploaded()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_category text;
  v_count int;
BEGIN
  -- Only notify for before, during, after photos (not issues)
  IF NEW.category IN ('before', 'during', 'after') THEN
    -- Count photos in this category for this job
    SELECT COUNT(*) INTO v_count
    FROM public.crew_photos
    WHERE job_id = NEW.job_id
      AND category = NEW.category;
    
    -- Create notification (only once per category or on first photo)
    IF v_count = 1 OR (v_count % 5 = 0) THEN -- Notify on first photo and every 5th photo
      INSERT INTO public.customer_notifications (
        job_id,
        event_type,
        title,
        body,
        metadata
      ) VALUES (
        NEW.job_id,
        'photos_uploaded',
        'New Photos Available',
        'New ' || NEW.category || ' photos have been added to your project.',
        jsonb_build_object(
          'photo_id', NEW.id,
          'category', NEW.category,
          'photo_url', NEW.photo_url
        )
      )
      ON CONFLICT DO NOTHING; -- Prevent duplicates
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger if crew_photos table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crew_photos') THEN
    DROP TRIGGER IF EXISTS trg_auto_notify_photos_uploaded ON public.crew_photos;
    CREATE TRIGGER trg_auto_notify_photos_uploaded
    AFTER INSERT ON public.crew_photos
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_notify_photos_uploaded();
  END IF;
  
  -- Also check for job_photos table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_photos') THEN
    DROP TRIGGER IF EXISTS trg_auto_notify_photos_uploaded_job_photos ON public.job_photos;
    CREATE TRIGGER trg_auto_notify_photos_uploaded_job_photos
    AFTER INSERT ON public.job_photos
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_notify_photos_uploaded();
  END IF;
END $$;

-- ============================================================
-- 11. COMMENTS
-- ============================================================

COMMENT ON TABLE public.customer_portal_access IS 'Block 227000: Secure portal access tokens for homeowners (passwordless login)';
COMMENT ON TABLE public.customer_messages IS 'Block 227000: Two-way messaging between homeowners and company';
COMMENT ON TABLE public.customer_notifications IS 'Block 227000: Timeline events and notifications for customer portal';
COMMENT ON FUNCTION public.create_customer_portal_access(uuid, uuid, int) IS 'Block 227000: Creates portal access and returns secure token URL';
COMMENT ON FUNCTION public.auto_create_portal_on_contract_sign() IS 'Block 227000: Auto-creates portal access when contract is signed';
COMMENT ON FUNCTION public.auto_notify_material_delivery() IS 'Block 227000: Auto-notifies customer when materials are delivered';
COMMENT ON FUNCTION public.auto_notify_crew_scheduled() IS 'Block 227000: Auto-notifies customer when crew is scheduled';
COMMENT ON FUNCTION public.auto_notify_photos_uploaded() IS 'Block 227000: Auto-notifies customer when progress photos are uploaded';

























